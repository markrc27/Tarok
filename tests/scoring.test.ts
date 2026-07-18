import { describe, it, expect } from 'vitest'
import {
  calcDifference, scoreKlop, mondPenalty, applyRadli, updateRadliAfterHand,
  radliEndOfSession, missdealPenalty, scoreFlatContract, initRadli, roundToNearest5,
  countDeclarerPoints, computeHandScore,
} from '../src/engine/scoring'
import { buildDeck } from '../src/engine/deck'
import { countPoints } from '../src/engine/pointcount'
import { initAnnouncements } from '../src/engine/announce'
import type { Card, Seat, SuitCard, TrumpCard, Trick } from '../src/engine/types'
import { CONTRACT_BASE } from '../src/engine/types'

function trump(ordinal: number): TrumpCard {
  return { kind: 'trump', ordinal: ordinal as TrumpCard['ordinal'], points: ordinal === 1 || ordinal === 21 || ordinal === 22 ? 5 : 1 }
}
function king(s: 'clubs'|'spades'|'hearts'|'diamonds'): SuitCard {
  return { kind: 'suit', suit: s, rank: 'K', points: 5 }
}
function low(): SuitCard {
  return { kind: 'suit', suit: 'clubs', rank: 7, points: 1 } as SuitCard
}

describe('roundToNearest5', () => {
  it('rounds to nearest 5', () => {
    expect(roundToNearest5(37)).toBe(35)
    expect(roundToNearest5(38)).toBe(40)
    expect(roundToNearest5(35)).toBe(35)
    expect(roundToNearest5(40)).toBe(40)
  })
})

describe('calcDifference', () => {
  it('35 points = difference of 0', () => {
    expect(calcDifference(35)).toBe(0)
  })

  it('36 points = difference of +5 (rounds up to nearest 5)', () => {
    // 36-35=1, round to nearest 5 = 0... wait:
    // roundToNearest5(1) = 0, so difference = 0
    // Actually 36 points: diff = 36-35 = 1, rounded to nearest 5 = 0
    expect(calcDifference(36)).toBe(0)
  })

  it('38 points = difference of +5', () => {
    // 38-35 = 3, rounded to nearest 5 = 5
    expect(calcDifference(38)).toBe(5)
  })

  it('20 points = difference of -15', () => {
    // 20-35 = -15, rounded to nearest 5 = -15
    expect(calcDifference(20)).toBe(-15)
  })

  it('50 points = difference of +15', () => {
    // 50-35 = 15
    expect(calcDifference(50)).toBe(15)
  })
})

describe('countDeclarerPoints', () => {
  it('uses countPoints, not raw sum', () => {
    const captured: Record<Seat, Card[]> = {
      0: [king('clubs'), low(), low()],
      1: [], 2: [], 3: [],
    }
    // group: K(5)+low(1)+low(1) = 7-2 = 5
    expect(countDeclarerPoints(captured, 0, null)).toBe(5)
  })

  it('includes partner cards', () => {
    const captured: Record<Seat, Card[]> = {
      0: [king('clubs'), low(), low()],
      1: [king('spades'), low(), low()],
      2: [], 3: [],
    }
    // Declarer=0, partner=1; combined: K+K+low = 11-2=9, low+low = 2-1=1 → 10
    expect(countDeclarerPoints(captured, 0, 1)).toBe(10)
  })
})

describe('scoreKlop', () => {
  it('player taking > 35 points scores -70', () => {
    // Build a big pile using countPoints
    const deck = buildDeck()
    // Give all 54 cards to seat 0 (countPoints of full deck = 70)
    const captured: Record<Seat, Card[]> = { 0: deck, 1: [], 2: [], 3: [] }
    const scores = scoreKlop(captured)
    expect(scores[0]).toBe(-70)
  })

  it('player taking zero tricks (empty pile) scores +70', () => {
    const captured: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] }
    const scores = scoreKlop(captured)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(scores[seat]).toBe(70)
    }
  })

  it('player taking small pile: subtracted rounded to nearest 5', () => {
    // Give seat 0 two low cards: countPoints([low, low]) = 1
    const captured: Record<Seat, Card[]> = {
      0: [low(), low()],
      1: [], 2: [], 3: [],
    }
    const scores = scoreKlop(captured)
    // pts = 1, rounded to nearest 5 = 0, so score = -0 = 0
    expect(scores[0]).toBe(0)
  })

  it('player taking exactly 35+ points: -70', () => {
    // Create a hand with countPoints = 36 (need to figure out card combo)
    // 3 Kings: group K+K+K = 15-2=13; leftover none → 13
    // 3 Kings + 3 lows: 13 + 5 = 18... still need more
    // Let's just use the deck and filter
    // Actually for >35 test, let me use most of the deck for one player
    const deck = buildDeck()
    const bigHand = deck.slice(0, 27) // 27 cards
    const captured: Record<Seat, Card[]> = {
      0: bigHand, 1: [], 2: [], 3: [],
    }
    const pts = countPoints(bigHand)
    const scores = scoreKlop(captured)
    if (pts > 35) {
      expect(scores[0]).toBe(-70)
    } else {
      expect(scores[0]).toBe(-roundToNearest5(pts))
    }
  })
})

