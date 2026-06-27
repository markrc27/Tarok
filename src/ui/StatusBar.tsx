import React from 'react'
import type { PlayState, BiddingState, Seat } from '../engine/types'
import { countPoints } from '../engine/pointcount'
import { CONTRACT_LABEL } from './labels'

interface Props {
  playState: PlayState | null
  biddingState: BiddingState | null
  playerNames: Record<Seat, string>
}

export default function StatusBar({ playState, biddingState, playerNames }: Props) {
  const rawContract = biddingState?.highestBid ?? playState?.contract ?? null
  const contractLabel = rawContract ? CONTRACT_LABEL[rawContract] : '—'
  const declarer = playState ? playerNames[playState.declarer] : '—'

  const turn = playState
    ? (() => {
        const trick = playState.currentTrick
        const playedSeats = new Set(trick.cards.map(c => c.seat))
        const order: Seat[] = [trick.ledSeat, ((trick.ledSeat+1)%4) as Seat, ((trick.ledSeat+2)%4) as Seat, ((trick.ledSeat+3)%4) as Seat]
        const next = order.find(s => !playedSeats.has(s))
        return next !== undefined ? playerNames[next] : '—'
      })()
    : '—'

  let pts = 0
  if (playState) {
    const declarerSide = ([0, 1, 2, 3] as Seat[]).filter(s => s === playState.declarer || s === playState.partner)
    const cards = declarerSide.flatMap(s => playState.capturedCards[s])
    pts = countPoints(cards)
  }

  // Hint when human must follow a specific suit/trump
  let followHint = ''
  if (playState && playState.currentTrick.cards.length > 0) {
    const ledSuit = playState.currentTrick.ledSuit
    if (ledSuit === 'trump') followHint = 'Must follow: tarok'
    else if (ledSuit) {
      const humanHasSuit = playState.hands[0].some(c => c.kind === 'suit' && c.suit === ledSuit)
      if (humanHasSuit) followHint = `Must follow: ${ledSuit}`
      else followHint = 'Must play tarok (no matching suit)'
    }
  }

  return (
    <div className="status-bar">
      <div className="status-item">Contract: <span>{contractLabel}</span></div>
      <div className="status-item">Declarer: <span>{declarer}</span></div>
      <div className="status-item">Turn: <span>{turn}</span></div>
      <div className="status-item">Points: <span>{pts} / 70</span></div>
      {followHint && <div className="status-item" style={{ color: '#facc15' }}>{followHint}</div>}
    </div>
  )
}
