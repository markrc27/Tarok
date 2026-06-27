import React from 'react'
import type { Card, SuitCard } from '../engine/types'
import { cardId } from '../engine/deck'
import CardSprite from './CardSprite'

const SUIT_ORDER = ['spades', 'clubs', 'hearts', 'diamonds']

function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'trump' ? -1 : 1
    if (a.kind === 'trump' && b.kind === 'trump') return a.ordinal - b.ordinal
    const sa = a as SuitCard, sb = b as SuitCard
    const suitDiff = SUIT_ORDER.indexOf(sa.suit) - SUIT_ORDER.indexOf(sb.suit)
    if (suitDiff !== 0) return suitDiff
    return sb.points - sa.points
  })
}

interface Props {
  cards: Card[]
  faceUp?: boolean
  legalCards?: Card[]
  onPlay?: (card: Card) => void
  vertical?: boolean
}

export default function Hand({ cards, faceUp = true, legalCards = [], onPlay, vertical = false }: Props) {
  if (!faceUp) {
    const n = cards.length
    if (vertical) {
      // Side seats: each card rotated 90°, stacked top-to-bottom with overlap.
      // A rotated 60×90 card is visually 90px wide × 60px tall.
      // left:15 centers the 60px DOM card inside a 90px-wide container.
      return (
        <div style={{ position: 'relative', width: 90, height: (n - 1) * 14 + 90 }}>
          {cards.map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: i * 14,
                left: 15,
                transform: 'rotate(90deg)',
                transformOrigin: '30px 45px',
              }}
            >
              <CardSprite faceUp={false} />
            </div>
          ))}
        </div>
      )
    }
    // Top seat: horizontal stack with overlap
    return (
      <div style={{ position: 'relative', width: (n - 1) * 14 + 60, height: 90 }}>
        {cards.map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: i * 14, top: 0 }}>
            <CardSprite faceUp={false} />
          </div>
        ))}
      </div>
    )
  }

  const legalIds = new Set(legalCards.map(cardId))
  const overlap = 28
  const sorted = sortHand(cards)

  return (
    <div className="hand" style={{ minWidth: `${Math.max((sorted.length - 1) * overlap + 60, 200)}px` }}>
      {sorted.map((card, i) => {
        const id = cardId(card)
        const isLegal = legalIds.has(id)
        const canPlay = onPlay !== undefined
        return (
          <div
            key={id}
            className={`hand-card${canPlay && !isLegal ? ' dimmed' : ''}`}
            style={{ left: `${i * overlap}px` }}
          >
            <CardSprite
              card={card}
              faceUp
              dimmed={canPlay && !isLegal}
              onClick={canPlay && isLegal ? () => onPlay(card) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
