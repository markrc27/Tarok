import { describe, it, expect } from 'vitest'
import {
  talonGroupSize, formTalonGroups, canDiscard, selectTalonGroup,
  initTalonExchange, resolveKingCall, canUpgradeToColourValat,
  talonToOpponents, discardHand,
} from '../src/engine/talon'
import { buildDeck, isSkis, isMond, isPagat } from '../src/engine/deck'
import type { Card, SuitCard, TrumpCard, Seat } from '../src/engine/types'

function suit(suit: 'clubs'|'spades'|'hearts'|'diamonds', rank: string): SuitCard {
  return { kind: 'suit', suit, rank: rank as SuitCard['rank'], points: 1 } as SuitCard
}
function trump(ordinal: number): TrumpCard {
  return { kind: 'trump', ordinal: ordinal as TrumpCard['ordinal'], points: ordinal === 1 || ordinal === 21 || ordinal === 22 ? 5 : 1 } as TrumpCard
}
function king(s: 'clubs'|'spades'|'hearts'|'diamonds'): SuitCard {
  return { kind: 'suit', suit: s, rank: 'K', points: 5 }
}
function low(s: 'clubs'|'spades'|'hearts'|'diamonds' = 'clubs'): SuitCard {
  return { kind: 'suit', suit: s, rank: 7, points: 1 } as SuitCard
}

describe('talonGroupSize', () => {
  it('three/solo-three → 3', () => {
    expect(talonGroupSize('three')).toBe(3)
    expect(talonGroupSize('solo-three')).toBe(3)
  })

  it('two/solo-two → 2', () => {
    expect(talonGroupSize('two')).toBe(2)
    expect(talonGroupSize('solo-two')).toBe(2)
  })

  it('one/solo-one → 1', () => {
    expect(talonGroupSize('one')).toBe(1)
    expect(talonGroupSize('solo-one')).toBe(1)
  })

  it('contracts without talon → 0', () => {
    expect(talonGroupSize('solo-without')).toBe(0)
    expect(talonGroupSize('beggar')).toBe(0)
  })
})

describe('formTalonGroups', () => {
  it('contract three: two groups of 3', () => {
    const talon = buildDeck().slice(0, 6)
    const groups = formTalonGroups(talon, 'three')
    expect(groups).toHaveLength(2)
    groups.forEach(g => expect(g).toHaveLength(3))
  })

  it('contract two: three groups of 2', () => {
    const talon = buildDeck().slice(0, 6)
    const groups = formTalonGroups(talon, 'two')
    expect(groups).toHaveLength(3)
    groups.forEach(g => expect(g).toHaveLength(2))
  })

  it('contract one: six groups of 1', () => {
    const talon = buildDeck().slice(0, 6)
    const groups = formTalonGroups(talon, 'one')
    expect(groups).toHaveLength(6)
    groups.forEach(g => expect(g).toHaveLength(1))
  })
})

describe('canDiscard', () => {
  it('cannot discard a King', () => {
    const hand = [king('clubs'), low(), low()]
    expect(canDiscard(king('clubs'), hand)).toBe(false)
  })

  it('cannot discard Škis (ordinal 22)', () => {
    const skis = buildDeck().find(isSkis)!
    const hand = [skis, low(), low()]
    expect(canDiscard(skis, hand)).toBe(false)
  })

  it('cannot discard Mond (ordinal 21)', () => {
    const mond = buildDeck().find(isMond)!
    const hand = [mond, low(), low()]
    expect(canDiscard(mond, hand)).toBe(false)
  })

  it('cannot discard Pagat (ordinal 1)', () => {
    const pagat = buildDeck().find(isPagat)!
    const hand = [pagat, low(), low()]
    expect(canDiscard(pagat, hand)).toBe(false)
  })

  it('can discard non-trula trump only when no non-trump non-king card in hand', () => {
    const t5 = trump(5)
    const handWithSuit = [t5, low()]
    expect(canDiscard(t5, handWithSuit)).toBe(false) // suit card available

    const handTrumpsOnly = [t5, trump(6)]
    expect(canDiscard(t5, handTrumpsOnly)).toBe(true) // no suit alternative
  })

  it('can always discard regular suit non-king card', () => {
    const card = low()
    const hand = [card, low(), low()]
    expect(canDiscard(card, hand)).toBe(true)
  })
})

