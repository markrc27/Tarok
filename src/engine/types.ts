export type BlackSuit = 'clubs' | 'spades'
export type RedSuit = 'hearts' | 'diamonds'
export type Suit = BlackSuit | RedSuit

export type BlackRank = 7 | 8 | 9 | 10 | 'J' | 'Kn' | 'Q' | 'K'
export type RedRank = 1 | 2 | 3 | 4 | 'J' | 'Kn' | 'Q' | 'K'
export type SuitRank = BlackRank | RedRank

// 1=Pagat, 21=Mond, 22=Škis
export type TrumpOrdinal =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22

export type PointValue = 1 | 2 | 3 | 4 | 5

export type SuitCard = {
  kind: 'suit'
  suit: Suit
  rank: BlackRank | RedRank
  points: PointValue
}

export type TrumpCard = {
  kind: 'trump'
  ordinal: TrumpOrdinal
  points: PointValue
}

export type Card = SuitCard | TrumpCard

// 0=human/bottom, 1=left AI, 2=top AI, 3=right AI
export type Seat = 0 | 1 | 2 | 3

export type Contract =
  | 'klop'
  | 'three'
  | 'two'
  | 'one'
  | 'solo-three'
  | 'solo-two'
  | 'solo-one'
  | 'beggar'
  | 'solo-without'
  | 'open-beggar'
  | 'color-valat-without'
  | 'valat-without'

export const CONTRACT_BASE: Record<Contract, number> = {
  'klop': 0,
  'three': 10,
  'two': 20,
  'one': 30,
  'solo-three': 40,
  'solo-two': 50,
  'solo-one': 60,
  'beggar': 70,
  'solo-without': 80,
  'open-beggar': 90,
  'color-valat-without': 125,
  'valat-without': 500,
}

export type BonusName = 'trula' | 'kings' | 'king-ultimo' | 'pagat-ultimo' | 'valat'

// 1=none, 2=kontra, 4=rekontra, 8=subkontra, 16=mordkontra
export type KontraLevel = 1 | 2 | 4 | 8 | 16

export interface Announcement {
  bonus: BonusName
  announced: boolean
  kontraLevel: KontraLevel
}

export interface Trick {
  cards: { seat: Seat; card: Card }[]
  winner: Seat | null
  vitamin?: Card  // klop T1–T6: talon card gifted to the trick winner
}

export type BidAction =
  | { kind: 'bid'; contract: Contract }
  | { kind: 'pass' }

export interface BiddingState {
  dealer: Seat
  forehand: Seat
  bids: { seat: Seat; action: BidAction }[]
  currentBidder: Seat
  highestBid: Contract | null
  highestBidder: Seat | null
  isCompulsoryKlop: boolean
  passed: Set<Seat>
  done: boolean
}

export interface BiddingResult {
  contract: Contract
  declarer: Seat
  isCompulsoryKlop: boolean
}

export interface DealResult {
  hands: Record<Seat, Card[]>
  talon: Card[]
  dealer: Seat
  forehand: Seat
  dealOrder: Seat[]
}

export type DealOutcome =
  | { kind: 'normal'; result: DealResult }
  | { kind: 'void-deal'; zeroTrumpSeat: Seat; result: DealResult }

export type TalonGroup = Card[]

export interface TalonExchange {
  groups: TalonGroup[]
  selectedGroup: number | null
  discard: Card[]
  talonRemainder: Card[]
}

export interface KingCall {
  calledSuit: Suit
  calledKing: SuitCard
  partner: Seat | null
  kingInTalon: boolean
  kingInDeclarerHand: boolean
}

export interface TrickState {
  trickNumber: number
  ledSeat: Seat
  cards: { seat: Seat; card: Card }[]
  ledSuit: Suit | 'trump' | null
}

export interface PlayState {
  hands: Record<Seat, Card[]>
  completedTricks: Trick[]
  currentTrick: TrickState
  capturedCards: Record<Seat, Card[]>
  mondCapturedBy: Seat | null
  mondCapturedWithSkis: boolean
  contract: Contract
  declarer: Seat
  partner: Seat | null
  forehand: Seat
  isColourValat: boolean
  openBeggarRevealed: boolean
  talonRemainder: Card[]
  talonDiscard: Card[]
  klopTalon: Card[]  // klop only: remaining talon cards to be dealt as vitamins
  kingCall: KingCall | null
  kingInTalonCaptured: boolean
}

export type PlayAction = { kind: 'play-card'; seat: Seat; card: Card }

export interface PlayResult {
  newState: PlayState
  trickComplete: boolean
  trickWinner: Seat | null
  handComplete: boolean
}

export interface AnnouncementState {
  announcements: Announcement[]
  kontraTargets: {
    target: 'game' | BonusName
    level: KontraLevel
    byDeclarerSide: boolean
  }[]
  phase: 'open' | 'closed'
}

export type AnnounceAction =
  | { kind: 'announce'; seat: Seat; bonus: BonusName }
  | { kind: 'kontra'; seat: Seat; target: 'game' | BonusName }
  | { kind: 'rekontra'; seat: Seat; target: 'game' | BonusName }
  | { kind: 'subkontra'; seat: Seat; target: 'game' | BonusName }
  | { kind: 'mordkontra'; seat: Seat; target: 'game' | BonusName }

export interface HandScore {
  declarerScore: number
  partnerScore: number | null
  opponentScores: Record<Seat, number>
  mondPenalties: Record<Seat, number>
  bonusBreakdown: {
    bonus: BonusName
    announced: boolean
    achieved: boolean
    value: number
    kontraLevel: KontraLevel
    side: 'declarer' | 'opponent'
  }[]
  totalDifference: number
  radliApplied: boolean
  contract: Contract
  declarer: Seat
  partner: Seat | null
}

export interface RadliState {
  uncancelled: Record<Seat, number>
}

export interface GameRecord {
  id: string
  playedAt: number
  playerNames: Record<Seat, string>
  finalScores: Record<Seat, number>
  rounds: number
  difficulty?: 'easy' | 'hard'
}

export interface RoundRecord {
  roundNumber: number
  contract: Contract
  declarer: Seat
  scoreDelta: Record<Seat, number>
  logText: string
}

export interface SessionState {
  scores: Record<Seat, number>
  radli: RadliState
  missdealStrikes: Record<Seat, number>
  handHistory: HandScore[]
  dealerSeat: Seat
  skisRoundEndSeat: Seat | null
  isSkisRound: boolean
}
