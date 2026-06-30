import type {
  Card, Seat, Contract, RadliState, HandScore, BonusName, KontraLevel,
  AnnouncementState, Announcement, Trick,
} from './types'
import { countPoints } from './pointcount'
import { getKontraMultiplier, evaluateBonus, evaluateBonusForSeats, bonusBaseValue } from './announce'

export function adjustCapturedForTalon(
  capturedCards: Record<Seat, Card[]>,
  talonRemainder: Card[],
  declarer: Seat,
  partner: Seat | null,
  kingInTalonCaptured: boolean,
): Record<Seat, Card[]> {
  if (talonRemainder.length === 0) return capturedCards
  const adj: Record<Seat, Card[]> = {
    0: [...capturedCards[0]],
    1: [...capturedCards[1]],
    2: [...capturedCards[2]],
    3: [...capturedCards[3]],
  }
  if (kingInTalonCaptured) {
    adj[declarer] = [...adj[declarer], ...talonRemainder]
  } else {
    const opp = ([0, 1, 2, 3] as Seat[]).find(s => s !== declarer && s !== partner) as Seat
    adj[opp] = [...adj[opp], ...talonRemainder]
  }
  return adj
}

export function roundToNearest5(n: number): number {
  return Math.round(n / 5) * 5
}

export function calcDifference(points: number): number {
  return roundToNearest5(points - 35)
}

export function countDeclarerPoints(
  capturedCards: Record<Seat, Card[]>,
  declarer: Seat,
  partner: Seat | null,
): number {
  const declarerSide = ([0, 1, 2, 3] as Seat[]).filter(s => s === declarer || s === partner)
  const cards = declarerSide.flatMap(s => capturedCards[s])
  return countPoints(cards)
}

export function scoreNormalContract(
  contract: Contract,
  difference: number,
  announcements: AnnouncementState,
  bonusResults: Record<BonusName, boolean>,
  contractBase: number,
  won: boolean,
  opponentBonusResults: Record<BonusName, boolean>,
): number {
  const gameKontra = getKontraMultiplier(announcements, 'game')
  // Always use |difference| for magnitude; sign determined by win/loss
  let total = (won ? 1 : -1) * (contractBase + Math.abs(difference)) * gameKontra

  // Valat overrides all other bonuses (valat achieved implies won=true)
  if (bonusResults['valat']) {
    const valatAnn = announcements.announcements.find(a => a.bonus === 'valat')
    const valAnnounced = valatAnn?.announced ?? false
    const valKontra = getKontraMultiplier(announcements, 'valat')
    return bonusBaseValue('valat', valAnnounced) * valKontra
  }

  // Announced bonuses: achieved=+value, not achieved=-value (independent of win/loss)
  for (const ann of announcements.announcements) {
    const achieved = bonusResults[ann.bonus]
    const kontra = getKontraMultiplier(announcements, ann.bonus)
    const value = bonusBaseValue(ann.bonus, ann.announced) * kontra
    total += achieved ? value : -value
  }

  const allBonuses: BonusName[] = ['trula', 'kings', 'king-ultimo', 'pagat-ultimo']

  // Declarer-side unannounced achieved bonuses: always positive, even on a loss
  for (const bonus of allBonuses) {
    const alreadyAnnounced = announcements.announcements.some(a => a.bonus === bonus)
    if (!alreadyAnnounced && bonusResults[bonus]) {
      total += bonusBaseValue(bonus, false)
    }
  }

  // Opposition-won unannounced bonuses: subtracted from declarer's score
  for (const bonus of allBonuses) {
    const wasAnnounced = announcements.announcements.some(a => a.bonus === bonus)
    if (!wasAnnounced && opponentBonusResults[bonus]) {
      total -= bonusBaseValue(bonus, false)
    }
  }

  return total
}