describe('selectTalonGroup', () => {
  it('adds group cards to hand', () => {
    const talon = buildDeck().slice(0, 6)
    const hand = buildDeck().slice(6, 18)
    const exchange = initTalonExchange(talon, 'three')
    const { updatedHand } = selectTalonGroup(exchange, 0, hand)
    expect(updatedHand).toHaveLength(15) // 12 + 3
  })

  it('unchosen groups become talonRemainder', () => {
    const talon = buildDeck().slice(0, 6)
    const exchange = initTalonExchange(talon, 'three')
    const { exchange: updated } = selectTalonGroup(exchange, 0, [])
    expect(updated.talonRemainder).toHaveLength(3) // the other group of 3
  })

  it('talonRemainder contains the unchosen groups', () => {
    const talon = buildDeck().slice(0, 6)
    const exchange = initTalonExchange(talon, 'two') // 3 groups of 2
    const { exchange: updated } = selectTalonGroup(exchange, 1, [])
    expect(updated.talonRemainder).toHaveLength(4) // 2 unchosen groups × 2
  })
})

describe('talonToOpponents', () => {
  it('returns the talonRemainder', () => {
    const talon = buildDeck().slice(0, 6)
    const exchange = initTalonExchange(talon, 'three')
    const { exchange: updated } = selectTalonGroup(exchange, 0, [])
    expect(talonToOpponents(updated)).toHaveLength(3)
  })
})

describe('resolveKingCall', () => {
  it('king in another player\'s hand sets partner', () => {
    const hands: Record<Seat, Card[]> = {
      0: [king('clubs'), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      1: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      2: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      3: [king('hearts'), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
    }
    const result = resolveKingCall('clubs', hands, [], 1)
    expect(result.partner).toBe(0)
    expect(result.kingInTalon).toBe(false)
    expect(result.kingInDeclarerHand).toBe(false)
  })

  it('called king in talon sets kingInTalon', () => {
    const hands: Record<Seat, Card[]> = {
      0: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      1: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      2: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      3: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
    }
    const talon = [king('spades'), low(), low(), low(), low(), low()]
    const result = resolveKingCall('spades', hands, talon, 0)
    expect(result.kingInTalon).toBe(true)
    expect(result.partner).toBeNull()
  })

  it('declarer calling own king sets kingInDeclarerHand', () => {
    const hands: Record<Seat, Card[]> = {
      0: [king('diamonds'), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      1: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      2: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
      3: [low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low(), low()],
    }
    const result = resolveKingCall('diamonds', hands, [], 0) // declarer=0 calls diamonds king they hold
    expect(result.kingInDeclarerHand).toBe(true)
    expect(result.partner).toBeNull()
  })
})

describe('canUpgradeToColourValat', () => {
  it('solo-three/two/one can upgrade', () => {
    expect(canUpgradeToColourValat('solo-three')).toBe(true)
    expect(canUpgradeToColourValat('solo-two')).toBe(true)
    expect(canUpgradeToColourValat('solo-one')).toBe(true)
  })

  it('other contracts cannot upgrade', () => {
    expect(canUpgradeToColourValat('three')).toBe(false)
    expect(canUpgradeToColourValat('beggar')).toBe(false)
    expect(canUpgradeToColourValat('solo-without')).toBe(false)
  })
})

describe('discardHand', () => {
  it('removes discarded cards from hand', () => {
    const hand = [low('clubs'), low('spades'), king('hearts')]
    const discard = [low('clubs')]
    const result = discardHand(hand, discard)
    expect(result).toHaveLength(2)
    expect(result.every(c => !(c.kind === 'suit' && c.suit === 'clubs'))).toBe(true)
  })
})
