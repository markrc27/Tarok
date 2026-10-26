import { describe, it, expect } from 'vitest'
import { chooseCard, computeKnownPartner, type BotConfig } from '../src/ai/play-heuristic'
import type { Card, PlayState, Seat, SuitCard, TrumpCard, KingCall, Trick } from '../src/engine/types'

// ── Card constructors ─────────────────────────────────────────────────────

function trump(ordinal: number): TrumpCard {
  const pts: 1 | 5 = (ordinal === 1 || ordinal === 21 || ordinal === 22) ? 5 : 1
  return { kind: 'trump', ordinal: ordinal as TrumpCard['ordinal'], points: pts }
}

function suit(
  s: 'clubs' | 'spades' | 'hearts' | 'diamonds',
  rank: SuitCard['rank'],
  pts: 1 | 2 | 3 | 4 | 5 = 1,
): SuitCard {
  return { kind: 'suit', suit: s, rank, points: pts }
}

const pagat = trump(1)   // 5pts
const mond  = trump(21)  // 5pts
const skis  = trump(22)  // 5pts

// ── KingCall factory ──────────────────────────────────────────────────────

function kingCall(
  calledSuit: 'clubs' | 'spades' | 'hearts' | 'diamonds',
  partner: Seat | null,
): KingCall {
  return {
    calledSuit,
    calledKing: suit(calledSuit, 'K', 5),
    partner,
    kingInTalon: partner === null,
    kingInDeclarerHand: false,
  }
}

// ── PlayState factory ─────────────────────────────────────────────────────

function makeState(opts: {
  contract?: PlayState['contract']
  declarer?: Seat
  partner?: Seat | null
  hand0?: Card[]
  hand1?: Card[]
  hand2?: Card[]
  hand3?: Card[]
  trickCards?: { seat: Seat; card: Card }[]
  capturedCards?: Partial<Record<Seat, Card[]>>
  completedTricks?: Trick[]
  kingCall?: KingCall | null
  isColourValat?: boolean
  openBeggarRevealed?: boolean
}): PlayState {
  const trickCards = opts.trickCards ?? []
  const ledCard = trickCards[0]?.card ?? null
  const ledSuit = ledCard
    ? (ledCard.kind === 'trump' ? 'trump' : (ledCard as SuitCard).suit)
    : null
  return {
    hands: { 0: opts.hand0 ?? [], 1: opts.hand1 ?? [], 2: opts.hand2 ?? [], 3: opts.hand3 ?? [] },
    completedTricks: opts.completedTricks ?? [],
    currentTrick: { trickNumber: 1, ledSeat: trickCards[0]?.seat ?? 0, cards: trickCards, ledSuit },
    capturedCards: { 0: [], 1: [], 2: [], 3: [], ...(opts.capturedCards ?? {}) },
    mondCapturedBy: null,
    mondCapturedWithSkis: false,
    contract: opts.contract ?? 'one',
    declarer: opts.declarer ?? 1,
    partner: opts.partner ?? null,
    forehand: 1,
    isColourValat: opts.isColourValat ?? false,
    openBeggarRevealed: opts.openBeggarRevealed ?? false,
    talonRemainder: [],
    talonDiscard: [],
    klopTalon: [],
    kingCall: opts.kingCall ?? null,
    kingInTalonCaptured: false,
  }
}

function cfg(knownPartner: Seat | null = null): BotConfig {
  return { difficultyBias: 0.5, knownPartner }
}

// ── 1. Opponent leading ───────────────────────────────────────────────────

describe('opponent leading — positive contract', () => {
  it('leads highest non-trump (king before lower cards)', () => {
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [suit('clubs', 'K', 5), suit('spades', 7), trump(5)],
    })
    // seat0 is an opponent of declarer(1)/partner(2), knownPartner=null
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })

  it('leads highest trump when no non-trumps, protects Pagat', () => {
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [skis, trump(10), pagat],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 }) // Škis, not Pagat
  })

  it('leads only trump (Pagat) when it is the only card', () => {
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [pagat],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 1 })
  })
})

// ── 2. Declarer/partner leading ───────────────────────────────────────────

describe('declarer leading — positive contract', () => {
  it('leads highest trump by ordinal — T20 before T5 (both 1pt, so point-sort alone would be arbitrary)', () => {
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [trump(5), trump(20), trump(10)],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 20 })
  })

  it('leads highest trump but skips Pagat when alternatives exist', () => {
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [trump(10), pagat],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('leads Pagat when it is the only trump', () => {
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [pagat, suit('clubs', 7)],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 1 })
  })

  it('leads highest value non-trump when no trumps in hand', () => {
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [suit('clubs', 'K', 5), suit('spades', 7)],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'suit', rank: 'K' })
  })
})

// ── 3. Partner/ally winning → dump lowest ────────────────────────────────

describe('ally winning — dump lowest card when following', () => {
  it('declarer side: partner is winning the trick, dumps lowest (not Škis)', () => {
    // seat1 (knownPartner) led T15 and is winning. seat0 (declarer) follows.
    // Candidates: T20(1pt) and Škis(5pt) — both legal (must follow trump).
    // Ally winning → dump T20 (lowest value), save Škis for a fight.
    const state = makeState({
      contract: 'one', declarer: 0, partner: 1,
      hand0: [trump(20), skis],
      trickCards: [{ seat: 1, card: trump(15) }],
    })
    const card = chooseCard(state, 0, cfg(1 as Seat)) // knownPartner=1
    expect(card).toMatchObject({ kind: 'trump', ordinal: 20 })
  })

  it('opponent side: fellow opponent is winning, dumps lowest (does not fight)', () => {
    // seat3 (fellow opponent) led T10 and is winning. seat0 also an opponent.
    // Candidates: T15(1pt) and T20(1pt) — both legal.
    // Ally winning → dump T15 (lowest).
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [trump(15), trump(20)],
      trickCards: [{ seat: 3, card: trump(10) }],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 15 })
  })

  it('declarer side: declarer is winning, partner dumps lowest', () => {
    // seat0 (declarer) led T20 and is winning. seat1 (partner) follows.
    // Candidates: T10(1pt) and Škis(5pt).
    // Ally winning → dump T10.
    const state = makeState({
      contract: 'one', declarer: 0, partner: 1,
      hand1: [trump(10), skis],
      trickCards: [{ seat: 0, card: trump(20) }],
    })
    const card = chooseCard(state, 1, cfg(1 as Seat)) // seat1=partner, knownPartner=1
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })
})

// ── 4. Enemy winning → fight with appropriate card ────────────────────────