export function scoreFlatContract(contract: Contract, won: boolean): number {
  const values: Partial<Record<Contract, number>> = {
    'beggar': 70,
    'solo-without': 80,
    'open-beggar': 90,
    'color-valat-without': 125,
    'valat-without': 500,
  }
  const v = values[contract] ?? 0
  return won ? v : -v
}

export function scoreKlop(capturedCards: Record<Seat, Card[]>): Record<Seat, number> {
  const result: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const cards = capturedCards[seat]
    if (cards.length === 0) {
      result[seat] = 70
    } else {
      const pts = countPoints(cards)
      if (pts > 35) {
        result[seat] = -70
      } else {
        const rounded = roundToNearest5(pts)
      result[seat] = rounded === 0 ? 0 : -rounded
      }
    }
  }
  return result
}

export function mondPenalty(
  mondCapturedWithSkis: boolean,
  mondPlayedBySeat: Seat | null,
): Record<Seat, number> {
  const result: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  if (mondCapturedWithSkis && mondPlayedBySeat !== null) {
    result[mondPlayedBySeat] = -20
  }
  return result
}

export function applyRadli(
  baseScore: number,
  radliState: RadliState,
  seat: Seat,
  won: boolean,
): { score: number; newRadliState: RadliState } {
  const uncancelled = radliState.uncancelled[seat]
  if (uncancelled === 0) {
    return { score: baseScore, newRadliState: radliState }
  }

  const doubled = baseScore * 2
  const newUncancelled = { ...radliState.uncancelled }
  if (won && uncancelled > 0) {
    newUncancelled[seat] = uncancelled - 1
  }

  return { score: doubled, newRadliState: { uncancelled: newUncancelled } }
}

export function updateRadliAfterHand(
  state: RadliState,
  contract: Contract,
  _won: boolean,
): RadliState {
  const contractStrength: Partial<Record<Contract, number>> = {
    'beggar': 7, 'solo-without': 8, 'open-beggar': 9,
    'color-valat-without': 10, 'valat-without': 11,
  }
  const isBeggarOrHigher = (contractStrength[contract] ?? 0) >= 7
  const isKlop = contract === 'klop'

  if (!isKlop && !isBeggarOrHigher) return state

  // All four seats gain one uncancelled radl
  const newUncancelled = { ...state.uncancelled }
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    newUncancelled[seat] = (newUncancelled[seat] ?? 0) + 1
  }
  return { uncancelled: newUncancelled }
}

export function radliEndOfSession(state: RadliState): Record<Seat, number> {
  const result: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const u = state.uncancelled[seat] ?? 0
    result[seat] = u === 0 ? 0 : -(u * 100)
  }
  return result
}

export function missdealPenalty(
  strikes: Record<Seat, number>,
  seat: Seat,
): { penalty: number; newStrikes: Record<Seat, number> } {
  const currentStrikes = strikes[seat] ?? 0
  const penalty = 20 * Math.pow(2, currentStrikes)
  const newStrikes = { ...strikes, [seat]: currentStrikes + 1 }
  return { penalty, newStrikes }
}

export function initRadli(): RadliState {
  return { uncancelled: { 0: 0, 1: 0, 2: 0, 3: 0 } }
}

