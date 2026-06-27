import { describe, it, expect } from 'vitest'
import { initPlay, playCard, isHandComplete } from '../src/engine/play'
import { deal } from '../src/engine/deal'
import { initBidding, applyBid, legalBids, resolveBidding } from '../src/engine/bidding'
import { initTalonExchange, selectTalonGroup, resolveKingCall, discardHand, canDiscard } from '../src/engine/talon'
import { evaluateHand, recommendBid, recommendKingCall } from '../src/ai/bidding-heuristic'
import { chooseCard } from '../src/ai/play-heuristic'
import type { Seat, Contract, BidAction, Card, PlayState, KingCall, SuitCard } from '../src/engine/types'

// Mirror of the partner-visibility logic in StatusBar
function partnerLabel(playState: PlayState, playerNames: Record<Seat, string>): string {
  if (playState.contract === 'klop' || !playState.kingCall || playState.partner === null) {
    return 'None'
  }
  const ck = playState.kingCall.calledKing
  const kingSeen = (c: { card: { kind: string } }) =>
    c.card.kind === 'suit' &&
    (c.card as SuitCard).suit === ck.suit &&
    (c.card as SuitCard).rank === 'K'
  const revealed =
    playState.completedTricks.some(t => t.cards.some(kingSeen)) ||
    playState.currentTrick.cards.some(kingSeen)
  return revealed ? playerNames[playState.partner] : 'Hidden'
}

function seededRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function nextSeat(playState: PlayState): Seat {
  const played = new Set(playState.currentTrick.cards.map(c => c.seat))
  const led = playState.currentTrick.ledSeat
  const order: Seat[] = [led, ((led+1)%4) as Seat, ((led+2)%4) as Seat, ((led+3)%4) as Seat]
  return order.find(s => !played.has(s)) ?? led
}

// Find a deal where a bot (non-seat-0) ends up as declarer with a partner contract
function findBotDeclarerDeal() {
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
    // Need bot declarer (seat 1/2/3) with a partner contract
    if (declarer === 0) continue
    if (!['three', 'two', 'one'].includes(contract)) continue

    return { dealResult, contract: contract as Contract, declarer, seed }
  }
  throw new Error('No suitable deal found in 500 seeds')
}

describe('partner visibility — bot declarer, bot partner', () => {
  it('shows Hidden at game start and reveals when called king is played', () => {
    const { dealResult, contract, declarer } = findBotDeclarerDeal()
    const playerNames: Record<Seat, string> = { 0: 'You', 1: 'Bot1', 2: 'Bot2', 3: 'Bot3' }

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
    const partner = kc.partner

    expect(partner).not.toBeNull()
    expect(partner).not.toBe(0)   // should be a bot
    expect(partner).not.toBe(declarer)

    const kingCall: KingCall = {
      calledSuit: kc.calledKing.suit,
      calledKing: kc.calledKing,
      partner,
      kingInTalon: kc.kingInTalon,
      kingInDeclarerHand: !kc.kingInTalon && kc.partner === null,
    }

    let playState = initPlay(dealResult, contract, declarer, partner, null, false, kingCall, hands)
    playState = { ...playState, talonRemainder, capturedCards: { ...playState.capturedCards, [declarer]: [...playState.capturedCards[declarer], ...toDiscard] } }

    // ── At game start: partner must be Hidden ──────────────────────────────
    const labelAtStart = partnerLabel(playState, playerNames)
    expect(labelAtStart).toBe('Hidden')

    // ── Play through until king is played or hand ends ─────────────────────
    const ck = kingCall.calledKing
    let kingPlayed = false
    let labelAfterReveal = 'Hidden'
    let safety = 0

    while (!isHandComplete(playState) && safety++ < 200) {
      const seat = nextSeat(playState)
      const card = chooseCard(playState, seat, { difficultyBias: 0.5 })
      const { newState } = playCard(playState, seat, card)
      playState = newState

      // Check if the king just entered currentTrick or completed a trick
      const kingInCurrent = playState.currentTrick.cards.some(
        c => c.card.kind === 'suit' && (c.card as SuitCard).suit === ck.suit && (c.card as SuitCard).rank === 'K'
      )
      const kingInCompleted = playState.completedTricks.some(t =>
        t.cards.some(c => c.card.kind === 'suit' && (c.card as SuitCard).suit === ck.suit && (c.card as SuitCard).rank === 'K')
      )

      if (!kingPlayed && (kingInCurrent || kingInCompleted)) {
        kingPlayed = true
        labelAfterReveal = partnerLabel(playState, playerNames)
        break
      }
    }

    expect(kingPlayed).toBe(true)
    expect(labelAfterReveal).toBe(playerNames[partner!])
  })
})