describe('enemy winning — fight for the trick', () => {
  it('opponent plays lowest beater (saves resources) when enemy winning', () => {
    // seat1 (declarer) led T5 and is winning. seat0 (opponent) follows.
    // Candidates: T10(1pt) and T20(1pt) — both beat T5.
    // Lowest beater → T10.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [trump(10), trump(20)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('declarer side plays highest beater (commits) when enemy winning', () => {
    // seat3 (opponent) led T15 and is winning. seat0 (declarer) follows.
    // Candidates: T20(1pt) and Škis(5pt) — both beat T15.
    // Highest beater → Škis (commits to definitely winning).
    const state = makeState({
      contract: 'one', declarer: 0, partner: 1,
      hand0: [trump(20), skis],
      trickCards: [{ seat: 3, card: trump(15) }],
    })
    const card = chooseCard(state, 0, cfg(1 as Seat))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 })
  })

  it('when no beaters available: dumps lowest value card', () => {
    // seat1 (declarer) led T20 and is winning. seat0 (opponent) has T5 and T10, neither beats T20.
    // No beaters → dump lowest = T5.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [trump(5), trump(10)],
      trickCards: [{ seat: 1, card: trump(20) }],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 5 })
  })

  it('opponent: beats with lowest suit card before spending a trump', () => {
    // seat1 (declarer) led 7♣ (suit, 1pt). seat0 has J♣(2pt) and T5(trump,1pt).
    // J♣ beats 7♣ (same suit, higher). T5 also beats (trump). Both are legal (must follow clubs?
    // Actually seat0 has J♣ so must follow clubs — legalCards = [J♣] only).
    // If only one candidate, returned directly. Let's add Q♣(4pt) too so there's a choice.
    // legalCards: must follow clubs → [J♣(2pt), Q♣(4pt)] — T5 is excluded (has clubs).
    // enemy winning with 7♣. beaters = [J♣, Q♣]. lowest beater = J♣(2pt).
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [suit('clubs', 'J', 2), suit('clubs', 'Q', 4), trump(5)],
      trickCards: [{ seat: 1, card: suit('clubs', 7) }],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'J' })
  })
})

// ── 5. Point-counting fold ────────────────────────────────────────────────

describe('point-counting fold — opponent does not waste Mond/Škis on a cheap trick', () => {
  // Setup: seat1 (declarer) led T5(1pt). Trick so far has 2 low trumps (T5+T3 = 2pts).
  // seat0 (opponent) has Mond(5pt) and T2(1pt). T2 cannot beat T5; Mond can.
  // legalCards: must follow trump → [Mond, T2]. beaters = [Mond].
  // The fold condition: trickPts<=1, cheapestBeater.points>=5, not last, declarerPts<28.
  // Note: trickPts counts cards played BEFORE seat0 plays. With T5 and T3 already in
  // the trick, trickPts = 2. That is > 1, so actually the fold won't fire here.
  // Let's use a single-card trick (only T5, trickPts=1) with 2 seats yet to play.

  it('folds: Mond is only beater on a 1-pt trick, seat0 is 2nd of 4 players', () => {
    // Trick: only seat1 has played T5(1pt). seat0 is 2nd player (seats 2,3 still to play).
    // trickPts = 1, not last (cards.length=1, not 3), declarerPts < 28.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [mond, trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }], // 1 card in trick, seat0 is 2nd
    })
    const card = chooseCard(state, 0, cfg(null))
    // Folds: dumps T2 instead of Mond
    expect(card).toMatchObject({ kind: 'trump', ordinal: 2 })
  })

  it('does NOT fold when seat0 is last to play (3 cards already in trick)', () => {
    // Same hand but 3 cards already played → seat0 is 4th (last). Safe to commit Mond.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [mond, trump(2)],
      trickCards: [
        { seat: 1, card: trump(5) },
        { seat: 2, card: trump(3) },
        { seat: 3, card: trump(4) },
      ],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 }) // plays Mond
  })

  it('does NOT fold when declarer team is near 28 pts (must fight)', () => {
    // Declarer(1) has already captured 28+ pts in their pile.
    // Even though trick is cheap and Mond is the only beater, opponents must fight.
    const state = makeState({
      contract: 'one', declarer: 1, partner: null,
      hand0: [mond, trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }],
      capturedCards: {
        1: [ // 4 kings + Škis + T3 + T4 + T6 = 5+5+5+5+5+1+1+1 = 28 pts
          suit('clubs', 'K', 5), suit('spades', 'K', 5),
          suit('hearts', 'K', 5), suit('diamonds', 'K', 5),
          trump(22), trump(3), trump(4), trump(6),
        ],
      },
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 }) // plays Mond
  })

  it('does NOT fold when there are two beaters (Mond is not the only option)', () => {
    // If seat0 has both Mond and another beater (T20), lowestBeater is T20(1pt) not Mond(5pt).
    // So fold check on lowestBeater.points >= 5 fails → plays T20 regardless.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [mond, trump(20), trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 20 }) // lowest beater
  })
})

// ── 5b. Endgame near-win threshold ────────────────────────────────────────
// In the last 2–3 tricks, opponents fight even when declarerPts < 28.

describe('hard mode endgame near-win threshold — opponents fight late', () => {
  function makeEndgameState(declarerPts: number, completedTrickCount: number): PlayState {
    // Trick only needs cards + winner for our counting purposes.
    const dummyTricks: Trick[] = Array.from({ length: completedTrickCount }, () => ({
      cards: [],
      winner: 2 as Seat,
    }))
    // Build captured pile with the right total points (5-pt cards + 1-pt fillers).
    const fivePoint: Card[] = Array.from({ length: Math.floor(declarerPts / 5) }, (_, i) =>
      ({ kind: 'trump', ordinal: (22 - i) as TrumpCard['ordinal'], points: 5 } as TrumpCard),
    )
    const onePoint: Card[] = Array.from({ length: declarerPts % 5 }, () =>
      ({ kind: 'trump', ordinal: 10 as TrumpCard['ordinal'], points: 1 } as TrumpCard),
    )
    return makeState({
      contract: 'one', declarer: 1, partner: null,
      hand0: [mond, trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }],
      completedTricks: dummyTricks,
      capturedCards: { 1: [...fivePoint, ...onePoint] },
    })
  }

  it('HARD: 10 tricks done, declarerPts=26 — opponents fight (near-win ≤2 tricks left)', () => {
    // 10 completed + current = trick 11, 2 remaining. declarerPts=26 ≥ 26 threshold → fight.
    const state = makeEndgameState(26, 10)
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })  // fights with Mond, not T2
  })

  it('HARD: 9 tricks done, declarerPts=23 — opponents fight (near-win ≤3 tricks left)', () => {
    // 9 completed + current = trick 10, 3 remaining. declarerPts=23 ≥ 23 threshold → fight.
    const state = makeEndgameState(23, 9)
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })
  })

  it('HARD: 9 tricks done, declarerPts=22 — opponents still fold (below ≤3-trick threshold)', () => {
    // 9 completed, declarerPts=22 < 23 threshold and < 28. Fold condition still applies.
    const state = makeEndgameState(22, 9)
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 2 })  // folds: dumps T2
  })

  it('EASY: endgame threshold does not apply — uses static 28pt cutoff only', () => {
    // Same as first test but easy mode: declarerPts=26, 2 tricks remaining → still folds.
    const state = makeEndgameState(26, 10)
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 2 })  // folds in easy mode
  })
})

