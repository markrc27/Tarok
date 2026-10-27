import { describe, it, expect } from 'vitest'
import {
  initBidding, applyBid, resolveBidding, legalBids,
  biddingOrder, contractStrength, availableContracts, forehandChoiceContracts,
} from '../src/engine/bidding'
import { initAnnouncements, applyAnnouncement, getKontraMultiplier } from '../src/engine/announce'
import { evaluateHand, recommendBid, recommendAnnouncements, shouldBotKontra, shouldBotRekontra, recommendTalonGroup } from '../src/ai/bidding-heuristic'
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

// ── Beggar bidding (hard mode) ───────────────────────────────────────────────

describe('recommendBid — beggar bidding (hard mode)', () => {
  it('hard mode: 0 trumps + hcp=0 (all low pips) bids beggar when available', () => {
    // No trumps, no courts → can't win any trick → ideal beggar hand.
    const hand: Card[] = [
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),
      suit('spades', 7), suit('spades', 8), suit('spades', 9),
      suit('hearts', 1), suit('hearts', 2),
      suit('diamonds', 1), suit('diamonds', 2), suit('diamonds', 3), suit('diamonds', 4),
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(0)
    expect(ev.highCardPoints).toBe(0)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one', 'beggar']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('beggar')
  })

  it('hard mode: 0 trumps + hcp=2 (one Knave) still bids beggar', () => {
    // One Knave adds 2 HCP but is still very low — threshold is ≤2.
    const hand: Card[] = [
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9), suit('clubs', 10),
      suit('spades', 7), suit('spades', 8), suit('spades', 9),
      suit('hearts', 1), suit('hearts', 2),
      suit('diamonds', 1), suit('diamonds', 2),
      suit('clubs', 'Kn'),  // Knave = 2 HCP
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(0)
    expect(ev.highCardPoints).toBe(2)
    const legal: import('../src/engine/types').Contract[] = ['one', 'beggar']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('beggar')
  })

  it('hard mode: 0 trumps + hcp=3 (one Queen) does NOT bid beggar — too risky', () => {
    // Q=3 HCP > threshold of 2; a Queen can win tricks → avoid beggar.
    const hand: Card[] = [
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9), suit('clubs', 10),
      suit('spades', 7), suit('spades', 8), suit('spades', 9),
      suit('hearts', 1), suit('hearts', 2), suit('hearts', 3),
      suit('diamonds', 1),
      suit('clubs', 'Q'),  // Queen = 3 HCP → above threshold
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(0)
    expect(ev.highCardPoints).toBe(3)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one', 'beggar']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('pass')
  })

  it('hard mode: 1 trump + hcp=0 does NOT bid beggar — trump could force a trick win', () => {
    // Must-beat rule would force the bot to ruff a void suit, winning a trick.
    const hand: Card[] = [
      trump(5),  // one trump
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9), suit('clubs', 10),
      suit('spades', 7), suit('spades', 8),
      suit('hearts', 1), suit('hearts', 2),
      suit('diamonds', 1), suit('diamonds', 2), suit('diamonds', 3),
    ]
    const ev = evaluateHand(hand)
    expect(ev.trumpCount).toBe(1)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one', 'beggar']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).not.toBe('beggar')
  })

  it('easy mode: 0 trumps + hcp=0 does NOT bid beggar (easy mode ignores this)', () => {
    const hand: Card[] = [
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),
      suit('spades', 7), suit('spades', 8), suit('spades', 9),
      suit('hearts', 1), suit('hearts', 2),
      suit('diamonds', 1), suit('diamonds', 2), suit('diamonds', 3), suit('diamonds', 4),
    ]
    const ev = evaluateHand(hand)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one', 'beggar']
    const rec = recommendBid(ev, legal, false, hand, 'easy')
    expect(rec).toBe('pass')
  })

  it('hard mode: beggar not in legal bids → passes (no fallback to normal contract)', () => {
    // Auction advanced past 'beggar' level; bot should pass rather than bid lower.
    const hand: Card[] = [
      suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),
      suit('spades', 7), suit('spades', 8), suit('spades', 9),
      suit('hearts', 1), suit('hearts', 2),
      suit('diamonds', 1), suit('diamonds', 2), suit('diamonds', 3), suit('diamonds', 4),
    ]
    const ev = evaluateHand(hand)
    // Only higher contracts available (beggar already overbid)
    const legal: import('../src/engine/types').Contract[] = ['solo-without', 'open-beggar']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
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

// ── Trula bump (hard mode) ────────────────────────────────────────────────────
// Holding all three trula cards (Škis + Mond + Pagat) is worth ~1 extra effective
// trump in hard mode — Mond/Škis are the two strongest trumps, and the trula bonus
// (+10 unannounced, +20 announced) significantly raises expected hand value.

describe('recommendBid — trula bump (hard mode)', () => {
  it('hard mode: 6 trumps + all trula bids one instead of two', () => {
    // trumpCount=6 → ceiling=two normally. trulaBump lifts to one.
    const hand: Card[] = [
      trump(22), trump(21), trump(1),  // Škis, Mond, Pagat (all trula)
      trump(2), trump(3), trump(4),    // 3 more → 6 total
      suit('clubs', 7), suit('hearts', 7), suit('spades', 7), suit('diamonds', 7),
      suit('clubs', 8), suit('hearts', 8),
    ]
    const ev = evaluateHand(hand)
    expect(ev.trulaPotential).toBe(3)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('one')
  })

  it('hard mode: 5 trumps + all trula bids two instead of three', () => {
    // trumpCount=5 → ceiling=three normally. trulaBump lifts to two.
    const hand: Card[] = [
      trump(22), trump(21), trump(1),
      trump(2), trump(3),
      suit('clubs', 7), suit('hearts', 7), suit('spades', 7), suit('diamonds', 7),
      suit('clubs', 8), suit('hearts', 8), suit('spades', 8),
    ]
    const ev = evaluateHand(hand)
    expect(ev.trulaPotential).toBe(3)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('two')
  })

  it('easy mode: 6 trumps + all trula still bids two (no trula bump)', () => {
    const hand: Card[] = [
      trump(22), trump(21), trump(1),
      trump(2), trump(3), trump(4),
      suit('clubs', 7), suit('hearts', 7), suit('spades', 7), suit('diamonds', 7),
      suit('clubs', 8), suit('hearts', 8),
    ]
    const ev = evaluateHand(hand)
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'easy')
    expect(rec).toBe('two')
  })

  it('hard mode: trulaPotential=2 does NOT trigger bump', () => {
    // Škis+Mond but no Pagat — trulaPotential=2, no bump.
    // 2 Jacks → HCP=2: avoids hcpPenalty (<=1) AND hcpBoost (>=8).
    const hand: Card[] = [
      trump(22), trump(21),
      trump(2), trump(3), trump(4), trump(5),
      suit('clubs', 'J'), suit('hearts', 'J'),  // HCP=2 (no penalty, no boost)
      suit('clubs', 7), suit('hearts', 1), suit('spades', 7), suit('diamonds', 1),
    ]
    const ev = evaluateHand(hand)
    expect(ev.trulaPotential).toBe(2)
    expect(ev.highCardPoints).toBe(2)  // between 1 and 8 — no modifier fires
    const legal: import('../src/engine/types').Contract[] = ['three', 'two', 'one']
    const rec = recommendBid(ev, legal, false, hand, 'hard')
    expect(rec).toBe('two')  // ceiling stays at two — trulaPotential=2, not 3
  })
})

