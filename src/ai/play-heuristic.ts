import type { Card, Seat, PlayState } from '../engine/types'
import { legalCards } from '../engine/play'
import { cardPoints, isTrump, isPagat } from '../engine/deck'

export interface BotConfig {
  difficultyBias: number // 0.0–1.0
}

function isDeclarerSide(seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  return seat === declarer || seat === partner
}

function isNegativeContract(contract: string): boolean {
  return contract === 'klop' || contract === 'beggar' || contract === 'open-beggar'
}

export function chooseCard(state: PlayState, seat: Seat, _config: BotConfig): Card {
  const candidates = legalCards(state, seat)
  if (candidates.length === 0) throw new Error(`chooseCard: no legal cards for seat ${seat}`)
  if (candidates.length === 1) return candidates[0]

  const negative = isNegativeContract(state.contract)
  const onDeclarerSide = isDeclarerSide(seat, state.declarer, state.partner)

  if (negative) {
    // Dump highest-value cards (avoid taking tricks)
    // Sort by point value descending, play highest points
    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
  }

  if (onDeclarerSide) {
    // Lead high trumps to grab tricks, but don't throw away Pagat unnecessarily
    const trumps = candidates.filter(isTrump)
    const nonTrumps = candidates.filter(c => !isTrump(c))

    // If leading and we have trumps, lead highest trump (except Pagat if alternatives exist)
    if (state.currentTrick.cards.length === 0 && trumps.length > 0) {
      const usableTrumps = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps
      return usableTrumps.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }

    // If following, play highest card to win the trick
    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
  } else {
    // Opponent of declarer: play low cards, avoid taking valuable tricks
    return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
  }
}
