import { describe, it, expect } from 'vitest'
import {
  initAnnouncements, bonusBaseValue, canAnnounce, nextKontraLevel,
  applyAnnouncement, getKontraMultiplier, evaluateBonus,
} from '../src/engine/announce'
import type { Card, Seat, SuitCard, TrumpCard, Trick } from '../src/engine/types'

function trump(ordinal: number): TrumpCard {
  return { kind: 'trump', ordinal: ordinal as TrumpCard['ordinal'], points: ordinal === 1 || ordinal === 21 || ordinal === 22 ? 5 : 1 }
}
function king(s: 'clubs'|'spades'|'hearts'|'diamonds'): SuitCard {
  return { kind: 'suit', suit: s, rank: 'K', points: 5 }
}
function low(): SuitCard {
  return { kind: 'suit', suit: 'clubs', rank: 7, points: 1 } as SuitCard
}

const pagat = trump(1)
const mond = trump(21)
const skis = trump(22)

describe('bonusBaseValue', () => {
  it('trula: 10 unannounced, 20 announced', () => {
    expect(bonusBaseValue('trula', false)).toBe(10)
    expect(bonusBaseValue('trula', true)).toBe(20)
  })

  it('pagat-ultimo: 25 unannounced, 50 announced', () => {
    expect(bonusBaseValue('pagat-ultimo', false)).toBe(25)
    expect(bonusBaseValue('pagat-ultimo', true)).toBe(50)
  })

  it('valat: 250 unannounced, 500 announced', () => {
    expect(bonusBaseValue('valat', false)).toBe(250)
    expect(bonusBaseValue('valat', true)).toBe(500)
  })
})

describe('canAnnounce', () => {
  it('only Pagat-holder may announce pagat-ultimo', () => {
    const hands: Record<Seat, Card[]> = {
      0: [pagat, low()],
      1: [low()],
      2: [low()],
      3: [low()],
    }
    expect(canAnnounce(0, 'pagat-ultimo', null, hands, 0)).toBe(true)
    expect(canAnnounce(1, 'pagat-ultimo', null, hands, 0)).toBe(false)
  })

  it('only king-holder on declarer side may announce king-ultimo', () => {
    const hands: Record<Seat, Card[]> = {
      0: [king('clubs'), low()],
      1: [low()],
      2: [low()],
      3: [low()],
    }
    // Seat 0 is declarer, holds a king
    expect(canAnnounce(0, 'king-ultimo', null, hands, 0)).toBe(true)
    // Seat 1 is opponent
    expect(canAnnounce(1, 'king-ultimo', null, hands, 0)).toBe(false)
  })

  it('trula can be announced by any player', () => {
    const hands: Record<Seat, Card[]> = {
      0: [low()], 1: [low()], 2: [low()], 3: [low()],
    }
    expect(canAnnounce(0, 'trula', null, hands, 0)).toBe(true)
    expect(canAnnounce(2, 'trula', null, hands, 0)).toBe(true)
  })
})

describe('nextKontraLevel', () => {
  it('none → kontra by opponents', () => {
    expect(nextKontraLevel(1, false)).toBe(2)
  })

  it('kontra → rekontra by declarer side', () => {
    expect(nextKontraLevel(2, true)).toBe(4)
  })

  it('rekontra → subkontra by opponents', () => {
    expect(nextKontraLevel(4, false)).toBe(8)
  })

  it('subkontra → mordkontra by declarer side', () => {
    expect(nextKontraLevel(8, true)).toBe(16)
  })

  it('cannot kontra beyond mordkontra', () => {
    expect(nextKontraLevel(16, false)).toBeNull()
    expect(nextKontraLevel(16, true)).toBeNull()
  })

  it('wrong side cannot kontra (opponents cannot rekontra)', () => {
    expect(nextKontraLevel(2, false)).toBeNull() // opponents cannot rekontra
  })
})