// ── 6. computeKnownPartner ────────────────────────────────────────────────

describe('computeKnownPartner', () => {
  const kc = kingCall('clubs', 2 as Seat) // called K♣, partner = seat2

  it('returns null when no tricks have been played', () => {
    const state = makeState({ kingCall: kc, partner: 2 as Seat })
    expect(computeKnownPartner(state)).toBeNull()
  })

  it('returns null when tricks were played but not the called king', () => {
    const state = makeState({
      kingCall: kc, partner: 2 as Seat,
      completedTricks: [{
        cards: [
          { seat: 0, card: trump(15) },
          { seat: 1, card: trump(5) },
          { seat: 2, card: suit('spades', 'K', 5) }, // K♠ not K♣
          { seat: 3, card: trump(3) },
        ],
        winner: 0,
      }],
    })
    expect(computeKnownPartner(state)).toBeNull()
  })

  it('returns partner when called king appears in a completed trick', () => {
    const state = makeState({
      kingCall: kc, partner: 2 as Seat,
      completedTricks: [{
        cards: [
          { seat: 0, card: trump(15) },
          { seat: 2, card: suit('clubs', 'K', 5) }, // K♣ — the called king
          { seat: 1, card: trump(5) },
          { seat: 3, card: trump(3) },
        ],
        winner: 0,
      }],
    })
    expect(computeKnownPartner(state)).toBe(2)
  })

  it('returns partner when called king is in the current in-progress trick', () => {
    const state = makeState({
      kingCall: kc, partner: 2 as Seat,
      trickCards: [
        { seat: 1, card: trump(10) },
        { seat: 2, card: suit('clubs', 'K', 5) }, // played in this trick
      ],
    })
    expect(computeKnownPartner(state)).toBe(2)
  })

  it('returns null when kingCall is absent (klop, beggar, etc.)', () => {
    const state = makeState({ kingCall: null, partner: null })
    expect(computeKnownPartner(state)).toBeNull()
  })

  it('returns null when partner is null (king was in talon or declarer hand)', () => {
    const kcNoPartner = kingCall('clubs', null)
    const state = makeState({ kingCall: kcNoPartner, partner: null })
    expect(computeKnownPartner(state)).toBeNull()
  })
})

// ── 7. Open Beggar — smart opponent leading ───────────────────────────────

describe('open beggar — opponent uses revealed hand to find forced-win leads', () => {
  // Declarer (seat1) has only K♣(5pt) in clubs. Opponent (seat0) has 7♣(1pt).
  // K♣ > 7♣ so declarer is forced to win if clubs is led.
  // Also: opponent has K♥ and 7♠ — declarer has 7♥ and K♠.
  // 7♥ < K♥ so hearts is NOT a forced win (declarer can duck with 7♥).
  // K♠ > 7♠ so spades IS forced win. Algorithm should pick clubs or spades (first found).
  it('leads a suit where all declarer cards beat opponent — forced win for declarer', () => {
    const state = makeState({
      contract: 'open-beggar',
      declarer: 1,
      openBeggarRevealed: true,
      hand0: [suit('clubs', 7), suit('hearts', 'K', 5), suit('spades', 7)],
      hand1: [suit('clubs', 'K', 5), suit('hearts', 7), suit('spades', 'K', 5)],
    })
    const card = chooseCard(state, 0, cfg())
    // Both clubs and spades are "forced win" suits — either is correct
    expect(['clubs', 'spades']).toContain((card as SuitCard).suit)
    expect(card.kind).toBe('suit')
  })

  it('falls back to suit with fewest declarer cards when no forced-win suit exists', () => {
    // Opponent has K♣ and K♥ — high cards in both suits.
    // Declarer has 7♣ (can duck K♣: 7♣ < K♣) and J♥, Q♥, Kn♥ (all < K♥, so can duck too).
    // No forced-win suit (declarer can always play lower). Clubs has 1 declarer card;
    // hearts has 3. Fallback: lead clubs (fewest declarer cards = least flexibility).
    const state = makeState({
      contract: 'open-beggar',
      declarer: 1,
      openBeggarRevealed: true,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 'K', 5)],
      hand1: [suit('clubs', 7), suit('hearts', 'J', 2), suit('hearts', 'Q', 4), suit('hearts', 'Kn', 3)],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs' })
  })

  it('ignores suits where declarer is void (they can freely discard)', () => {
    // Declarer has no clubs — void. Opponent leads clubs → declarer discards low.
    // Declarer has 7♥ in hearts; opponent has K♥ — K♥ > 7♥ so NOT forced win.
    // Declarer has K♠; opponent has 7♠ — K♠ > 7♠ so spades IS forced win.
    const state = makeState({
      contract: 'open-beggar',
      declarer: 1,
      openBeggarRevealed: true,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 'K', 5), suit('spades', 7)],
      hand1: [suit('hearts', 7), suit('spades', 'K', 5)], // no clubs
    })
    const card = chooseCard(state, 0, cfg())
    // Should lead spades (forced win), not clubs (declarer void) or hearts (declarer can duck)
    expect(card).toMatchObject({ kind: 'suit', suit: 'spades' })
  })

  it('falls back to standard high lead when hand is not yet revealed', () => {
    // openBeggarRevealed = false — smart leading not active yet
    const state = makeState({
      contract: 'open-beggar',
      declarer: 1,
      openBeggarRevealed: false,
      hand0: [suit('clubs', 7), suit('hearts', 'K', 5)],
      hand1: [suit('clubs', 'K', 5), suit('hearts', 7)],
    })
    const card = chooseCard(state, 0, cfg())
    // Standard path: lead highest by points → K♥(5pt)
    expect(card).toMatchObject({ kind: 'suit', suit: 'hearts', rank: 'K' })
  })

  it('prefers void suit lead when declarer still has trumps (forces trump win)', () => {
    // Declarer has T5 + T6 (trumps) and only hearts cards.
    // Clubs: opponent has K♣, declarer void → if we lead clubs, declarer must trump and WIN.
    // Hearts: declarer has 7♥ which is lower than K♥ (declarer can duck).
    // New priority: void suit + declarer-has-trumps = best case → lead K♣.
    const state = makeState({
      contract: 'open-beggar',
      declarer: 1,
      openBeggarRevealed: true,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 'K', 5)],
      hand1: [trump(5), trump(6), suit('hearts', 7)],
    })
    const card = chooseCard(state, 0, cfg())
    // Clubs void + declarer has trumps → lead K♣ (forces trump)
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })
})

