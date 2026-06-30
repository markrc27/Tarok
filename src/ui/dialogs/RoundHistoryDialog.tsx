import React from 'react'
import type { RoundRecord, Seat } from '../../engine/types'
import { CONTRACT_LABEL } from '../labels'

interface Props {
  roundHistory: RoundRecord[]
  playerNames: Record<Seat, string>
  onClose: () => void
}

const SEATS: Seat[] = [0, 1, 2, 3]

export default function RoundHistoryDialog({ roundHistory, playerNames, onClose }: Props) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 30,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1a1a1a',
      border: '1px solid #444',
      borderRadius: 6,
      padding: '14px 20px 12px',
      zIndex: 200,
      boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
      minWidth: 560,
      maxWidth: 720,
    }}>
      {roundHistory.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '8px 0' }}>No completed rounds yet.</p>
      ) : (
        <div style={{ maxHeight: 170, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
              <th style={{ ...th, position: 'sticky', top: 0, background: '#1a1a1a' }}>#</th>
              <th style={{ ...th, position: 'sticky', top: 0, background: '#1a1a1a' }}>Contract</th>
              <th style={{ ...th, position: 'sticky', top: 0, background: '#1a1a1a' }}>Declarer</th>
              {SEATS.map(s => (
                <th key={s} style={{ ...th, color: '#ccc', position: 'sticky', top: 0, background: '#1a1a1a' }}>{playerNames[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roundHistory.map((r, i) => {
              const isKlop = r.contract === 'klop'
              const maxDelta = Math.max(...SEATS.map(s => r.scoreDelta[s]))
              return (
                <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                  <td style={td}>{r.roundNumber}</td>
                  <td style={td}>{CONTRACT_LABEL[r.contract]}</td>
                  <td style={td}>{isKlop ? '—' : playerNames[r.declarer]}</td>
                  {SEATS.map(s => {
                    const d = r.scoreDelta[s]
                    const isWinner = d === maxDelta && d > 0
                    return (
                      <td key={s} style={{
                        ...td,
                        color: d > 0 ? '#4f4' : d < 0 ? '#f66' : '#888',
                        fontWeight: isWinner ? 'bold' : undefined,
                      }}>
                        {d > 0 ? `+${d}` : d}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}

      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontWeight: 'normal',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const td: React.CSSProperties = {
  padding: '7px 10px',
  color: '#ccc',
}