// ── recommendTalonGroup — hard mode void bonus ────────────────────────────────
// Hard mode adds a +12 void bonus per suit that can be fully cleared by
// discarding after taking a group. A void enables ruffing all future leads
// in that suit instead of being forced to follow.

describe('recommendTalonGroup — hard mode void bonus', () => {
  it('HARD: group enabling a void preferred over group with more raw points', () => {
    // hand has no clubs (0 club cards); group 1 has only [7♣, 8♣] — taking it and
    // discarding both creates a clubs void (inSuit=2 ≤ groupSize=2, no king).
    // group 0 has 6pt raw; group 1 has 2pt + 12 void = 14pt → group 1 wins.
    const hand: Card[] = [trump(5), suit('hearts', 'K'), suit('spades', 'Q')]
    const group0: Card[] = [suit('hearts', 'Q'), suit('spades', 'J')]  // 4+2 = 6pt
    const group1: Card[] = [suit('clubs', 7), suit('clubs', 8)]        // 1+1 = 2pt, clubs void
    expect(recommendTalonGroup([group0, group1], hand, 2, 'hard')).toBe(1)
  })

  it('EASY: raw points win — no void bonus applied', () => {
    // same groups as above; easy mode ignores void bonus → group 0 (6pt) wins
    const hand: Card[] = [trump(5), suit('hearts', 'K'), suit('spades', 'Q')]
    const group0: Card[] = [suit('hearts', 'Q'), suit('spades', 'J')]  // 6pt
    const group1: Card[] = [suit('clubs', 7), suit('clubs', 8)]        // 2pt
    expect(recommendTalonGroup([group0, group1], hand, 2, 'easy')).toBe(0)
  })

  it('HARD: king-in-suit blocks void bonus even when suit count ≤ groupSize', () => {
    // group 1 has [K♣, 7♣] (1 non-king suit card) with no clubs in hand.
    // combined clubs = 2 ≤ groupSize=2 BUT hasKing=true → no void bonus.
    // group 0 has 7pt raw, group 1 has 6pt raw. group 0 wins.
    const hand: Card[] = [trump(5), suit('hearts', 7)]  // 0 clubs, 0 diamonds
    const group0: Card[] = [suit('diamonds', 'Q'), suit('diamonds', 'J')]  // 4+2 = 6pt, diamonds void → +12 → 18pt
    const group1: Card[] = [suit('clubs', 'K'), suit('clubs', 7)]          // 5+1 = 6pt, clubs has king → no void
    // hard mode: group 0 gets diamonds void (no diamonds in hand, no king) → 6+12=18; group 1 = 6. Group 0 wins.
    expect(recommendTalonGroup([group0, group1], hand, 2, 'hard')).toBe(0)
  })
})