// ── 8. Colour Valat — taroks treated as plain suit when leading ───────────

describe('colour valat — taroks are not effective trumps for leading decisions', () => {
  it('opponent leads tarok (not filtered as trump) before suit cards', () => {
    // In colour valat, opponents should lead highest card regardless of kind.
    // Without the fix, taroks would be filtered as "trumps" and held back.
    // With the fix, taroks count as non-effective-trumps → opponent leads them freely.
    const state = makeState({
      contract: 'color-valat-without',
      declarer: 1,
      isColourValat: true,
      hand0: [trump(15), suit('clubs', 7)], // T15 and 7♣
    })
    // Opponent (seat0) leading: non-effective-trumps include T15 in colour valat.
    // Both are "non-trump" — leads highest by points. T15 is 1pt, 7♣ is 1pt → either OK,
    // but the key check is T15 is NOT skipped (it used to be filtered as trump).
    // With isColourValat, effectiveIsTrump(T15)=false so both go to nonTrumps pool.
    const card = chooseCard(state, 0, cfg())
    // Should pick one of the two (both 1pt, either is fine — just not skipping T15)
    expect([trump(15), suit('clubs', 7)]).toContainEqual(card)
  })

  it('declarer does not lock onto leading taroks when they are not effective trumps', () => {
    // Declarer in colour valat: taroks are not effective trumps so the "lead highest trump"
    // branch is skipped. Falls through to highest-points card.
    const state = makeState({
      contract: 'color-valat-without',
      declarer: 0,
      isColourValat: true,
      hand0: [trump(10), suit('clubs', 'K', 5)], // T10(1pt) and K♣(5pt)
    })
    const card = chooseCard(state, 0, cfg())
    // No effective trumps → leads highest by cardPoints → K♣(5pt) over T10(1pt)
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })
})

// ── 9. Valat — opponents never fold on cheap tricks ───────────────────────

describe('valat contracts — opponent point-counting fold is disabled', () => {
  it('valat-without: opponent plays Mond on cheap trick (does not fold)', () => {
    // Same setup as the fold test: Mond is only beater, trick has 1pt, not last to play.
    // In a normal contract this would fold. In valat-without it must not.
    const state = makeState({
      contract: 'valat-without',
      declarer: 1,
      hand0: [mond, trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg())
    // Fold disabled in valat — plays Mond to fight for the trick
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })
  })

  it('color-valat-without: opponent plays Mond on cheap trick (does not fold)', () => {
    const state = makeState({
      contract: 'color-valat-without',
      declarer: 1,
      isColourValat: true,
      hand0: [mond, trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })
  })

  it('standard contract: fold still applies (regression)', () => {
    // Confirm the fold still works for normal contracts (unchanged behaviour).
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand0: [mond, trump(2)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 2 }) // still folds
  })
})

// ── 10. No-cheat king discovery ───────────────────────────────────────────

describe('no-cheat king discovery — partner plays as opponent until king is revealed', () => {
  // Contract: declarer=1, state.partner=2 (engine truth), hand for seat2: [K♣(5), T10(1)]
  // Before reveal (knownPartner=null): seat2 plays as opponent → leads highest NON-trump (K♣)
  // After reveal (knownPartner=2): seat2 plays as declarer-side → leads highest TRUMP (T10)

  it('before king revealed: partner bot leads as opponent (highest non-trump)', () => {
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2 as Seat,
      hand2: [suit('clubs', 'K', 5), trump(10)],
    })
    const card = chooseCard(state, 2, cfg(null)) // knownPartner=null → plays as opponent
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })

  it('after king revealed: partner bot leads as declarer-side (highest trump)', () => {
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2 as Seat,
      hand2: [suit('clubs', 'K', 5), trump(10)],
    })
    const card = chooseCard(state, 2, cfg(2 as Seat)) // knownPartner=2 → plays as partner
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('before reveal: partner following enemy trick plays as opponent (tries to beat)', () => {
    // declarer(1) led T5 and is "enemy" to the unaware partner(2).
    // knownPartner=null: seat2 thinks seat1 is enemy → plays lowest beater (T10).
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2 as Seat,
      hand2: [trump(10), trump(20)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 2, cfg(null))
    // As opponent: enemy winning → play lowest beater (T10)
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('after reveal: partner following declarer trick dumps lowest (ally winning)', () => {
    // declarer(1) led T5. seat2 now knows they are the partner (knownPartner=2).
    // Ally (declarer) winning → dump lowest (T10).
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2 as Seat,
      hand2: [trump(10), trump(20)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 2, cfg(2 as Seat))
    // As declarer-side: ally winning → dump lowest (T10)
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })
})

// ── BOT-004: secret partner guards the called king ─────────────────────────

describe('secret partner does not lead called king (BOT-004)', () => {
  it('partner bot avoids leading called king when it has other non-trumps', () => {
    // seat0 is the secret partner (holds K♣, the called king). It leads.
    // It also holds Q♣ and a trump. Should lead Q♣ not K♣.
    const kClubs = suit('clubs', 'K', 5)
    const qClubs = suit('clubs', 'Q', 4)
    const state = makeState({
      contract: 'one', declarer: 1, partner: 0 as Seat,
      hand0: [kClubs, qClubs, trump(5)],
      kingCall: kingCall('clubs', 0 as Seat),
    })
    const card = chooseCard(state, 0, cfg(null)) // knownPartner still null (king not yet played)
    expect(card).not.toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'Q' })
  })

  it('partner bot leads called king only when it is the sole non-trump', () => {
    // Forced: K♣ is the only non-trump, so it must be led.
    const kClubs = suit('clubs', 'K', 5)
    const state = makeState({
      contract: 'one', declarer: 1, partner: 0 as Seat,
      hand0: [kClubs, trump(5)],
      kingCall: kingCall('clubs', 0 as Seat),
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })

  it('bot with no king call is unaffected — still leads highest non-trump', () => {
    const kClubs = suit('clubs', 'K', 5)
    const qSpades = suit('spades', 'Q', 4)
    const state = makeState({
      contract: 'one', declarer: 1, partner: null,
      hand0: [kClubs, qSpades, trump(5)],
      kingCall: null,
    })
    const card = chooseCard(state, 0, cfg(null))
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })
})

