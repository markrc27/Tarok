import type { Card, Seat, PlayState, TrumpCard, TrumpOrdinal, SuitCard, Suit } from '../engine/types'
import { legalCards } from '../engine/play'
import { cardPoints, isTrump, isPagat, trumpStrength, suitStrength } from '../engine/deck'
import type { BotDifficulty } from './bidding-heuristic'

export interface BotConfig {
  difficultyBias: number // 0.0–1.0 (legacy; kept for test compat)
  difficulty?: BotDifficulty
  // Set to the partner seat only once the called king has been played publicly.
  knownPartner?: Seat | null
  // True when pagat-ultimo is announced in the current hand (any side).
  pagatUltimoAnnounced?: boolean
  // Hard mode: true when this specific bot privately knows it IS the called partner
  // (it holds the called king). Enables secret cooperation before the king is played.
  selfIsPartner?: boolean
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
  const declarerHasTrumps = declarerHand.some(c => c.kind === 'trump')

  // Best case: declarer is void in this suit AND still holds trumps — forcing them
  // to trump means they WIN the trick, which is exactly the opponent goal in beggar.
  if (declarerHasTrumps) {
    for (const s of suits) {
      const declInSuit = declarerHand.filter((c): c is SuitCard => c.kind === 'suit' && c.suit === s)
      if (declInSuit.length === 0) {
        const inSuit = ourSuitCards.filter(c => c.suit === s)
        // Lead highest to maximise chance of surviving until the declarer trumps it
        return inSuit.sort((a, b) => suitStrength(b) - suitStrength(a))[0]
      }
    }
  }

  // Second best: suit where ALL of declarer's cards beat ALL of ours — they must take it.
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

