import type {
  Card, SuitCard, TrumpCard, Suit, BlackRank, RedRank,
  TrumpOrdinal, PointValue,
} from './types'

const BLACK_SUITS: Suit[] = ['clubs', 'spades']
const RED_SUITS: Suit[] = ['hearts', 'diamonds']
const BLACK_RANKS: BlackRank[] = [7, 8, 9, 10, 'J', 'Kn', 'Q', 'K']
const RED_RANKS: RedRank[] = [1, 2, 3, 4, 'J', 'Kn', 'Q', 'K']

const RANK_POINTS: Record<string, PointValue> = {
  K: 5, Q: 4, Kn: 3, J: 2,
}

function suitCardPoints(rank: BlackRank | RedRank): PointValue {
  const r = String(rank)
  return (RANK_POINTS[r] as PointValue | undefined) ?? 1
}

function trumpCardPoints(ordinal: TrumpOrdinal): PointValue {
  if (ordinal === 1 || ordinal === 21 || ordinal === 22) return 5
  return 1
}

export function buildDeck(): Card[] {
  const cards: Card[] = []

  for (const suit of BLACK_SUITS) {
    for (const rank of BLACK_RANKS) {
      cards.push({ kind: 'suit', suit, rank, points: suitCardPoints(rank) })
    }
  }
  for (const suit of RED_SUITS) {
    for (const rank of RED_RANKS) {
      cards.push({ kind: 'suit', suit, rank, points: suitCardPoints(rank) })
    }
  }
  for (let o = 1; o <= 22; o++) {
    const ordinal = o as TrumpOrdinal
    cards.push({ kind: 'trump', ordinal, points: trumpCardPoints(ordinal) })
  }

  return cards
}

export function cardPoints(c: Card): PointValue {
  return c.points
}

export function cardId(c: Card): string {
  if (c.kind === 'trump') return `trump-${c.ordinal}`
  return `suit-${c.suit}-${c.rank}`
}

export function cardsEqual(a: Card, b: Card): boolean {
  return cardId(a) === cardId(b)
}

export function isPagat(c: Card): boolean {
  return c.kind === 'trump' && c.ordinal === 1
}

export function isMond(c: Card): boolean {
  return c.kind === 'trump' && c.ordinal === 21
}

export function isSkis(c: Card): boolean {
  return c.kind === 'trump' && c.ordinal === 22
}

export function isTrump(c: Card): boolean {
  return c.kind === 'trump'
}

export function isKing(c: Card): boolean {
  return c.kind === 'suit' && c.rank === 'K'
}

export function isTrula(c: Card): boolean {
  return isPagat(c) || isMond(c) || isSkis(c)
}

export function trumpStrength(c: TrumpCard): number {
  return c.ordinal
}

const BLACK_RANK_STRENGTH: Record<string, number> = {
  '7': 1, '8': 2, '9': 3, '10': 4, J: 5, Kn: 6, Q: 7, K: 8,
}
const RED_RANK_STRENGTH: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4': 4, J: 5, Kn: 6, Q: 7, K: 8,
}

export function suitStrength(c: SuitCard): number {
  const table = c.suit === 'clubs' || c.suit === 'spades'
    ? BLACK_RANK_STRENGTH
    : RED_RANK_STRENGTH
  return table[String(c.rank)] ?? 0
}
