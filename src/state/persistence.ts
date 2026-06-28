import type { GameRecord } from '../engine/types'

const HISTORY_KEY = 'tarok-game-history'
const DRAFT_KEY = 'tarok-game-draft'
const MAX_RECORDS = 100

export function loadGameHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as GameRecord[]) : []
  } catch { return [] }
}

export function saveGameRecord(record: GameRecord): void {
  const history = loadGameHistory()
  history.unshift(record)
  if (history.length > MAX_RECORDS) history.splice(MAX_RECORDS)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) } catch {}
}

export function saveDraftRecord(record: GameRecord): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(record)) } catch {}
}

export function consumeDraftRecord(): GameRecord | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    localStorage.removeItem(DRAFT_KEY)
    return JSON.parse(raw) as GameRecord
  } catch { return null }
}

export function mergeGameHistory(incoming: GameRecord[]): void {
  const existing = loadGameHistory()
  const byId = new Map(existing.map(r => [r.id, r]))
  for (const r of incoming) byId.set(r.id, r)
  const merged = [...byId.values()].sort((a, b) => b.playedAt - a.playedAt)
  if (merged.length > MAX_RECORDS) merged.splice(MAX_RECORDS)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(merged)) } catch {}
}
