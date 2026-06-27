import type {
  Card, Seat, Contract, TrickState, PlayState, PlayResult, Trick, KingCall,
  TalonExchange, DealResult, Suit,
} from './types'
import {
  isTrump, isKing, isPagat, isMond, isSkis, isTrula,
  trumpStrength, suitStrength, cardsEqual, cardId,
} from './deck'

function isNegativeContract(contract: Contract): boolean {
  return contract === 'klop' || contract === 'beggar' || contract === 'open-beggar'
}

function requiresDeclarerLead(contract: Contract): boolean {
  const strength: Record<Contract, number> = {
    'klop': 0, 'three': 1, 'two': 2, 'one': 3,
    'solo-three': 4, 'solo-two': 5, 'solo-one': 6,
    'beggar': 7, 'solo-without': 8, 'open-beggar': 9,
    'color-valat-without': 10, 'valat-without': 11,
  }
  // beggar and above: declarer leads
  return strength[contract] >= 7
}

export function firstLeader(contract: Contract, declarer: Seat, forehand: Seat): Seat {
  if (requiresDeclarerLead(contract)) return declarer
  return forehand
}

// In colour valat, trumps are treated as a plain suit (not as trumps)
export function effectiveSuit(c: Card, isColourValat: boolean): Suit | 'trump' {
  if (c.kind === 'suit') return c.suit
  if (isColourValat) return 'trump-suit' as Suit // treated as its own plain suit
  return 'trump'
}

function ledSuitFromCard(c: Card, isColourValat: boolean): Suit | 'trump' {
  return effectiveSuit(c, isColourValat)
}

export function isEmperorTrick(trick: TrickState): boolean {
  const hasSkis = trick.cards.some(({ card }) => isSkis(card))
  const hasMond = trick.cards.some(({ card }) => isMond(card))
  const hasPagat = trick.cards.some(({ card }) => isPagat(card))
  return hasSkis && hasMond && hasPagat
}

function highestCardInTrick(trick: TrickState, isColourValat: boolean): Card | null {
  if (trick.cards.length === 0) return null
  const ledSuit = trick.ledSuit
  if (!ledSuit) return null

  let best: Card | null = null
  for (const { card } of trick.cards) {
    const eff = effectiveSuit(card, isColourValat)
    const isContributing = eff === ledSuit || (ledSuit !== 'trump' && eff === 'trump' && !isColourValat)
    if (!isContributing) continue
    if (best === null) { best = card; continue }

    const bestEff = effectiveSuit(best, isColourValat)
    if (eff === 'trump' && bestEff !== 'trump') { best = card; continue }
    if (eff !== 'trump' && bestEff === 'trump') continue
    if (eff === 'trump') {
      if (trumpStrength(card as Parameters<typeof trumpStrength>[0]) > trumpStrength(best as Parameters<typeof trumpStrength>[0])) best = card
    } else {
      if (card.kind === 'suit' && best.kind === 'suit' && suitStrength(card) > suitStrength(best)) best = card
    }
  }
  return best
}

export function resolveTrick(trick: TrickState, isColourValat: boolean): Seat {
  // Emperor trick check FIRST
  if (isEmperorTrick(trick)) {
    const pagatEntry = trick.cards.find(({ card }) => isPagat(card))!
    return pagatEntry.seat
  }

  const ledSuit = trick.ledSuit
  if (!ledSuit) return trick.ledSeat

  let winnerEntry = trick.cards[0]
  for (const entry of trick.cards.slice(1)) {
    const card = entry.card
    const best = winnerEntry.card
    const cardEff = effectiveSuit(card, isColourValat)
    const bestEff = effectiveSuit(best, isColourValat)

    if (isColourValat) {
      // Trumps demoted; only led suit wins
      if (cardEff === ledSuit && bestEff !== ledSuit) { winnerEntry = entry; continue }
      if (cardEff !== ledSuit) continue
      // Both on led suit
      if (card.kind === 'suit' && best.kind === 'suit' && suitStrength(card) > suitStrength(best)) winnerEntry = entry
    } else {
      // Normal resolution
      if (cardEff === 'trump' && bestEff !== 'trump') { winnerEntry = entry; continue }
      if (cardEff !== 'trump' && bestEff === 'trump') continue
      if (cardEff === 'trump') {
        if (trumpStrength(card as Parameters<typeof trumpStrength>[0]) > trumpStrength(best as Parameters<typeof trumpStrength>[0])) winnerEntry = entry
      } else {
        if (cardEff !== ledSuit) continue
        if (card.kind === 'suit' && best.kind === 'suit' && suitStrength(card) > suitStrength(best)) winnerEntry = entry
      }
    }
  }
  return winnerEntry.seat
}

