import type { Card, Contract, Suit, SuitCard, TrumpCard, BonusName } from '../engine/types'
import { isTrump, isPagat, isKing, cardPoints } from '../engine/deck'
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
  const { trumpCount, trulaPotential } = ev

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

  // Partner contracts — share the burden with a called king
  if (trumpCount >= 7)  return 'one'
  if (trumpCount >= 6)  return 'two'
  if (trumpCount >= 5)  return 'three'   // forehand-only; non-forehand bots will pass

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

  // Find the highest legal bid at or below our ceiling
  const ceilStrength = contractStrength(ceiling)
  const candidates = legalBids.filter(b => contractStrength(b) <= ceilStrength)
  if (candidates.length === 0) return 'pass'

  return candidates.reduce((best, c) =>
    contractStrength(c) > contractStrength(best) ? c : best,
  )
}

// Pick the talon group index that adds the most raw card points.
export function recommendTalonGroup(groups: Card[][]): number {
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < groups.length; i++) {
    const score = groups[i].reduce((sum, c) => sum + cardPoints(c), 0)
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
  const score = (suit: Suit): number => {
    if (hand.some(c => c.kind === 'suit' && c.suit === suit && c.rank === 'K')) return -2
    if (talonRemainder.some(c => c.kind === 'suit' && c.suit === suit && c.rank === 'K')) return -1
    return 0
  }
  return legalSuits.reduce((best, s) => score(s) > score(best) ? s : best, legalSuits[0])
}

// Returns bonuses the bot should announce given its hand (hard mode only).
export function recommendAnnouncements(hand: Card[]): BonusName[] {
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

  return bonuses
}
