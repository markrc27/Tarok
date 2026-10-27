import type { Card, Contract, Suit, SuitCard, TrumpCard, BonusName } from '../engine/types'
import { isTrump, isPagat, isKing, cardPoints, cardsEqual } from '../engine/deck'
import { contractStrength } from '../engine/bidding'
import { canDiscard } from '../engine/talon'

export type BotDifficulty = 'easy' | 'hard'

export interface HandEvaluation {
  trumpCount: number
  highCardPoints: number
  hasPagat: boolean
  hasMond: boolean
  hasSkis: boolean
  trulaPotential: number
}

export function evaluateHand(hand: Card[]): HandEvaluation {
  const trumps = hand.filter(isTrump)
  const hasPagat = hand.some(isPagat)
  const hasMond = hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 21)
  const hasSkis = hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)

  let hcp = 0
  for (const c of hand) {
    if (c.kind === 'suit') {
      if (c.rank === 'K') hcp += 4
      else if (c.rank === 'Q') hcp += 3
      else if (c.rank === 'Kn') hcp += 2
      else if (c.rank === 'J') hcp += 1
    }
  }

  return {
    trumpCount: trumps.length,
    highCardPoints: hcp,
    hasPagat,
    hasMond,
    hasSkis,
    trulaPotential: (hasPagat ? 1 : 0) + (hasMond ? 1 : 0) + (hasSkis ? 1 : 0),
  }
}

const SUITS = ['clubs', 'spades', 'hearts', 'diamonds'] as const

function holdsAllFourKings(hand: Card[]): boolean {
  return SUITS.every(suit => hand.some(c => c.kind === 'suit' && c.suit === suit && c.rank === 'K'))
}

function countKings(hand: Card[]): number {
  return hand.filter(c => c.kind === 'suit' && (c as SuitCard).rank === 'K').length
}

// Returns the highest contract this hand can safely support, or null to pass.
function handCeiling(ev: HandEvaluation, hand: Card[], difficulty: BotDifficulty): Contract | null {
  const { trumpCount, trulaPotential, highCardPoints } = ev

  // Exceptional: near-complete trump run
  if (trumpCount >= 10 && trulaPotential >= 2) return 'solo-without'

  // Hard mode solo gate: never bid solo on trump length alone — require ≥2 trula or ≥1 king.
  const kingsCount = countKings(hand)
  const soloAllowed = difficulty === 'easy' || trulaPotential >= 2 || kingsCount >= 1

  // Strong solo hands — gated in hard mode
  if (trumpCount >= 10) return soloAllowed ? 'solo-one' : 'one'
  if (trumpCount >= 9)  return soloAllowed ? 'solo-two' : 'one'
  if (trumpCount >= 8)  return soloAllowed ? 'solo-three' : 'one'

  // Holding all four kings means any called king is in own hand — effectively solo.
  if (holdsAllFourKings(hand)) {
    if (trumpCount >= 7) return 'solo-one'
    if (trumpCount >= 6) return 'solo-two'
    if (trumpCount >= 5) return 'solo-three'
    return null
  }

  // Hard mode: 0 trumps + very low courts → beggar. With no trumps the bot
  // cannot ruff; with only low pip cards it can never beat a suit trick. The
  // beggar AI already leads lowest-from-longest to shed tricks onto opponents.
  if (difficulty === 'hard' && trumpCount === 0 && highCardPoints <= 2) return 'beggar'

  // Partner contracts — share the burden with a called king.
  // Hard mode: strong courts (≥8 HCP) mean extra material that makes the 36-point
  // threshold more achievable, so bump the ceiling up one level. Conversely, very
  // weak courts (≤1 HCP) in hard mode signal a hand that relies entirely on trump
  // length — knock the ceiling down one level.
  // Hard mode void bonus: being void in any suit is worth +1 effective trump for
  // partner contracts — the bot can ruff immediately when that suit is led. Capped
  // at +1 and at 7 total so we stay in the partner range.
  const hcpBoost   = difficulty === 'hard' && highCardPoints >= 8
  const hcpPenalty = difficulty === 'hard' && highCardPoints <= 1
  const hasVoid    = difficulty === 'hard' &&
    SUITS.some(s => !hand.some(c => c.kind === 'suit' && (c as SuitCard).suit === s))
  const ptTrumps   = Math.min(trumpCount + (hasVoid ? 1 : 0), 7)
  // Hard mode: holding all three trula cards (Škis + Mond + Pagat) adds ~1 effective
  // trump for partner-range contracts — Mond/Škis are the two strongest non-Pagat
  // trumps, and the trula bonus (+10 unannounced, +20 announced) significantly
  // raises the expected value of the hand.
  const trulaBump  = difficulty === 'hard' && trulaPotential === 3

  if (ptTrumps >= 7)  return 'one'
  if (ptTrumps >= 6)  {
    if (hcpBoost || trulaBump) return 'one'
    if (hcpPenalty)  return 'three'
    return 'two'
  }
  if (ptTrumps >= 5)  return (hcpBoost || trulaBump) ? 'two' : 'three'
  if (ptTrumps >= 4 && (hcpBoost || trulaBump)) return 'three'

  return null  // weak hand — pass
}

