import React from 'react'
import type { HandScore, Seat } from '../../engine/types'

interface Props {
  history: HandScore[]
  playerNames: Record<Seat, string>
  sessionScores: Record<Seat, number>
  onClose: () => void
}

export default function StatisticsDialog({ history, playerNames, sessionScores, onClose }: Props) {
  const seats: Seat[] = [0, 1, 2, 3]

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 500, maxHeight: '80vh', overflow: 'auto' }}>
        <h2>Statistics</h2>
        <table className="score-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Contract</th>
              {seats.map(s => <th key={s}>{playerNames[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{h.contract}</td>
                {seats.map(s => (
                  <td key={s}>
                    {s === h.declarer
                      ? h.declarerScore
                      : h.partner !== null && s === h.partner
                        ? (h.partnerScore ?? h.declarerScore)
                        : h.opponentScores[s] !== undefined
                          ? h.opponentScores[s]
                          : '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ fontWeight: 'bold', background: '#333' }}>
              <td colSpan={2}>Total</td>
              {seats.map(s => <td key={s}>{sessionScores[s]}</td>)}
            </tr>
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
