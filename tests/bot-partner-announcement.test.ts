import { describe, it, expect } from 'vitest'
import { initPlay, playCard, isHandComplete } from '../src/engine/play'
import { deal } from '../src/engine/deal'
import { initBidding, applyBid, legalBids, resolveBidding } from '../src/engine/bidding'
import { initTalonExchange, selectTalonGroup, resolveKingCall, discardHand, canDiscard } from '../src/engine/talon'
import { initAnnouncements, applyAnnouncement, evaluateBonus } from '../src/engine/announce'
import { computeHandScore, adjustCapturedForTalon, countDeclarerPoints, initRadli } from '../src/engine/scoring'
import { evaluateHand, recommendBid, recommendKingCall } from '../src/ai/bidding-heuristic'
import { chooseCard } from '../src/ai/play-heuristic'
import { CONTRACT_BASE } from '../src/engine/types'
import type { Seat, Contract, BidAction, Card, KingCall, SuitCard } from '../src/engine/types'

function seededRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function nextSeat(playState: ReturnType<typeof initPlay>): Seat {
  const played = new Set(playState.currentTrick.cards.map(c => c.seat))
  const led = playState.currentTrick.ledSeat
  const order: Seat[] = [led, ((led+1)%4) as Seat, ((led+2)%4) as Seat, ((led+3)%4) as Seat]
  return order.find(s => !played.has(s)) ?? led
}

function findBotDeclarerPartnerDeal() {
  for (let seed = 1; seed < 500; seed++) {
    const outcome = deal(0 as Seat, seededRng(seed))
    if (outcome.kind === 'void-deal') continue
    const dealResult = outcome.result

    let biddingState = initBidding(dealResult.dealer, false)
    let iters = 0
    while (!biddingState.done && iters++ < 20) {
      const seat = biddingState.currentBidder
      const legal = legalBids(biddingState, seat)
      const rec = recommendBid(evaluateHand(dealResult.hands[seat]), legal, false)
      const action: BidAction = rec === 'pass' ? { kind: 'pass' } : { kind: 'bid', contract: rec as Contract }
      biddingState = applyBid(biddingState, action)
    }
    if (!biddingState.done) continue

    const result = resolveBidding(biddingState)
    if (!result) continue

    const { contract, declarer } = result
    if (declarer === 0) continue
    if (!['three', 'two', 'one'].includes(contract)) continue

    return { dealResult, contract: contract as Contract, declarer, seed }
  }
  throw new Error('No suitable deal found')
}

describe('bot declarer + bot partner makes announcement', () => {
  it('announcement from partner bot is recorded and reflected in scoring', () => {
    const { dealResult, contract, declarer } = findBotDeclarerPartnerDeal()

    // Talon exchange
    const exchange = initTalonExchange(dealResult.talon, contract)
    const { updatedHand, exchange: updated } = selectTalonGroup(exchange, 0, dealResult.hands[declarer])
    let hands = { ...dealResult.hands, [declarer]: updatedHand }
    const talonRemainder = updated.talonRemainder

    const groupSize = updated.groups[0].length
    const discardable = updatedHand.filter(c => canDiscard(c, updatedHand))
    const toDiscard = discardable.slice(0, groupSize)
    const finalHand = discardHand(updatedHand, toDiscard)
    hands = { ...hands, [declarer]: finalHand }

    // King call
    const calledSuit = recommendKingCall(finalHand, ['clubs', 'spades', 'hearts', 'diamonds'])
    const kc = resolveKingCall(calledSuit, hands, dealResult.talon, declarer)
    const partner = kc.partner as Seat

    expect(partner).not.toBeNull()
    expect(partner).not.toBe(0 as Seat)
    expect(partner).not.toBe(declarer)

    const kingCall: KingCall = {
      calledSuit: kc.calledKing.suit,
      calledKing: kc.calledKing,
      partner,
      kingInTalon: kc.kingInTalon,
      kingInDeclarerHand: !kc.kingInTalon && kc.partner === null,
    }

    // Partner bot announces Trula (always valid; outcome depends on card distribution)
    let announcementState = initAnnouncements()
    announcementState = applyAnnouncement(
      announcementState,
      { kind: 'announce', seat: partner, bonus: 'trula' },
      declarer,
      partner,
    )

    expect(announcementState.announcements).toHaveLength(1)
    expect(announcementState.announcements[0].bonus).toBe('trula')
    expect(announcementState.announcements[0].announced).toBe(true)

    // Play the hand
    let playState = initPlay(dealResult, contract, declarer, partner, null, false, kingCall, hands)
    playState = {
      ...playState,
      talonRemainder,
      capturedCards: {
        ...playState.capturedCards,
        [declarer]: [...playState.capturedCards[declarer], ...toDiscard],
      },
    }

    let safety = 0
    while (!isHandComplete(playState) && safety++ < 200) {
      const seat = nextSeat(playState)
      const card = chooseCard(playState, seat, { difficultyBias: 0.5 })
      const result = playCard(playState, seat, card)
      playState = result.newState
    }

    expect(isHandComplete(playState)).toBe(true)
    expect(playState.completedTricks).toHaveLength(12)

    // Score
    const effectiveCaptured = adjustCapturedForTalon(
      playState.capturedCards,
      talonRemainder,
      declarer,
      partner,
      playState.kingInTalonCaptured,
    )

    const declarerPts = countDeclarerPoints(effectiveCaptured, declarer, partner)
    const won = declarerPts >= 36

    const handScore = computeHandScore({
      contract,
      declarer,
      partner,
      capturedCards: effectiveCaptured,
      talonRemainder,
      mondCapturedWithSkis: playState.mondCapturedWithSkis,
      mondPlayedBySeat: playState.mondCapturedBy,
      announcementState,
      completedTricks: playState.completedTricks,
      calledKing: kingCall.calledKing,
      radliState: initRadli(),
      contractBase: CONTRACT_BASE[contract],
      won,
    })

    // Trula announcement must appear in the bonus breakdown
    const trulaEntry = handScore.bonusBreakdown.find(b => b.bonus === 'trula')
    expect(trulaEntry).toBeDefined()
    expect(trulaEntry!.announced).toBe(true)

    // Score impact: trula announced value is 20 (10 base × 2 for announced)
    // If achieved: +20 to declarer score; if not: −20
    const trulaAchieved = evaluateBonus('trula', effectiveCaptured, playState.completedTricks, declarer, partner, kingCall.calledKing)
    expect(trulaEntry!.achieved).toBe(trulaAchieved)
    expect(trulaEntry!.value).toBe(20)

    console.log(`Seed found: declarer=seat${declarer}, partner=seat${partner}, contract=${contract}`)
    console.log(`Declarer pts: ${declarerPts}, Won hand: ${won}`)
    console.log(`Trula announced by partner (seat${partner}): ${trulaAchieved ? 'ACHIEVED ✓' : 'NOT ACHIEVED ✗'}`)
    console.log(`Declarer net score: ${handScore.declarerScore}`)
  })
})
