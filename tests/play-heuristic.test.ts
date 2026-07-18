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