// ── recommendTalonGroup — trula/kings set bonus ───────────────────────────────
// Hard mode: taking a group that COMPLETES Pagat+Mond+Škis (trula) or all 4 kings
// enables announcing that bonus (+20 each). Add +20 to such groups' score.

describe('recommendTalonGroup — trula and kings set bonus (hard mode)', () => {
  it('HARD: group with Pagat completes trula (hand has Mond+Škis) → +20 bonus, beats raw-point rival', () => {
    // hand has Mond(21) + Škis(22) — one trula card away.
    // group0: Pagat(5pt) → completes trula (+20) → score = 5+20 = 25
    // group1: K♣(5pt) + Q♣(4pt) → score = 9
    // Hard: group0 wins (25 > 9).
    const hand: Card[] = [trump(21), trump(22), trump(5), suit('hearts', 7)]
    const group0: Card[] = [trump(1)]                           // Pagat = 5pt + trula +20
    const group1: Card[] = [suit('clubs', 'K'), suit('clubs', 'Q')]  // K+Q = 9pt
    expect(recommendTalonGroup([group0, group1], hand, 1, 'hard')).toBe(0)
  })

  it('EASY: no trula set bonus — raw points win (group1 with 9pt beats Pagat group at 5pt)', () => {
    const hand: Card[] = [trump(21), trump(22), trump(5), suit('hearts', 7)]
    const group0: Card[] = [trump(1)]
    const group1: Card[] = [suit('clubs', 'K'), suit('clubs', 'Q')]
    expect(recommendTalonGroup([group0, group1], hand, 1, 'easy')).toBe(1)
  })

  it('HARD: no trula bonus when hand already has all three trula cards', () => {
    // hand already has Pagat+Mond+Škis — completing trula from group is irrelevant.
    // group0: Pagat again (impossible in real game, but tests the guard).
    // group1: K♣(5) + Q♣(4) = 9pt → higher raw score → group1 wins.
    const hand: Card[] = [trump(1), trump(21), trump(22), suit('hearts', 7)]
    const group0: Card[] = [trump(2)]                                       // T2 = 1pt, no set bonus
    const group1: Card[] = [suit('clubs', 'K'), suit('clubs', 'Q')]         // 9pt
    expect(recommendTalonGroup([group0, group1], hand, 1, 'hard')).toBe(1)
  })

  it('HARD: group completing all 4 kings → +20 kings bonus beats rival', () => {
    // hand has K♠, K♥, K♦ — one king away.
    // group0: K♣(5pt) → completes all kings (+20) → score = 5+20 = 25
    // group1: Q♣(4pt) + J♣(2pt) → score = 6
    const hand: Card[] = [
      suit('spades', 'K'), suit('hearts', 'K'), suit('diamonds', 'K'),
      trump(5),
    ]
    const group0: Card[] = [suit('clubs', 'K')]                          // K♣ = 5pt + kings +20
    const group1: Card[] = [suit('clubs', 'Q'), suit('clubs', 'J')]     // 4+2 = 6pt
    expect(recommendTalonGroup([group0, group1], hand, 1, 'hard')).toBe(0)
  })
})

