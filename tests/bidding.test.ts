import { describe, it, expect } from 'vitest'
import {
  initBidding, applyBid, resolveBidding, legalBids,
  biddingOrder, contractStrength, availableContracts, forehandChoiceContracts,
} from '../src/engine/bidding'
import { evaluateHand, recommendBid, recommendAnnouncements, shouldBotKontra, shouldBotRekontra } from '../src/ai/bidding-heuristic'
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

  it('forehand choice (normal): may name any contract including klop and three', () => {
    const bids = forehandChoiceContracts(false)
    expect(bids).toContain('klop')
    expect(bids).toContain('three')
    expect(bids).toContain('two')
    expect(bids).toContain('solo-without')
    expect(bids).toContain('valat-without')
    expect(bids).toHaveLength(12)
  })

  it('forehand choice (compulsory klop): only klop or solo-without and above', () => {
    const bids = forehandChoiceContracts(true)
    expect(bids).toContain('klop')          // klop is always an option for forehand
    expect(bids).toContain('solo-without')
    expect(bids).toContain('valat-without')
    // The three-through-beggar ladder is removed under compulsory klop
    expect(bids).not.toContain('three')
    expect(bids).not.toContain('two')
    expect(bids).not.toContain('one')
    expect(bids).not.toContain('solo-three')
    expect(bids).not.toContain('beggar')
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

// ── HCP-adjusted bidding (hard mode) ─────────────────────────────────────────

describe('recommendBid — HCP adjustment (hard mode)', () => {
  // Hand helpers: N trumps plus various courts
  function handWithTrumpsAndCourts(trumpCount: number, courts: Card[]): Card[] {
    return [
      ...Array.from({ length: trumpCount }, (_, i) => trump(i + 2)),
      ...courts,
    ]
  }

  it('hard mode: 6 trumps + high HCP (≥8) bids one instead of two', () => {
    // 6 trumps normally → ceiling 'two'. With ≥8 HCP in hard mode → ceiling 'one'.
    const hand = handWithTrumpsAndCourts(6, [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'Q'), suit('diamonds', 'Q'),
      suit('clubs', 'Kn'), suit('spades', 'J'),
    ])
    // HCP: K+K+Q+Q+Kn+J = 4+4+3+3+2+1 = 17
    const ev = evaluateHand(hand)
    expect(ev.highCardPoints).toBeGreaterThanOrEqual(8)
    const legal: import('../src/engine/types').Contract[] = ['two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('one')
  })

  it('easy mode: 6 trumps + high HCP still bids two (HCP ignored)', () => {
    const hand = handWithTrumpsAndCourts(6, [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'Q'), suit('diamonds', 'Q'),
      suit('clubs', 'Kn'), suit('spades', 'J'),
    ])
    const ev = evaluateHand(hand)
    const legal: import('../src/engine/types').Contract[] = ['two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'easy')
    expect(rec).toBe('two')
  })

  it('hard mode: 5 trumps + high HCP (≥8) bids two instead of three', () => {
    const hand = handWithTrumpsAndCourts(5, [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'Q'), suit('diamonds', 'Q'),
      suit('clubs', 'Kn'), suit('spades', 'J'), suit('hearts', 'J'),
    ])
    const ev = evaluateHand(hand)
    expect(ev.highCardPoints).toBeGreaterThanOrEqual(8)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('two')
  })

  it('hard mode: 4 trumps + high HCP (≥8) bids three (borderline rescued by courts)', () => {
    // Deliberately NOT all four kings — that path exits early via holdsAllFourKings.
    // Three kings + courts gives ≥8 HCP without triggering the all-four-kings branch.
    const hand = handWithTrumpsAndCourts(4, [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'),
      suit('clubs', 'Q'), suit('spades', 'Q'), suit('hearts', 'Q'),
      suit('diamonds', 'Kn'), suit('clubs', 'J'),
    ])
    // HCP: K+K+K+Q+Q+Q+Kn+J = 4+4+4+3+3+3+2+1 = 24 ≥ 8
    const ev = evaluateHand(hand)
    expect(ev.highCardPoints).toBeGreaterThanOrEqual(8)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('three')
  })

  it('hard mode: 4 trumps + low HCP (<8) still passes', () => {
    const hand = handWithTrumpsAndCourts(4, [
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7),
      suit('clubs', 8), suit('spades', 8), suit('hearts', 8), suit('diamonds', 8),
    ])
    const ev = evaluateHand(hand)
    expect(ev.highCardPoints).toBe(0)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('pass')
  })

  it('hard mode: 6 trumps + very low HCP (≤1) bids three (conservative)', () => {
    const hand = handWithTrumpsAndCourts(6, [
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7),
      suit('clubs', 8), suit('spades', 'J'),  // only 1 HCP (one J)
    ])
    const ev = evaluateHand(hand)
    expect(ev.highCardPoints).toBeLessThanOrEqual(1)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('three')
  })
})