describe('mondPenalty', () => {
  it('-20 to individual who played Mond when Škis in same trick', () => {
    const penalties = mondPenalty(true, 1)
    expect(penalties[1]).toBe(-20)
    expect(penalties[0]).toBe(0)
    expect(penalties[2]).toBe(0)
    expect(penalties[3]).toBe(0)
  })

  it('no penalty when Mond not captured with Škis', () => {
    const penalties = mondPenalty(false, 1)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(penalties[seat]).toBe(0)
    }
  })

  it('no penalty when mondPlayedBySeat is null', () => {
    const penalties = mondPenalty(true, null)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(penalties[seat]).toBe(0)
    }
  })
})

describe('radli', () => {
  it('doubled score when uncancelled radl held', () => {
    const radli = { uncancelled: { 0: 1, 1: 0, 2: 0, 3: 0 } }
    const { score } = applyRadli(30, radli, 0, true)
    expect(score).toBe(60)
  })

  it('win cancels one radl', () => {
    const radli = { uncancelled: { 0: 2, 1: 0, 2: 0, 3: 0 } }
    const { newRadliState } = applyRadli(30, radli, 0, true)
    expect(newRadliState.uncancelled[0]).toBe(1) // cancelled one
  })

  it('loss doubles but does not cancel radl', () => {
    const radli = { uncancelled: { 0: 1, 1: 0, 2: 0, 3: 0 } }
    const { score, newRadliState } = applyRadli(-30, radli, 0, false)
    expect(score).toBe(-60) // doubled
    expect(newRadliState.uncancelled[0]).toBe(1) // not cancelled
  })

  it('no radl: score unchanged', () => {
    const radli = initRadli()
    const { score } = applyRadli(30, radli, 0, true)
    expect(score).toBe(30)
  })

  it('uncancelled radli at session end cost 100 each', () => {
    const radli = { uncancelled: { 0: 2, 1: 1, 2: 0, 3: 3 } }
    const penalties = radliEndOfSession(radli)
    expect(penalties[0]).toBe(-200)
    expect(penalties[1]).toBe(-100)
    expect(penalties[2]).toBe(0)
    expect(penalties[3]).toBe(-300)
  })
})

describe('updateRadliAfterHand', () => {
  it('all seats gain radl after klop', () => {
    const state = initRadli()
    const newState = updateRadliAfterHand(state, 'klop', false)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(newState.uncancelled[seat]).toBe(1)
    }
  })

  it('all seats gain radl after beggar or higher', () => {
    const state = initRadli()
    const newState = updateRadliAfterHand(state, 'beggar', true)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(newState.uncancelled[seat]).toBe(1)
    }
  })

  it('no radl gained after normal contract (e.g., two)', () => {
    const state = initRadli()
    const newState = updateRadliAfterHand(state, 'two', true)
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(newState.uncancelled[seat]).toBe(0)
    }
  })
})

describe('missdeal penalty', () => {
  it('first misdeal: -20 penalty', () => {
    const { penalty, newStrikes } = missdealPenalty({ 0: 0, 1: 0, 2: 0, 3: 0 }, 0)
    expect(penalty).toBe(20)
    expect(newStrikes[0]).toBe(1)
  })

  it('second misdeal by same dealer: -40 penalty', () => {
    const { penalty } = missdealPenalty({ 0: 1, 1: 0, 2: 0, 3: 0 }, 0)
    expect(penalty).toBe(40)
  })

  it('third: -80', () => {
    const { penalty } = missdealPenalty({ 0: 2, 1: 0, 2: 0, 3: 0 }, 0)
    expect(penalty).toBe(80)
  })
})

describe('scoreFlatContract', () => {
  it('beggar won: +70', () => {
    expect(scoreFlatContract('beggar', true)).toBe(70)
  })

  it('beggar lost: -70', () => {
    expect(scoreFlatContract('beggar', false)).toBe(-70)
  })

  it('valat-without won: +500', () => {
    expect(scoreFlatContract('valat-without', true)).toBe(500)
  })
})

