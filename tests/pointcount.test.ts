import { describe, it, expect } from 'vitest'
import { countPoints } from '../src/engine/pointcount'
import { buildDeck } from '../src/engine/deck'
import type { Card, SuitCard, TrumpCard } from '../src/engine/types'

function makeCard(points: 1 | 2 | 3 | 4 | 5): Card {
  return { kind: 'suit', suit: 'clubs', rank: 'K', points } as SuitCard
}

function low(): Card { return { kind: 'suit', suit: 'clubs', rank: 7, points: 1 } as SuitCard }
function king(): Card { return { kind: 'suit', suit: 'clubs', rank: 'K', points: 5 } as SuitCard }
function queen(): Card { return { kind: 'suit', suit: 'clubs', rank: 'Q', points: 4 } as SuitCard }

describe('countPoints', () => {
  it('empty hand scores 0', () => {
    expect(countPoints([])).toBe(0)
  })

  it('single low card (1pt) scores 0', () => {
    expect(countPoints([low()])).toBe(0)
  })

  it('single King (5pt) scores 4', () => {
    expect(countPoints([king()])).toBe(4)
  })

  it('two low cards score 1', () => {
    expect(countPoints([low(), low()])).toBe(1)
  })

  it('two cards high+low (5+1) score 5', () => {
    expect(countPoints([king(), low()])).toBe(5)
  })

  it('three low cards score 1', () => {
    expect(countPoints([low(), low(), low()])).toBe(1)
  })

  it('three Kings (5+5+5) score 13', () => {
    expect(countPoints([king(), king(), king()])).toBe(13)
  })

  it('one King + two lows (5+1+1) score 5', () => {
    expect(countPoints([king(), low(), low()])).toBe(5)
  })

  it('full 54-card deck scores exactly 70', () => {
    expect(countPoints(buildDeck())).toBe(70)
  })

  it('6 cards: 3 Kings + 3 lows = 14', () => {
    // Group 1: K(5)+K(5)+low(1) = 11-2 = 9
    // Group 2: K(5)+low(1)+low(1) = 7-2 = 5
    // Total = 14
    expect(countPoints([king(), king(), low(), king(), low(), low()])).toBe(14)
  })

  it('4 cards: 2 Kings + 2 lows', () => {
    // Group 1 (3): K(5)+K(5)+low(1) = 11-2 = 9
    // Leftover 1: low(1) = 1-1 = 0
    // Total = 9
    expect(countPoints([king(), king(), low(), low()])).toBe(9)
  })

  it('5 cards: 3 Kings + 2 lows', () => {
    // Group 1 (3): K(5)+K(5)+K(5) = 15-2 = 13
    // Leftover 2: low(1)+low(1) = 2-1 = 1
    // Total = 14
    expect(countPoints([king(), king(), king(), low(), low()])).toBe(14)
  })

  it('Pagat/Mond/Škis as a group scores 13', () => {
    const deck = buildDeck()
    const pagat = deck.find(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 1)!
    const mond = deck.find(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 21)!
    const skis = deck.find(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)!
    expect(countPoints([pagat, mond, skis])).toBe(13)
  })

  it('16-card hand total points consistent: group math holds', () => {
    // 16 cards: 5 full groups of 3 (15 cards) + 1 leftover
    const cards: Card[] = [
      ...Array(5).fill(null).map(() => king()),
      ...Array(11).fill(null).map(() => low()),
    ]
    const result = countPoints(cards)
    // 5 groups of 3:
    // We have 5 kings(5pt) and 11 lows(1pt)
    // Sort doesn't matter — just group by 3
    // Groups: KKL(9), KKL(9), KLL(5), LLL(1), LLL(1) + leftover L(0)
    // = 9+9+5+1+1+0 = 25
    expect(result).toBe(25)
  })

  it('scoring is order-independent for same set of cards', () => {
    const cards1 = [king(), low(), queen()]
    const cards2 = [queen(), king(), low()]
    expect(countPoints(cards1)).toBe(countPoints(cards2))
  })
})