// ── Opponent bot trula/kings announcements ────────────────────────────────────
// In hard mode, opponent bots announce trula/kings when they hold all relevant
// cards — this doubles the bonus value compared to unannounced. The store
// filters out pagat-ultimo and king-ultimo (declarer-side only).

describe('opponent bot — trula/kings announcement logic (hard mode)', () => {
  it('opponent holding all 3 trula cards → trula announced in state', () => {
    // Simulate the store's per-opponent loop: recommendAnnouncements → filter → applyAnnouncement
    const hand: Card[] = [
      trump(22), trump(21), trump(1),  // Škis, Mond, Pagat (all trula)
      trump(5), trump(6), trump(7), trump(8),
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7),
      suit('clubs', 8),
    ]
    let ann = initAnnouncements()
    for (const bonus of recommendAnnouncements(hand)) {
      if (bonus === 'trula' || bonus === 'kings') {
        ann = applyAnnouncement(ann, { kind: 'announce', seat: 2 as Seat, bonus }, 0 as Seat, null)
      }
    }
    expect(ann.announcements.find(a => a.bonus === 'trula')).toBeDefined()
    expect(ann.announcements.find(a => a.bonus === 'trula')?.by).toBe(2)
  })

  it('opponent holding all 4 kings → kings announced in state', () => {
    const hand: Card[] = [
      suit('clubs', 'K'), suit('spades', 'K'), suit('hearts', 'K'), suit('diamonds', 'K'),
      trump(5), trump(6), trump(7), trump(8),
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7),
    ]
    let ann = initAnnouncements()
    for (const bonus of recommendAnnouncements(hand)) {
      if (bonus === 'trula' || bonus === 'kings') {
        ann = applyAnnouncement(ann, { kind: 'announce', seat: 3 as Seat, bonus }, 0 as Seat, null)
      }
    }
    expect(ann.announcements.find(a => a.bonus === 'kings')).toBeDefined()
    expect(ann.announcements.find(a => a.bonus === 'kings')?.by).toBe(3)
  })

  it('opponent with pagat + 9 trumps → pagat-ultimo filtered out (opponents only announce trula/kings)', () => {
    // recommendAnnouncements returns pagat-ultimo for 9 trumps + pagat, but the
    // opponent bot loop only passes trula/kings — pagat-ultimo must not appear.
    const hand: Card[] = [
      trump(1), trump(2), trump(3), trump(4), trump(5), trump(6), trump(7), trump(8), trump(9),
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7),
    ]
    let ann = initAnnouncements()
    for (const bonus of recommendAnnouncements(hand)) {
      if (bonus === 'trula' || bonus === 'kings') {
        ann = applyAnnouncement(ann, { kind: 'announce', seat: 1 as Seat, bonus }, 0 as Seat, null)
      }
    }
    expect(ann.announcements.find(a => a.bonus === 'pagat-ultimo')).toBeUndefined()
  })
})

