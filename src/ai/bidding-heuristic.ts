import type { Card, Contract, Suit } from '../engine/types'
import { isTrump, isPagat, isMond, isSkis, isKing } from '../engine/deck'
import { contractStrength } from '../engine/bidding'

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
  const hasMond = hand.some(isMond)
  const hasSkis = hand.some(isSkis)

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

// Returns the highest contract this hand can safely support, or null to pass.
// Keyed on trump count only — HCP average is ~10/hand so including it made nearly
// every hand qualify for 'one', causing bots to always open with One.
function handCeiling(ev: HandEvaluation): Contract | null {
  const { trumpCount, trulaPotential } = ev

  // Exceptional: near-complete trump run
  if (trumpCount >= 10 && trulaPotential >= 2) return 'solo-without'
  // Strong solo hands
  if (trumpCount >= 10) return 'solo-one'
  if (trumpCount >= 9)  return 'solo-two'
  if (trumpCount >= 8)  return 'solo-three'
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
): Contract | 'pass' {
  if (legalBids.length === 0) return 'pass'

  const ceiling = handCeiling(evaluation)
  if (!ceiling) return 'pass'

  // Find the highest legal bid at or below our ceiling
  const ceilStrength = contractStrength(ceiling)
  const candidates = legalBids.filter(b => contractStrength(b) <= ceilStrength)
  if (candidates.length === 0) return 'pass'

  return candidates.reduce((best, c) =>
    contractStrength(c) > contractStrength(best) ? c : best,
  )
}

export function recommendKingCall(
  hand: Card[],
  legalSuits: Suit[],
): Suit {
  // Prefer suits where bot does not hold the King (to actually get a partner)
  for (const suit of legalSuits) {
    const holdsKing = hand.some(c => c.kind === 'suit' && c.suit === suit && c.rank === 'K')
    if (!holdsKing) return suit
  }
  return legalSuits[0]
}