export function checkMondCapture(trick: TrickState): {
  captured: boolean
  byWhom: Seat | null
  withSkis: boolean
} {
  const mondEntry = trick.cards.find(({ card }) => isMond(card))
  if (!mondEntry) return { captured: false, byWhom: null, withSkis: false }
  const withSkis = trick.cards.some(({ card }) => isSkis(card))
  return { captured: true, byWhom: mondEntry.seat, withSkis }
}

export function legalCards(state: PlayState, seat: Seat): Card[] {
  const hand = state.hands[seat]
  const trick = state.currentTrick

  if (trick.cards.length === 0) {
    // Leading: any card is legal in both positive and negative contracts
    return [...hand]
  }

  const ledSuit = trick.ledSuit!
  const isColourValat = state.isColourValat

  // Step 1: determine candidates by suit-following / trump rules
  let candidates: Card[]

  const following = hand.filter(c => effectiveSuit(c, isColourValat) === ledSuit)
  if (following.length > 0) {
    candidates = following
  } else if (!isColourValat && ledSuit !== 'trump') {
    const trumps = hand.filter(c => effectiveSuit(c, isColourValat) === 'trump')
    candidates = trumps.length > 0 ? trumps : [...hand]
  } else {
    candidates = [...hand]
  }

  // Step 2: negative contract extra rules apply on top of the candidate set
  if (isNegativeContract(state.contract)) {
    const highest = highestCardInTrick(trick, isColourValat)
    if (highest) {
      const canBeat = candidates.filter(c => beats(c, highest, isColourValat))
      if (canBeat.length > 0) candidates = canBeat
    }

    // Pagat restriction: remove Pagat if other legal cards exist
    if (candidates.length > 1) {
      const withoutPagat = candidates.filter(c => !isPagat(c))
      if (withoutPagat.length > 0) candidates = withoutPagat
    }
  }

  return candidates
}

function beats(card: Card, highest: Card, isColourValat: boolean): boolean {
  const cardEff = effectiveSuit(card, isColourValat)
  const highEff = effectiveSuit(highest, isColourValat)
  if (cardEff === 'trump' && highEff !== 'trump') return true
  if (cardEff !== 'trump' && highEff === 'trump') return false
  if (cardEff !== highEff) return false
  if (cardEff === 'trump') {
    return trumpStrength(card as Parameters<typeof trumpStrength>[0]) >
      trumpStrength(highest as Parameters<typeof trumpStrength>[0])
  }
  if (card.kind === 'suit' && highest.kind === 'suit') return suitStrength(card) > suitStrength(highest)
  return false
}

export function playCard(state: PlayState, seat: Seat, card: Card): PlayResult {
  const legal = legalCards(state, seat)
  if (!legal.some(c => cardsEqual(c, card))) {
    throw new Error(`Illegal play: ${cardId(card)} by seat ${seat}`)
  }

  const newHand = state.hands[seat].filter(c => !cardsEqual(c, card))
  const newLedSuit = state.currentTrick.cards.length === 0
    ? effectiveSuit(card, state.isColourValat)
    : state.currentTrick.ledSuit

  const newCards = [...state.currentTrick.cards, { seat, card }]
  const newTrick: TrickState = {
    ...state.currentTrick,
    cards: newCards,
    ledSuit: newLedSuit,
  }

  const newHands = { ...state.hands, [seat]: newHand }
  let newState: PlayState = { ...state, hands: newHands, currentTrick: newTrick }

  // Check if trick is complete (all 4 players played)
  const trickComplete = newCards.length === 4
  let trickWinner: Seat | null = null

  if (trickComplete) {
    trickWinner = resolveTrick(newTrick, state.isColourValat)
    newState = applyTrickResult(newState, trickWinner)
  }

  const handComplete = trickComplete && Object.values(newState.hands).every(h => h.length === 0)

  return { newState, trickComplete, trickWinner, handComplete }
}

