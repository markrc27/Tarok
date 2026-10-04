import React, { useState } from 'react'
import type { TalonExchange, Card, KingCall } from '../../engine/types'
import { canDiscard } from '../../engine/talon'
import { cardId, isMond, cardsEqual } from '../../engine/deck'
import CardSprite from '../CardSprite'

interface Props {
  exchange: TalonExchange
  hand: Card[]
  groupSize: number
  kingCall?: KingCall | null
  onSelectGroup: (index: number) => void
  onDiscard: (cards: Card[]) => void
}

const SUIT_NAME: Record<string, string> = { clubs: 'Clubs', spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds' }

export default function TalonDialog({ exchange, hand, groupSize, kingCall, onSelectGroup, onDiscard }: Props) {
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

  const handleDiscard = () => {
    const toDiscard = hand.filter(c => discardSelected.has(cardId(c)))
    onDiscard(toDiscard)
  }

  if (phase === 'select-group') {
    // Warn before the pick is confirmed when it leaves the Mond (-20, ENG-008)
    // or the called king (declarer then plays alone) behind in the talon.
    const mondGroup = exchange.groups.findIndex(g => g.some(isMond))
    const calledKing = kingCall?.calledKing ?? null
    const kingGroup = calledKing ? exchange.groups.findIndex(g => g.some(c => cardsEqual(c, calledKing))) : -1
    const kingName = calledKing ? `King of ${SUIT_NAME[calledKing.suit] ?? calledKing.suit}` : ''
    const warnings: string[] = []
    if (selectedGroup !== null) {
      if (mondGroup >= 0 && selectedGroup !== mondGroup) {
        warnings.push(kingGroup === selectedGroup
          ? `This leaves the Mond in the talon. That costs you 20 points — unless you win a trick with your called ${kingName}, which wins you the rest of the talon, Mond included.`
          : 'This leaves the Mond in the talon. That costs you 20 points.')
      }
      if (kingGroup >= 0 && selectedGroup !== kingGroup) {
        warnings.push(`This leaves your called ${kingName} in the talon. You will play this hand alone, with no partner.`)
      }
    }
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)' }}>
          <h2>Choose Talon Group</h2>
          <div className="talon-groups" style={{ overflowY: 'auto', flex: 1 }}>
            {exchange.groups.map((group, i) => (
              <div
                key={i}
                className={`talon-group ${selectedGroup === i ? 'selected' : ''}`}
                onClick={() => setSelectedGroup(i)}
              >
                {group.map(c => (
                  <CardSprite key={cardId(c)} card={c} faceUp />
                ))}
              </div>
            ))}
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="talon-warning">⚠ {w}</p>
          ))}
          {/* Clicking only highlights a group; taking it needs an explicit confirm. */}
          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button
              className="btn"
              disabled={selectedGroup === null}
              onClick={() => selectedGroup !== null && onSelectGroup(selectedGroup)}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Discard phase
  const discardableHand = hand.filter(c => canDiscard(c, hand))

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)' }}>
        <h2>Discard {groupSize} Card{groupSize > 1 ? 's' : ''}</h2>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>
          Select {groupSize} card{groupSize > 1 ? 's' : ''} to discard (Kings and Trula cannot be discarded).
        </p>
        <div className="discard-hand" style={{ overflowY: 'auto', flex: 1 }}>
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
        <div className="modal-actions" style={{ flexShrink: 0 }}>
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
