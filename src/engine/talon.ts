import type {
  Card, Contract, TalonGroup, TalonExchange, KingCall, Suit, Seat, SuitCard,
} from './types'
import { isKing, isTrula, isTrump, cardsEqual } from './deck'

export function talonGroupSize(contract: Contract): number {
  if (contract === 'three' || contract === 'solo-three') return 3
  if (contract === 'two' || contract === 'solo-two') return 2
  if (contract === 'one' || contract === 'solo-one') return 1
  return 0
}

export function formTalonGroups(talon: Card[], contract: Contract): TalonGroup[] {
  const size = talonGroupSize(contract)
  if (size === 0) return []
  const groups: TalonGroup[] = []
  for (let i = 0; i < 6; i += size) {
    groups.push(talon.slice(i, i + size))
  }
  return groups
}

export function canDiscard(card: Card, hand: Card[]): boolean {
  if (isKing(card)) return false
  if (isTrula(card)) return false
  if (isTrump(card)) {
    // May only discard non-trula trump when no non-trump, non-king card exists
    const hasNonTrumpNonKing = hand.some(c => !isTrump(c) && !isKing(c))
    return !hasNonTrumpNonKing
  }
  return true
}

export function legalDiscards(hand: Card[], count: number): Card[] {
  return hand.filter(c => canDiscard(c, hand)).slice(0, count)
}

export function initTalonExchange(talon: Card[], contract: Contract): TalonExchange {
  return {
    groups: formTalonGroups(talon, contract),
    selectedGroup: null,
    discard: [],
    talonRemainder: [],
  }
}

export function selectTalonGroup(
  exchange: TalonExchange,
  groupIndex: number,
  hand: Card[],
): { updatedHand: Card[]; exchange: TalonExchange } {
  const group = exchange.groups[groupIndex]
  const updatedHand = [...hand, ...group]
  const talonRemainder = exchange.groups
    .filter((_, i) => i !== groupIndex)
    .flat()

  return {
    updatedHand,
    exchange: { ...exchange, selectedGroup: groupIndex, talonRemainder },
  }
}

export function applyDiscard(
  exchange: TalonExchange,
  discard: Card[],
  hand: Card[],
): TalonExchange {
  const updatedHand = hand.filter(c => !discard.some(d => cardsEqual(c, d)))
  void updatedHand // hand is returned by caller after this
  return { ...exchange, discard }
}

export function resolveKingCall(
  calledSuit: Suit,
  hands: Record<Seat, Card[]>,
  talon: Card[],
  declarer: Seat,
): KingCall {
  const calledKing = buildCalledKing(calledSuit)

  // Check if king is in declarer's own hand
  const inDeclarerHand = hands[declarer].some(
    c => c.kind === 'suit' && c.suit === calledSuit && c.rank === 'K',
  )

  // Check if king is in talon
  const inTalon = talon.some(
    c => c.kind === 'suit' && c.suit === calledSuit && c.rank === 'K',
  )

  // Find partner (whoever else holds the king)
  let partner: Seat | null = null
  if (!inDeclarerHand && !inTalon) {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      if (seat === declarer) continue
      if (hands[seat].some(c => c.kind === 'suit' && c.suit === calledSuit && c.rank === 'K')) {
        partner = seat
        break
      }
    }
  }

  return {
    calledSuit,
    calledKing,
    partner,
    kingInTalon: inTalon,
    kingInDeclarerHand: inDeclarerHand,
  }
}

function buildCalledKing(suit: Suit): SuitCard {
  return { kind: 'suit', suit, rank: 'K', points: 5 }
}

export function canUpgradeToColourValat(contract: Contract): boolean {
  return contract === 'solo-three' || contract === 'solo-two' || contract === 'solo-one'
}

export function talonToOpponents(exchange: TalonExchange): Card[] {
  return exchange.talonRemainder
}

export function discardHand(hand: Card[], discard: Card[]): Card[] {
  return hand.filter(c => !discard.some(d => cardsEqual(c, d)))
}
