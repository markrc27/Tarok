import { describe, it, expect } from 'vitest'
import { legalCards, resolveTrick, isEmperorTrick, checkMondCapture, playCard, firstLeader } from '../src/engine/play'
import type { Card, PlayState, TrickState, Seat, SuitCard, TrumpCard } from '../src/engine/types'

function trump(ordinal: number): TrumpCard {
  const pts: 1 | 5 = (ordinal === 1 || ordinal === 21 || ordinal === 22) ? 5 : 1
  return { kind: 'trump', ordinal: ordinal as TrumpCard['ordinal'], points: pts }
}

function suit(s: 'clubs'|'spades'|'hearts'|'diamonds', rank: string | number, pts: 1|2|3|4|5 = 1): SuitCard {
  return { kind: 'suit', suit: s, rank: rank as SuitCard['rank'], points: pts } as SuitCard
}

function king(s: 'clubs'|'spades'|'hearts'|'diamonds'): SuitCard {
  return { kind: 'suit', suit: s, rank: 'K', points: 5 }
}

function low(s: 'clubs'|'spades'|'hearts'|'diamonds' = 'clubs'): SuitCard {
  return { kind: 'suit', suit: s, rank: 7, points: 1 } as SuitCard
}

const pagat = trump(1)
const mond = trump(21)
const skis = trump(22)
const t5 = trump(5)
const t10 = trump(10)

function makeState(
  hands: Record<Seat, Card[]>,
  trick: Partial<TrickState> = {},
  opts: Partial<PlayState> = {},
): PlayState {
  return {
    hands,
    completedTricks: [],
    currentTrick: {
      trickNumber: 1,
      ledSeat: 0,
      cards: [],
      ledSuit: null,
      ...trick,
    },
    capturedCards: { 0: [], 1: [], 2: [], 3: [] },
    mondCapturedBy: null,
    mondCapturedWithSkis: false,
    contract: 'one',
    declarer: 0,
    partner: null,
    forehand: 3,
    isColourValat: false,
    openBeggarRevealed: false,
    talonRemainder: [],
    kingCall: null,
    kingInTalonCaptured: false,
    ...opts,
  }
}

describe('firstLeader', () => {
  it('forehand leads for contracts up to solo-one', () => {
    expect(firstLeader('one', 2, 3)).toBe(3)
    expect(firstLeader('solo-one', 2, 3)).toBe(3)
    expect(firstLeader('three', 2, 3)).toBe(3)
  })

  it('declarer leads for beggar and above', () => {
    expect(firstLeader('beggar', 2, 3)).toBe(2)
    expect(firstLeader('solo-without', 2, 3)).toBe(2)
    expect(firstLeader('open-beggar', 2, 3)).toBe(2)
    expect(firstLeader('valat-without', 2, 3)).toBe(2)
  })
})

describe('legalCards - leading', () => {
  it('leader can play any card in a positive contract', () => {
    const hand = [skis, king('clubs'), low()]
    const state = makeState({ 0: hand, 1: [], 2: [], 3: [] })
    expect(legalCards(state, 0)).toHaveLength(3)
  })

  it('leader can play any card in klop', () => {
    const hand = [skis, king('clubs'), low()]
    const state = makeState({ 0: hand, 1: [], 2: [], 3: [] }, {}, { contract: 'klop' })
    expect(legalCards(state, 0)).toHaveLength(3)
  })
})

describe('legalCards - following', () => {
  it('must follow led suit when holding led suit cards', () => {
    const hand = [low('clubs'), low('spades'), trump(5)]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'clubs', cards: [{ seat: 0, card: low('clubs') }] },
    )
    const legal = legalCards(state, 1)
    expect(legal).toEqual([low('clubs')])
  })

  it('must play trump when no led suit cards held', () => {
    const hand = [low('spades'), trump(5), trump(10)]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'clubs', cards: [{ seat: 0, card: low('clubs') }] },
    )
    const legal = legalCards(state, 1)
    expect(legal.every(c => c.kind === 'trump')).toBe(true)
    expect(legal).toHaveLength(2)
  })

  it('may play anything when no led suit and no trumps', () => {
    const hand = [low('spades'), low('hearts'), low('diamonds')]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'clubs', cards: [{ seat: 0, card: low('clubs') }] },
    )
    const legal = legalCards(state, 1)
    expect(legal).toHaveLength(3)
  })
})

