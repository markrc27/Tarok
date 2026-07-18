import { describe, it, expect } from 'vitest'
import {
  initBidding, applyBid, resolveBidding, legalBids,
  biddingOrder, contractStrength, availableContracts,
} from '../src/engine/bidding'
import { evaluateHand, recommendBid } from '../src/ai/bidding-heuristic'
import type { Seat, BidAction, Card, SuitCard, TrumpCard } from '../src/engine/types'

function trump(ordinal: number): TrumpCard {
  const pts: 1 | 5 = (ordinal === 1 || ordinal === 21 || ordinal === 22) ? 5 : 1
  return { kind: 'trump', ordinal: ordinal as TrumpCard['ordinal'], points: pts }
}

function suit(s: SuitCard['suit'], rank: SuitCard['rank']): SuitCard {
  const pts: 1 | 2 | 3 | 4 | 5 = rank === 'K' ? 5 : rank === 'Q' ? 4 : rank === 'Kn' ? 3 : rank === 'J' ? 2 : 1
  return { kind: 'suit', suit: s, rank, points: pts }
}

function passAll(state: ReturnType<typeof initBidding>, except?: Seat) {
  let s = state
  const order = biddingOrder(state.dealer)
  for (const seat of order) {
    if (seat === except) continue
    if (!s.passed.has(seat) && !s.done) {
      s = applyBid(s, { kind: 'pass' })
    }
  }
  return s
}

describe('biddingOrder', () => {
  it('with dealer=0, order is [2, 1, 0, 3] (forehand=3 speaks last)', () => {
    expect(biddingOrder(0)).toEqual([2, 1, 0, 3])
  })

  it('with dealer=1, forehand=0 speaks last', () => {
    const order = biddingOrder(1)
    expect(order[3]).toBe(0) // forehand = (1+3)%4 = 0
  })

  it('forehand is always the last speaker', () => {
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const order = biddingOrder(dealer)
      const forehand = ((dealer + 3) % 4) as Seat
      expect(order[3]).toBe(forehand)
    }
  })
})

describe('contractStrength', () => {
  it('klop is lowest', () => {
    expect(contractStrength('klop')).toBe(0)
  })

  it('valat-without is highest', () => {
    expect(contractStrength('valat-without')).toBe(11)
  })

  it('three < two < one', () => {
    expect(contractStrength('three')).toBeLessThan(contractStrength('two'))
    expect(contractStrength('two')).toBeLessThan(contractStrength('one'))
  })
})

describe('legalBids', () => {
  it('first bidder can bid two through valat-without (not klop or three)', () => {
    const state = initBidding(0, false)
    const bids = legalBids(state, state.currentBidder)
    expect(bids).not.toContain('klop')
    expect(bids).not.toContain('three')
    expect(bids).toContain('two')
    expect(bids).toContain('valat-without')
  })

  it('Forehand can match current highest bid', () => {
    const dealer = 0 as Seat
    const forehand = 3 as Seat
    let state = initBidding(dealer, false)
    // First bidder (seat 2) bids 'two'
    state = applyBid(state, { kind: 'bid', contract: 'two' })
    // Seat 1 passes
    state = applyBid(state, { kind: 'pass' })
    // Seat 0 passes
    state = applyBid(state, { kind: 'pass' })
    // Now it's forehand's (seat 3) turn — can match 'two'
    expect(state.currentBidder).toBe(forehand)
    const bids = legalBids(state, forehand)
    expect(bids).toContain('two') // forehand can match
  })

  it('non-forehand must exceed current highest bid', () => {
    const dealer = 0 as Seat
    let state = initBidding(dealer, false)
    // Seat 2 bids 'two'
    state = applyBid(state, { kind: 'bid', contract: 'two' })
    // Seat 1's turn — must exceed 'two', cannot bid 'two'
    expect(state.currentBidder).toBe(1)
    const bids = legalBids(state, 1)
    expect(bids).not.toContain('two')
    expect(bids).toContain('one') // one > two in ladder
  })

  it('compulsory klop: floor is solo-without, three through beggar removed', () => {
    const state = initBidding(0, true)
    const bids = legalBids(state, state.currentBidder)
    expect(bids).not.toContain('three')
    expect(bids).not.toContain('two')
    expect(bids).not.toContain('one')
    expect(bids).not.toContain('beggar')
    expect(bids).toContain('solo-without')
    expect(bids).toContain('valat-without')
  })

  it('passed seat gets empty legal bids', () => {
    let state = initBidding(0, false)
    // First bidder passes
    state = applyBid(state, { kind: 'pass' })
    // The first bidder is now in passed set
    const firstBidder = biddingOrder(0)[0]
    expect(legalBids(state, firstBidder)).toHaveLength(0)
  })

  it('returns empty for non-current-bidder', () => {
    const state = initBidding(0, false)
    // currentBidder is biddingOrder(0)[0] = seat 2
    // seat 1 is not current bidder
    expect(legalBids(state, 1)).toHaveLength(0)
  })
})

