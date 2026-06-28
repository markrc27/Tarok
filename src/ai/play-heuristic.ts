import type { Card, Seat, PlayState, TrumpCard, SuitCard, Suit } from '../engine/types'
import { legalCards } from '../engine/play'
import { cardPoints, isTrump, isPagat, trumpStrength, suitStrength } from '../engine/deck'

export interface BotConfig {
  difficultyBias: number // 0.0–1.0
  // Set to the partner seat only once the called king has been played publicly.
  // Defaults to null — bots don't know the partnership until it's revealed.
  knownPartner?: Seat | null
}

function isDeclarerSide(seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  return seat === declarer || seat === partner
}

// True if the winning seat is on the same team as `seat`.
function onMySide(winner: Seat, seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  const meOnDeclarerSide = isDeclarerSide(seat, declarer, partner)
  if (meOnDeclarerSide) return isDeclarerSide(winner, declarer, partner)
  return !isDeclarerSide(winner, declarer, partner)
}

// True if `candidate` beats `current` as the trick's leading card in context.
function cardBeatsCard(
  candidate: Card,
  current: Card,
  ledSuit: Suit | 'trump',
  isColourValat: boolean,
): boolean {
  if (isColourValat) {
    const cEff = candidate.kind === 'trump' ? 'trump' : (candidate as SuitCard).suit
    const wEff = current.kind === 'trump' ? 'trump' : (current as SuitCard).suit
    if (cEff === ledSuit && wEff !== ledSuit) return true
    if (cEff !== ledSuit) return false
    if (candidate.kind === 'trump' && current.kind === 'trump')
      return trumpStrength(candidate as TrumpCard) > trumpStrength(current as TrumpCard)
    if (candidate.kind === 'suit' && current.kind === 'suit')
      return suitStrength(candidate as SuitCard) > suitStrength(current as SuitCard)
    return false
  }
  const cTrump = candidate.kind === 'trump'
  const wTrump = current.kind === 'trump'
  if (cTrump && !wTrump) return true
  if (!cTrump && wTrump) return false
  if (cTrump && wTrump)
    return trumpStrength(candidate as TrumpCard) > trumpStrength(current as TrumpCard)
  const cSuit = (candidate as SuitCard).suit
  const wSuit = (current as SuitCard).suit
  if (cSuit !== ledSuit) return false
  if (wSuit !== ledSuit) return true
  return suitStrength(candidate as SuitCard) > suitStrength(current as SuitCard)
}

// Single comparable strength: trumps (1000+ordinal) always beat suit cards.
function cardStrength(c: Card): number {
  if (c.kind === 'trump') return 1000 + trumpStrength(c as TrumpCard)
  return suitStrength(c as SuitCard)
}

// Points captured by the declarer team as far as the bot can tell.
// Uses knownPartner (publicly revealed) rather than state.partner (engine ground truth).
function declarerTeamPoints(state: PlayState, knownPartner: Seat | null): number {
  const { capturedCards, declarer } = state
  const seats: Seat[] = knownPartner !== null ? [declarer, knownPartner] : [declarer]
  return seats.reduce<number>((sum, s) =>
    sum + capturedCards[s].reduce<number>((ps, c) => ps + c.points, 0), 0)
}

// Points already played into the current trick.
function currentTrickPoints(state: PlayState): number {
  return state.currentTrick.cards.reduce((sum, e) => sum + e.card.points, 0)
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

  const { contract, declarer, currentTrick } = state
  const isLeading = currentTrick.cards.length === 0
  // Use knownPartner (publicly observed) rather than state.partner (engine ground truth)
  // so bots only coordinate once the called king has been played.
  const knownPartner = _config.knownPartner ?? null
  const onDeclarerSide = isDeclarerSide(seat, declarer, knownPartner)

  // ── Klop ─────────────────────────────────────────────────────────────────
  if (contract === 'klop') {
    if (isLeading) {
      const nonTrumps = candidates.filter(c => !isTrump(c))
      const pool = nonTrumps.length > 0 ? nonTrumps : candidates
      return pool.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }
    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
  }

  // ── Beggar / Open Beggar ──────────────────────────────────────────────────
  if (contract === 'beggar' || contract === 'open-beggar') {
    if (seat === declarer) {
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }
    if (isLeading) {
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }
    const winner = currentWinner(state)
    const declarerIsWinning = winner === declarer
    if (declarerIsWinning) {
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    } else {
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }
  }

  // ── Standard positive contracts ───────────────────────────────────────────
  const { ledSuit } = currentTrick
  const declarerPts = declarerTeamPoints(state, knownPartner)

  // ── Leading ──────────────────────────────────────────────────────────────
  if (isLeading) {
    if (onDeclarerSide) {
      // Lead highest trump to draw out opponents; sort by ordinal (not points — low
      // trumps are all 1pt so point-sort is random among them). Protect Pagat.
      const trumps = candidates.filter(isTrump)
      if (trumps.length > 0) {
        const usable = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps
        return usable.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
      }
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    } else {
      // Opponent leading: play highest to set a bar the declarer must clear.
      // Lead non-trump first — forces the declarer to follow suit or waste a trump.
      const nonTrumps = candidates.filter(c => !isTrump(c))
      if (nonTrumps.length > 0) {
        return nonTrumps.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
      }
      const trumps = candidates.filter(isTrump)
      const usable = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps
      return usable.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
    }
  }

  // ── Following ─────────────────────────────────────────────────────────────
  // Bail out if ledSuit somehow unset (shouldn't happen when following).
  if (!ledSuit) return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]

  const winner = currentWinner(state)

  // Partner/ally awareness: if my side is already winning, don't double-cover —
  // dump lowest to save strong cards for tricks we actually need to fight for.
  if (winner !== null && onMySide(winner, seat, declarer, knownPartner)) {
    return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
  }

  // Enemy is winning (or no winner resolved — safe fallback). Try to beat them.
  const winnerEntry = winner !== null
    ? currentTrick.cards.find(e => e.seat === winner) ?? null
    : null
  const bestCard = winnerEntry?.card ?? null

  const beaters = bestCard !== null
    ? candidates.filter(c => cardBeatsCard(c, bestCard, ledSuit, state.isColourValat))
    : []

  if (beaters.length > 0) {
    if (onDeclarerSide) {
      // Commit strongly: play highest beater to ensure we take the trick even if
      // a later player in the trick could also beat the current winner.
      return beaters.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
    } else {
      // Opponent: use lowest beater by default (efficient — preserve Mond/Škis
      // for tricks that are actually worth fighting for).
      const lowestBeater = beaters.sort((a, b) => cardStrength(a) - cardStrength(b))[0]

      // Point-counting fold: don't spend a 5-pt card (Mond/Škis) on a near-empty
      // trick unless we're last to play or the declarer team is close to winning
      // (28+ pts = they can cross 35 in two more tricks → opponents must fight).
      const isLastToPlay = currentTrick.cards.length === 3
      const declarerNearWin = declarerPts >= 28
      const trickPts = currentTrickPoints(state)
      if (!isLastToPlay && !declarerNearWin && trickPts <= 1 && cardPoints(lowestBeater) >= 5) {
        return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
      }

      return lowestBeater
    }
  }

  // Can't beat the current winner: dump lowest value card to minimise the
  // points the enemy captures from this trick.
  return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
}