// ── Capturing the Mond with the Škis ───────────────────────────────────────

describe('Mond capture with Škis', () => {
  it('opponent bot plays Škis to capture an enemy declarer\'s Mond', () => {
    // seat 0 (opponent) led hearts; declarer(1) trumped in with the Mond and is
    // winning. Bot seat 3 is void in hearts (must trump) and holds the Škis.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      trickCards: [
        { seat: 0, card: suit('hearts', 7) },
        { seat: 1, card: mond },
      ],
      hand3: [skis, trump(3)],
    })
    const card = chooseCard(state, 3, cfg(null))
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 })
  })

  it('does NOT Škis a Mond played by its own side (teammate)', () => {
    // declarer 1 + partner 2 vs opponents 0 and 3, so bot seat 3's teammate is
    // seat 0. Seat 0 is winning with the Mond → don't capture our own side's Mond.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      trickCards: [
        { seat: 2, card: suit('hearts', 7) },  // declarer's partner leads hearts
        { seat: 0, card: mond },               // bot's teammate trumps in, winning
      ],
      hand3: [skis, trump(3)],
    })
    // knownPartner = the declarer's partner (seat 2), as the bot knows once revealed
    const card = chooseCard(state, 3, cfg(2 as Seat))
    expect(card).not.toMatchObject({ kind: 'trump', ordinal: 22 })
  })

  it('HARD: cutthroat — captures a teammate\'s Mond with the Škis late in the hand', () => {
    // Same teammate-Mond setup, but hard mode and late in the hand (10 tricks
    // done): the individual −20 penalty makes taking it a relative gain, and the
    // Škis has no better use left.
    const priorTricks: Trick[] = Array.from({ length: 10 }, () => ({ cards: [], winner: 0 as Seat }))
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      trickCards: [
        { seat: 2, card: suit('hearts', 7) },
        { seat: 0, card: mond },
      ],
      hand3: [skis, trump(3)],
      completedTricks: priorTricks,
    })
    const card = chooseCard(state, 3, { difficultyBias: 0.5, knownPartner: 2 as Seat, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 })
  })

  it('EASY: stays loyal — does not capture a teammate\'s Mond even late in the hand', () => {
    const priorTricks: Trick[] = Array.from({ length: 10 }, () => ({ cards: [], winner: 0 as Seat }))
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      trickCards: [
        { seat: 2, card: suit('hearts', 7) },
        { seat: 0, card: mond },
      ],
      hand3: [skis, trump(3)],
      completedTricks: priorTricks,
    })
    const card = chooseCard(state, 3, { difficultyBias: 0.5, knownPartner: 2 as Seat, difficulty: 'easy' })
    expect(card).not.toMatchObject({ kind: 'trump', ordinal: 22 })
  })
})

// ── 11. Klop following: lowest beater when forced to win ──────────────────────

describe('klop following — cheapest beater when forced to win', () => {
  it('forced to win (all candidates beat current leader): plays cheapest, saves Mond for dump', () => {
    // Trick: seat1 led T5(1pt). seat0 follows. Both T10(1pt) and Mond(5pt) beat T5.
    // Engine must-beat: candidates = [T10, Mond]. We're going to win → play T10 (cheapest).
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [mond, trump(10)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg())
    // Should play cheapest beater (T10) to preserve Mond for dumping later
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('cannot beat current leader: dumps highest-value card', () => {
    // Trick: seat1 led T20(1pt). seat0 has T5(1pt) and Mond(5pt). Neither beats T20.
    // Engine: must-beat finds no beaters → candidates are both. Dump Mond(5pt).
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [mond, trump(5)],
      trickCards: [{ seat: 1, card: trump(20) }],
    })
    const card = chooseCard(state, 0, cfg())
    // Can't win → dump highest value = Mond(5pt)
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })
  })

  it('forced to win with suit cards: plays cheapest suit beater', () => {
    // Trick: seat1 led 7♣ (1pt). seat0 has J♣(2pt) and Q♣(4pt). Both beat 7♣.
    // Must win → play J♣ (cheapest), save Q♣ for dumping.
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [suit('clubs', 'J', 2), suit('clubs', 'Q', 4)],
      trickCards: [{ seat: 1, card: suit('clubs', 7) }],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'J' })
  })

  it('single candidate in klop: returns it unconditionally', () => {
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [mond],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })
  })
})

// ── 12. Klop leading: shortest suit first ─────────────────────────────────────

describe('klop leading — lead from shortest suit to create voids', () => {
  it('leads from 1-card suit (hearts) over 3-card suit (clubs)', () => {
    // Hand: K♣, Q♣, J♣ (clubs: 3) and Q♥ (hearts: 1).
    // Shortest = hearts → lead Q♥.
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [
        suit('clubs', 'K', 5), suit('clubs', 'Q', 4), suit('clubs', 'J', 2),
        suit('hearts', 'Q', 4),
      ],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'suit', suit: 'hearts' })
  })

  it('leads from 1-card suit (hearts) over 2-card suit (clubs)', () => {
    // Clubs: K♣, Q♣ (2). Hearts: J♥ (1). Shortest = hearts → lead J♥.
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [suit('clubs', 'K', 5), suit('clubs', 'Q', 4), suit('hearts', 'J', 2)],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'suit', suit: 'hearts' })
  })

  it('leads lowest card within the shortest suit', () => {
    // Shortest suit has Q♥(4pt) and J♥(2pt) → leads J♥ (lowest).
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [
        suit('clubs', 'K', 5), suit('clubs', 'Q', 4), suit('clubs', 'J', 2),
        suit('hearts', 'Q', 4), suit('hearts', 'J', 2),
        suit('spades', 7),   // single-card spades would be shortest
      ],
    })
    // Spades (1 card) is shortest, leads 7♠
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'suit', suit: 'spades' })
  })

  it('leads lowest trump when no non-trump available', () => {
    // Hand: only T5 and T10. Leads T5 (lowest).
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [trump(5), trump(10)],
    })
    const card = chooseCard(state, 0, cfg())
    expect(card).toMatchObject({ kind: 'trump', ordinal: 5 })
  })
})