describe('legalCards - negative contracts', () => {
  it('must beat highest card if able in klop', () => {
    const hand = [trump(5), trump(3)]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'trump', cards: [{ seat: 0, card: trump(4) }] },
      { contract: 'klop' },
    )
    const legal = legalCards(state, 1)
    // Only trump(5) beats trump(4); trump(3) does not
    expect(legal).toHaveLength(1)
    expect(legal[0]).toEqual(trump(5))
  })

  it('if cannot beat, may play any legal card in klop', () => {
    const hand = [trump(2), trump(3)]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'trump', cards: [{ seat: 0, card: trump(10) }] },
      { contract: 'klop' },
    )
    const legal = legalCards(state, 1)
    // Cannot beat trump(10), so any trump is legal
    expect(legal).toHaveLength(2)
  })

  it('Pagat cannot be played when other cards are available in klop', () => {
    const hand = [pagat, trump(5)]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'trump', cards: [{ seat: 0, card: trump(3) }] },
      { contract: 'klop' },
    )
    const legal = legalCards(state, 1)
    // Both must follow trump; trump(5) can beat trump(3), so only trump(5) is legal
    // Pagat cannot be played when trump(5) beats the trick
    expect(legal).not.toContainEqual(pagat)
    expect(legal).toContainEqual(trump(5))
  })
})

describe('resolveTrick', () => {
  it('highest trump wins when trumps played', () => {
    const trick: TrickState = {
      trickNumber: 1,
      ledSeat: 0,
      ledSuit: 'trump',
      cards: [
        { seat: 0, card: trump(5) },
        { seat: 1, card: trump(15) },
        { seat: 2, card: trump(10) },
        { seat: 3, card: trump(8) },
      ],
    }
    expect(resolveTrick(trick, false)).toBe(1)
  })

  it('highest card of led suit wins when no trumps', () => {
    const trick: TrickState = {
      trickNumber: 1,
      ledSeat: 0,
      ledSuit: 'clubs',
      cards: [
        { seat: 0, card: low('clubs') },       // 7 clubs (weak)
        { seat: 1, card: suit('clubs', 9) },   // 9 clubs
        { seat: 2, card: king('clubs') },       // King clubs (strong)
        { seat: 3, card: low('spades') },       // off-suit
      ],
    }
    expect(resolveTrick(trick, false)).toBe(2) // King wins
  })

  it('trump beats led suit cards', () => {
    const trick: TrickState = {
      trickNumber: 1,
      ledSeat: 0,
      ledSuit: 'clubs',
      cards: [
        { seat: 0, card: king('clubs') },
        { seat: 1, card: trump(2) },  // small trump
        { seat: 2, card: low('spades') },
        { seat: 3, card: low('hearts') },
      ],
    }
    expect(resolveTrick(trick, false)).toBe(1) // trump wins
  })

  it('emperor trick: Pagat wins even though Škis present', () => {
    const trick: TrickState = {
      trickNumber: 1,
      ledSeat: 0,
      ledSuit: 'trump',
      cards: [
        { seat: 0, card: skis },
        { seat: 1, card: mond },
        { seat: 2, card: pagat },
        { seat: 3, card: trump(10) },
      ],
    }
    expect(resolveTrick(trick, false)).toBe(2) // Pagat wins via emperor trick
  })

  it('emperor trick only fires when all three trula present', () => {
    // Škis + Mond but no Pagat — normal resolution: Škis wins
    const trick: TrickState = {
      trickNumber: 1,
      ledSeat: 0,
      ledSuit: 'trump',
      cards: [
        { seat: 0, card: skis },
        { seat: 1, card: mond },
        { seat: 2, card: trump(10) },
        { seat: 3, card: trump(5) },
      ],
    }
    expect(resolveTrick(trick, false)).toBe(0) // Škis wins normally
  })

  it('Škis beats Mond in normal play', () => {
    const trick: TrickState = {
      trickNumber: 1,
      ledSeat: 0,
      ledSuit: 'trump',
      cards: [
        { seat: 0, card: mond },
        { seat: 1, card: skis },
        { seat: 2, card: trump(5) },
        { seat: 3, card: trump(3) },
      ],
    }
    expect(resolveTrick(trick, false)).toBe(1) // Škis beats Mond
  })
})