describe('bidding resolution', () => {
  it('all non-forehand pass: forehand is declarer with klop as default', () => {
    let state = initBidding(0, false)
    // Speaking order: [2, 1, 0, 3], forehand=3
    // Seats 2, 1, 0 all pass
    state = applyBid(state, { kind: 'pass' }) // seat 2
    state = applyBid(state, { kind: 'pass' }) // seat 1
    state = applyBid(state, { kind: 'pass' }) // seat 0
    // Now it's forehand (seat 3) — still active
    // In this state with no bids, bidding ends once 3 passed
    expect(state.done).toBe(true)
    const result = resolveBidding(state)
    expect(result).not.toBeNull()
    expect(result!.declarer).toBe(3) // forehand
  })

  it('highest bidder becomes declarer', () => {
    let state = initBidding(0, false)
    // Seat 2 bids 'one'
    state = applyBid(state, { kind: 'bid', contract: 'one' })
    // Seat 1 passes
    state = applyBid(state, { kind: 'pass' })
    // Seat 0 passes
    state = applyBid(state, { kind: 'pass' })
    // Seat 3 (forehand) passes
    state = applyBid(state, { kind: 'pass' })
    expect(state.done).toBe(true)
    const result = resolveBidding(state)
    expect(result!.declarer).toBe(2)
    expect(result!.contract).toBe('one')
  })

  it('forehand outbids by matching, becomes declarer after original bidder passes', () => {
    let state = initBidding(0, false)
    // Seat 2 bids 'two'
    state = applyBid(state, { kind: 'bid', contract: 'two' })
    // Seat 1 passes
    state = applyBid(state, { kind: 'pass' })
    // Seat 0 passes
    state = applyBid(state, { kind: 'pass' })
    // Seat 3 (forehand) matches with 'two'
    state = applyBid(state, { kind: 'bid', contract: 'two' })
    // Seat 2 must now pass (can't re-bid 'two', must go higher — they choose to pass)
    state = applyBid(state, { kind: 'pass' })
    expect(state.done).toBe(true)
    const result = resolveBidding(state)
    expect(result!.declarer).toBe(3) // forehand wins the match
    expect(result!.contract).toBe('two')
  })

  it('resolveBidding returns null when bidding not done', () => {
    const state = initBidding(0, false)
    expect(resolveBidding(state)).toBeNull()
  })

  it('compulsory klop: all four pass → klop is played', () => {
    let state = initBidding(0, true)
    // All pass (no one wants to bid solo-without or higher)
    for (let i = 0; i < 4; i++) {
      state = applyBid(state, { kind: 'pass' })
    }
    expect(state.done).toBe(true)
    const result = resolveBidding(state)
    expect(result!.contract).toBe('klop')
  })
})

describe('availableContracts', () => {
  it('normal: includes all 12 contracts', () => {
    expect(availableContracts(false)).toHaveLength(12)
  })

  it('compulsory klop: only solo-without through valat-without', () => {
    const c = availableContracts(true)
    expect(c).toContain('solo-without')
    expect(c).not.toContain('beggar')
    expect(c).not.toContain('three')
    expect(c[0]).toBe('solo-without')
  })
})

describe('recommendBid — all four kings (BOT-001)', () => {
  const allKings = [
    suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'), suit('diamonds', 'K'),
  ]

  it('6 trumps + all 4 kings → solo-two (not partner two)', () => {
    const hand: Card[] = [
      ...Array.from({ length: 6 }, (_, i) => trump(i + 2)),
      ...allKings,
      suit('clubs', 'Q'), suit('clubs', 'J'),
    ]
    const legal: import('../src/engine/types').Contract[] = [
      'two', 'one', 'solo-three', 'solo-two', 'solo-one',
    ]
    const rec = recommendBid(evaluateHand(hand), legal, false, hand)
    expect(contractStrength(rec as import('../src/engine/types').Contract)).toBeGreaterThanOrEqual(contractStrength('solo-two'))
    expect(rec).not.toBe('two')
  })

  it('5 trumps + all 4 kings → bids solo-three', () => {
    const hand: Card[] = [
      ...Array.from({ length: 5 }, (_, i) => trump(i + 2)),
      ...allKings,
      suit('clubs', 'Q'), suit('clubs', 'J'), suit('spades', 'Q'),
    ]
    const legal: import('../src/engine/types').Contract[] = [
      'three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one',
    ]
    const rec = recommendBid(evaluateHand(hand), legal, false, hand)
    expect(rec).toBe('solo-three')
  })

  it('4 trumps + all 4 kings → passes (ceiling is null)', () => {
    const hand: Card[] = [
      ...Array.from({ length: 4 }, (_, i) => trump(i + 2)),
      ...allKings,
      suit('clubs', 'Q'), suit('clubs', 'J'), suit('spades', 'Q'), suit('spades', 'J'),
    ]
    const legal: import('../src/engine/types').Contract[] = ['two', 'one', 'solo-three']
    const rec = recommendBid(evaluateHand(hand), legal, false, hand)
    expect(rec).toBe('pass')
  })
})
