import { describe, it, expect } from 'vitest'
import { deal, dealHands, hasZeroTrumps } from '../src/engine/deal'
import { initBidding, applyBid, resolveBidding, legalBids, biddingOrder } from '../src/engine/bidding'
import { initTalonExchange, selectTalonGroup, applyDiscard, resolveKingCall, discardHand, canDiscard } from '../src/engine/talon'
import { initPlay, playCard, isHandComplete, resolveTrick, checkMondCapture } from '../src/engine/play'
import { initAnnouncements } from '../src/engine/announce'
import { countDeclarerPoints, initRadli } from '../src/engine/scoring'
import { countPoints } from '../src/engine/pointcount'
import { buildDeck } from '../src/engine/deck'
import { evaluateHand, recommendBid, recommendKingCall } from '../src/ai/bidding-heuristic'
import { chooseCard } from '../src/ai/play-heuristic'
import type { Seat, BidAction, Contract, Card, TrickState } from '../src/engine/types'

function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function nextSeatToPlay(playState: ReturnType<typeof initPlay>): Seat {
  const playedSeats = new Set(playState.currentTrick.cards.map(c => c.seat))
  const ledSeat = playState.currentTrick.ledSeat
  const order: Seat[] = [ledSeat, ((ledSeat+1)%4) as Seat, ((ledSeat+2)%4) as Seat, ((ledSeat+3)%4) as Seat]
  return order.find(s => !playedSeats.has(s)) ?? ledSeat
}

function playFullHand(
  playState: ReturnType<typeof initPlay>,
  config = { difficultyBias: 0.5 },
): ReturnType<typeof initPlay> {
  let state = playState
  let safety = 0
  while (!isHandComplete(state) && safety < 200) {
    const seat = nextSeatToPlay(state)
    const card = chooseCard(state, seat, config)
    const { newState } = playCard(state, seat, card)
    state = newState
    safety++
  }
  return state
}

function getNormalDeal(dealer: Seat, seed: number) {
  let s = seed
  let outcome = deal(dealer, seededRng(s))
  while (outcome.kind === 'void-deal') {
    outcome = deal(dealer, seededRng(s++))
  }
  return outcome.result
}

