import { describe, it, expect } from 'vitest'
import {
  buildDeck, cardId, cardPoints, isPagat, isMond, isSkis,
  isTrump, isKing, isTrula, trumpStrength, suitStrength,
} from '../src/engine/deck'
import type { TrumpCard, SuitCard } from '../src/engine/types'

describe('buildDeck', () => {
  it('produces exactly 54 cards', () => {
    expect(buildDeck()).toHaveLength(54)
  })

  it('contains 22 trumps with ordinals 1–22', () => {
    const deck = buildDeck()
    const trumps = deck.filter(c => c.kind === 'trump') as TrumpCard[]
    expect(trumps).toHaveLength(22)
    const ordinals = trumps.map(t => t.ordinal).sort((a, b) => a - b)
    expect(ordinals).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22])
  })

  it('contains 32 suit cards (4 suits × 8 ranks)', () => {
    const deck = buildDeck()
    expect(deck.filter(c => c.kind === 'suit')).toHaveLength(32)
  })

  it('black suits contain ranks 7,8,9,10,J,Kn,Q,K', () => {
    const deck = buildDeck()
    for (const suit of ['clubs', 'spades'] as const) {
      const cards = deck.filter(c => c.kind === 'suit' && c.suit === suit) as SuitCard[]
      expect(cards).toHaveLength(8)
      const ranks = cards.map(c => c.rank).sort()
      expect(ranks).toEqual([10, 7, 8, 9, 'J', 'K', 'Kn', 'Q'].sort())
    }
  })

  it('red suits contain ranks 1,2,3,4,J,Kn,Q,K', () => {
    const deck = buildDeck()
    for (const suit of ['hearts', 'diamonds'] as const) {
      const cards = deck.filter(c => c.kind === 'suit' && c.suit === suit) as SuitCard[]
      expect(cards).toHaveLength(8)
      const ranks = cards.map(c => c.rank).sort()
      expect(ranks).toEqual([1, 2, 3, 4, 'J', 'K', 'Kn', 'Q'].sort())
    }
  })

  it('raw sum of card point values is 106', () => {
    // The "70 points" in the rules refers to countPoints(deck), not raw sum.
    // Raw: 4K(20)+4Q(16)+4Kn(12)+4J(8)+Pagat+Mond+Škis(15)+19 mid-trumps(19)+16 pip cards(16)=106
    const deck = buildDeck()
    const total = deck.reduce((s, c) => s + cardPoints(c), 0)
    expect(total).toBe(106)
  })

  it('Škis (ordinal 22) has 5 points', () => {
    const skis = buildDeck().find(isSkis)!
    expect(skis.points).toBe(5)
  })

  it('Mond (ordinal 21) has 5 points', () => {
    const mond = buildDeck().find(isMond)!
    expect(mond.points).toBe(5)
  })

  it('Pagat (ordinal 1) has 5 points', () => {
    const pagat = buildDeck().find(isPagat)!
    expect(pagat.points).toBe(5)
  })

  it('all four Kings have 5 points', () => {
    const kings = buildDeck().filter(isKing)
    expect(kings).toHaveLength(4)
    kings.forEach(k => expect(k.points).toBe(5))
  })

  it('all four Queens have 4 points', () => {
    const queens = buildDeck().filter(c => c.kind === 'suit' && c.rank === 'Q')
    expect(queens).toHaveLength(4)
    queens.forEach(q => expect(q.points).toBe(4))
  })

  it('all four Knights have 3 points', () => {
    const knights = buildDeck().filter(c => c.kind === 'suit' && c.rank === 'Kn')
    expect(knights).toHaveLength(4)
    knights.forEach(kn => expect(kn.points).toBe(3))
  })

  it('all four Jacks have 2 points', () => {
    const jacks = buildDeck().filter(c => c.kind === 'suit' && c.rank === 'J')
    expect(jacks).toHaveLength(4)
    jacks.forEach(j => expect(j.points).toBe(2))
  })

  it('trumps II–XX each have 1 point', () => {
    const midTrumps = buildDeck().filter(
      c => c.kind === 'trump' && (c as TrumpCard).ordinal >= 2 && (c as TrumpCard).ordinal <= 20,
    )
    expect(midTrumps).toHaveLength(19)
    midTrumps.forEach(t => expect(t.points).toBe(1))
  })

  it('cardId produces unique strings for all 54 cards', () => {
    const ids = buildDeck().map(cardId)
    expect(new Set(ids).size).toBe(54)
  })

  it('trumpStrength returns ordinal', () => {
    const deck = buildDeck()
    const skis = deck.find(isSkis) as TrumpCard
    const pagat = deck.find(isPagat) as TrumpCard
    expect(trumpStrength(skis)).toBe(22)
    expect(trumpStrength(pagat)).toBe(1)
  })

  it('suitStrength: King > Queen > Knight > Jack', () => {
    const deck = buildDeck()
    const clubs = deck.filter(c => c.kind === 'suit' && (c as SuitCard).suit === 'clubs') as SuitCard[]
    const K = clubs.find(c => c.rank === 'K')!
    const Q = clubs.find(c => c.rank === 'Q')!
    const Kn = clubs.find(c => c.rank === 'Kn')!
    const J = clubs.find(c => c.rank === 'J')!
    expect(suitStrength(K)).toBeGreaterThan(suitStrength(Q))
    expect(suitStrength(Q)).toBeGreaterThan(suitStrength(Kn))
    expect(suitStrength(Kn)).toBeGreaterThan(suitStrength(J))
  })

  it('isTrula identifies Škis, Mond, and Pagat only', () => {
    const deck = buildDeck()
    const trula = deck.filter(isTrula)
    expect(trula).toHaveLength(3)
    expect(trula.every(c => c.kind === 'trump')).toBe(true)
  })

  it('isTrump returns false for suit cards', () => {
    const suitCards = buildDeck().filter(c => c.kind === 'suit')
    suitCards.forEach(c => expect(isTrump(c)).toBe(false))
  })
})
