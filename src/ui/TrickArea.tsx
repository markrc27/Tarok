import React from 'react'
import type { PlayState, Seat, Card } from '../engine/types'
import CardSprite from './CardSprite'

interface Props {
  playState: PlayState
  pendingTrick: { cards: { seat: Seat; card: Card }[]; winner: Seat } | null
  playerNames: Record<Seat, string>
}

const SEAT_CLASS = ['trick-slot-bottom', 'trick-slot-left', 'trick-slot-top', 'trick-slot-right']

export default function TrickArea({ playState, pendingTrick, playerNames }: Props) {
  const displayCards = pendingTrick ? pendingTrick.cards : playState.currentTrick.cards
  const winner = pendingTrick?.winner ?? null

  return (
    <div className="trick-area">
      {displayCards.map(({ seat, card }) => (
        <div
          key={seat}
          className={`trick-slot ${SEAT_CLASS[seat]}${pendingTrick && seat === winner ? ' trick-winner-card' : ''}`}
        >
          <CardSprite card={card} faceUp />
        </div>
      ))}
      {winner !== null && (
        <div className="trick-winner-banner">
          {winner === 0 ? 'You win the trick' : `${playerNames[winner]} wins the trick`}
        </div>
      )}
    </div>
  )
}