describe('full hand integration', () => {
  it('plays a complete 12-trick hand without errors (seeded)', () => {
    const dealResult = getNormalDeal(0, 42)

    // Bidding
    let biddingState = initBidding(dealResult.dealer, false)
    let iterations = 0
    while (!biddingState.done && iterations++ < 20) {
      const seat = biddingState.currentBidder
      const legal = legalBids(biddingState, seat)
      const eval_ = evaluateHand(dealResult.hands[seat])
      const rec = recommendBid(eval_, legal, false)
      const action: BidAction = rec === 'pass'
        ? { kind: 'pass' }
        : { kind: 'bid', contract: rec as Contract }
      biddingState = applyBid(biddingState, action)
    }

    expect(biddingState.done).toBe(true)
    const biddingResult = resolveBidding(biddingState)!
    const { contract, declarer } = biddingResult

    let hands = { ...dealResult.hands }
    let partner: Seat | null = null
    const needsTalon = ['three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one'].includes(contract)

    let exchangeForPlay = null as import('../src/engine/types').TalonExchange | null

    if (needsTalon) {
      const exchange = initTalonExchange(dealResult.talon, contract)
      const { updatedHand, exchange: updated } = selectTalonGroup(exchange, 0, hands[declarer])

      const groupSize = updated.groups[0].length
      const discardable = updatedHand.filter(c => canDiscard(c, updatedHand))
      const toDiscard = discardable.slice(0, groupSize)
      const finalHand = discardHand(updatedHand, toDiscard)
      hands = { ...hands, [declarer]: finalHand }

      // applyDiscard records the discard on the exchange object;
      // initPlay reads exchange.discard and exchange.talonRemainder directly.
      exchangeForPlay = applyDiscard(updated, toDiscard, updatedHand)

      if (['three', 'two', 'one'].includes(contract)) {
        const calledSuit = recommendKingCall(hands[declarer], ['clubs', 'spades', 'hearts', 'diamonds'])
        const kc = resolveKingCall(calledSuit, hands, dealResult.talon, declarer)
        partner = kc.partner
      }
    }

    let playState = initPlay(
      dealResult, contract, declarer, partner, exchangeForPlay, false, null, hands,
    )

    // Card conservation: initPlay must seed capturedCards[declarer] with the
    // discard and talonRemainder internally — no manual patching here.
    // If this assertion fails, initPlay is not seeding the exchange correctly.
    const discardPts = countPoints(exchangeForPlay?.discard ?? [])
    expect(countPoints(playState.capturedCards[declarer])).toBe(discardPts)

    playState = playFullHand(playState)

    expect(isHandComplete(playState)).toBe(true)
    expect(playState.completedTricks).toHaveLength(12)

    // Card conservation after play: all 54 card-points must be accounted for
    // across captured piles plus the unchosen talon remainder.
    // A failure here means cards leaked somewhere in the pipeline.
    const allCaptured = ([0, 1, 2, 3] as Seat[]).flatMap(s => playState.capturedCards[s])
    expect(countPoints([...allCaptured, ...playState.talonRemainder])).toBe(70)
  })

  it('zero-trump void deal is detected', () => {
    const deck = buildDeck()
    const suits = deck.filter(c => c.kind === 'suit')
    const trumps = deck.filter(c => c.kind === 'trump')
    const rigged: Card[] = [
      ...suits.slice(0, 6),
      ...suits.slice(6, 12),
      ...trumps.slice(0, 6),
      ...trumps.slice(6, 12),
      ...trumps.slice(12, 18),
      ...suits.slice(12, 18),
      ...trumps.slice(18, 22),
      ...suits.slice(18, 20),
      ...suits.slice(20, 26),
      ...suits.slice(26, 32),
    ]
    const result = dealHands(rigged, 3)
    expect(hasZeroTrumps(result.hands[2])).toBe(true)
  })

  it('emperor trick: Pagat wins when all three trula played', () => {
    const pagat = { kind: 'trump', ordinal: 1, points: 5 } as Card
    const mond = { kind: 'trump', ordinal: 21, points: 5 } as Card
    const skis = { kind: 'trump', ordinal: 22, points: 5 } as Card
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0 as Seat, ledSuit: 'trump',
      cards: [
        { seat: 0 as Seat, card: skis },
        { seat: 1 as Seat, card: mond },
        { seat: 2 as Seat, card: pagat },
        { seat: 3 as Seat, card: { kind: 'trump', ordinal: 10, points: 1 } as Card },
      ],
    }
    expect(resolveTrick(trick, false)).toBe(2)
  })

  it('captured Mond penalty flag set correctly', () => {
    const mond = { kind: 'trump', ordinal: 21, points: 5 } as Card
    const skis = { kind: 'trump', ordinal: 22, points: 5 } as Card
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0 as Seat, ledSuit: 'trump',
      cards: [
        { seat: 0 as Seat, card: skis },
        { seat: 1 as Seat, card: mond },
        { seat: 2 as Seat, card: { kind: 'trump', ordinal: 5, points: 1 } as Card },
        { seat: 3 as Seat, card: { kind: 'trump', ordinal: 3, points: 1 } as Card },
      ],
    }
    const result = checkMondCapture(trick)
    expect(result.captured).toBe(true)
    expect(result.withSkis).toBe(true)
    expect(result.byWhom).toBe(1)
  })

  it('klop hand: all 48 played cards are captured', () => {
    const dealResult = getNormalDeal(0, 123)

    let playState = initPlay(
      dealResult, 'klop', 0 as Seat, null, null, false, null, dealResult.hands,
    )

    playState = playFullHand(playState)

    expect(isHandComplete(playState)).toBe(true)
    const totalCapturedCards = ([0, 1, 2, 3] as Seat[])
      .flatMap(s => playState.capturedCards[s])
    // In klop, 48 cards played (54 - 6 talon); all should be captured
    expect(totalCapturedCards.length).toBe(48)
  })
})
