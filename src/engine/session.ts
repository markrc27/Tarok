import type { Seat, SessionState, PlayState } from './types'
import { isSkis } from './deck'
import { initRadli, missdealPenalty } from './scoring'

export function initSession(playerNames: Record<Seat, string>): SessionState {
  void playerNames
  return {
    scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    radli: initRadli(),
    missdealStrikes: { 0: 0, 1: 0, 2: 0, 3: 0 },
    handHistory: [],
    dealerSeat: 0,
    skisRoundEndSeat: null,
    isSkisRound: false,
  }
}

export function initSkisRound(playState: PlayState): { skisHolderSeat: Seat | null; wasInTalon: boolean } {
  // Inspect completed tricks for Škis location
  for (const trick of playState.completedTricks) {
    for (const { seat, card } of trick.cards) {
      if (isSkis(card)) {
        return { skisHolderSeat: seat, wasInTalon: false }
      }
    }
  }
  return { skisHolderSeat: null, wasInTalon: true }
}

export function shouldEndSession(state: SessionState, currentDealer: Seat): boolean {
  if (!state.isSkisRound || state.skisRoundEndSeat === null) return false
  return currentDealer === state.skisRoundEndSeat
}

export function applyMisdeal(state: SessionState, dealer: Seat): SessionState {
  const { penalty, newStrikes } = missdealPenalty(state.missdealStrikes, dealer)
  return {
    ...state,
    scores: { ...state.scores, [dealer]: state.scores[dealer] - penalty },
    missdealStrikes: newStrikes,
  }
}


export function nextDealer(current: Seat): Seat {
  return ((current + 3) % 4) as Seat // anticlockwise
}
