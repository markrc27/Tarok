import React from 'react'
import type { Card, SuitCard } from '../engine/types'
import { cardId, suitStrength } from '../engine/deck'
import CardSprite from './CardSprite'

const SUIT_ORDER = ['spades', 'clubs', 'hearts', 'diamonds']

function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'trump' ? -1 : 1
    if (a.kind === 'trump' && b.kind === 'trump') return a.ordinal - b.ordinal
    const sa = a as SuitCard, sb = b as SuitCard
    const suitDiff = SUIT_ORDER.indexOf(sa.suit) - SUIT_ORDER.indexOf(sb.suit)
    if (suitDiff !== 0) return suitDiff
    return suitStrength(sa) - suitStrength(sb)
  })
}

interface Props {
  cards: Card[]
  faceUp?: boolean
  legalCards?: Card[]
  onPlay?: (card: Card) => void
  vertical?: boolean
  cardW?: number
  cardH?: number
  handStep?: number
  aiStep?: number
}

export default function Hand({
  cards,
  faceUp = true,
  legalCards = [],
  onPlay,
  vertical = false,
  cardW = 90,
  cardH = 135,
  handStep = 50,
  aiStep = 14,
}: Props) {
  if (!faceUp) {
    const n = cards.length
    if (vertical) {
      return (
        <div style={{ position: 'relative', width: cardH, height: (n - 1) * aiStep + cardW }}>
          {cards.map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: i * aiStep,
                left: (cardH - cardW) / 2,
                transform: 'rotate(90deg)',
                transformOrigin: `${cardW / 2}px ${cardH / 2}px`,
              }}
            >
              <CardSprite faceUp={false} />
            </div>
          ))}
        </div>
      )
    }
    return (
      <div style={{ position: 'relative', width: (n - 1) * aiStep + cardW, height: cardH }}>
        {cards.map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: i * aiStep, top: 0 }}>
            <CardSprite faceUp={false} />
          </div>
        ))}
      </div>
    )
  }

  const legalIds = new Set(legalCards.map(cardId))
  const sorted = sortHand(cards)

  return (
    <div className="hand" style={{ width: `${(sorted.length - 1) * handStep + cardW}px`, height: `${cardH + 20}px` }}>
      {sorted.map((card, i) => {
        const id = cardId(card)
        const isLegal = legalIds.has(id)
        const canPlay = onPlay !== undefined
        const playable = canPlay && isLegal
        return (
          <div
            key={id}
            className={`hand-card${canPlay && !isLegal ? ' dimmed' : ''}${playable ? ' playable' : ''}`}
            style={{ left: `${i * handStep}px` }}
            onClick={playable ? () => onPlay(card) : undefined}
          >
            <CardSprite card={card} faceUp dimmed={canPlay && !isLegal} />
          </div>
        )
      })}
    </div>
  )
}
