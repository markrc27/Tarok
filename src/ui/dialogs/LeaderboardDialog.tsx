import React, { useEffect, useState } from 'react'

interface LeaderboardRow {
  id: string
  played_at: number
  player_name: string
  final_score: number
  rounds: number
  difficulty: string
}

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

  useEffect(() => {
    fetch('/api/games')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: LeaderboardRow[]) => setRows(data))
      .catch(() => setError(true))
  }, [])

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 520, maxWidth: 700 }}>
        <h2>Leaderboard</h2>

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
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="score-table">
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e' }}>
                <tr>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  <th>Score</th>
                  <th>Rounds</th>
                  <th>Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.played_at)}</td>
                    <td>{row.player_name}</td>
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
