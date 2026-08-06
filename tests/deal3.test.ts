import { describe, it, expect } from 'vitest'
import { dealHands3, deal3 } from '../src/engine/deal3'
import { buildDeck } from '../src/engine/deck'
import { shuffle } from '../src/engine/shuffle'
import type { Seat } from '../src/engine/types'
import { countPoints } from '../src/engine/pointcount'

describe('dealHands3', () => {
  const deck = shuffle(buildDeck(), () => 0.5)

  it('deals 16 cards to each of seats 0-2, 0 to seat 3', () => {
    const result = dealHands3(deck, 0)
    expect(result.hands[0].length).toBe(16)
    expect(result.hands[1].length).toBe(16)
    expect(result.hands[2].length).toBe(16)
    expect(result.hands[3].length).toBe(0)
  })

  it('talon has 6 cards', () => {
    const result = dealHands3(deck, 0)
    expect(result.talon.length).toBe(6)
  })

  it('total cards = 54 (16*3 + 6)', () => {
    const result = dealHands3(deck, 0)
    const total = result.hands[0].length + result.hands[1].length + result.hands[2].length + result.hands[3].length + result.talon.length
    expect(total).toBe(54)
  })

  it('card conservation: total points = 70', () => {
    const result = dealHands3(deck, 0)
    const allCards = [...result.hands[0], ...result.hands[1], ...result.hands[2], ...result.talon]
    expect(countPoints(allCards)).toBe(70)
  })

  it('forehand is (dealer+2)%3 for each dealer', () => {
    for (const dealer of [0, 1, 2] as Seat[]) {
      const result = dealHands3(deck, dealer)
      expect(result.forehand).toBe((dealer + 2) % 3)
    }
  })

  it('dealer is set correctly', () => {
    const result = dealHands3(deck, 1)
    expect(result.dealer).toBe(1)
  })
})

describe('deal3 void deal', () => {
  it('returns normal deal when all active seats have trumps', () => {
    // Run enough times to expect at least one normal deal
    let attempts = 0
    let gotNormal = false
    while (attempts < 100 && !gotNormal) {
      const outcome = deal3(0)
      if (outcome.kind === 'normal') gotNormal = true
      attempts++
    }
    expect(gotNormal).toBe(true)
  })

  it('void deal only triggers for seats 0-2, not seat 3', () => {
    // Seat 3 hand is empty, so hasZeroTrumps check should not fire for it
    const result = dealHands3(buildDeck(), 0)
    expect(result.hands[3].length).toBe(0)
    // deal3 should never report seat 3 as zeroTrumpSeat
    for (let i = 0; i < 20; i++) {
      const outcome = deal3(0)
      if (outcome.kind === 'void-deal') {
        expect(outcome.zeroTrumpSeat).not.toBe(3)
      }
    }
  })
})
