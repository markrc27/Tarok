import React, { useState } from 'react'
import type { BonusName, Seat, Card, Contract, AnnouncementState, TalonExchange, KingCall } from '../../engine/types'
import { canAnnounce } from '../../engine/announce'
import { cardId } from '../../engine/deck'
import CardSprite from '../CardSprite'

const SUIT_NAME: Record<string, string> = { clubs: 'Clubs', spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds' }

const BONUS_LABELS: Record<BonusName, string> = {
  trula: 'Trula: Škis + Mond + Pagat (10/20)',
  kings: 'Kings: all 4 kings (10/20)',
  valat: 'Valat: win every trick (250/500)',
  'king-ultimo': 'King Ultimo: called king wins last trick (10/20)',
  'pagat-ultimo': 'Pagat Ultimo: Pagat wins last trick (25/50)',
}

const BONUS_SHORT: Record<BonusName, string> = {
  trula: 'Trula',
  kings: 'Kings',
  valat: 'Valat',
  'king-ultimo': 'King Ultimo',
  'pagat-ultimo': 'Pagat Ultimo',
}

const DECLARER_SIDE_BONUSES: BonusName[] = ['trula', 'kings', 'valat', 'king-ultimo', 'pagat-ultimo']

interface Props {
  contract: Contract
  declarer: Seat
  partner: Seat | null
  hands: Record<Seat, Card[]>
  announcementState?: AnnouncementState
  kingCall?: KingCall | null
  talonExchange?: TalonExchange | null
  playerNames?: Record<Seat, string>
  onFinish: (bonuses: BonusName[], kontraGame: boolean) => void
}

export default function AnnouncementsDialog({ contract, declarer, partner, hands, announcementState, kingCall, talonExchange, playerNames, onFinish }: Props) {
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

  // UI-018: the called suit is public knowledge the moment it's named — only
  // the partner's identity stays secret (tracked separately via computeKnownPartner).
  // UI-019: per pagat.com the talon is "exposed" in sets when the declarer takes
  // one — visible to everyone at the table, not just the declarer. Rendered as
  // its own floating panel (not inside .announce-panel) so it doesn't force the
  // panel to scroll, with smaller scoped cards so every group fits at once.
  const declarerName = playerNames?.[declarer] ?? 'Declarer'

  return (
    <div className="announce-layout">
      {talonExchange && talonExchange.groups.length > 0 && (
        <div className="talon-reveal" style={{ '--card-w': '46px', '--card-h': '69px' } as React.CSSProperties}>
          <p style={{ color: '#fff', fontSize: 14, margin: 0 }}>
            <strong>Talon</strong> — {declarerName} took the highlighted group:
          </p>
          <div className="talon-groups">
            {talonExchange.groups.map((group, i) => (
              <div key={i} className={`talon-group readonly ${talonExchange.selectedGroup === i ? 'selected' : ''}`}>
                {group.map(c => (
                  <CardSprite key={cardId(c)} card={c} faceUp />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="announce-panel">
        <h2>Announcements</h2>

        {kingCall && (
          <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 8px' }}>
            Called King: <strong style={{ color: '#f0f0f0' }}>{SUIT_NAME[kingCall.calledKing.suit] ?? kingCall.calledKing.suit}</strong>
          </p>
        )}

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
              <button className="btn" onClick={() => onFinish([...checked], false)}>Confirm</button>
            </div>
          </>
        ) : canKontra ? (
          <>
            <p style={{ color: '#aaa', fontSize: 12, margin: '6px 0 8px' }}>You are an opponent.</p>
            {announcementState && announcementState.announcements.length > 0 && (
              <div style={{ background: '#1a1a1a', borderRadius: 4, padding: '6px 10px', marginBottom: 10, fontSize: 12 }}>
                <div style={{ color: '#888', marginBottom: 4 }}>Declarer announced:</div>
                {announcementState.announcements.map((ann, i) => (
                  <div key={i} style={{ color: '#f0c040' }}>
                    {BONUS_SHORT[ann.bonus]}{ann.announced ? '' : ' (unannounced)'}
                  </div>
                ))}
              </div>
            )}
            {announcementState && announcementState.announcements.length === 0 && (
              <p style={{ color: '#555', fontSize: 11, margin: '0 0 8px' }}>No bonuses announced by declarer.</p>
            )}
            <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: 16 }}>Kontra</p>
            <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 14px' }}>This doubles the point value for the round.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => onFinish([], false)}>Pass</button>
              <button className="btn" onClick={() => onFinish([], true)}>Call</button>
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
    </div>
  )
}