describe('isEmperorTrick', () => {
  it('returns true when Škis, Mond, Pagat all present', () => {
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0, ledSuit: 'trump',
      cards: [
        { seat: 0, card: skis },
        { seat: 1, card: mond },
        { seat: 2, card: pagat },
        { seat: 3, card: trump(5) },
      ],
    }
    expect(isEmperorTrick(trick)).toBe(true)
  })

  it('returns false when only two trula present', () => {
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0, ledSuit: 'trump',
      cards: [
        { seat: 0, card: skis },
        { seat: 1, card: mond },
        { seat: 2, card: trump(5) },
        { seat: 3, card: trump(3) },
      ],
    }
    expect(isEmperorTrick(trick)).toBe(false)
  })
})

describe('checkMondCapture', () => {
  it('Mond with Škis in same trick sets penalty flag', () => {
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0, ledSuit: 'trump',
      cards: [
        { seat: 0, card: skis },
        { seat: 1, card: mond },
        { seat: 2, card: trump(5) },
        { seat: 3, card: trump(3) },
      ],
    }
    const result = checkMondCapture(trick)
    expect(result.captured).toBe(true)
    expect(result.withSkis).toBe(true)
  })

  it('Mond without Škis: captured but not with Škis', () => {
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0, ledSuit: 'trump',
      cards: [
        { seat: 0, card: trump(10) },
        { seat: 1, card: mond },
        { seat: 2, card: trump(5) },
        { seat: 3, card: trump(3) },
      ],
    }
    const result = checkMondCapture(trick)
    expect(result.captured).toBe(true)
    expect(result.withSkis).toBe(false)
  })

  it('no Mond in trick: not captured', () => {
    const trick: TrickState = {
      trickNumber: 1, ledSeat: 0, ledSuit: 'trump',
      cards: [
        { seat: 0, card: skis },
        { seat: 1, card: trump(5) },
        { seat: 2, card: trump(3) },
        { seat: 3, card: trump(2) },
      ],
    }
    const result = checkMondCapture(trick)
    expect(result.captured).toBe(false)
  })
})

describe('playCard', () => {
  it('throws on illegal card play', () => {
    const hand = [low('clubs'), low('spades')]
    const state = makeState(
      { 0: [], 1: hand, 2: [], 3: [] },
      { ledSuit: 'clubs', cards: [{ seat: 0, card: low('clubs') }] },
    )
    // Playing spades when must follow clubs is illegal
    expect(() => playCard(state, 1, low('spades'))).toThrow()
  })

  it('advances trick state after a legal play', () => {
    const hand = [low('clubs')]
    const state = makeState({ 0: hand, 1: [], 2: [], 3: [] })
    const { newState } = playCard(state, 0, low('clubs'))
    expect(newState.currentTrick.cards).toHaveLength(1)
    expect(newState.hands[0]).toHaveLength(0)
  })

  it('completes trick after 4 cards played', () => {
    const state = makeState({
      0: [low('clubs')],
      1: [low('spades')],
      2: [low('hearts')],
      3: [king('clubs')],
    })
    let s = state
    const { newState: s1, trickComplete: c1 } = playCard(s, 0, low('clubs'))
    expect(c1).toBe(false)
    s = s1
    const { newState: s2, trickComplete: c2 } = playCard(s, 1, low('spades'))
    expect(c2).toBe(false)
    s = s2
    const { newState: s3, trickComplete: c3 } = playCard(s, 2, low('hearts'))
    expect(c3).toBe(false)
    s = s3
    const { newState: s4, trickComplete: c4, trickWinner } = playCard(s, 3, king('clubs'))
    expect(c4).toBe(true)
    // King of clubs follows clubs suit and is highest card of led suit
    expect(trickWinner).toBe(3)
    // Cards moved to winner's capture pile
    expect(s4.capturedCards[3]).toHaveLength(4)
    // New trick started
    expect(s4.currentTrick.cards).toHaveLength(0)
    expect(s4.currentTrick.ledSeat).toBe(3)
  })
})

describe('hand complete', () => {
  it('handComplete is true after all 12 tricks', () => {
    // Simplified: give 1 card to each player, play 1 trick
    const state = makeState({
      0: [trump(15)],
      1: [trump(10)],
      2: [trump(5)],
      3: [trump(3)],
    }, { ledSuit: 'trump' })
    let s = state
    let result
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const card = s.hands[seat][0]
      result = playCard(s, seat, card)
      s = result.newState
    }
    expect(result!.handComplete).toBe(true)
  })
})
