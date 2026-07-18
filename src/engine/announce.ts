import type {
  Seat, BonusName, KontraLevel, AnnouncementState, AnnounceAction,
  Announcement, Trick, Card,
} from './types'
import { isPagat, isKing, isTrula, cardsEqual } from './deck'

export function initAnnouncements(): AnnouncementState {
  return { announcements: [], kontraTargets: [], phase: 'open' }
}

export function bonusBaseValue(bonus: BonusName, announced: boolean): number {
  const base: Record<BonusName, number> = {
    'trula': 10,
    'kings': 10,
    'king-ultimo': 10,
    'pagat-ultimo': 25,
    'valat': 250,
  }
  return announced ? base[bonus] * 2 : base[bonus]
}

export function canAnnounce(
  seat: Seat,
  bonus: BonusName,
  partner: Seat | null,
  hands: Record<Seat, Card[]>,
  declarer: Seat,
): boolean {
  const isDeclarerSide = seat === declarer || seat === partner
  if (bonus === 'pagat-ultimo') {
    // Only the Pagat-holder may announce
    return hands[seat].some(isPagat)
  }
  if (bonus === 'king-ultimo') {
    // Only the king-holder (on declarer's side) may announce
    if (!isDeclarerSide) return false
    return hands[seat].some(isKing)
  }
  return true
}

export function nextKontraLevel(current: KontraLevel, byDeclarerSide: boolean): KontraLevel | null {
  // Chain: none(1) → kontra(2, by opponents) → rekontra(4, by declarer) → sub(8, by opponents) → mord(16, by declarer)
  if (current === 1 && !byDeclarerSide) return 2
  if (current === 2 && byDeclarerSide) return 4
  if (current === 4 && !byDeclarerSide) return 8
  if (current === 8 && byDeclarerSide) return 16
  return null // already at max or wrong side
}

function isDeclarerSide(seat: Seat, declarer: Seat, partner: Seat | null): boolean {
  return seat === declarer || seat === partner
}

export function applyAnnouncement(
  state: AnnouncementState,
  action: AnnounceAction,
  declarer: Seat,
  partner: Seat | null,
): AnnouncementState {
  if (action.kind === 'announce') {
    const existing = state.announcements.find(a => a.bonus === action.bonus)
    if (existing) return state
    const newAnn: Announcement = { bonus: action.bonus, announced: true, kontraLevel: 1 }
    return { ...state, announcements: [...state.announcements, newAnn] }
  }

  // Kontra actions
  const target = action.target
  const bySide = isDeclarerSide(action.seat, declarer, partner)
  const existing = state.kontraTargets.find(k => k.target === target)
  const currentLevel: KontraLevel = existing?.level ?? 1
  const nextLevel = nextKontraLevel(currentLevel, bySide)
  if (nextLevel === null) return state // invalid kontra

  const newKontraTargets = existing
    ? state.kontraTargets.map(k => k.target === target ? { ...k, level: nextLevel, byDeclarerSide: bySide } : k)
    : [...state.kontraTargets, { target, level: nextLevel, byDeclarerSide: bySide }]

  // Update announcement kontraLevel if it's a bonus target
  const newAnnouncements = state.announcements.map(a =>
    a.bonus === target ? { ...a, kontraLevel: nextLevel } : a,
  )

  return { ...state, announcements: newAnnouncements, kontraTargets: newKontraTargets }
}

export function getKontraMultiplier(state: AnnouncementState, target: 'game' | BonusName): KontraLevel {
  const kt = state.kontraTargets.find(k => k.target === target)
  return kt?.level ?? 1
}

export function evaluateBonusForSeats(
  bonus: BonusName,
  seats: Seat[],
  capturedCards: Record<Seat, Card[]>,
  completedTricks: Trick[],
  calledKing: Card | null,
): boolean {
  const sideCards = seats.flatMap(s => capturedCards[s])

  if (bonus === 'trula') {
    const hasPagat = sideCards.some(isPagat)
    const hasMond = sideCards.some(c => c.kind === 'trump' && (c as { ordinal: number }).ordinal === 21)
    const hasSkis = sideCards.some(c => c.kind === 'trump' && (c as { ordinal: number }).ordinal === 22)
    return hasPagat && hasMond && hasSkis
  }

  if (bonus === 'kings') {
    return sideCards.filter(isKing).length === 4
  }

  if (bonus === 'pagat-ultimo') {
    const lastTrick = completedTricks[completedTricks.length - 1]
    if (!lastTrick || lastTrick.winner === null) return false
    if (!seats.includes(lastTrick.winner)) return false
    const winnerEntry = lastTrick.cards.find(e => e.seat === lastTrick.winner)
    return winnerEntry !== undefined && isPagat(winnerEntry.card)
  }

  if (bonus === 'king-ultimo') {
    if (!calledKing) return false
    const lastTrick = completedTricks[completedTricks.length - 1]
    if (!lastTrick || lastTrick.winner === null) return false
    if (!seats.includes(lastTrick.winner)) return false
    const winnerEntry = lastTrick.cards.find(e => e.seat === lastTrick.winner)
    return winnerEntry !== undefined && cardsEqual(winnerEntry.card, calledKing)
  }

  if (bonus === 'valat') {
    return completedTricks.every(t => t.winner !== null && seats.includes(t.winner))
  }

  return false
}

export function evaluateBonus(
  bonus: BonusName,
  capturedCards: Record<Seat, Card[]>,
  completedTricks: Trick[],
  declarer: Seat,
  partner: Seat | null,
  calledKing: Card | null,
): boolean {
  const seats = ([0, 1, 2, 3] as Seat[]).filter(s => s === declarer || s === partner)
  return evaluateBonusForSeats(bonus, seats, capturedCards, completedTricks, calledKing)
}
