import React, { useState, useEffect } from 'react'
import type { GameRecord, Seat } from '../../engine/types'
import { loadGameHistory, IS_ELECTRON } from '../../state/persistence'

interface Props {
  onClose: () => void
}

// Unified row shape used for both web (D1) and Electron (localStorage) display
interface HistoryRow {
  id: string
  playedAt: number
  playerName: string
  finalScore: number
  rounds: number
  difficulty: string
}

type SortKey = 'playedAt' | 'finalScore'

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(ts))
}

// ── Electron view: full 4-player breakdown from localStorage ───────────────

type ElectronSortKey = 'newest' | 'oldest' | Seat

function winnerSeat(record: GameRecord): Seat {
  const seats: Seat[] = [0, 1, 2, 3]
  return seats.reduce((best, s) => record.finalScores[s] > record.finalScores[best] ? s : best, 0 as Seat)
}

function ElectronHistory({ onClose }: Props) {
  const [history] = useState<GameRecord[]>(() => loadGameHistory())
  const [sortBy, setSortBy] = useState<ElectronSortKey>('newest')

  const sorted = [...history].sort((a, b) => {
    if (sortBy === 'newest') return b.playedAt - a.playedAt
    if (sortBy === 'oldest') return a.playedAt - b.playedAt
    return b.finalScores[sortBy] - a.finalScores[sortBy]
  })

  const toggleDateSort = () => setSortBy(s => s === 'newest' ? 'oldest' : 'newest')
  const dateSortLabel = sortBy === 'oldest' ? 'Date ↑' : 'Date ↓'

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 640, maxWidth: 800 }}>
        <h2>Game History</h2>
        {sorted.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>No completed games yet.</p>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="score-table">
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e' }}>
                <tr>
                  <th>
                    <button onClick={toggleDateSort} style={{ background: 'none', border: 'none', color: (sortBy === 'newest' || sortBy === 'oldest') ? '#f0f0f0' : '#888', cursor: 'pointer', fontWeight: 'bold', fontSize: 'inherit', padding: 0 }}>
                      {dateSortLabel}
                    </button>
                  </th>
                  <th>Rounds</th>
                  <th>Difficulty</th>
                  {([0, 1, 2, 3] as Seat[]).map(seat => (
                    <th key={seat}>
                      <button onClick={() => setSortBy(seat)} style={{ background: 'none', border: 'none', color: sortBy === seat ? '#f0f0f0' : '#888', cursor: 'pointer', fontWeight: 'bold', fontSize: 'inherit', padding: 0 }}>
                        {`P${seat + 1}`}{sortBy === seat ? ' ↓' : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(record => {
                  const winner = winnerSeat(record)
                  return (
                    <tr key={record.id}>
                      <td style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(record.playedAt)}</td>
                      <td style={{ textAlign: 'center' }}>{record.rounds}</td>
                      <td style={{ textAlign: 'center' }}>
                        {record.difficulty === 'hard'
                          ? <span style={{ color: '#f0c040', fontSize: 11, fontWeight: 'bold' }}>Hard</span>
                          : <span style={{ color: '#888', fontSize: 11 }}>Easy</span>}
                      </td>
                      {([0, 1, 2, 3] as Seat[]).map(seat => (
                        <td key={seat} style={{ color: seat === winner ? '#f0c040' : record.finalScores[seat] >= 0 ? '#4f4' : '#f44', fontWeight: seat === winner ? 'bold' : undefined }}>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 1 }}>{record.playerNames[seat]}</div>
                          <div>{record.finalScores[seat] >= 0 ? '+' : ''}{record.finalScores[seat]}</div>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Web view: global history from D1 ──────────────────────────────────────

function WebHistory({ onClose }: Props) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('playedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/games?view=history')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: { id: string; played_at: number; player_name: string; final_score: number; rounds: number; difficulty: string }[]) => {
        setRows(data.map(r => ({
          id: r.id,
          playedAt: r.played_at,
          playerName: r.player_name,
          finalScore: r.final_score,
          rounds: r.rounds,
          difficulty: r.difficulty,
        })))
      })
      .catch(() => setError(true))
  }, [])

  const sorted = rows ? [...rows].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortDir === 'desc' ? -diff : diff
  }) : []

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
  const colBtn = (key: SortKey): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold',
    fontSize: 'inherit', padding: 0, color: sortKey === key ? '#f0f0f0' : '#888',
  })

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 480, maxWidth: 680 }}>
        <h2>Game History</h2>

        {error && (
          <p style={{ color: '#f88', textAlign: 'center', margin: '24px 0' }}>Could not load history.</p>
        )}
        {!error && rows === null && (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>Loading…</p>
        )}
        {!error && rows !== null && rows.length === 0 && (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>No completed games yet.</p>
        )}
        {!error && rows !== null && rows.length > 0 && (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="score-table">
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e' }}>
                <tr>
                  <th style={{ textAlign: 'left' }}>
                    <button style={colBtn('playedAt')} onClick={() => handleSort('playedAt')}>
                      Date{arrow('playedAt')}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  <th>
                    <button style={colBtn('finalScore')} onClick={() => handleSort('finalScore')}>
                      Score{arrow('finalScore')}
                    </button>
                  </th>
                  <th>Rounds</th>
                  <th>Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => (
                  <tr key={row.id}>
                    <td style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.playedAt)}</td>
                    <td>{row.playerName}</td>
                    <td style={{ color: row.finalScore >= 0 ? '#4f4' : '#f44', fontWeight: 'bold', textAlign: 'center' }}>
                      {row.finalScore >= 0 ? '+' : ''}{row.finalScore}
                    </td>
                    <td style={{ textAlign: 'center' }}>{row.rounds}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.difficulty === 'hard'
                        ? <span style={{ color: '#f0c040', fontSize: 11, fontWeight: 'bold' }}>Hard</span>
                        : <span style={{ color: '#888', fontSize: 11 }}>Easy</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Entry point ────────────────────────────────────────────────────────────

export default function HistoryDialog({ onClose }: Props) {
  return IS_ELECTRON
    ? <ElectronHistory onClose={onClose} />
    : <WebHistory onClose={onClose} />
}
