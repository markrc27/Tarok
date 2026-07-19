// Cloudflare Worker entry point — handles /api/games, falls through to static assets

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<{ success: boolean }>
  all<T>(): Promise<{ results: T[] }>
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement
}
interface Env {
  DB: D1Database
  ASSETS: { fetch(req: Request | string): Promise<Response> }
}

interface GameRow {
  id: string
  played_at: number
  player_name: string
  final_score: number
  rounds: number
  difficulty: string
}

interface PostBody {
  id: string
  playedAt: number
  playerName: string
  finalScore: number
  rounds: number
  difficulty: 'easy' | 'hard'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validate(body: unknown): body is PostBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  const now = Date.now()
  return (
    typeof b.id === 'string' && UUID_RE.test(b.id) &&
    typeof b.playedAt === 'number' && b.playedAt > 0 && b.playedAt <= now + 60_000 &&
    typeof b.playerName === 'string' && b.playerName.length >= 1 && b.playerName.length <= 50 &&
    typeof b.finalScore === 'number' && Number.isInteger(b.finalScore) && Math.abs(b.finalScore) <= 100_000 &&
    typeof b.rounds === 'number' && Number.isInteger(b.rounds) && b.rounds >= 1 && b.rounds <= 500 &&
    (b.difficulty === 'easy' || b.difficulty === 'hard')
  )
}

async function handleGet(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, played_at, player_name, final_score, rounds, difficulty
     FROM games ORDER BY played_at DESC LIMIT 100`
  ).all<GameRow>()
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } })
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  const len = Number(request.headers.get('Content-Length') ?? '0')
  if (len > 2_000) return new Response('Payload too large', { status: 413 })

  let body: unknown
  try { body = await request.json() } catch { return new Response('Bad JSON', { status: 400 }) }

  if (!validate(body)) return new Response('Invalid data', { status: 422 })

  await env.DB.prepare(
    `INSERT OR IGNORE INTO games (id, played_at, player_name, final_score, rounds, difficulty)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(body.id, body.playedAt, body.playerName, body.finalScore, body.rounds, body.difficulty).run()

  return new Response(null, { status: 201 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/games') {
      if (request.method === 'GET') return handleGet(env)
      if (request.method === 'POST') return handlePost(request, env)
      return new Response('Method Not Allowed', { status: 405 })
    }

    return env.ASSETS.fetch(request)
  },
}