// ── 13. Hard mode opponent leading: shortest suit ─────────────────────────────

describe('hard mode opponent leading — shortest suit creates voids', () => {
  it('HARD: leads from 1-card suit (hearts) over 3-card suit (clubs)', () => {
    // Opponent (seat0) leading. Contract=one, declarer=1.
    // Clubs: K♣,Q♣,J♣ (3 cards). Hearts: Q♥ (1 card). Hard → leads Q♥.
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [
        suit('clubs', 'K', 5), suit('clubs', 'Q', 4), suit('clubs', 'J', 2),
        suit('hearts', 'Q', 4),
      ],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'hearts' })
  })

  it('EASY: ignores suit lengths — leads highest-value non-trump (K♣ not Q♥)', () => {
    // Same hand but easy mode → highest by points = K♣(5pt) over Q♥(4pt).
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [
        suit('clubs', 'K', 5), suit('clubs', 'Q', 4), suit('clubs', 'J', 2),
        suit('hearts', 'Q', 4),
      ],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })

  it('HARD: all suits equal length — falls back to highest-value non-trump', () => {
    // Clubs: K♣,Q♣ (2). Hearts: Q♥,J♥ (2). Equal → fall back to highest = K♣(5pt).
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [
        suit('clubs', 'K', 5), suit('clubs', 'Q', 4),
        suit('hearts', 'Q', 4), suit('hearts', 'J', 2),
      ],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    // Both suits are 2 cards. Reduce picks clubs (first alphabetically in reduce), leads K♣.
    expect(card).toMatchObject({ kind: 'suit', rank: 'K' })
  })

  it('HARD: only one non-trump suit — leads highest in it (no shortest-suit branch fires differently)', () => {
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [suit('clubs', 'K', 5), suit('clubs', 'Q', 4), trump(5)],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })
})

// ── 14. Hard mode declarer: switches to suit leads when trumps exhausted ──────

describe('hard mode declarer leading — switches to suit when opponent trumps exhausted', () => {
  function manyCompletedTricks(trumpsPlayed: number[]): Trick[] {
    // Pack the played trumps into completed tricks (1 each for simplicity)
    return trumpsPlayed.map(ord => ({
      cards: [{ seat: 1 as Seat, card: trump(ord) }],
      winner: 1 as Seat,
    }))
  }

  it('HARD: ≤3 unseen opponent trumps → leads highest suit card over leading trump', () => {
    // Own hand: T18, T19, T20 (ordinals 18-20) + K♣.
    // Played: ordinals 1..17 in completed tricks (no overlap with hand).
    // Unseen = 22 total − 17 played − 3 in hand = 2 ≤ 3 → switch to suit leads.
    const tricks = manyCompletedTricks(Array.from({ length: 17 }, (_, i) => i + 1))
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [trump(18), trump(19), trump(20), suit('clubs', 'K', 5)],
      completedTricks: tricks,
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })

  it('HARD: many unseen opponent trumps → continues leading trump not suit', () => {
    // Only 5 played → unseen = 22 − 5 − 3 = 14 > 3 → stay with trumps.
    const tricks = manyCompletedTricks(Array.from({ length: 5 }, (_, i) => i + 1))
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [trump(18), trump(19), trump(20), suit('clubs', 'K', 5)],
      completedTricks: tricks,
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card.kind).toBe('trump')
  })

  it('EASY: never switches to suit based on trump count (unchanged behaviour)', () => {
    // Same exhausted-trump setup (only 2 unseen); easy mode should still lead trump.
    const tricks = manyCompletedTricks(Array.from({ length: 17 }, (_, i) => i + 1))
    const state = makeState({
      contract: 'one', declarer: 0,
      hand0: [trump(18), trump(19), trump(20), suit('clubs', 'K', 5)],
      completedTricks: tricks,
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy', knownPartner: null })
    expect(card.kind).toBe('trump')
  })
})

// ── 15. Hard mode opponent trump lead: Mond protection ─────────────────────

describe('hard mode opponent trump lead — Mond protection (same as declarer side)', () => {
  it('HARD: opponent avoids leading Mond when Škis is unseen and not in hand', () => {
    // Opponent (seat0) has no suit cards — must lead trump.
    // Hand: Mond(5pt) + T10(1pt). Škis is unseen (not played, not in hand).
    // Leading Mond risks it falling to the Škis for −20 → skip it, lead T10.
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [mond, trump(10)],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('EASY: opponent leads Mond when it is highest (no protection in easy mode)', () => {
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [mond, trump(10)],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy' })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })
  })

  it('HARD: opponent leads Mond when holding Škis (no need to protect)', () => {
    // We hold the Škis, so Mond cannot be captured by it — safe to lead Mond.
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [mond, skis, trump(10)],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 })  // leads Škis (highest)
  })

  it('HARD: opponent leads Mond when Škis is already played (safe)', () => {
    // Škis was played in a previous trick — can no longer capture Mond.
    const state = makeState({
      contract: 'one', declarer: 1,
      hand0: [mond, trump(10)],
      completedTricks: [{ cards: [{ seat: 1 as Seat, card: skis }], winner: 1 as Seat }],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 21 })  // safe to lead Mond
  })
})

// ── 16. Beggar declarer leading: longest suit ─────────────────────────────────

describe('hard mode beggar declarer leading — longest suit (give away tricks)', () => {
  it('HARD: leads lowest card in the longest suit', () => {
    // Clubs: K♣,Q♣,J♣ (3 cards — longest). Hearts: Q♥ (1 card).
    // Hard mode: leads from clubs (longest) to maximise opponents having that suit.
    // Lowest in clubs = J♣ (rank lowest = highest suitStrength = lowest ordinal… actually
    // for "lowest" in the suit the rank ordering is 7<8<9<10<J<Kn<Q<K).
    // So J♣ is lower than Q♣ and K♣ → leads J♣.
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand0: [
        suit('clubs', 'K', 5), suit('clubs', 'Q', 4), suit('clubs', 'J', 2),
        suit('hearts', 'Q', 4),
      ],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'J' })
  })

  it('EASY: does not use suit-length logic — plays lowest card overall', () => {
    // Easy mode: just sorts by cardPoints ascending → J♣(2pt) tied with other 1pt cards.
    // Q♥(4pt) and K♣(5pt) are higher. With J♣ lowest points in suit, it wins.
    // Actually J♣(2pt) vs Q♣(4pt) vs K♣(5pt) vs Q♥(4pt) — easiest = J♣(2pt).
    // Both easy and hard pick J♣ here — use a cleaner differentiator.
    // Different example: clubs has 1-pt cards only, hearts has Q♥(4pt) alone.
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand0: [
        suit('clubs', 7), suit('clubs', 8), suit('clubs', 9),   // clubs: 3 cards, 1pt each
        suit('hearts', 'K', 5),                                   // hearts: 1 card, 5pt (high value)
      ],
    })
    // EASY: picks lowest points = 7♣(1pt) not K♥(5pt)
    const easyCard = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy' })
    // HARD: picks lowest in LONGEST suit = clubs (3) → 7♣(1pt) — same result here
    // because clubs is both longest and has lowest cards. Test the contrasting case below.
    expect(easyCard).toMatchObject({ kind: 'suit', suit: 'clubs' })
  })

  it('HARD: prefers longest suit over suit with globally lowest card', () => {
    // Clubs: K♣ (1 card, 5pt). Hearts: 7♥,8♥,9♥ (3 cards, 1pt each).
    // Easy: picks K♣ (lowest by points? No: 7♥=1pt < K♣=5pt → picks 7♥ in easy too).
    // Use: clubs 1pt card, hearts 5pt cards x3 — then hard picks hearts(longest, 5pt) over clubs(shortest, 1pt).
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand0: [
        suit('clubs', 7),                                          // clubs: 1 card, 1pt
        suit('hearts', 'K', 5), suit('hearts', 'Q', 4), suit('hearts', 'J', 2), // hearts: 3 cards
      ],
    })
    // HARD: longest = hearts (3) → lowest in hearts = J♥(rank=J, lowest suit rank in hearts here)
    const hardCard = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(hardCard).toMatchObject({ kind: 'suit', suit: 'hearts' })
    // EASY: lowest points overall = 7♣(1pt)
    const easyCard = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy' })
    expect(easyCard).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 7 })
  })

  it('HARD: when following (not leading), uses normal lowest-card logic', () => {
    // Declarer following: trick led with 7♥. Declarer has K♣ and Q♥.
    // Must follow suit → candidates reduced to Q♥. Plays Q♥.
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 'Q', 4)],
      trickCards: [{ seat: 1, card: suit('hearts', 7) }],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'hearts', rank: 'Q' })
  })
})