export function computeHandScore(params: {
  contract: Contract
  declarer: Seat
  partner: Seat | null
  capturedCards: Record<Seat, Card[]>
  talonRemainder: Card[]
  mondCapturedWithSkis: boolean
  mondPlayedBySeat: Seat | null
  announcementState: AnnouncementState
  completedTricks: Trick[]
  calledKing: Card | null
  radliState: RadliState
  contractBase: number
  won: boolean
}): HandScore {
  const {
    contract, declarer, partner, capturedCards, talonRemainder,
    mondCapturedWithSkis, mondPlayedBySeat, announcementState,
    completedTricks, calledKing, radliState, contractBase,
  } = params

  const declarerPoints = countDeclarerPoints(capturedCards, declarer, partner)
  const difference = calcDifference(declarerPoints)
  // Beggar/open-beggar: win = take zero tricks. All others: win = ≥36 points.
  const won = (contract === 'beggar' || contract === 'open-beggar')
    ? capturedCards[declarer].length === 0
    : declarerPoints >= 36

  const bonusResults: Record<BonusName, boolean> = {
    'trula': evaluateBonus('trula', capturedCards, completedTricks, declarer, partner, calledKing),
    'kings': evaluateBonus('kings', capturedCards, completedTricks, declarer, partner, calledKing),
    'king-ultimo': evaluateBonus('king-ultimo', capturedCards, completedTricks, declarer, partner, calledKing),
    'pagat-ultimo': evaluateBonus('pagat-ultimo', capturedCards, completedTricks, declarer, partner, calledKing),
    'valat': evaluateBonus('valat', capturedCards, completedTricks, declarer, partner, calledKing),
  }

  const mPenalties = mondPenalty(mondCapturedWithSkis, mondPlayedBySeat)

  const opponentSeats = ([0, 1, 2, 3] as Seat[]).filter(s => s !== declarer && s !== partner)
  const opponentBonusResults: Record<BonusName, boolean> = {
    trula: evaluateBonusForSeats('trula', opponentSeats, capturedCards, completedTricks, calledKing),
    kings: evaluateBonusForSeats('kings', opponentSeats, capturedCards, completedTricks, calledKing),
    'king-ultimo': evaluateBonusForSeats('king-ultimo', opponentSeats, capturedCards, completedTricks, calledKing),
    'pagat-ultimo': evaluateBonusForSeats('pagat-ultimo', opponentSeats, capturedCards, completedTricks, calledKing),
    valat: false,
  }

  let declarerScore: number
  const isFlat = ['beggar', 'solo-without', 'open-beggar', 'color-valat-without', 'valat-without'].includes(contract)

  if (isFlat) {
    declarerScore = scoreFlatContract(contract, won) + mPenalties[declarer]
  } else {
    declarerScore = scoreNormalContract(contract, difference, announcementState, bonusResults, contractBase, won, opponentBonusResults)
    declarerScore += mPenalties[declarer]
  }

  // Apply radli for declarer
  const { score: finalScore, newRadliState } = applyRadli(declarerScore, radliState, declarer, won)
  declarerScore = finalScore
  void newRadliState

  const partnerScore = partner !== null ? declarerScore : null

  const opponentScores: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    if (seat === declarer || seat === partner) continue
    // Opponents don't gain or lose from the hand result — only the mond penalty applies
    opponentScores[seat] = mPenalties[seat]
  }

  const bonusBreakdown: HandScore['bonusBreakdown'] = []

  if (!isFlat) {
    bonusBreakdown.push(...announcementState.announcements.map(ann => ({
      bonus: ann.bonus,
      announced: true,
      achieved: bonusResults[ann.bonus],
      value: bonusBaseValue(ann.bonus, ann.announced),
      kontraLevel: getKontraMultiplier(announcementState, ann.bonus),
      side: 'declarer' as const,
    })))

    const allBonuses: BonusName[] = ['trula', 'kings', 'king-ultimo', 'pagat-ultimo']
    for (const bonus of allBonuses) {
      const alreadyAnnounced = announcementState.announcements.some(a => a.bonus === bonus)
      if (!alreadyAnnounced) {
        if (bonusResults[bonus]) {
          bonusBreakdown.push({ bonus, announced: false, achieved: true, value: bonusBaseValue(bonus, false), kontraLevel: 1, side: 'declarer' })
        } else if (opponentBonusResults[bonus]) {
          bonusBreakdown.push({ bonus, announced: false, achieved: true, value: bonusBaseValue(bonus, false), kontraLevel: 1, side: 'opponent' })
        }
      }
    }
  }

  return {
    declarerScore,
    partnerScore,
    opponentScores,
    mondPenalties: mPenalties,
    bonusBreakdown,
    totalDifference: difference,
    radliApplied: radliState.uncancelled[declarer] > 0,
    contract,
    declarer,
    partner,
  }
}