export function applyTrickResult(state: PlayState, winner: Seat): PlayState {
  const trick: Trick = {
    cards: state.currentTrick.cards,
    winner,
  }

  const mondCheck = checkMondCapture(state.currentTrick)
  const newMondCapturedBy = mondCheck.captured ? mondCheck.byWhom : state.mondCapturedBy
  const newMondCapturedWithSkis = mondCheck.captured && mondCheck.withSkis
    ? true
    : state.mondCapturedWithSkis

  // All trick cards go to winner's capture pile
  const newCaptured = { ...state.capturedCards }
  newCaptured[winner] = [...newCaptured[winner], ...state.currentTrick.cards.map(e => e.card)]

  // Check if called king in talon was captured (king appears in trick captured by declarer's side)
  let kingInTalonCaptured = state.kingInTalonCaptured
  if (state.kingCall?.kingInTalon && !kingInTalonCaptured) {
    const kingCard = state.kingCall.calledKing
    const kingInThisTrick = state.currentTrick.cards.some(({ card }) => cardsEqual(card, kingCard))
    if (kingInThisTrick) {
      const isDeclarerSide = winner === state.declarer || winner === state.partner
      if (isDeclarerSide) kingInTalonCaptured = true
    }
  }

  const openBeggarRevealed = state.openBeggarRevealed ||
    (state.contract === 'open-beggar' && state.completedTricks.length === 0)

  const nextLeader = winner
  const nextTrick: TrickState = {
    trickNumber: state.currentTrick.trickNumber + 1,
    ledSeat: nextLeader,
    cards: [],
    ledSuit: null,
  }

  return {
    ...state,
    hands: state.hands,
    completedTricks: [...state.completedTricks, trick],
    currentTrick: nextTrick,
    capturedCards: newCaptured,
    mondCapturedBy: newMondCapturedBy,
    mondCapturedWithSkis: newMondCapturedWithSkis,
    openBeggarRevealed,
    kingInTalonCaptured,
  }
}

export function isHandComplete(state: PlayState): boolean {
  return Object.values(state.hands).every(h => h.length === 0) && state.currentTrick.cards.length === 0
}

export function initPlay(
  dealResult: DealResult,
  contract: Contract,
  declarer: Seat,
  partner: Seat | null,
  exchange: TalonExchange | null,
  isColourValat: boolean,
  kingCall: KingCall | null,
  hands: Record<Seat, Card[]>,
): PlayState {
  const leader = firstLeader(contract, declarer, dealResult.forehand)

  // Talon remainder goes to opponents at end (tracked via capturedCards)
  const talonRemainder = exchange?.talonRemainder ?? []

  return {
    hands,
    completedTricks: [],
    currentTrick: {
      trickNumber: 1,
      ledSeat: leader,
      cards: [],
      ledSuit: null,
    },
    capturedCards: {
      0: declarer === 0 ? [...(exchange?.discard ?? [])] : [],
      1: declarer === 1 ? [...(exchange?.discard ?? [])] : [],
      2: declarer === 2 ? [...(exchange?.discard ?? [])] : [],
      3: declarer === 3 ? [...(exchange?.discard ?? [])] : [],
    },
    mondCapturedBy: null,
    mondCapturedWithSkis: false,
    contract,
    declarer,
    partner,
    forehand: dealResult.forehand,
    isColourValat,
    openBeggarRevealed: false,
    talonRemainder,
    kingCall,
    kingInTalonCaptured: false,
  }
}