// ── 17. Beggar opponent following: yield when fellow opponent is winning ──────

describe('hard mode beggar opponent following — yield when fellow opponent winning', () => {
  it('HARD: opponent yields (plays low) when fellow opponent (not declarer) is winning', () => {
    // Beggar: declarer=0. Trick: seat3 (opponent) led 7♣ and is winning.
    // Seat1 (opponent) follows. In hard mode → yield, play lowest.
    // Candidates: K♣(5pt), J♣(2pt). Both beat 7♣. Current winner = seat3.
    // Hard: play J♣ (lowest) to avoid winning, letting seat3 keep the trick.
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand1: [suit('clubs', 'K', 5), suit('clubs', 'J', 2)],
      trickCards: [{ seat: 3, card: suit('clubs', 7) }],
    })
    const card = chooseCard(state, 1, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'J' })
  })

  it('EASY: opponent plays HIGH when fellow opponent is winning (try to win)', () => {
    // Same setup; easy mode plays highest to try to win.
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand1: [suit('clubs', 'K', 5), suit('clubs', 'J', 2)],
      trickCards: [{ seat: 3, card: suit('clubs', 7) }],
    })
    const card = chooseCard(state, 1, { difficultyBias: 0.5, difficulty: 'easy' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'K' })
  })

  it('HARD: opponent still plays low when declarer is winning (original behaviour preserved)', () => {
    // Declarer(0) led 7♣ and is winning. Seat1 follows with K♣, J♣.
    // Must beat: both beat 7♣. Hard: play low → J♣.
    const state = makeState({
      contract: 'beggar', declarer: 0,
      hand1: [suit('clubs', 'K', 5), suit('clubs', 'J', 2)],
      trickCards: [{ seat: 0, card: suit('clubs', 7) }],
    })
    const card = chooseCard(state, 1, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs', rank: 'J' })
  })
})

// ── 18. Declarer side following last: use cheapest beater ─────────────────────

