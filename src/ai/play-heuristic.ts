import type { Card, Seat, PlayState } from '../engine/types'
import { legalCards } from '../engine/play'
import { cardPoints, isTrump, isPagat, trumpStrength, suitStrength } from '../engine/deck'

export interface BotConfig {
  difficultyBias: number // 0.0–1.0
}

function isDeclarerSide(seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  return seat === declarer || seat === partner
}

// Returns the seat currently winning the trick, or null if trick not started.
function currentWinner(state: PlayState): Seat | null {
  const { currentTrick, isColourValat } = state
  const trickCards = currentTrick.cards
  if (trickCards.length === 0 || !currentTrick.ledSuit) return null

  const ledSuit = currentTrick.ledSuit

  let bestEntry = trickCards[0]
  for (const entry of trickCards.slice(1)) {
    const card = entry.card
    const best = bestEntry.card
    const cardEff = card.kind === 'trump' ? 'trump' : card.suit
    const bestEff = best.kind === 'trump' ? 'trump' : best.suit

    if (isColourValat) {
      if (cardEff === ledSuit && bestEff !== ledSuit) { bestEntry = entry; continue }
      if (cardEff !== ledSuit) continue
      if (card.kind === 'suit' && best.kind === 'suit' && suitStrength(card) > suitStrength(best)) bestEntry = entry
    } else {
      if (cardEff === 'trump' && bestEff !== 'trump') { bestEntry = entry; continue }
      if (cardEff !== 'trump' && bestEff === 'trump') continue
      if (cardEff === 'trump' && bestEff === 'trump') {
        if (card.kind === 'trump' && best.kind === 'trump' && trumpStrength(card) > trumpStrength(best)) bestEntry = entry
      } else {
        if (cardEff !== ledSuit) continue
        if (card.kind === 'suit' && best.kind === 'suit' && suitStrength(card) > suitStrength(best)) bestEntry = entry
      }
    }
  }
  return bestEntry.seat
}

export function chooseCard(state: PlayState, seat: Seat, _config: BotConfig): Card {
  const candidates = legalCards(state, seat)
  if (candidates.length === 0) throw new Error(`chooseCard: no legal cards for seat ${seat}`)
  if (candidates.length === 1) return candidates[0]

  const { contract, declarer, partner, currentTrick } = state
  const isLeading = currentTrick.cards.length === 0
  const onDeclarerSide = isDeclarerSide(seat, declarer, partner)

  // ── Klop ─────────────────────────────────────────────────────────────────
  // Goal: avoid winning tricks that carry high card points.
  if (contract === 'klop') {
    if (isLeading) {
      // Lead weakest non-trump first (might lose to a trump); if only trumps, lead lowest trump.
      const nonTrumps = candidates.filter(c => !isTrump(c))
      const pool = nonTrumps.length > 0 ? nonTrumps : candidates
      return pool.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }
    // Following: dump the highest-value card — whoever wins takes it off our hands.
    // (The game rules already force us to beat if we can, so sometimes we'll win
    //  regardless; in that case playing our highest still keeps the worst for last.)
    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
  }

  // ── Beggar / Open Beggar ──────────────────────────────────────────────────
  // Declarer must take NO tricks; opponents must force the declarer to win one.
  if (contract === 'beggar' || contract === 'open-beggar') {
    if (seat === declarer) {
      // Always play the lowest card to minimise the chance of winning.
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }

    // Opponent strategy: make the declarer win a trick.
    // Negative-contract rules already force the declarer to beat the current
    // highest card if they can, so leading high exploits that directly.
    if (isLeading) {
      // Lead highest to set a bar the declarer must clear (or concede).
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }

    // Following: check if the declarer is currently winning the trick.
    const winner = currentWinner(state)
    const declarerIsWinning = winner === declarer

    if (declarerIsWinning) {
      // Declarer is currently on top — play the lowest legal card so we
      // don't accidentally rescue them by taking the trick ourselves.
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    } else {
      // Declarer is losing — play high to stay above them and force them
      // to respond with something even higher (or concede the win to an opponent
      // who will then lead high again next trick).
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }
  }

  // ── Standard positive contracts ───────────────────────────────────────────
  if (onDeclarerSide) {
    const trumps = candidates.filter(isTrump)
    const nonTrumps = candidates.filter(c => !isTrump(c))

    if (isLeading && trumps.length > 0) {
      const usableTrumps = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps
      return usableTrumps.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }

    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
  } else {
    // Opponent of declarer: play low, avoid taking valuable tricks
    return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
  }
}
