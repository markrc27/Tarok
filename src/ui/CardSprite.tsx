import React from 'react'
import type { Card, SuitCard, TrumpCard } from '../engine/types'
import { useGameStore } from '../state/store'
import { SUIT_SYM } from './labels'

interface Props {
  card?: Card
  faceUp?: boolean
  dimmed?: boolean
  onClick?: () => void
  selected?: boolean
  className?: string
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

// Cache-busting version tag for the traditional-mode PNGs. Bump when art changes.
export const CARD_ART_VERSION = 7

// Single source of truth for a card's traditional-mode image URL. Used both by
// the sprite below and by the preloader (src/ui/preloadCards.ts) so the warmed
// URLs always match exactly what gets rendered.
export function cardImageSrc(card: Card): string {
  return card.kind === 'trump'
    ? `./cards/trump-${(card as TrumpCard).ordinal}.png?v=${CARD_ART_VERSION}`
    : `./cards/${(card as SuitCard).suit}-${String((card as SuitCard).rank)}.png?v=${CARD_ART_VERSION}`
}

export const CARD_BACK_SRC = './LakeBled.png'

function CardBack() {
  return (
    <img
      src={CARD_BACK_SRC}
      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
      alt=""
      draggable={false}
    />
  )
}

export default function CardSprite({ card, faceUp = true, dimmed, onClick, selected, className = '' }: Props) {
  const cardAppearance = useGameStore(s => s.cardAppearance)

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

  if (cardAppearance === 'traditional') {
    const src = cardImageSrc(card)
    return (
      <div
        className={`card ${dimmed ? 'dimmed' : ''} ${selected ? 'selected-card' : ''} ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'inherit', padding: 0 }}
      >
        <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }} alt="" draggable={false} />
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
  const sym = SUIT_SYM[s.suit]
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