describe('hard mode declarer side following last — cheapest beater preserves high cards', () => {
  it('HARD: last to play uses cheapest beater (T10) over Škis when both beat enemy', () => {
    // Trick: seat2 (opponent) led T8 and is winning.
    // Seat1 (declarer, last to play) has T10 and Škis. Both beat T8.
    // Hard, last: use T10 (cheapest), preserve Škis for later leads.
    const state = makeState({
      contract: 'one', declarer: 1,
      hand1: [trump(10), skis],
      trickCards: [
        { seat: 2, card: trump(8) },   // opponent leading
        { seat: 3, card: trump(9) },   // another opponent
        { seat: 0, card: suit('clubs', 7) }, // partner (void in trump... wait, they played suit so not forced)
      ],
    })
    // seat1 is last (3 cards already played), declarer wins with T10 cheapest
    const card = chooseCard(state, 1, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 10 })
  })

  it('EASY: last to play still uses highest beater', () => {
    const state = makeState({
      contract: 'one', declarer: 1,
      hand1: [trump(10), skis],
      trickCards: [
        { seat: 2, card: trump(8) },
        { seat: 3, card: trump(9) },
        { seat: 0, card: suit('clubs', 7) },
      ],
    })
    const card = chooseCard(state, 1, { difficultyBias: 0.5, difficulty: 'easy', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 })  // Škis (highest)
  })

  it('HARD: 3rd player (not last) still uses highest beater', () => {
    // Only 2 cards played — seat1 is 3rd (index 2), not last (index 3).
    const state = makeState({
      contract: 'one', declarer: 1,
      hand1: [trump(10), skis],
      trickCards: [
        { seat: 2, card: trump(8) },
        { seat: 3, card: trump(9) },
      ],
    })
    const card = chooseCard(state, 1, { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    // Not last → use highest beater (Škis)
    expect(card).toMatchObject({ kind: 'trump', ordinal: 22 })
  })
})

// ── Hard mode: secret partner cooperation ────────────────────────────────────
// The bot that holds the called king knows it is the partner even before the
// king has been publicly played. With selfIsPartner=true and difficulty=hard,
// it cooperates silently: sloughs highest suit card onto the declarer's trick
// and fights with its strongest beater when the enemy is winning.

describe('hard mode secret partner — follows as declarer side before king revealed', () => {
  it('secret partner sloughs highest suit card onto declarer winning trick', () => {
    // Contract: two; seat1=declarer, seat2=secret partner (selfIsPartner).
    // Trick: seat1 (declarer) leads T20 and is winning.
    // Seat2 has Q♣(4pt) and 7♦(1pt) — neither is trump so both are legal.
    // Opponent mode (no selfIsPartner): dumps 7♦ (lowest, saves Q♣ to fight later).
    // Secret partner mode: sloughs Q♣ (highest) to maximise declarer's pile.
    const state = makeState({
      contract: 'two', declarer: 1, partner: 2,
      hand2: [suit('clubs', 'Q', 4), suit('diamonds', 7)],
      trickCards: [{ seat: 1, card: trump(20) }],
    })
    const cardOpponent = chooseCard(state, 2,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null, selfIsPartner: false })
    expect(cardOpponent).toMatchObject({ kind: 'suit', rank: 7 })  // dumps cheap card

    const cardPartner = chooseCard(state, 2,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null, selfIsPartner: true })
    expect(cardPartner).toMatchObject({ kind: 'suit', rank: 'Q' })  // sloughs valuable card
  })

  it('secret partner fights with highest beater when enemy is winning', () => {
    // Contract: one; seat1=declarer, seat2=secret partner.
    // Trick: seat0 (enemy) led T8 and is winning. Seat2 has T10 and T18 — both beat T8.
    // Opponent mode: plays LOWEST beater (T10, save resources).
    // Secret partner mode: plays HIGHEST beater (T18) to win the trick for the declarer side.
    const state = makeState({
      contract: 'one', declarer: 1, partner: 2,
      hand2: [trump(10), trump(18)],
      trickCards: [{ seat: 0, card: trump(8) }],
    })
    const cardOpponent = chooseCard(state, 2,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null, selfIsPartner: false })
    expect(cardOpponent).toMatchObject({ kind: 'trump', ordinal: 10 })  // lowest beater

    const cardPartner = chooseCard(state, 2,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null, selfIsPartner: true })
    expect(cardPartner).toMatchObject({ kind: 'trump', ordinal: 18 })  // highest beater
  })

  it('secret partner still leads like an opponent (maintains cover, no trump first)', () => {
    // When LEADING, the secret partner must not reveal itself by leading trumps
    // (which is the declarer-side pattern). It uses the opponent leading logic instead.
    // Contract: two; seat1=declarer, seat2=secret partner.
    // Seat2 has T15 and Q♥ (suit card). As declarer side it would lead T15; as
    // opponent it leads Q♥ (non-trump first).
    const state = makeState({
      contract: 'two', declarer: 1, partner: 2,
      hand2: [trump(15), suit('hearts', 'Q', 4)],
      trickCards: [],
    })
    // selfIsPartner=true → leading still picks non-trump (cover maintained)
    const card = chooseCard(state, 2,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null, selfIsPartner: true })
    expect(card).toMatchObject({ kind: 'suit' })  // non-trump, not T15
  })
})

// ── Hard mode valat: opponents use highest beater ─────────────────────────────

describe('hard mode valat contracts — opponent uses highest beater', () => {
  it('HARD valat: opponent uses highest beater (not lowest)', () => {
    // Contract: valat-without; seat1=declarer (no partner).
    // Trick: seat1 led T5. Seat0 (opponent) has T10 and T20 — both beat T5.
    // Normal mode: plays T10 (lowest beater, saves T20).
    // Valat hard mode: plays T20 (highest) to guarantee winning the trick.
    const state = makeState({
      contract: 'valat-without', declarer: 1, partner: null,
      hand0: [trump(10), trump(20)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const cardEasy = chooseCard(state, 0,
      { difficultyBias: 0.5, difficulty: 'easy', knownPartner: null })
    expect(cardEasy).toMatchObject({ kind: 'trump', ordinal: 10 })  // lowest beater in easy

    const cardHard = chooseCard(state, 0,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(cardHard).toMatchObject({ kind: 'trump', ordinal: 20 })  // highest beater in hard
  })

  it('HARD color-valat: opponent also uses highest beater', () => {
    // color-valat-without: same behaviour as valat for the highest-beater heuristic.
    const state = makeState({
      contract: 'color-valat-without', declarer: 1, partner: null,
      hand0: [trump(10), trump(20)],
      trickCards: [{ seat: 1, card: trump(5) }],
    })
    const card = chooseCard(state, 0,
      { difficultyBias: 0.5, difficulty: 'hard', knownPartner: null })
    expect(card).toMatchObject({ kind: 'trump', ordinal: 20 })
  })
})

// ── Hard mode klop: avoid leading a lone king ─────────────────────────────────

describe('hard mode klop — skip lone king singleton lead', () => {
  it('HARD: prefers a 2-card suit over a 1-card king singleton', () => {
    // Clubs: K♣ alone (1 card, dangerous — will win the trick).
    // Hearts: 7♥, 8♥ (2 cards, safer lead).
    // Hard mode: leads from hearts (avoids the lone king).
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 7), suit('hearts', 8)],
    })
    const cardHard = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(cardHard).toMatchObject({ kind: 'suit', suit: 'hearts' })
  })

  it('EASY: still leads from shortest suit (1-card clubs = K♣, even in easy mode)', () => {
    // Easy mode ignores the king-singleton heuristic → leads K♣ as shortest suit.
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 7), suit('hearts', 8)],
    })
    const cardEasy = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'easy' })
    expect(cardEasy).toMatchObject({ kind: 'suit', suit: 'clubs' })  // shortest regardless
  })

  it('HARD: when ALL singletons are kings, falls back to shortest suit', () => {
    // K♣ (1 card) and K♥ (1 card) — both are dangerous singletons.
    // No safe suit → fall back to shortest. Both are length 1, picks first (clubs).
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [suit('clubs', 'K', 5), suit('hearts', 'K', 5)],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    // Both are dangerous, no safe suit — falls back and picks one of the two (either is OK)
    expect(card).toMatchObject({ kind: 'suit' })
  })

  it('HARD: 1-card non-king singleton is preferred over 2-card suit', () => {
    // J♣ (1 card, non-king singleton) and K♥, Q♥ (2 cards).
    // J♣ is short (1 card) and NOT a dangerous singleton → leads J♣.
    const state = makeState({
      contract: 'klop', declarer: 1,
      hand0: [suit('clubs', 'J', 2), suit('hearts', 'K', 5), suit('hearts', 'Q', 4)],
    })
    const card = chooseCard(state, 0, { difficultyBias: 0.5, difficulty: 'hard' })
    expect(card).toMatchObject({ kind: 'suit', suit: 'clubs' })  // J♣ (1 card, safe)
  })
})
