import React, { useState } from 'react'
import type { Contract, BidAction } from '../../engine/types'
import { CONTRACT_BASE } from '../../engine/types'
import { CONTRACT_LABEL, CONTRACT_DESC } from '../labels'

interface Props {
  legalBids: Contract[]
  onBid: (action: BidAction) => void
  isForehandChoice?: boolean
  currentHighBid?: Contract | null
  currentHighBidderName?: string | null
}

export default function BiddingDialog({ legalBids, onBid, isForehandChoice, currentHighBid, currentHighBidderName }: Props) {
  const [selected, setSelected] = useState<Contract | null>(legalBids[0] ?? null)
  const [infoFor, setInfoFor] = useState<Contract | null>(null)

  const toggleInfo = (c: Contract, e: React.MouseEvent) => {
    e.preventDefault()
    setInfoFor(prev => prev === c ? null : c)
  }

  return (
    <div className="bid-panel">
      <h2>{isForehandChoice ? 'Your Choice (Forehand)' : 'Bidding'}</h2>

      {isForehandChoice && (
        <p style={{ marginBottom: 10, color: '#aaa', fontSize: 12 }}>
          All others passed — choose your contract:
        </p>
      )}
      {!isForehandChoice && currentHighBid && (
        <p style={{ marginBottom: 10, color: '#aaa', fontSize: 12 }}>
          Current bid: <strong style={{ color: '#f0f0f0' }}>{CONTRACT_LABEL[currentHighBid]}</strong>
          {currentHighBidderName ? ` by ${currentHighBidderName}` : ''} — you must bid higher or pass.
        </p>
      )}
      {!isForehandChoice && !currentHighBid && (
        <p style={{ marginBottom: 10, color: '#aaa', fontSize: 12 }}>
          No bids yet — you may bid any contract or pass.
        </p>
      )}

      <div className="bid-list">
        {legalBids.map(c => (
          <React.Fragment key={c}>
            <label className="bid-option">
              <input
                type="radio"
                name="contract"
                checked={selected === c}
                onChange={() => setSelected(c)}
              />
              <span>{CONTRACT_LABEL[c]}</span>
              <span style={{ color: '#888', fontSize: 11 }}>
                {CONTRACT_BASE[c] > 0 ? ` — base ${CONTRACT_BASE[c]}` : ''}
              </span>
              <button
                className="info-btn"
                onClick={(e) => toggleInfo(c, e)}
                title="What is this contract?"
              >
                ?
              </button>
            </label>
            {infoFor === c && (
              <div className="contract-desc">
                {CONTRACT_DESC[c]}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="modal-actions">
        {!isForehandChoice && (
          <button className="btn btn-ghost" onClick={() => onBid({ kind: 'pass' })}>
            Pass
          </button>
        )}
        <button
          className="btn"
          disabled={!selected}
          onClick={() => selected && onBid({ kind: 'bid', contract: selected })}
        >
          {isForehandChoice ? 'Choose' : 'Bid'}
        </button>
      </div>
    </div>
  )
}