// ── recommendAnnouncements ───────────────────────────────────────────────────

describe('recommendAnnouncements', () => {
  function pagat(): TrumpCard { return { kind: 'trump', ordinal: 1, points: 5 } }
  function mond(): TrumpCard  { return { kind: 'trump', ordinal: 21, points: 5 } }
  function skis(): TrumpCard  { return { kind: 'trump', ordinal: 22, points: 5 } }
  function t(n: number): TrumpCard { return { kind: 'trump', ordinal: n as TrumpCard['ordinal'], points: 1 } }

  it('recommends trula when holding Škis + Mond + Pagat', () => {
    const hand: Card[] = [skis(), mond(), pagat(), t(10), t(11), t(12), t(13), suit('clubs', 'K'), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7)]
    expect(recommendAnnouncements(hand)).toContain('trula')
  })

  it('does NOT recommend trula without all three (missing Mond)', () => {
    const hand: Card[] = [skis(), pagat(), t(10), t(11), suit('clubs', 'K'), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7)]
    expect(recommendAnnouncements(hand)).not.toContain('trula')
  })

  it('recommends kings when holding all four kings', () => {
    const hand: Card[] = [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'), suit('diamonds', 'K'),
      t(5), t(6), t(7), t(8), t(9), t(10), suit('clubs', 7), suit('spades', 7),
    ]
    expect(recommendAnnouncements(hand)).toContain('kings')
  })

  it('does NOT recommend kings with only three kings', () => {
    const hand: Card[] = [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'),
      t(5), t(6), t(7), t(8), suit('diamonds', 7), suit('clubs', 7), suit('spades', 7),
    ]
    expect(recommendAnnouncements(hand)).not.toContain('kings')
  })

  it('recommends pagat-ultimo when holding Pagat + 9+ trumps', () => {
    const hand: Card[] = [pagat(), t(2), t(3), t(4), t(5), t(6), t(7), t(8), t(9), t(10), suit('clubs', 7), suit('spades', 7)]
    expect(hand.filter(c => c.kind === 'trump')).toHaveLength(10)  // 10 trumps including Pagat
    expect(recommendAnnouncements(hand)).toContain('pagat-ultimo')
  })

  it('does NOT recommend pagat-ultimo with only 8 trumps (Pagat included)', () => {
    const hand: Card[] = [pagat(), t(2), t(3), t(4), t(5), t(6), t(7), t(8), suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7)]
    expect(hand.filter(c => c.kind === 'trump')).toHaveLength(8)
    expect(recommendAnnouncements(hand)).not.toContain('pagat-ultimo')
  })

  it('does NOT recommend pagat-ultimo without the Pagat', () => {
    const hand: Card[] = [t(2), t(3), t(4), t(5), t(6), t(7), t(8), t(9), t(10), t(11), suit('clubs', 7), suit('spades', 7)]
    expect(recommendAnnouncements(hand)).not.toContain('pagat-ultimo')
  })

  it('returns empty for a weak hand with no special cards', () => {
    const hand: Card[] = [t(5), t(6), t(7), suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 8), suit('spades', 8), suit('hearts', 8), suit('diamonds', 8), suit('clubs', 9)]
    expect(recommendAnnouncements(hand)).toHaveLength(0)
  })

  it('can recommend multiple bonuses in one hand (trula + kings + pagat-ultimo)', () => {
    // Škis, Mond, Pagat + 7 more trumps + all 4 kings = 12 cards
    const hand: Card[] = [
      skis(), mond(), pagat(),
      t(2), t(3), t(4), t(5), t(6), t(7),
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'), // only 3 kings → no 'kings'
    ]
    const bonuses = recommendAnnouncements(hand)
    expect(bonuses).toContain('trula')
    expect(bonuses).toContain('pagat-ultimo')  // 9 trumps (with pagat)
    expect(bonuses).not.toContain('kings')      // only 3 kings
  })

  it('recommends king-ultimo when holding called king + ≥7 trumps', () => {
    const calledKing: Card = suit('clubs', 'K')
    const hand: Card[] = [
      calledKing,  // holds the called king
      t(5), t(6), t(7), t(8), t(9), t(10), t(11),  // 7 other trumps
      suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7),
    ]
    expect(recommendAnnouncements(hand, calledKing)).toContain('king-ultimo')
  })

  it('does NOT recommend king-ultimo without the called king in hand', () => {
    const calledKing: Card = suit('clubs', 'K')
    const hand: Card[] = [
      // no K♣ in hand
      t(5), t(6), t(7), t(8), t(9), t(10), t(11), t(12),
      suit('spades', 'K'), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7),
    ]
    expect(recommendAnnouncements(hand, calledKing)).not.toContain('king-ultimo')
  })

  it('does NOT recommend king-ultimo with fewer than 7 trumps', () => {
    const calledKing: Card = suit('clubs', 'K')
    const hand: Card[] = [
      calledKing,
      t(5), t(6), t(7), t(8), t(9), t(10),  // only 6 trumps
      suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7), suit('spades', 8),
    ]
    expect(recommendAnnouncements(hand, calledKing)).not.toContain('king-ultimo')
  })

  it('does NOT recommend king-ultimo when calledKing is not provided', () => {
    const hand: Card[] = [
      suit('clubs', 'K'),
      t(5), t(6), t(7), t(8), t(9), t(10), t(11),
      suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7),
    ]
    // no calledKing argument → can't know which king is called
    expect(recommendAnnouncements(hand)).not.toContain('king-ultimo')
  })
})

