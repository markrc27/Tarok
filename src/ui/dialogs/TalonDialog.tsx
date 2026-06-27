import React, { useState } from 'react'
import type { TalonExchange, Card } from '../../engine/types'
import { canDiscard } from '../../engine/talon'
import { cardId } from '../../engine/deck'
import CardSprite from '../CardSprite'

interface Props {
  exchange: TalonExchange
  hand: Card[]
  groupSize: number
  onSelectGroup: (index: number) => void
  onDiscard: (cards: Card[]) => void
}

export default function TalonDialog({ exchange, hand, groupSize, onSelectGroup, onDiscard }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<number | null>(exchange.selectedGroup)
  const [discardSelected, setDiscardSelected] = useState<Set<string>>(new Set())

  const phase = exchange.selectedGroup === null ? 'select-group' : 'discard'

  const toggleDiscard = (card: Card) => {
    const id = cardId(card)
    const next = new Set(discardSelected)
    if (next.has(id)) next.delete(id)
    else if (next.size < groupSize) next.add(id)
    setDiscardSelected(next)
  }

  const handleGroupSelect = (i: number) => {
    setSelectedGroup(i)
    onSelectGroup(i)
  }

  const handleDiscard = () => {
    const toDiscard = hand.filter(c => discardSelected.has(cardId(c)))
    onDiscard(toDiscard)
  }

  if (phase === 'select-group') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h2>Choose Talon Group</h2>
          <div className="talon-groups">
            {exchange.groups.map((group, i) => (
              <div
                key={i}
                className={`talon-group ${selectedGroup === i ? 'selected' : ''}`}
                onClick={() => handleGroupSelect(i)}
              >
                {group.map(c => (
                  <CardSprite key={cardId(c)} card={c} faceUp />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Discard phase
  const discardableHand = hand.filter(c => canDiscard(c, hand))

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Discard {groupSize} Card{groupSize > 1 ? 's' : ''}</h2>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>
          Select {groupSize} card{groupSize > 1 ? 's' : ''} to discard (Kings and Trula cannot be discarded).
        </p>
        <div className="discard-hand">
          {hand.map(c => {
            const id = cardId(c)
            const isDiscardable = discardableHand.some(d => cardId(d) === id)
            return (
              <div
                key={id}
                className={`discard-card ${discardSelected.has(id) ? 'selected' : ''}`}
                style={{ opacity: isDiscardable ? 1 : 0.35 }}
                onClick={() => isDiscardable && toggleDiscard(c)}
              >
                <CardSprite card={c} faceUp />
              </div>
            )
          })}
        </div>
        <div className="modal-actions">
          <button
            className="btn"
            disabled={discardSelected.size !== groupSize}
            onClick={handleDiscard}
          >
            Discard ({discardSelected.size}/{groupSize})
          </button>
        </div>
      </div>
    </div>
  )
}
