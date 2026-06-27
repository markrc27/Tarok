import React from 'react'
import type { Card, SuitCard, TrumpCard } from '../engine/types'

interface Props {
  card?: Card
  faceUp?: boolean
  dimmed?: boolean
  onClick?: () => void
  selected?: boolean
  className?: string
}

const SUIT_SYMBOL: Record<string, string> = {
  clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦',
}

function rankLabel(rank: SuitCard['rank']): string {
  if (rank === 'Kn') return 'C'  // Cavalier
  return String(rank)             // K, Q, J pass through as-is
}

function trumpLabel(ordinal: number): string {
  if (ordinal === 22) return 'ŠKIS'
  const roman = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X',
    'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI']
  return roman[ordinal] ?? String(ordinal)
}

function CardBack() {
  return (
    <img
      src="/LakeBled.png"
      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
      alt=""
      draggable={false}
    />
  )
}

export default function CardSprite({ card, faceUp = true, dimmed, onClick, selected, className = '' }: Props) {
  if (!faceUp || !card) {
    return (
      <div
        className={`card face-down ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'inherit' }}
      >
        <CardBack/>
      </div>
    )
  }

  if (card.kind === 'trump') {
    const t = card as TrumpCard
    const label = trumpLabel(t.ordinal)
    return (
      <div
        className={`card trump ${dimmed ? 'dimmed' : ''} ${selected ? 'selected-card' : ''} ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'inherit' }}
      >
        <div className="card-corner-top">{label}</div>
        <div className="card-center">★</div>
        <div className="card-corner-bot">{label}</div>
      </div>
    )
  }

  const s = card as SuitCard
  const sym = SUIT_SYMBOL[s.suit]
  const isRed = s.suit === 'hearts' || s.suit === 'diamonds'
  const rank = rankLabel(s.rank)

  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${dimmed ? 'dimmed' : ''} ${selected ? 'selected-card' : ''} ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'inherit' }}
    >
      <div className="card-corner-top">{rank}<br />{sym}</div>
      <div className="card-center">{sym}</div>
      <div className="card-corner-bot">{rank}<br />{sym}</div>
    </div>
  )
}