export function recommendBid(
  evaluation: HandEvaluation,
  legalBids: Contract[],
  _isCompulsoryKlop: boolean,
  hand: Card[] = [],
  difficulty: BotDifficulty = 'easy',
): Contract | 'pass' {
  if (legalBids.length === 0) return 'pass'

  const ceiling = handCeiling(evaluation, hand, difficulty)
  if (!ceiling) return 'pass'

  // Beggar ceiling: only bid 'beggar' itself (never fall back to a normal contract
  // like 'one' or 'two' — bidding positively with 0 trumps is suicidal).
  if (ceiling === 'beggar') {
    return legalBids.includes('beggar') ? 'beggar' : 'pass'
  }

  // Find the highest legal bid at or below our ceiling
  const ceilStrength = contractStrength(ceiling)
  const candidates = legalBids.filter(b => contractStrength(b) <= ceilStrength)
  if (candidates.length === 0) return 'pass'

  return candidates.reduce((best, c) =>
    contractStrength(c) > contractStrength(best) ? c : best,
  )
}

// Pick the talon group index that maximises the declarer's expected value.
// Hard mode adds a void bonus (12 pts) per suit that can be fully cleared by
// discarding: a void lets the declarer ruff every future lead in that suit.
export function recommendTalonGroup(
  groups: Card[][],
  hand?: Card[],
  groupSize?: number,
  difficulty?: BotDifficulty,
): number {
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < groups.length; i++) {
    // ENG-008: leaving the Mond in the unchosen talon costs the declarer 20.
    const mondLeftPenalty = groups[i].some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 21) ? 20 : 0
    let score = groups[i].reduce((sum, c) => sum + cardPoints(c), 0) + mondLeftPenalty

    if (difficulty === 'hard' && hand) {
      const combined = [...hand, ...groups[i]]

      // Void bonus — if taking this group (then discarding groupSize cards) could leave
      // the declarer completely void in a suit, that ruffing potential is worth ~12 pts.
      // Applies only to non-king suits: kings cannot be discarded.
      if (groupSize !== undefined) {
        for (const s of SUITS) {
          const inSuit = combined.filter(c => c.kind === 'suit' && (c as SuitCard).suit === s)
          const hasKing = inSuit.some(c => (c as SuitCard).rank === 'K')
          if (!hasKing && inSuit.length > 0 && inSuit.length <= groupSize) {
            score += 12
          }
        }
      }

      // Trula set bonus (+20): taking this group completes the Pagat+Mond+Škis set,
      // enabling a trula announcement worth +20. Only fires when the group itself provides
      // the missing trula card — if the hand already had all three, it's already scored.
      const combinedPagat = combined.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 1)
      const combinedMond  = combined.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 21)
      const combinedSkis  = combined.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)
      const handAllTrula = hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 1) &&
                           hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 21) &&
                           hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)
      if (combinedPagat && combinedMond && combinedSkis && !handAllTrula) score += 20

      // Kings set bonus (+20): taking this group completes all four kings, enabling a
      // kings announcement worth +20. Only fires when the group provides the missing king.
      const combinedAllKings = SUITS.every(s => combined.some(
        c => c.kind === 'suit' && (c as SuitCard).suit === s && (c as SuitCard).rank === 'K',
      ))
      const handAllKings = SUITS.every(s => hand.some(
        c => c.kind === 'suit' && (c as SuitCard).suit === s && (c as SuitCard).rank === 'K',
      ))
      if (combinedAllKings && !handAllKings) score += 20
    }

    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