// ── Opponent bot subkontra after declarer rekontra ────────────────────────────
// The kontra chain: kontra(×2) → rekontra(×4) → subkontra(×8) → mordkontra(×16).
// When the declarer rekontras, a dominant-trump opponent bot should subkontra —
// the same hand strength that justified the initial kontra holds after the rekontra.

describe('opponent bot subkontra after declarer rekontra', () => {
  function strongHand(): Card[] {
    // 8 trumps — meets the hard-mode kontra threshold (≥8 trumps)
    return [
      trump(2), trump(3), trump(4), trump(5), trump(6), trump(7), trump(8), trump(9),
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7),
    ]
  }

  it('HARD: dominant-trump hand subkontras after declarer rekontra (×8)', () => {
    // Simulate the full kontra chain: opponent kontras (×2), declarer rekontras (×4),
    // then the same opponent subkontras (×8) using shouldBotKontra check.
    let ann = initAnnouncements()
    // Step 1: opponent (seat 2) initial kontra
    ann = applyAnnouncement(ann, { kind: 'kontra', seat: 2 as Seat, target: 'game' }, 0 as Seat, null)
    expect(getKontraMultiplier(ann, 'game')).toBe(2)
    // Step 2: declarer (seat 0) rekontra
    ann = applyAnnouncement(ann, { kind: 'kontra', seat: 0 as Seat, target: 'game' }, 0 as Seat, null)
    expect(getKontraMultiplier(ann, 'game')).toBe(4)
    // Step 3: opponent subkontra — store uses shouldBotKontra for the same threshold
    if (shouldBotKontra(strongHand(), 'hard')) {
      ann = applyAnnouncement(ann, { kind: 'kontra', seat: 2 as Seat, target: 'game' }, 0 as Seat, null)
    }
    expect(getKontraMultiplier(ann, 'game')).toBe(8)  // subkontra achieved
  })

  it('EASY: no subkontra even with strong hand (easy mode never kontras)', () => {
    expect(shouldBotKontra(strongHand(), 'easy')).toBe(false)
    // → subkontra never applied in easy mode
    let ann = initAnnouncements()
    ann = applyAnnouncement(ann, { kind: 'kontra', seat: 2 as Seat, target: 'game' }, 0 as Seat, null)
    ann = applyAnnouncement(ann, { kind: 'kontra', seat: 0 as Seat, target: 'game' }, 0 as Seat, null)
    // easy mode: shouldBotKontra returns false → no subkontra applied
    if (shouldBotKontra(strongHand(), 'easy')) {
      ann = applyAnnouncement(ann, { kind: 'kontra', seat: 2 as Seat, target: 'game' }, 0 as Seat, null)
    }
    expect(getKontraMultiplier(ann, 'game')).toBe(4)  // stays at rekontra, no subkontra
  })

  it('HARD: weak hand (7 trumps) does NOT subkontra after rekontra', () => {
    // 7 trumps — below the 8-trump hard-mode kontra threshold
    const weakHand: Card[] = [
      trump(2), trump(3), trump(4), trump(5), trump(6), trump(7), trump(8),
      suit('clubs', 7), suit('spades', 7), suit('hearts', 7), suit('diamonds', 7), suit('clubs', 8),
    ]
    expect(shouldBotKontra(weakHand, 'hard')).toBe(false)
    // → no subkontra for a hand below threshold
  })
})
