import type {
  Seat, DealResult, BiddingState, TalonExchange, KingCall,
  AnnouncementState, PlayState, RadliState, HandScore, Contract, Card,
} from '../engine/types'

export type GamePhase =
  | 'setup'
  | 'idle'
  | 'dealing'
  | 'bidding'
  | 'forehand-choice'   // all others passed; forehand picks klop or higher
  | 'talon'
  | 'king-call'
  | 'announcing'
  | 'playing'
  | 'scoring'
  | 'skis-round'

export interface GameState {
  phase: GamePhase
  dealResult: DealResult | null
  biddingState: BiddingState | null
  talonExchange: TalonExchange | null
  kingCall: KingCall | null
  announcementState: AnnouncementState | null
  playState: PlayState | null
  radliState: RadliState
  sessionScores: Record<Seat, number>
  playerNames: Record<Seat, string>
  missdealStrikes: Record<Seat, number>
  options: { soundEnabled: boolean }
  statistics: HandScore[]
  skisRoundEndSeat: Seat | null
  dealerSeat: Seat
  pendingDiscardCount: number
  forehandChoiceContract: Contract | null
  pendingTrick: { cards: { seat: Seat; card: Card }[]; winner: Seat } | null
  roundId: number
}