describe('kontra chain', () => {
  it('opponent kontras game, declarer rekontras', () => {
    let state = initAnnouncements()
    // Opponent (seat 2) kontras the game
    state = applyAnnouncement(state, { kind: 'kontra', seat: 2, target: 'game' }, 0, null)
    expect(getKontraMultiplier(state, 'game')).toBe(2)

    // Declarer (seat 0) rekontras
    state = applyAnnouncement(state, { kind: 'rekontra', seat: 0, target: 'game' }, 0, null)
    expect(getKontraMultiplier(state, 'game')).toBe(4)
  })

  it('kontra targets are independent', () => {
    let state = initAnnouncements()
    state = applyAnnouncement(state, { kind: 'announce', seat: 0, bonus: 'trula' }, 0, null)
    state = applyAnnouncement(state, { kind: 'kontra', seat: 2, target: 'game' }, 0, null)
    state = applyAnnouncement(state, { kind: 'kontra', seat: 2, target: 'trula' }, 0, null)

    expect(getKontraMultiplier(state, 'game')).toBe(2)
    expect(getKontraMultiplier(state, 'trula')).toBe(2)
    expect(getKontraMultiplier(state, 'kings')).toBe(1) // not touched
  })
})

describe('evaluateBonus', () => {
  const emptyCaptured: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] }

  it('trula: declarer side has Škis, Mond, Pagat', () => {
    const captured: Record<Seat, Card[]> = {
      0: [skis, mond, pagat],
      1: [], 2: [], 3: [],
    }
    expect(evaluateBonus('trula', captured, [], 0, null, null)).toBe(true)
  })

  it('trula: fails if Pagat on opponent side', () => {
    const captured: Record<Seat, Card[]> = {
      0: [skis, mond],
      1: [pagat], 2: [], 3: [],
    }
    expect(evaluateBonus('trula', captured, [], 0, null, null)).toBe(false)
  })

  it('kings: declarer side has all 4 kings', () => {
    const captured: Record<Seat, Card[]> = {
      0: [king('clubs'), king('spades'), king('hearts'), king('diamonds')],
      1: [], 2: [], 3: [],
    }
    expect(evaluateBonus('kings', captured, [], 0, null, null)).toBe(true)
  })

  it('kings: fails with only 3 kings', () => {
    const captured: Record<Seat, Card[]> = {
      0: [king('clubs'), king('spades'), king('hearts')],
      1: [], 2: [], 3: [],
    }
    expect(evaluateBonus('kings', captured, [], 0, null, null)).toBe(false)
  })

  it('pagat-ultimo: Pagat wins last trick for declarer side', () => {
    const lastTrick: Trick = {
      cards: [{ seat: 0, card: pagat }],
      winner: 0,
    }
    expect(evaluateBonus('pagat-ultimo', emptyCaptured, [lastTrick], 0, null, null)).toBe(true)
  })

  it('pagat-ultimo: fails when opponent wins last trick with Pagat', () => {
    const lastTrick: Trick = {
      cards: [{ seat: 1, card: pagat }],
      winner: 1,
    }
    expect(evaluateBonus('pagat-ultimo', emptyCaptured, [lastTrick], 0, null, null)).toBe(false)
  })

  it('valat: declarer side wins every trick', () => {
    const tricks: Trick[] = [
      { cards: [], winner: 0 },
      { cards: [], winner: 0 },
    ]
    expect(evaluateBonus('valat', emptyCaptured, tricks, 0, null, null)).toBe(true)
  })

  it('valat: fails when opponent wins a trick', () => {
    const tricks: Trick[] = [
      { cards: [], winner: 0 },
      { cards: [], winner: 1 },
    ]
    expect(evaluateBonus('valat', emptyCaptured, tricks, 0, null, null)).toBe(false)
  })

  it('unannounced bonus still evaluates correctly', () => {
    // Even without an announcement, the bonus evaluation returns true/false
    const captured: Record<Seat, Card[]> = {
      0: [skis, mond, pagat],
      1: [], 2: [], 3: [],
    }
    expect(evaluateBonus('trula', captured, [], 0, null, null)).toBe(true)
  })
})