// ── shouldBotKontra ──────────────────────────────────────────────────────────

describe('shouldBotKontra', () => {
  function t(n: number): TrumpCard { return { kind: 'trump', ordinal: n as TrumpCard['ordinal'], points: 1 } }

  function handWith(trumps: TrumpCard[], extras: Card[]): Card[] {
    return [...trumps, ...extras].slice(0, 12)
  }

  it('easy mode: never kontras regardless of trump count', () => {
    // 10 trumps — dominant hand in easy mode → no kontra
    const hand = handWith(
      [t(1), t(2), t(3), t(4), t(5), t(6), t(7), t(8), t(9), t(10)],
      [suit('clubs', 7), suit('spades', 7)],
    )
    expect(shouldBotKontra(hand, 'easy')).toBe(false)
  })

  it('hard mode: ≥8 trumps kontras (dominant trump control)', () => {
    const hand = handWith(
      [t(2), t(3), t(4), t(5), t(6), t(7), t(8), t(9)],  // 8 trumps
      [suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7)],
    )
    expect(shouldBotKontra(hand, 'hard')).toBe(true)
  })

  it('hard mode: 7 trumps alone does NOT kontra (below threshold)', () => {
    const hand = handWith(
      [t(2), t(3), t(4), t(5), t(6), t(7), t(8)],  // 7 trumps
      [suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 8)],
    )
    expect(shouldBotKontra(hand, 'hard')).toBe(false)
  })

  it('hard mode: 6 trumps + ≥8 HCP kontras (strong combined hand)', () => {
    const hand = handWith(
      [t(2), t(3), t(4), t(5), t(6), t(7)],  // 6 trumps
      [
        suit('clubs', 'K'), suit('spades', 'K'),   // 4+4 = 8 HCP
        suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7), suit('spades', 7),
      ],
    )
    expect(shouldBotKontra(hand, 'hard')).toBe(true)
  })

  it('hard mode: 6 trumps + 7 HCP does NOT kontra (HCP just below threshold)', () => {
    const hand = handWith(
      [t(2), t(3), t(4), t(5), t(6), t(7)],  // 6 trumps
      [
        suit('clubs', 'K'), suit('spades', 'Q'),  // 4+3 = 7 HCP
        suit('hearts', 7), suit('diamonds', 7), suit('clubs', 7), suit('spades', 7),
      ],
    )
    expect(shouldBotKontra(hand, 'hard')).toBe(false)
  })

  it('hard mode: 5 trumps + high HCP does NOT kontra (trump count too low)', () => {
    const hand = handWith(
      [t(2), t(3), t(4), t(5), t(6)],  // 5 trumps
      [
        suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'), suit('diamonds', 'K'),
        suit('clubs', 'Q'), suit('spades', 'Q'), suit('hearts', 'Q'),
      ],
    )
    expect(shouldBotKontra(hand, 'hard')).toBe(false)
  })
})

// ── shouldBotRekontra ─────────────────────────────────────────────────────────