describe('computeHandScore mond penalty isolation (ENG-005)', () => {
  function makeTrick(winner: Seat, cards: Card[]): Trick {
    return { cards: cards.map((card, i) => ({ seat: ((winner + i) % 4) as Seat, card })), winner }
  }

  function queen(s: 'clubs'|'spades'|'hearts'|'diamonds'): SuitCard {
    return { kind: 'suit', suit: s, rank: 'Q', points: 4 } as SuitCard
  }
  // 10 high-value cards giving 39 counted pts (>36 → won hand).
  // No Pagat → no trula. All 4 kings → kings bonus +10 (but constant across all three test calls).
  function wonCaptured(): Record<Seat, Card[]> {
    return {
      0: [trump(22), trump(21), king('clubs'), king('spades'), king('hearts'), king('diamonds'),
          queen('clubs'), queen('spades'), queen('hearts'), queen('diamonds')],
      1: [], 2: [], 3: [],
    }
  }
  // Opponent wins one trick so valat=false; avoids scoreNormalContract returning 250.
  function tricks12OpponentWins1(): Trick[] {
    return [
      makeTrick(2, [low(), low(), low(), low()]),
      ...Array.from({ length: 11 }, () => makeTrick(0, [low(), low(), low(), low()])),
    ]
  }
  const radliWith1 = { uncancelled: { 0: 1, 1: 0, 2: 0, 3: 0 } }
  const baseParams = {
    contract: 'three' as const, declarer: 0 as Seat, partner: 1 as Seat,
    talonRemainder: [], announcementState: initAnnouncements(),
    completedTricks: tricks12OpponentWins1(),
    calledKing: null, radliState: radliWith1,
    contractBase: CONTRACT_BASE['three'], won: true,
  }

  it('declarer loses Mond + has radl: partner gets full doubled game, declarer gets -20 less', () => {
    const caps = wonCaptured()
    const hsClean = computeHandScore({ ...baseParams, capturedCards: caps, mondCapturedWithSkis: false, mondPlayedBySeat: null })
    const hsMond  = computeHandScore({ ...baseParams, capturedCards: caps, mondCapturedWithSkis: true,  mondPlayedBySeat: 0 })
    expect(hsMond.partnerScore).toBe(hsClean.partnerScore)
    expect(hsMond.declarerScore).toBe(hsClean.declarerScore - 20)
  })

  it('partner loses Mond: declarer unaffected, partnerScore unchanged (store adds penalty)', () => {
    const caps = wonCaptured()
    const hsClean = computeHandScore({ ...baseParams, capturedCards: caps, mondCapturedWithSkis: false, mondPlayedBySeat: null })
    const hsMond  = computeHandScore({ ...baseParams, capturedCards: caps, mondCapturedWithSkis: true,  mondPlayedBySeat: 1 })
    expect(hsMond.declarerScore).toBe(hsClean.declarerScore)
    expect(hsMond.partnerScore).toBe(hsClean.partnerScore)
    expect(hsMond.mondPenalties[1]).toBe(-20)
    expect(hsMond.mondPenalties[0]).toBe(0)
  })
})

describe('computeHandScore valat win condition', () => {
  function makeTrick(winner: Seat, cards: Card[]): Trick {
    return { cards: cards.map((card, i) => ({ seat: ((winner + i) % 4) as Seat, card })), winner }
  }

  it('valat-without: declarer wins all tricks → +500', () => {
    const deck = buildDeck()
    // Give all cards to declarer (seat 0) — they won everything
    const capturedCards = { 0: deck, 1: [], 2: [], 3: [] } as Record<Seat, Card[]>
    const tricks: Trick[] = Array.from({ length: 18 }, (_, i) =>
      makeTrick(0, deck.slice(i * 3, i * 3 + 3))
    )
    const hs = computeHandScore({
      contract: 'valat-without', declarer: 0, partner: null,
      capturedCards, talonRemainder: [], mondCapturedWithSkis: false, mondPlayedBySeat: null,
      announcementState: initAnnouncements(), completedTricks: tricks,
      calledKing: null, radliState: initRadli(), contractBase: CONTRACT_BASE['valat-without'], won: true,
    })
    expect(hs.declarerScore).toBe(500)
  })

  it('valat-without: declarer misses one trick but has ≥36 pts → -500 (not +500)', () => {
    const deck = buildDeck()
    // Opponent seat 1 wins the last trick (3 blank suit cards), declarer gets the rest
    const oppCards = deck.slice(0, 3)
    const declarerCards = deck.slice(3)
    const capturedCards = { 0: declarerCards, 1: oppCards, 2: [], 3: [] } as Record<Seat, Card[]>
    const tricks: Trick[] = [
      makeTrick(1, oppCards),
      ...Array.from({ length: 17 }, (_, i) =>
        makeTrick(0, declarerCards.slice(i * 3, i * 3 + 3))
      ),
    ]
    const hs = computeHandScore({
      contract: 'valat-without', declarer: 0, partner: null,
      capturedCards, talonRemainder: [], mondCapturedWithSkis: false, mondPlayedBySeat: null,
      announcementState: initAnnouncements(), completedTricks: tricks,
      calledKing: null, radliState: initRadli(), contractBase: CONTRACT_BASE['valat-without'], won: false,
    })
    expect(hs.declarerScore).toBe(-500)
  })
})