  // Fallback: suit where declarer has fewest cards (most likely to be void on second lead).
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

// Count trump ordinals that are neither played nor in the given seat's hand.
// A low count means opponents are likely out of trumps — safe to switch to suit leads.
function unseenOpponentTrumps(state: PlayState, seat: Seat): number {
  const played = playedTrumpOrdinals(state)
  const inHand = new Set<number>(
    state.hands[seat].filter(c => c.kind === 'trump').map(c => (c as TrumpCard).ordinal),
  )
  let count = 0
  for (let o = 1; o <= 22; o++) {
    if (!played.has(o) && !inHand.has(o)) count++
  }
  return count
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
  let candidates = legalCards(state, seat)
  if (candidates.length === 0) throw new Error(`chooseCard: no legal cards for seat ${seat}`)
  if (candidates.length === 1) return candidates[0]

  const { contract, declarer, currentTrick, isColourValat } = state

  // BOT-005: Pagat Ultimo constraint — once announced, hold the Pagat for trick 12.
  if ((_config.pagatUltimoAnnounced ?? false) && contract !== 'klop') {
    const pagatEntry = candidates.find(isPagat)
    if (pagatEntry) {
      if (state.completedTricks.length === 11) {
        return pagatEntry  // trick 12: play the Pagat to complete the ultimo
      }
      const withoutPagat = candidates.filter(c => !isPagat(c))
      if (withoutPagat.length > 0) candidates = withoutPagat
    }
  }
  const difficulty = _config.difficulty ?? 'easy'
  const isLeading = currentTrick.cards.length === 0
  const knownPartner = _config.knownPartner ?? null
  const selfIsPartner = _config.selfIsPartner ?? false
  // For FOLLOWING: if we privately know we're the partner (hold the called king),
  // cooperate with the declarer even before the king is publicly revealed.
  // For LEADING: keep using knownPartner only (don't reveal by leading like a declarer).
  const effectivePartner = (selfIsPartner && difficulty === 'hard') ? seat : knownPartner
  const onDeclarerSide = isDeclarerSide(seat, declarer, knownPartner)
  const effectiveOnDeclarerSide = isDeclarerSide(seat, declarer, effectivePartner)

  // ── Klop ─────────────────────────────────────────────────────────────────
  if (contract === 'klop') {
    if (isLeading) {
      const nonTrumps = candidates.filter(c => !isTrump(c))
      const pool = nonTrumps.length > 0 ? nonTrumps : candidates
      const suitPool = pool.filter((c): c is SuitCard => c.kind === 'suit')
      if (suitPool.length > 0) {
        // Lead from shortest suit: creates a void quickly so high cards in other
        // suits can be dumped onto future tricks rather than having to be led.
        const suitCounts: Partial<Record<Suit, number>> = {}
        for (const c of state.hands[seat]) {
          if (c.kind === 'suit') {
            const s = (c as SuitCard).suit
            suitCounts[s] = (suitCounts[s] ?? 0) + 1
          }
        }
        const suits = [...new Set(suitPool.map(c => c.suit))]

        // Hard mode: avoid leading a lone king — it wins the trick (kings cannot be beaten
        // by any other card in the same suit) and klop players want to AVOID winning tricks.
        const dangerousSingletons = new Set(
          suits.filter(s =>
            difficulty === 'hard' &&
            (suitCounts[s] ?? 0) === 1 &&
            suitPool.some(c => c.suit === s && c.rank === 'K'),
          ),
        )
        const safeLeadSuits = suits.filter(s => !dangerousSingletons.has(s))
        const leadCandidateSuits = safeLeadSuits.length > 0 ? safeLeadSuits : suits

        const shortestSuit = leadCandidateSuits.reduce((best, s) =>
          (suitCounts[s] ?? Infinity) < (suitCounts[best] ?? Infinity) ? s : best,
        )
        const inSuit = suitPool.filter(c => c.suit === shortestSuit)
        return inSuit.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
      }
      return pool.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }

    // Following in klop: the engine has already applied must-beat filtering, so
    // candidates are either ALL beaters (we will win the trick) or ALL non-beaters
    // (we cannot win).  When forced to win, play the CHEAPEST card to save
    // high-value cards for dumping onto future tricks we won't win.
    // When we can't win, dump the most valuable card we have.
    const trickEntries = currentTrick.cards
    if (trickEntries.length > 0 && currentTrick.ledSuit) {
      const currentBestSeat = currentWinner(state)
      const currentBestCard = currentBestSeat !== null
        ? trickEntries.find(e => e.seat === currentBestSeat)?.card ?? null
        : null
      if (currentBestCard !== null &&
          cardBeatsCard(candidates[0], currentBestCard, currentTrick.ledSuit, false)) {
        // All candidates are beaters — we'll take this trick regardless; minimise cost.
        return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
      }
      // Can't win — dump highest value card to shed it.
      // Hard mode: Škis is unbeatable; dumping Mond onto a Škis-winning trick triggers
      // the −20 Mond penalty to the Mond holder. Avoid it by dumping any other card first.
      if (difficulty === 'hard' && currentBestCard !== null &&
          currentBestCard.kind === 'trump' && (currentBestCard as TrumpCard).ordinal === 22) {
        const noMond = candidates.filter(c => !(c.kind === 'trump' && (c as TrumpCard).ordinal === 21))
        if (noMond.length > 0) return noMond.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
      }
    }
    // Can't win (or leading) — dump highest-value card to shed it from the hand.
    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
  }

  // ── Beggar / Open Beggar ──────────────────────────────────────────────────
  if (contract === 'beggar' || contract === 'open-beggar') {
    if (seat === declarer) {
      if (isLeading && difficulty === 'hard') {
        // Lead lowest card from the longest suit: more opponents likely hold that
        // suit and the must-beat rule forces the highest-holding opponent to take the trick.
        const suitCandidates = candidates.filter((c): c is SuitCard => c.kind === 'suit')
        if (suitCandidates.length > 0) {
          const suitCounts: Partial<Record<Suit, number>> = {}
          for (const c of state.hands[seat]) {
            if (c.kind === 'suit') {
              const s = (c as SuitCard).suit
              suitCounts[s] = (suitCounts[s] ?? 0) + 1
            }
          }
          const suits = [...new Set(suitCandidates.map(c => c.suit))]
          const longestSuit = suits.reduce((best, s) =>
            (suitCounts[s] ?? 0) > (suitCounts[best] ?? 0) ? s : best,
          )
          const inSuit = suitCandidates.filter(c => c.suit === longestSuit)
          return inSuit.sort((a, b) => suitStrength(a) - suitStrength(b))[0]
        }
      }
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }
    if (isLeading && contract === 'open-beggar' && state.openBeggarRevealed) {
      const smartLead = openBeggarOpponentLead(candidates, state.hands[declarer])
      if (smartLead) return smartLead
    }
    if (isLeading) {
      // Hard mode: lead LOW to start a must-beat chain — leading K♥ means the opponent
      // wins the trick themselves (nobody can beat a king in its suit). Leading 7♥ forces
      // anyone with 8♥+ (including the declarer) to beat it, giving the declarer the
      // best chance of being forced into taking a trick.
      if (difficulty === 'hard') return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
      return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
    }
    const winner = currentWinner(state)
    const declarerIsWinning = winner === declarer
    if (declarerIsWinning) {
      // Declarer currently winning — play LOW to let them keep the trick.
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }
    // A fellow opponent is winning. Hard mode: yield (play lowest) — the must-beat
    // rule will force the declarer to overtrump their own side if they can, which is
    // self-defeating. Easy mode: try to take the trick to guarantee a winner.
    if (difficulty === 'hard') {
      return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
    }
    return candidates.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
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

  // ── Last-trick Pagat opportunism ─────────────────────────────────────────
  // Hard mode, non-flat contracts: if Pagat is the highest remaining trump (all
  // T2-T22 are played or in our hand), play it in the last trick for unannounced
  // pagat-ultimo (+25). Both declarer and opponent sides benefit. Only when safe
  // (certain win) — playing Pagat to the last trick and losing is −25.
  if (difficulty === 'hard' && !isValatContract && contract !== 'solo-without' &&
      state.completedTricks.length === 11) {
    const pagatCandidate = candidates.find(isPagat)
    if (pagatCandidate) {
      const played = playedTrumpOrdinals(state)
      const myHandOrdinals = new Set(
        state.hands[seat].filter(c => c.kind === 'trump').map(c => (c as TrumpCard).ordinal)
      )
      let allHigherTrumpsOut = true
      for (let o = 2; o <= 22; o++) {
        if (!played.has(o) && !myHandOrdinals.has(o as TrumpOrdinal)) { allHigherTrumpsOut = false; break }
      }
      if (allHigherTrumpsOut) {
        if (isLeading) return pagatCandidate
        if (currentTrick.ledSuit) {
          const win = currentWinner(state)
          const best = win !== null ? currentTrick.cards.find(e => e.seat === win)?.card ?? null : null
          if (best === null || cardBeatsCard(pagatCandidate, best, currentTrick.ledSuit, isColourValat)) {
            return pagatCandidate
          }
        }
      }
    }
  }

  // ── Leading ──────────────────────────────────────────────────────────────
  if (isLeading) {
    if (onDeclarerSide) {
      const trumps = candidates.filter(c => effectiveIsTrump(c, isColourValat))

      // Hard mode: once opponents are nearly out of trumps, switch to leading suit
      // winners instead of continuing to draw — opponents can no longer ruff them.
      if (difficulty === 'hard' && trumps.length > 0 && !isColourValat && !isValatContract) {
        const unseen = unseenOpponentTrumps(state, seat)
        if (unseen <= 3) {
          const suitWinners = candidates.filter(c => !effectiveIsTrump(c, isColourValat))
          if (suitWinners.length > 0) {
            // Prefer the called suit: partner holds the called king and will win the trick.
            if (effectivePartner !== null) {
              const cs = state.kingCall?.calledSuit
              if (cs) {
                const inCalled = suitWinners.filter(c => c.kind === 'suit' && (c as SuitCard).suit === cs)
                if (inCalled.length > 0) {
                  return inCalled.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
                }
              }
            }
            return suitWinners.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
          }
        }
      }

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
      // Hard mode: endgame trump squeeze — when all regular (non-trula) trumps T2-T20 are
      // exhausted outside our hand, only trula cards could remain in the declarer side's
      // hand. Leading any trump now forces them to spend Pagat/Mond/Škis, draining 5pt
      // cards from their pile. Skip when Škis is unseen and we only hold Mond — we'd
      // be throwing Mond straight into the Škis.
      if (difficulty === 'hard' && !isColourValat) {
        const myTrumps = candidates.filter(c => c.kind === 'trump') as TrumpCard[]
        if (myTrumps.length > 0) {
          const played = playedTrumpOrdinals(state)
          const myOrdinals: Set<number> = new Set(myTrumps.map(c => c.ordinal))
          let unseenRegular = 0
          for (let o = 2; o <= 20; o++) {
            if (!played.has(o) && !myOrdinals.has(o)) unseenRegular++
          }
          if (unseenRegular === 0) {
            const weHoldSkis = myOrdinals.has(22)
            const skisPlayed = played.has(22)
            let pool = myTrumps.filter(c => !isPagat(c))
            if (pool.length === 0) pool = myTrumps
            if (!weHoldSkis && !skisPlayed) {
              const noMond = pool.filter(c => c.ordinal !== 21)
              if (noMond.length > 0) pool = noMond
              else pool = []  // only Mond and Škis is outstanding — fall through to suit lead
            }
            if (pool.length > 0) {
              return pool.sort((a, b) => cardStrength(a) - cardStrength(b))[0]
            }
          }
        }
      }

      // Hard mode: in valat-without the opponent MUST win at least one trick to break
      // the declaration. Suit leads can be ruffed by the trump-heavy declarer; leading
      // the highest trump guarantees the best chance — only a higher-ordinal trump beats
      // it. Not applied in colour-valat-without where taroks are a plain suit: there a
      // king-singleton is an unconditional winner (no card ruff rules apply), so the
      // king-singleton heuristic below is already the strongest play.
      if (difficulty === 'hard' && isValatContract && !isColourValat) {
        const valTrumps = candidates.filter(c => c.kind === 'trump') as TrumpCard[]
        if (valTrumps.length > 0) {
          return valTrumps.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
        }
      }

      const nonTrumps = candidates.filter(c => !effectiveIsTrump(c, isColourValat))
      if (nonTrumps.length > 0) {
        // Hard mode with hidden partnership: avoid the ENTIRE called suit — leading
        // any card there could flush out the partner king early, helping the declarer
        // side establish their strongest suit. Easy mode + revealed partnership: only
        // avoid the king card itself (to not accidentally play the called king out of turn).
        const calledSuit = calledKingCard?.kind === 'suit' ? (calledKingCard as SuitCard).suit : null
        const safeNonTrumps = nonTrumps.filter(c => {
          if (c.kind !== 'suit') return true
          const sc = c as SuitCard
          if (difficulty === 'hard' && calledSuit && knownPartner === null) return sc.suit !== calledSuit
          return !isCalledKingCard(c)
        })
        const pool = safeNonTrumps.length > 0 ? safeNonTrumps : nonTrumps

        // Hard mode: lead from the shortest non-trump suit to create voids quickly.
        // A void lets us slough high-value cards onto future tricks we won't win,
        // maximising the point drain on the declarer's side.
        if (difficulty === 'hard' && pool.some(c => c.kind === 'suit')) {
          const suitPool = pool.filter((c): c is SuitCard => c.kind === 'suit')
          const suitCounts: Partial<Record<Suit, number>> = {}
          for (const c of state.hands[seat]) {
            if (c.kind === 'suit') {
              const s = (c as SuitCard).suit
              suitCounts[s] = (suitCounts[s] ?? 0) + 1
            }
          }
          const suits = [...new Set(suitPool.map(c => c.suit))]

          // King-singleton: guaranteed winner (K is highest suit card) AND creates a void
          // in one play — both goals in a single card. Prefer this over a non-king singleton.
          const kingSingletonSuits = suits.filter(
            s => (suitCounts[s] ?? 0) === 1 && suitPool.some(c => c.suit === s && c.rank === 'K'),
          )
          if (kingSingletonSuits.length > 0) {
            return suitPool.filter(c => c.suit === kingSingletonSuits[0])[0]
          }

          const shortestSuit = suits.reduce((best, s) =>
            (suitCounts[s] ?? Infinity) < (suitCounts[best] ?? Infinity) ? s : best,
          )
          const inSuit = suitPool.filter(c => c.suit === shortestSuit)
          if (inSuit.length > 0) {
            // Lead highest in the shortest suit — either wins the trick outright or
            // forces opponents to spend trumps, creating the void in one lead.
            return inSuit.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
          }
        }

        return pool.sort((a, b) => cardPoints(b) - cardPoints(a))[0]
      }
      const trumps = candidates.filter(c => effectiveIsTrump(c, isColourValat))
      let usable = trumps.length > 1 ? trumps.filter(c => !isPagat(c)) : trumps

      // Hard mode: protect Mond when Škis is still unseen — same guard as the
      // declarer-side path, since opponents also lose −20 if the Mond falls to the Škis.
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
  }

  // ── Following ─────────────────────────────────────────────────────────────
  if (!ledSuit) return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]

  const winner = currentWinner(state)

  // Forced to trump: void in led suit and all candidates are trumps
  const forcedToTrump = ledSuit !== 'trump' && candidates.every(c => effectiveIsTrump(c, isColourValat))
  const isLastToPlay = currentTrick.cards.length === 3

  if (winner !== null && onMySide(winner, seat, declarer, effectivePartner)) {
    if (difficulty === 'hard') {
      // Cutthroat Mond capture: a teammate is winning THIS trick with the Mond
      // and we hold the Škis. The −20 Mond penalty is individual, so taking it
      // costs our own score nothing while docking the Mond-player 20 — a net
      // relative gain in an individually-scored game. Only spend the Škis when
      // it has no better use (last two tricks, or it's our only trump), and only
      // where the Mond penalty actually applies (not the valat contracts).
      if (!isValatContract) {
        const winnerCard = currentTrick.cards.find(e => e.seat === winner)?.card
        const winnerHasMond = winnerCard?.kind === 'trump' && (winnerCard as TrumpCard).ordinal === 21
        const skisCandidate = candidates.find(c => c.kind === 'trump' && (c as TrumpCard).ordinal === 22)
        if (winnerHasMond && skisCandidate) {
          const lateHand = state.completedTricks.length >= 10
          const skisIsOnlyTrump = state.hands[seat].filter(c => c.kind === 'trump').length === 1
          if (lateHand || skisIsOnlyTrump) return skisCandidate
        }
      }
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
    if (effectiveOnDeclarerSide) {
      // Last to play: cheapest beater is sufficient — nobody can overtrump. Preserve
      // high cards (Škis, Mond) for future tricks where they must beat earlier players.
      // Exception: near-loss endgame (≤3 tricks left, ≤20 pts) — no future to save for,
      // so use strongest beater to maximise this trick's value.
      if (difficulty === 'hard' && isLastToPlay) {
        const tricksLeft = 12 - state.completedTricks.length
        const declarerNearLoss = !isValatContract && declarerPts <= 20 && tricksLeft <= 3
        if (!declarerNearLoss) {
          return beaters.sort((a, b) => cardStrength(a) - cardStrength(b))[0]
        }
      }
      // Hard mode: a declarer-side ally is still to play after us — use cheapest beater
      // so they can overbear if needed, keeping our Škis/Mond for future lead tricks.
      if (difficulty === 'hard' && beaters.length > 1) {
        const playOrder: Seat[] = [0, 1, 2, 3].map(i => ((currentTrick.ledSeat + i) % 4) as Seat)
        const myIndex = playOrder.indexOf(seat)
        const hasAllyAfterMe = playOrder.slice(myIndex + 1).some(
          s => isDeclarerSide(s, declarer, effectivePartner),
        )
        if (hasAllyAfterMe) {
          return beaters.sort((a, b) => cardStrength(a) - cardStrength(b))[0]
        }
      }
      // Not last to play, no ally after: opponents still to play may have higher trumps.
      // Hard mode: if a "safe" trump exists (i.e., one that beats the highest unseen
      // opponent trump), use the cheapest such trump rather than wasting Škis/Mond.
      // Only applies when safe.length > 0 — if no safe trump exists (threat ceiling too
      // high), fall through to strongest beater to maximise the chance of winning.
      if (difficulty === 'hard' && !isColourValat && beaters.every(c => c.kind === 'trump')) {
        const trumpBeaters = beaters as TrumpCard[]
        const played = playedTrumpOrdinals(state)
        const myOrdinals = new Set(trumpBeaters.map(c => c.ordinal))
        let highestThreat = 0
        for (let o = 22; o >= 1; o--) {
          if (!myOrdinals.has(o as TrumpOrdinal) && !played.has(o)) { highestThreat = o; break }
        }
        const safe = highestThreat > 0
          ? trumpBeaters.filter(c => c.ordinal > highestThreat)
          : trumpBeaters
        if (safe.length > 0) {
          return safe.sort((a, b) => a.ordinal - b.ordinal)[0]
        }
      }
      return beaters.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
    } else {
      const lowestBeater = beaters.sort((a, b) => cardStrength(a) - cardStrength(b))[0]

      // BOT-004: never fold when Škis is the only beater — it is the sole card that
      // can secure this trick against a potential Mond played later in the same trick.
      const skisIsOnlyBeater = beaters.length === 1 &&
        beaters[0].kind === 'trump' && (beaters[0] as TrumpCard).ordinal === 22

      // In the endgame (≤3 tricks left) the declarer can coast from a lower score.
      // Tighten the near-win threshold so opponents fight every trick.
      const tricksRemaining = 12 - state.completedTricks.length
      const declarerNearWin = declarerPts >= 28 ||
        (difficulty === 'hard' && tricksRemaining <= 2 && declarerPts >= 26) ||
        (difficulty === 'hard' && tricksRemaining <= 3 && declarerPts >= 23)
      const trickPts = currentTrickPoints(state)
      if (!isValatContract && !isLastToPlay && !declarerNearWin && trickPts <= 1 && cardPoints(lowestBeater) >= 5 && !skisIsOnlyBeater) {
        return candidates.sort((a, b) => cardPoints(a) - cardPoints(b))[0]
      }

      // Hard mode: in valat contracts opponents must win at least one trick — use
      // the strongest available beater to guarantee winning THIS trick rather than
      // risking a cheap beater being overtrumped by a later declarer-side player.
      if (difficulty === 'hard' && isValatContract) {
        return beaters.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
      }

      // Hard mode: the trick already has ≥5 pts AND a declarer-side player is still
      // to play after us — use our strongest beater to prevent them overtrumping a
      // high-value trick. Using cheapest here lets the declarer win the trick for free.
      if (difficulty === 'hard' && !isLastToPlay && trickPts >= 5) {
        const playOrder: Seat[] = [0, 1, 2, 3].map(i => ((currentTrick.ledSeat + i) % 4) as Seat)
        const myIndex = playOrder.indexOf(seat)
        const hasEnemyAfterMe = playOrder.slice(myIndex + 1).some(
          s => isDeclarerSide(s, declarer, effectivePartner),
        )
        if (hasEnemyAfterMe) {
          return beaters.sort((a, b) => cardStrength(b) - cardStrength(a))[0]
        }
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
