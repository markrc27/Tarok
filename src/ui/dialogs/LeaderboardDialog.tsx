import React, { useEffect, useState } from 'react'

interface LeaderboardRow {
  id: string
  played_at: number
  player_name: string
  final_score: number
  rounds: number
  difficulty: string
}

type SortKey = 'final_score' | 'rounds' | 'played_at'

interface Props {
  onClose: () => void
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(ts))
}

export default function LeaderboardDialog({ onClose }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('final_score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/games?view=leaderboard')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: LeaderboardRow[]) => setRows(data))
      .catch(() => setError(true))
  }, [])

  const sorted = rows ? [...rows].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortDir === 'desc' ? -diff : diff
  }) : []

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
  const colStyle = (key: SortKey): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold',
    fontSize: 'inherit', padding: 0,
    color: sortKey === key ? '#f0f0f0' : '#888',
  })

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 480, maxWidth: 640 }}>
        <h2>Leaderboard — Top 10</h2>

        {error && (
          <p style={{ color: '#f88', textAlign: 'center', margin: '24px 0' }}>
            Could not load leaderboard.
          </p>
        )}

        {!error && rows === null && (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>Loading…</p>
        )}

        {!error && rows !== null && rows.length === 0 && (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>No games recorded yet.</p>
        )}

        {!error && rows !== null && rows.length > 0 && (
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table className="score-table">
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e' }}>
                <tr>
                  <th style={{ textAlign: 'left' }}>
                    <button style={colStyle('played_at')} onClick={() => handleSort('played_at')}>
                      Date{arrow('played_at')}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  <th>
                    <button style={colStyle('final_score')} onClick={() => handleSort('final_score')}>
                      Score{arrow('final_score')}
                    </button>
                  </th>
                  <th>
                    <button style={colStyle('rounds')} onClick={() => handleSort('rounds')}>
                      Rounds{arrow('rounds')}
                    </button>
                  </th>
                  <th>Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id}>
                    <td style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.played_at)}</td>
                    <td>
                      {i === 0 && sortKey === 'final_score' && sortDir === 'desc' && (
                        <span style={{ fontSize: 11, marginRight: 4 }}>🥇</span>
                      )}
                      {row.player_name}
                    </td>
                    <td style={{ color: row.final_score >= 0 ? '#4f4' : '#f44', fontWeight: 'bold', textAlign: 'center' }}>
                      {row.final_score >= 0 ? '+' : ''}{row.final_score}
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
