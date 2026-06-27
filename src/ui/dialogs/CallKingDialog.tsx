import React from 'react'
import type { Suit } from '../../engine/types'

interface Props {
  onCall: (suit: Suit) => void
}

const SUITS: { suit: Suit; symbol: string; label: string }[] = [
  { suit: 'clubs',    symbol: '♣', label: 'Clubs' },
  { suit: 'spades',   symbol: '♠', label: 'Spades' },
  { suit: 'hearts',   symbol: '♥', label: 'Hearts' },
  { suit: 'diamonds', symbol: '♦', label: 'Diamonds' },
]

export default function CallKingDialog({ onCall }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Call a King</h2>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 10 }}>
          The holder of the called King becomes your secret partner.
        </p>
        <div className="suit-buttons">
          {SUITS.map(({ suit, symbol, label }) => (
            <button
              key={suit}
              className={`suit-btn ${suit}`}
              title={label}
              onClick={() => onCall(suit)}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