describe('shouldBotRekontra', () => {
  function t(n: number): TrumpCard { return { kind: 'trump', ordinal: n as TrumpCard['ordinal'], points: 1 } }

  function handWith(trumps: TrumpCard[], extras: Card[]): Card[] {
    return [...trumps, ...extras].slice(0, 12)
  }

  it('easy mode: never rekontra regardless of hand strength', () => {
    const hand = handWith(
      [t(1),t(2),t(3),t(4),t(5),t(6),t(7),t(8),t(9),t(10)],  // 10 trumps
      [suit('clubs', 'K'), suit('spades', 'K')],
    )
    expect(shouldBotRekontra(hand, 'easy')).toBe(false)
  })

  it('hard mode: ≥9 trumps rekontra (dominant trump control)', () => {
    const hand = handWith(
      [t(2),t(3),t(4),t(5),t(6),t(7),t(8),t(9),t(10)],  // 9 trumps
      [suit('clubs', 7), suit('spades', 7), suit('hearts', 7)],
    )
    expect(shouldBotRekontra(hand, 'hard')).toBe(true)
  })

  it('hard mode: 8 trumps alone does NOT rekontra (below threshold)', () => {
    const hand = handWith(
      [t(2),t(3),t(4),t(5),t(6),t(7),t(8),t(9)],  // 8 trumps
      [suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7)],
    )
    expect(shouldBotRekontra(hand, 'hard')).toBe(false)
  })

  it('hard mode: 7 trumps + ≥12 HCP rekontra (strong combined hand)', () => {
    const hand = handWith(
      [t(2),t(3),t(4),t(5),t(6),t(7),t(8)],  // 7 trumps
      [
        suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'),  // 4+4+4 = 12 HCP
        suit('diamonds', 7), suit('clubs', 7),
      ],
    )
    expect(shouldBotRekontra(hand, 'hard')).toBe(true)
  })

  it('hard mode: 7 trumps + 11 HCP does NOT rekontra (HCP just below threshold)', () => {
    const hand = handWith(
      [t(2),t(3),t(4),t(5),t(6),t(7),t(8)],  // 7 trumps
      [
        suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'Q'),  // 4+4+3 = 11 HCP
        suit('diamonds', 7), suit('clubs', 7),
      ],
    )
    expect(shouldBotRekontra(hand, 'hard')).toBe(false)
  })

  it('hard mode: 6 trumps + max HCP does NOT rekontra (trump count too low)', () => {
    const hand = handWith(
      [t(2),t(3),t(4),t(5),t(6),t(7)],  // 6 trumps
      [
        suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'), suit('diamonds', 'K'),
        suit('clubs', 'Q'), suit('spades', 'Q'),
      ],
    )
    expect(shouldBotRekontra(hand, 'hard')).toBe(false)
  })
})

// ── Void-suit distribution bonus in bidding (hard mode) ──────────────────────
// A void suit effectively adds +1 to the partner-contract trump threshold:
// when void, the bot can ruff that suit immediately — similar to one extra trump.

describe('recommendBid — void suit bonus (hard mode)', () => {
  it('hard mode: 5 trumps + void suit bids two instead of three', () => {
    // 5 trumps (ceiling = three). Void in diamonds → ptTrumps=6 → ceiling = two.
    // HCP = 5 (J+Kn) — no HCP boost (< 8).
    const hand: Card[] = [
      trump(2), trump(3), trump(4), trump(5), trump(6),
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),
      suit('spades', 7), suit('spades', 8),
      suit('hearts', 'J'), suit('hearts', 'Kn'),  // no diamonds → void
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(5)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('two')
  })

  it('hard mode: 5 trumps + no void still bids three (unaffected)', () => {
    // Same trump count but all 4 suits covered → no void bonus → ceiling = three.
    const hand: Card[] = [
      trump(2), trump(3), trump(4), trump(5), trump(6),
      suit('clubs', 7), suit('clubs', 8),
      suit('spades', 7), suit('spades', 8),
      suit('hearts', 'J'),
      suit('diamonds', 1), suit('clubs', 9),  // diamonds present → no void
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(5)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('three')
  })

  it('easy mode: 5 trumps + void still bids three (void bonus is hard-mode only)', () => {
    // Same hand as first test — easy mode ignores void bonus.
    const hand: Card[] = [
      trump(2), trump(3), trump(4), trump(5), trump(6),
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),
      suit('spades', 7), suit('spades', 8),
      suit('hearts', 'J'), suit('hearts', 'Kn'),  // no diamonds → void
    ]
    const ev = evaluateHand(hand)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'easy')
    expect(rec).toBe('three')
  })

  it('hard mode: 6 trumps + void bids one instead of two (effective 7 trumps)', () => {
    // 6 trumps (ceiling = two). Void in diamonds → ptTrumps=min(7,7)=7 → ceiling = one.
    const hand: Card[] = [
      trump(2), trump(3), trump(4), trump(5), trump(6), trump(7),
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),
      suit('spades', 7), suit('spades', 8),
      suit('hearts', 'J'),  // no diamonds → void
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(6)
    const legal: import('../src/engine/types').Contract[] = ['two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('one')
  })
})
