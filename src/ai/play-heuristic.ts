import type { Card, Seat, PlayState, TrumpCard, SuitCard, Suit } from '../engine/types'
import { legalCards } from '../engine/play'
import { cardPoints, isTrump, isPagat, trumpStrength, suitStrength } from '../engine/deck'
import type { BotDifficulty } from './bidding-heuristic'

export interface BotConfig {
  difficultyBias: number // 0.0–1.0 (legacy; kept for test compat)
  difficulty?: BotDifficulty
  // Set to the partner seat only once the called king has been played publicly.
  knownPartner?: Seat | null
}

function isDeclarerSide(seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  return seat === declarer || seat === partner
}

function onMySide(winner: Seat, seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  const meOnDeclarerSide = isDeclarerSide(seat, declarer, partner)
  if (meOnDeclarerSide) return isDeclarerSide(winner, declarer, partner)
  return !isDeclarerSide(winner, declarer, partner)
}

function effectiveIsTrump(c: Card, isColourValat: boolean): boolean {
  return c.kind === 'trump' && !isColourValat
}

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

function cardStrength(c: Card): number {
  if (c.kind === 'trump') return 1000 + trumpStrength(c as TrumpCard)
  return suitStrength(c as SuitCard)
}

export function computeKnownPartner(state: PlayState): Seat | null {
  const { kingCall, partner, completedTricks, currentTrick } = state
  if (!kingCall || partner === null) return null
  const { calledKing } = kingCall
  const isCalledKing = (card: Card) =>
    card.kind === 'suit' && card.suit === calledKing.suit && card.rank === 'K'
  if (currentTrick.cards.some(e => isCalledKing(e.card))) return partner
  for (const trick of completedTricks) {
    if (trick.cards.some(e => isCalledKing(e.card))) return partner
  }
  return null
}

function declarerTeamPoints(state: PlayState, knownPartner: Seat | null): number {
  const { capturedCards, declarer } = state
  const seats: Seat[] = knownPartner !== null ? [declarer, knownPartner] : [declarer]
  return seats.reduce<number>((sum, s) =>
    sum + capturedCards[s].reduce<number>((ps, c) => ps + c.points, 0), 0)
}

function currentTrickPoints(state: PlayState): number {
  return state.currentTrick.cards.reduce((sum, e) => sum + e.card.points, 0)
}

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

function openBeggarOpponentLead(candidates: Card[], declarerHand: Card[]): Card | null {
  const ourSuitCards = candidates.filter((c): c is SuitCard => c.kind === 'suit')
  if (ourSuitCards.length === 0) return null

  const suits = [...new Set(ourSuitCards.map(c => c.suit))]

  for (const s of suits) {
    const ourInSuit = ourSuitCards.filter(c => c.suit === s)
    const declInSuit = declarerHand.filter((c): c is SuitCard => c.kind === 'suit' && c.suit === s)
    if (declInSuit.length === 0) continue
    const ourMax = Math.max(...ourInSuit.map(c => suitStrength(c)))
    const declMin = Math.min(...declInSuit.map(c => suitStrength(c)))
    if (declMin > ourMax) {
      return ourInSuit.sort((a, b) => suitStrength(b) - suitStrength(a))[0]
    }
  }

  const suitsWithDeclCards = suits
    .filter(s => declarerHand.some(c => c.kind === 'suit' && (c as SuitCard).suit === s))
    .sort((a, b) => {
      const aCnt = declarerHand.filter(c => c.kind === 'suit' && (c as SuitCard).suit === a).length
      const bCnt = declarerHand.filter(c => c.kind === 'suit' && (c as SuitCard).suit === b).length
      return aCnt - bCnt
    })
  if (suitsWithDeclCards.length > 0) {
    const targetSuit = suitsWithDeclCards[0]
    const inSuit = ourSuitCards.filter(c => c.suit === targetSuit)
    return inSuit.sort((a, b) => suitStrength(b) - suitStrength(a))[0]
  }

  return null
}

// ── Hard mode helpers ─────────────────────────────────────────────────────

// Set of trump ordinals that have appeared in completed tricks or the current trick.
function playedTrumpOrdinals(state: PlayState): Set<number> {
  const played = new Set<number>()
  for (const t of state.completedTricks) {
    for (const e of t.cards) {
      if (e.card.kind === 'trump') played.add((e.card as TrumpCard).ordinal)
    }
  }
  for (const e of state.currentTrick.cards) {
    if (e.card.kind === 'trump') played.add((e.card as TrumpCard).ordinal)
  }
  return played
}

// Cheapest trump in `myTrumps` that beats the highest unseen trump an opponent might hold.
// If no safe trump exists, returns lowest trump.
function cheapestSafeHoldingTrump(myTrumps: TrumpCard[], played: Set<number>): TrumpCard {
  const myOrdinals: Set<number> = new Set(myTrumps.map(c => c.ordinal))
  let highestThreat = 0
  for (let o = 22; o >= 1; o--) {
    if (!myOrdinals.has(o) && !played.has(o)) { highestThreat = o; break }
  }
  if (highestThreat === 0) {
    // No unseen trumps remain outside our hand — any trump holds
    return myTrumps.sort((a, b) => a.ordinal - b.ordinal)[0]
  }
  const safe = myTrumps.filter(c => c.ordinal > highestThreat)
  if (safe.length === 0) return myTrumps.sort((a, b) => a.ordinal - b.ordinal)[0]
  return safe.sort((a, b) => a.ordinal - b.ordinal)[0]
}

