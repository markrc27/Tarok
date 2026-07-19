import type { GameRecord } from '../engine/types'

const IS_ELECTRON = typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent)

const HISTORY_KEY = 'tarok-game-history'
const DRAFT_KEY = 'tarok-game-draft'
const OPFS_FILE = 'tarok-history.json'
const MAX_RECORDS = 100

// ── localStorage (sync, primary read path) ─────────────────────────────────

export function loadGameHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as GameRecord[]) : []
  } catch { return [] }
}

function writeHistory(records: GameRecord[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(records)) } catch {}
}

export function saveGameRecord(record: GameRecord): void {
  const history = loadGameHistory()
  history.unshift(record)
  if (history.length > MAX_RECORDS) history.splice(MAX_RECORDS)
  writeHistory(history)
  opfsSave(history).catch(() => {})
}

export function mergeGameHistory(incoming: GameRecord[]): void {
  const existing = loadGameHistory()
  const byId = new Map(existing.map(r => [r.id, r]))
  for (const r of incoming) byId.set(r.id, r)
  const merged = [...byId.values()].sort((a, b) => b.playedAt - a.playedAt)
  if (merged.length > MAX_RECORDS) merged.splice(MAX_RECORDS)
  writeHistory(merged)
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

// ── OPFS (async, auto-backup to a real browser-managed file) ───────────────

async function opfsHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getFileHandle(OPFS_FILE, { create: true })
  } catch { return null }
}

async function opfsSave(records: GameRecord[]): Promise<void> {
  const handle = await opfsHandle()
  if (!handle) return
  try {
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(records))
    await writable.close()
  } catch {}
}

// Fire-and-forget: posts seat-0's result to the Cloudflare backend. Skipped in Electron.
export function postGameToApi(record: GameRecord, playerName: string, finalScore: number): void {
  if (IS_ELECTRON) return
  fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: record.id,
      playedAt: record.playedAt,
      playerName,
      finalScore,
      rounds: record.rounds,
      difficulty: record.difficulty ?? 'easy',
    }),
  }).catch(() => {})
}

// Called once on app startup. Reads the OPFS file and merges into localStorage.
export async function opfsLoad(): Promise<void> {
  const handle = await opfsHandle()
  if (!handle) return
  try {
    const file = await handle.getFile()
    const text = await file.text()
    if (!text) return
    const records = JSON.parse(text) as GameRecord[]
    if (!Array.isArray(records) || records.length === 0) return
    mergeGameHistory(records)
  } catch {}
}
