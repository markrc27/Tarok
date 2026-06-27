import { describe, it, expect } from 'vitest'
import { deal, dealHands, hasZeroTrumps, anticlockwiseSeatOrder } from '../src/engine/deal'
import { buildDeck, cardId } from '../src/engine/deck'
import type { Seat, Card } from '../src/engine/types'

function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

describe('anticlockwiseSeatOrder', () => {
  it('returns 4 seats starting from given seat', () => {
    expect(anticlockwiseSeatOrder(0)).toHaveLength(4)
    expect(anticlockwiseSeatOrder(0)[0]).toBe(0)
  })

  it('anticlockwise from seat 0 is [0, 3, 2, 1]', () => {
    expect(anticlockwiseSeatOrder(0)).toEqual([0, 3, 2, 1])
  })

  it('anticlockwise from seat 1 is [1, 0, 3, 2]', () => {
    expect(anticlockwiseSeatOrder(1)).toEqual([1, 0, 3, 2])
  })
})

describe('dealHands', () => {
  it('produces exactly 54 total cards across hands + talon', () => {
    const deck = buildDeck()
    const result = dealHands(deck, 0)
    const total = Object.values(result.hands).reduce((s, h) => s + h.length, 0) + result.talon.length
    expect(total).toBe(54)
  })

  it('talon has exactly 6 cards', () => {
    const result = dealHands(buildDeck(), 0)
    expect(result.talon).toHaveLength(6)
  })

  it('each player gets exactly 12 cards', () => {
    const result = dealHands(buildDeck(), 0)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(result.hands[seat]).toHaveLength(12)
    }
  })

  it('all cards are unique (no duplicates)', () => {
    const result = dealHands(buildDeck(), 0)
    const all: Card[] = [
      ...result.talon,
      ...result.hands[0],
      ...result.hands[1],
      ...result.hands[2],
      ...result.hands[3],
    ]
    const ids = all.map(cardId)
    expect(new Set(ids).size).toBe(54)
  })

  it('forehand is one seat anticlockwise of dealer (dealer + 3 mod 4)', () => {
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const result = dealHands(buildDeck(), dealer)
      expect(result.forehand).toBe(((dealer + 3) % 4) as Seat)
    }
  })

  it('deal order starts with forehand', () => {
    const result = dealHands(buildDeck(), 0)
    expect(result.dealOrder[0]).toBe(result.forehand)
  })
})

describe('hasZeroTrumps', () => {
  it('returns true when no trumps in hand', () => {
    const deck = buildDeck()
    const suitOnly = deck.filter(c => c.kind === 'suit').slice(0, 6)
    expect(hasZeroTrumps(suitOnly)).toBe(true)
  })

  it('returns false when hand has at least one trump', () => {
    const deck = buildDeck()
    const withTrump = [
      ...deck.filter(c => c.kind === 'suit').slice(0, 5),
      deck.find(c => c.kind === 'trump')!,
    ]
    expect(hasZeroTrumps(withTrump)).toBe(false)
  })
})

describe('deal', () => {
  it('with seeded RNG produces deterministic results', () => {
    const r1 = deal(0, seededRng(42))
    const r2 = deal(0, seededRng(42))
    expect(r1.result.talon.map(cardId)).toEqual(r2.result.talon.map(cardId))
  })

  it('normal deal produces normal outcome for typical hand', () => {
    // With enough seeds, at least some will produce normal deals
    let found = false
    for (let seed = 0; seed < 100; seed++) {
      const outcome = deal(0, seededRng(seed))
      if (outcome.kind === 'normal') { found = true; break }
    }
    expect(found).toBe(true)
  })

  it('detects void deal when a player has no trumps', () => {
    // dealer=3, forehand=seat2, playerOrder=[2,1,0,3]
    // Seat 2 gets deck positions [6:12] and [30:36]
    // Construct deck so those two packets are all suit cards
    const deck = buildDeck()
    const suits = deck.filter(c => c.kind === 'suit')   // 32 suit cards
    const trumps = deck.filter(c => c.kind === 'trump') // 22 trump cards
    // Layout: talon(6 suits) | seat2-p1(6 suits) | seat1-p1(6 trumps) |
    //         seat0-p1(6 trumps) | seat3-p1(6 trumps) | seat2-p2(6 suits) |
    //         seat1-p2(4 trumps+2 suits) | seat0-p2(6 suits) | seat3-p2(6 suits)
    const rigged: Card[] = [
      ...suits.slice(0, 6),    // talon [0:6]
      ...suits.slice(6, 12),   // seat2 packet1 [6:12] — all suits
      ...trumps.slice(0, 6),   // seat1 packet1 [12:18]
      ...trumps.slice(6, 12),  // seat0 packet1 [18:24]
      ...trumps.slice(12, 18), // seat3 packet1 [24:30]
      ...suits.slice(12, 18),  // seat2 packet2 [30:36] — all suits
      ...trumps.slice(18, 22), // seat1 packet2 (partial) [36:40]
      ...suits.slice(18, 20),  // seat1 packet2 (fill) [40:42]
      ...suits.slice(20, 26),  // seat0 packet2 [42:48]
      ...suits.slice(26, 32),  // seat3 packet2 [48:54]
    ]
    expect(rigged).toHaveLength(54)
    const result = dealHands(rigged, 3)
    expect(hasZeroTrumps(result.hands[2])).toBe(true)
  })
})