export function chooseCard(state: PlayState, seat: Seat, _config: BotConfig): Card {
  const candidates = legalCards(state, seat)
  if (candidates.length === 0) throw new Error(`chooseCard: no legal cards for seat ${seat}`)
  if (candidates.length === 1) return candidates[0]

  const { contract, declarer, currentTrick, isColourValat } = state
  const difficulty = _config.difficulty ?? 'easy'
  const isLeading = currentTrick.cards.length === 0
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
    if (isLeading && contract === 'open-beggar' && state.openBeggarRevealed) {
      const smartLead = openBeggarOpponentLead(candidates, state.hands[declarer])
      if (smartLead) return smartLead
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
  const isValatContract = contract === 'valat-without' || contract === 'color-valat-without'

  const calledKingCard = state.kingCall?.calledKing ?? null
  function isCalledKingCard(c: Card): boolean {
    if (!calledKingCard || calledKingCard.kind !== 'suit') return false
    return c.kind === 'suit' &&
      (c as SuitCard).suit === (calledKingCard as SuitCard).suit &&
      (c as SuitCard).rank === 'K'
  }

  // ── Leading ──────────────────────────────────────────────────────────────
  if (isLeading) {
    if (onDeclarerSide) {
      const trumps = candidates.filter(c => effectiveIsTrump(c, isColourValat))
      if (trumps.length > 0) {
        let usable = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps

        // Hard mode: protect Mond when Škis is still unseen and we don't hold it.
        if (difficulty === 'hard' && usable.length > 1 && !isColourValat) {
          const weHoldSkis = candidates.some(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)
          const skisPlayed = playedTrumpOrdinals(state).has(22)
          if (!weHoldSkis && !skisPlayed) {
            const noMond = usable.filter(c => !(c.kind === 'trump' && (c as TrumpCard).ordinal === 21))
            if (noMond.length > 0) usable = noMond
          }
        }

        return usable.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
      }
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    } else {
      const nonTrumps = candidates.filter(c => !effectiveIsTrump(c, isColourValat))
      if (nonTrumps.length > 0) {
        const safeNonTrumps = nonTrumps.filter(c => !isCalledKingCard(c))
        const pool = safeNonTrumps.length > 0 ? safeNonTrumps : nonTrumps
        return pool.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
      }
      const trumps = candidates.filter(c => effectiveIsTrump(c, isColourValat))
      const usable = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps
      return usable.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
    }
  }

  // ── Following ─────────────────────────────────────────────────────────────
  if (!ledSuit) return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]

  const winner = currentWinner(state)

  // Forced to trump: void in led suit and all candidates are trumps
  const forcedToTrump = ledSuit !== 'trump' && candidates.every(c => effectiveIsTrump(c, isColourValat))
  const isLastToPlay = currentTrick.cards.length === 3

  if (winner !== null && onMySide(winner, seat, declarer, knownPartner)) {
    if (difficulty === 'hard') {
      // If forced to trump over partner's trick, use cheapest safe trump rather than lowest
      if (forcedToTrump && !isLastToPlay) {
        const myTrumps = candidates.filter(c => c.kind === 'trump') as TrumpCard[]
        if (myTrumps.length > 0) {
          return cheapestSafeHoldingTrump(myTrumps, playedTrumpOrdinals(state))
        }
      }
      // Partner winning: slough highest-point suit card to maximise their pile
      const suitCards = candidates.filter(c => !effectiveIsTrump(c, isColourValat))
      if (suitCards.length > 0) {
        return suitCards.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
      }
    }
    return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
  }

  // Enemy is winning — try to beat them.
  const winnerEntry = winner !== null
    ? currentTrick.cards.find(e => e.seat === winner) ?? null
    : null
  const bestCard = winnerEntry?.card ?? null

  const beaters = bestCard !== null
    ? candidates.filter(c => cardBeatsCard(c, bestCard, ledSuit, isColourValat))
    : []

  if (beaters.length > 0) {
    if (onDeclarerSide) {
      return beaters.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
    } else {
      const lowestBeater = beaters.sort((a, b) => cardStrength(a) - cardStrength(b))[0]

      const declarerNearWin = declarerPts >= 28
      const trickPts = currentTrickPoints(state)
      if (!isValatContract && !isLastToPlay && !declarerNearWin && trickPts <= 1 && cardPoints(lowestBeater) >= 5) {
        return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
      }

      return lowestBeater
    }
  }

  // Can't beat: dump lowest, unless forced to trump in hard mode
  if (difficulty === 'hard' && forcedToTrump && !isLastToPlay) {
    const myTrumps = candidates.filter(c => c.kind === 'trump') as TrumpCard[]
    if (myTrumps.length > 0) {
      return cheapestSafeHoldingTrump(myTrumps, playedTrumpOrdinals(state))
    }
  }

  return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
}
