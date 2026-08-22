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
  currentDifficulty: 'easy' | 'hard'
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(ts))
}

export default function LeaderboardDialog({ onClose, currentDifficulty }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('final_score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [activeTab, setActiveTab] = useState<'easy' | 'hard'>(currentDifficulty)

  useEffect(() => {
    setRows(null)
    setError(false)
    fetch(`/api/games?view=leaderboard&difficulty=${activeTab}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: LeaderboardRow[]) => setRows(data))
      .catch(() => setError(true))
  }, [activeTab])

  const filtered = rows ?? []

  const sorted = [...filtered].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortDir === 'desc' ? -diff : diff
  })

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

  const tabStyle = (tab: 'easy' | 'hard'): React.CSSProperties => ({
    background: activeTab === tab ? '#0078d4' : '#2a2a2a',
    border: '1px solid ' + (activeTab === tab ? '#0078d4' : '#444'),
    color: activeTab === tab ? '#fff' : '#aaa',
    cursor: 'pointer', fontSize: 12, padding: '4px 16px',
    borderRadius: tab === 'easy' ? '4px 0 0 4px' : '0 4px 4px 0',
  })

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 480, maxWidth: 640 }}>
        <h2>Leaderboard — Top 10</h2>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <button style={tabStyle('easy')} onClick={() => setActiveTab('easy')}>Easy</button>
          <button style={tabStyle('hard')} onClick={() => setActiveTab('hard')}>Hard</button>
        </div>

        {error && (
          <p style={{ color: '#f88', textAlign: 'center', margin: '24px 0' }}>
            Could not load leaderboard.
          </p>
        )}

        {!error && rows === null && (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>Loading…</p>
        )}

        {!error && rows !== null && sorted.length === 0 && (
          <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>No {activeTab} games recorded yet.</p>
        )}

        {!error && rows !== null && sorted.length > 0 && (
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
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id}>
                    <td style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.played_at)}</td>
                    <td>
                      {sortKey === 'final_score' && sortDir === 'desc' && i === 0 && (
                        <span style={{ fontSize: 11, marginRight: 4 }}>🥇</span>
                      )}
                      {sortKey === 'final_score' && sortDir === 'desc' && i === 1 && (
                        <span style={{ fontSize: 11, marginRight: 4 }}>🥈</span>
                      )}
                      {sortKey === 'final_score' && sortDir === 'desc' && i === 2 && (
                        <span style={{ fontSize: 11, marginRight: 4 }}>🥉</span>
                      )}
                      {row.player_name}
                    </td>
                    <td style={{ color: row.final_score >= 0 ? '#4f4' : '#f44', fontWeight: 'bold', textAlign: 'center' }}>
                      {row.final_score >= 0 ? '+' : ''}{row.final_score}
                    </td>
                    <td style={{ textAlign: 'center' }}>{row.rounds}</td>
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