// Discard the highest-value legally discardable cards (they count toward captured pile).
// Hard mode: avoid Pagat, prefer creating suit voids, prefer courts in suits without our king.
export function recommendDiscard(hand: Card[], count: number, difficulty: BotDifficulty = 'easy'): Card[] {
  const discardable = hand.filter(c => canDiscard(c, hand))

  if (difficulty === 'hard') {
    // Exclude Pagat even if it would otherwise be legally discardable (last resort trump)
    const noPagat = discardable.filter(c => !isPagat(c))
    const pool = noPagat.length >= count ? noPagat : discardable

    // Count cards per suit in hand to identify short suits (void creation targets)
    const suitCounts: Partial<Record<Suit, number>> = {}
    for (const c of hand) {
      if (c.kind === 'suit') {
        const s = (c as SuitCard).suit
        suitCounts[s] = (suitCounts[s] ?? 0) + 1
      }
    }
    // Suits where we hold the king
    const kingSuits = new Set<Suit>(
      hand.filter(c => c.kind === 'suit' && (c as SuitCard).rank === 'K')
        .map(c => (c as SuitCard).suit),
    )

    return pool.sort((a, b) => {
      const suitA = a.kind === 'suit' ? (a as SuitCard).suit : null
      const suitB = b.kind === 'suit' ? (b as SuitCard).suit : null
      // Prefer suit cards over trumps for discarding (keep suit flexibility)
      if (suitA && !suitB) return -1
      if (!suitA && suitB) return 1
      if (suitA && suitB) {
        // Prefer shorter suits (void creation)
        const cntA = suitCounts[suitA] ?? 0
        const cntB = suitCounts[suitB] ?? 0
        if (cntA !== cntB) return cntA - cntB
        // Prefer suits we don't hold the king for (king suits are worth protecting)
        const aHasKing = kingSuits.has(suitA) ? 1 : 0
        const bHasKing = kingSuits.has(suitB) ? 1 : 0
        if (aHasKing !== bHasKing) return aHasKing - bHasKing
      }
      // Tertiary: highest points first (discarded cards go to our captured pile)
      return cardPoints(b) - cardPoints(a)
    }).slice(0, count)
  }

  return discardable.sort((a, b) => cardPoints(b) - cardPoints(a)).slice(0, count)
}

export function recommendKingCall(
  hand: Card[],
  legalSuits: Suit[],
  talonRemainder: Card[] = [],
): Suit {
  // Score each suit: avoid calling own king (plays solo) or king in talon (no partner);
  // prefer the shortest suit — fewer cards means the declarer can ruff in earlier,
  // giving the partner king more room to come out cleanly.
  const score = (suit: Suit): number => {
    if (hand.some(c => c.kind === 'suit' && (c as SuitCard).suit === suit && (c as SuitCard).rank === 'K')) return -100
    if (talonRemainder.some(c => c.kind === 'suit' && (c as SuitCard).suit === suit && (c as SuitCard).rank === 'K')) return -50
    const count = hand.filter(c => c.kind === 'suit' && (c as SuitCard).suit === suit).length
    return -count  // fewer suit cards = higher score = preferred
  }
  return legalSuits.reduce((best, s) => score(s) > score(best) ? s : best, legalSuits[0])
}

// Returns true when an opponent bot should kontra the game in hard mode.
// ≥8 trumps gives dominant trump control; ≥6 trumps + ≥8 HCP combines
// trump length with strong suit winners for a well-rounded defensive hand.
export function shouldBotKontra(hand: Card[], difficulty: BotDifficulty): boolean {
  if (difficulty !== 'hard') return false
  const { trumpCount, highCardPoints } = evaluateHand(hand)
  return trumpCount >= 8 || (trumpCount >= 6 && highCardPoints >= 8)
}

// Returns true when a bot on the declarer side should rekontra (×4) after an opponent
// has already kontrad (×2) in hard mode. Higher threshold than kontra: ≥9 trumps gives
// near-certain trump dominance; ≥7 trumps + ≥12 HCP combines deep trump length with
// very strong court cards. Only called for non-beggar contracts.
export function shouldBotRekontra(hand: Card[], difficulty: BotDifficulty): boolean {
  if (difficulty !== 'hard') return false
  const { trumpCount, highCardPoints } = evaluateHand(hand)
  return trumpCount >= 9 || (trumpCount >= 7 && highCardPoints >= 12)
}

// Returns bonuses the bot should announce given its hand (hard mode only).
// Pass `calledKing` when the bot holds the called king (is the partner) so
// king-ultimo can be considered.
export function recommendAnnouncements(hand: Card[], calledKing?: Card | null): BonusName[] {
  const bonuses: BonusName[] = []
  const hasSkis = hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)
  const hasMond = hand.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 21)
  const hasPagat = hand.some(isPagat)
  const trumpCount = hand.filter(c => c.kind === 'trump').length
  const allKings = SUITS.every(s => hand.some(c => c.kind === 'suit' && (c as SuitCard).suit === s && (c as SuitCard).rank === 'K'))

  if (hasSkis && hasMond && hasPagat) bonuses.push('trula')
  if (allKings) bonuses.push('kings')
  // Pagat ultimo only when holding enough trumps to plausibly win the last trick
  if (hasPagat && trumpCount >= 9) bonuses.push('pagat-ultimo')
  // King ultimo: holding the called king with strong trump support (≥7 trumps)
  // means the engine will reserve the king until the last trick — high probability
  // of success. The engine enforces the obligation once announced.
  if (calledKing && trumpCount >= 7 && hand.some(c => cardsEqual(c, calledKing))) {
    bonuses.push('king-ultimo')
  }

  return bonuses
}
