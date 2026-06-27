import React, { useState } from 'react'
import type { BonusName, Seat, Card, Contract } from '../../engine/types'
import { canAnnounce } from '../../engine/announce'

const BONUS_LABELS: Record<BonusName, string> = {
  trula: 'Trula: Škis + Mond + Pagat (10/20)',
  kings: 'Kings: all 4 kings (10/20)',
  valat: 'Valat: win every trick (250/500)',
  'king-ultimo': 'King Ultimo: called king wins last trick (10/20)',
  'pagat-ultimo': 'Pagat Ultimo: Pagat wins last trick (25/50)',
}

const DECLARER_SIDE_BONUSES: BonusName[] = ['trula', 'kings', 'valat', 'king-ultimo', 'pagat-ultimo']

interface Props {
  contract: Contract
  declarer: Seat
  partner: Seat | null
  hands: Record<Seat, Card[]>
  onFinish: (bonuses: BonusName[], kontraGame: boolean) => void
}

export default function AnnouncementsDialog({ contract, declarer, partner, hands, onFinish }: Props) {
  const [checked, setChecked] = useState<Set<BonusName>>(new Set())

  const HUMAN = 0 as Seat
  const onDeclarerSide = HUMAN === declarer || HUMAN === partner
  const isFlatContract = ['beggar', 'open-beggar', 'solo-without', 'color-valat-without', 'valat-without'].includes(contract)

  const eligibleBonuses = onDeclarerSide && !isFlatContract
    ? DECLARER_SIDE_BONUSES.filter(b => canAnnounce(HUMAN, b, partner, hands, declarer))
    : []

  const canKontra = !onDeclarerSide

  const toggle = (b: BonusName) =>
    setChecked(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n })

  return (
    <div className="bid-panel">
      <h2>Announcements</h2>

      {onDeclarerSide ? (
        <>
          <p style={{ color: '#aaa', fontSize: 12, margin: '6px 0 4px' }}>
            You are on the declaring side — announce bonuses:
          </p>
          <p style={{ color: '#666', fontSize: 11, margin: '0 0 10px' }}>Point values: default / if announced</p>
          {eligibleBonuses.length > 0 && (
            <div className="bid-list">
              {eligibleBonuses.map(b => (
                <label key={b} className="bid-option">
                  <input type="checkbox" checked={checked.has(b)} onChange={() => toggle(b)} />
                  <span>{BONUS_LABELS[b]}</span>
                </label>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => onFinish([], false)}>Pass</button>
            <button className="btn" onClick={() => onFinish([...checked], false)}>Confirm</button>
          </div>
        </>
      ) : canKontra ? (
        <>
          <p style={{ color: '#aaa', fontSize: 12, margin: '6px 0 6px' }}>You are an opponent.</p>
          <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: 16 }}>Kontra</p>
          <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 14px' }}>This doubles the point value for the round.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => onFinish([], false)}>Pass</button>
            <button className="btn" onClick={() => onFinish([], true)}>Confirm</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: '#888', fontSize: 12, margin: '6px 0 12px' }}>No actions available.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => onFinish([], false)}>Continue</button>
          </div>
        </>
      )}
    </div>
  )
}
