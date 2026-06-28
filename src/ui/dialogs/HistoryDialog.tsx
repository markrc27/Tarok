import React, { useState } from 'react'
import type { GameRecord, Seat } from '../../engine/types'
import { loadGameHistory } from '../../state/persistence'

interface Props {
  onClose: () => void
}

type SortKey = 'newest' | 'oldest' | Seat

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(ts))
}

function winnerSeat(record: GameRecord): Seat {
  const seats: Seat[] = [0, 1, 2, 3]
  return seats.reduce((best, s) => record.finalScores[s] > record.finalScores[best] ? s : best, 0 as Seat)
}

export default function HistoryDialog({ onClose }: Props) {
  const [history] = useState<GameRecord[]>(() => loadGameHistory())
  const [sortBy, setSortBy] = useState<SortKey>('newest')

  const sorted = [...history].sort((a, b) => {
    if (sortBy === 'newest') return b.playedAt - a.playedAt
    if (sortBy === 'oldest') return a.playedAt - b.playedAt
    return b.finalScores[sortBy] - a.finalScores[sortBy]
  })

  const toggleDateSort = () => setSortBy(s => s === 'newest' ? 'oldest' : 'newest')
  const sortBySeat = (seat: Seat) => setSortBy(seat)

  const dateSortLabel = sortBy === 'oldest' ? 'Date ↑' : 'Date ↓'

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 640, maxWidth: 800, maxHeight: '80vh', overflow: 'auto' }}>
        <h2>Game History</h2>

        {sorted.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>No completed games yet.</p>
        ) : (
          <table className="score-table">
            <thead>
              <tr>
                <th>
                  <button
                    onClick={toggleDateSort}
                    style={{ background: 'none', border: 'none', color: (sortBy === 'newest' || sortBy === 'oldest') ? '#f0f0f0' : '#888', cursor: 'pointer', fontWeight: 'bold', fontSize: 'inherit', padding: 0 }}
                  >
                    {dateSortLabel}
                  </button>
                </th>
                <th>Rounds</th>
                {([0, 1, 2, 3] as Seat[]).map(seat => {
                  const names = new Set(sorted.map(r => r.playerNames[seat]))
                  const label = names.size === 1 ? [...names][0] : (seat === 0 ? 'You' : `P${seat + 1}`)
                  return (
                    <th key={seat}>
                      <button
                        onClick={() => sortBySeat(seat)}
                        style={{ background: 'none', border: 'none', color: sortBy === seat ? '#f0f0f0' : '#888', cursor: 'pointer', fontWeight: 'bold', fontSize: 'inherit', padding: 0 }}
                      >
                        {label}{sortBy === seat ? ' ↓' : ''}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map(record => {
                const winner = winnerSeat(record)
                return (
                  <tr key={record.id}>
                    <td style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(record.playedAt)}</td>
                    <td style={{ textAlign: 'center' }}>{record.rounds}</td>
                    {([0, 1, 2, 3] as Seat[]).map(seat => (
                      <td key={seat} style={{
                        color: seat === winner ? '#f0c040' : record.finalScores[seat] >= 0 ? '#4f4' : '#f44',
                        fontWeight: seat === winner ? 'bold' : undefined,
                      }}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 1 }}>{record.playerNames[seat]}</div>
                        <div>{record.finalScores[seat] >= 0 ? '+' : ''}{record.finalScores[seat]}</div>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
