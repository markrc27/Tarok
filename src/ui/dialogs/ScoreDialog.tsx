import React, { useState } from 'react'
import type { PlayState, RadliState, AnnouncementState, Seat, Card, SuitCard } from '../../engine/types'
import { CONTRACT_BASE } from '../../engine/types'
import { computeHandScore, scoreKlop, countDeclarerPoints, calcDifference, adjustCapturedForTalon, applyRadli, updateRadliAfterHand } from '../../engine/scoring'
import { countPoints } from '../../engine/pointcount'
import { bonusBaseValue, getKontraMultiplier } from '../../engine/announce'
import { CONTRACT_LABEL, BONUS_LABEL, SUIT_SYM } from '../labels'
const RANK_LABEL: Record<string, string> = { K: 'K', Q: 'Q', Kn: 'C', J: 'J' }

function kontraMultLabel(mult: number): string {
  if (mult <= 1) return ''
  const name = mult === 2 ? 'kontra' : mult === 4 ? 'rekontra' : mult === 8 ? 'subkontra' : 'mordkontra'
  return ` ${name} ×${mult}`
}

function cardText(card: Card): string {
  if (card.kind === 'trump') {
    if (card.ordinal === 22) return 'Škis'
    if (card.ordinal === 21) return 'Mond'
    if (card.ordinal === 1) return 'Pagat'
    return `T${card.ordinal}`
  }
  const s = card as SuitCard
  return `${RANK_LABEL[s.rank as string] ?? s.rank}${SUIT_SYM[s.suit]}`
}

// Group a captured pile into threes and score it the common way: each group of
// three is the sum of its cards' face values minus 2 (a leftover of 1–2 cards
// loses 1). Cards are left in capture order (roughly chronological, as they
// were won) rather than sorted — grouping order doesn't affect the total, and
// keeping the natural order makes the count traceable against the trick list.
function pileInThrees(cards: Card[]): { chunks: Card[][]; values: number[]; total: number } {
  const chunks: Card[][] = []
  for (let i = 0; i < cards.length; i += 3) chunks.push(cards.slice(i, i + 3))
  const values = chunks.map(ch => ch.reduce((sum, c) => sum + c.points, 0) - (ch.length === 3 ? 2 : 1))
  const total = values.reduce((sum, v) => sum + v, 0)
  return { chunks, values, total }
}

interface Props {
  playState: PlayState
  announcementState: AnnouncementState
  sessionScores: Record<Seat, number>
  radliState: RadliState
  playerNames: Record<Seat, string>
  roundId: number
  onNewRound: (logText: string) => void
  onEndGame: () => void
}

export default function ScoreDialog({ playState, announcementState, sessionScores, radliState, playerNames, roundId, onNewRound, onEndGame }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [showGameLog, setShowGameLog] = useState(false)
  const [showPointLog, setShowPointLog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showRadliInfo, setShowRadliInfo] = useState(false)

  const { contract, declarer, partner, capturedCards, completedTricks,
          talonRemainder, talonDiscard, mondCapturedWithSkis, mondCapturedBy, kingCall,
          kingInTalonCaptured } = playState
  const effectiveCaptured = adjustCapturedForTalon(capturedCards, talonRemainder, declarer, partner, kingInTalonCaptured)

  const seats: Seat[] = [0, 1, 2, 3]
  const isFlat = ['beggar', 'solo-without', 'open-beggar', 'color-valat-without', 'valat-without'].includes(contract)

  const delta: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  let declarerPts = 0
  let won = false
  let difference = 0
  let handScore = null as ReturnType<typeof computeHandScore> | null

  if (contract === 'klop') {
    const klopScores = scoreKlop(effectiveCaptured)
    for (const s of seats) delta[s] = klopScores[s]
  } else {
    declarerPts = countDeclarerPoints(effectiveCaptured, declarer, partner)
    const isValat = contract === 'valat-without' || contract === 'color-valat-without'
    won = (contract === 'beggar' || contract === 'open-beggar')
      ? effectiveCaptured[declarer].length === 0
      : isValat
        ? completedTricks.every(t => t.winner === declarer)
        : declarerPts >= 36
    difference = calcDifference(declarerPts)

    handScore = computeHandScore({
      contract, declarer, partner, capturedCards: effectiveCaptured, talonRemainder,
      mondCapturedWithSkis, mondPlayedBySeat: mondCapturedBy,
      announcementState, completedTricks,
      calledKing: kingCall?.calledKing ?? null,
      radliState, contractBase: CONTRACT_BASE[contract], won,
    })

    delta[declarer] = handScore.declarerScore
    if (partner !== null) {
      delta[partner] = (handScore.partnerScore ?? handScore.declarerScore) + handScore.mondPenalties[partner]
    }
    for (const s of seats) {
      if (s !== declarer && s !== partner) delta[s] = handScore.opponentScores[s]
    }
  }

  // Project radli after this hand: mirror store's acknowledgeScore logic
  const { newRadliState: afterCancel } = applyRadli(0, radliState, declarer, won)
  const projectedRadli = updateRadliAfterHand(afterCancel, contract, won)

  function buildLogLines(): string[] {
    const lines: string[] = []
    lines.push(`=== Round: ${CONTRACT_LABEL[contract]} ===`)
    if (contract !== 'klop' && handScore) {
      lines.push(`Declarer: ${playerNames[declarer]}${partner !== null ? `, Partner: ${playerNames[partner]}` : ''}`)
      const cvContract = contract === 'valat-without' || contract === 'color-valat-without'
      const beggarContract = contract === 'beggar' || contract === 'open-beggar'
      if (cvContract) {
        lines.push(`Card points: ${declarerPts} scored (need all tricks) — ${won ? 'WON HAND' : 'LOST HAND'}`)
      } else if (beggarContract) {
        lines.push(`Tricks taken: ${completedTricks.filter(t => t.winner === declarer).length} (need 0) — ${won ? 'WON HAND' : 'LOST HAND'}`)
      } else {
        lines.push(`Card points: ${declarerPts} scored (need 36, ${difference >= 0 ? '+' : ''}${difference} diff) — ${won ? 'WON HAND' : 'LOST HAND'}`)
      }
      lines.push('')
      lines.push('--- Score breakdown ---')
      const gameKontraLog = getKontraMultiplier(announcementState, 'game')
      const gameKontraStrLog = kontraMultLabel(gameKontraLog)
      if (isFlat) {
        lines.push(`Game (${CONTRACT_LABEL[contract]}): ${CONTRACT_BASE[contract]} base (flat)${gameKontraStrLog} = ${won ? '+' : '-'}${CONTRACT_BASE[contract] * gameKontraLog}`)
      } else {
        const gameNetLog = (CONTRACT_BASE[contract] + Math.abs(difference)) * gameKontraLog
        lines.push(`Game (${CONTRACT_LABEL[contract]}): ${CONTRACT_BASE[contract]} base + ${Math.abs(difference)} ${won ? 'over' : 'under'} threshold${gameKontraStrLog} = ${won ? '+' : '-'}${gameNetLog}`)
      }
      for (const b of handScore.bonusBreakdown) {
        const net = b.value * b.kontraLevel
        const kontraStr = b.announced ? kontraMultLabel(b.kontraLevel) : ''
        const tag = b.announced ? `announced${kontraStr}` : 'unannounced'
        if (b.side === 'opponent') {
          lines.push(b.achieved
            ? `${BONUS_LABEL[b.bonus] ?? b.bonus} (opponents, ${tag}): won = -${net}`
            : `${BONUS_LABEL[b.bonus] ?? b.bonus} (opponents attempted, beaten, ${tag}): +${net}`)
        } else {
          lines.push(`${BONUS_LABEL[b.bonus] ?? b.bonus} (${tag}): ${b.achieved ? 'Successful' : 'Unsuccessful'} = ${b.achieved ? '+' : '-'}${net}`)
        }
      }
      if (handScore.radliApplied) lines.push('Radli: score doubled')
      const sideScoreLog = handScore.declarerScore - handScore.mondPenalties[declarer]
      lines.push(`Declarer net: ${sideScoreLog >= 0 ? '+' : ''}${sideScoreLog}`)
      for (const s of seats) {
        if (handScore.mondPenalties[s] !== 0) {
          lines.push(`Mond lost with Škis: ${playerNames[s]} (individual) = ${handScore.mondPenalties[s]}`)
        }
      }
      if (talonDiscard.length > 0) {
        const discardPts = countPoints(talonDiscard)
        const discardCards = talonDiscard.map(cardText).join(', ')
        lines.push('')
        lines.push(`Talon discard (${discardPts} pts): ${discardCards}`)
      }
    }
    lines.push('')
    lines.push('--- Session scores after this round ---')
    for (const s of seats) {
      lines.push(`  ${playerNames[s]}: ${sessionScores[s] + delta[s] >= 0 ? '+' : ''}${sessionScores[s] + delta[s]} (this round: ${delta[s] >= 0 ? '+' : ''}${delta[s]})`)
    }
    lines.push('')
    lines.push(`--- Tricks played (${completedTricks.length}) ---`)
    completedTricks.forEach((trick, i) => {
      const ledSeat = trick.cards[0]?.seat
      const order = [ledSeat, ((ledSeat+1)%4), ((ledSeat+2)%4), ((ledSeat+3)%4)] as Seat[]
      const ordered = [...trick.cards].sort((a, b) => order.indexOf(a.seat) - order.indexOf(b.seat))
      const plays = ordered.map(({ seat, card }) => `${playerNames[seat]}:${cardText(card)}`).join('  ')
      const vitaminStr = trick.vitamin ? `  [vitamin: ${cardText(trick.vitamin)}]` : ''
      lines.push(`#${i+1}: ${plays}${vitaminStr}  -> ${playerNames[trick.winner ?? ledSeat]}`)
    })

    // Klop: per-player point summary with groups-of-3 breakdown
    if (contract === 'klop') {
      lines.push('')
      lines.push('--- Klop Point Summary (Rounded to Nearest 5) ---')
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        const cards = effectiveCaptured[seat]
        const sc = delta[seat]
        lines.push(`${playerNames[seat]}:`)
        if (cards.length === 0) {
          lines.push('  took no tricks → +70')
        } else {
          const { chunks, values, total } = pileInThrees(cards)
          chunks.forEach((ch, gi) => {
            const math = `${ch.map(c => c.points).join(' + ')} − ${ch.length === 3 ? 2 : 1} = ${values[gi]}`
            lines.push(`  [${ch.map(cardText).join('   ')}] ${math}`)
          })
          const rounded = Math.round(total / 5) * 5
          if (total > 35) {
            lines.push(`  Total: ${total} pts — exceeds 35 → −70`)
          } else if (total !== rounded) {
            lines.push(`  Total: ${total} pts → rounds to ${rounded} → ${sc}`)
          } else {
            lines.push(`  Total: ${total} pts → ${sc}`)
          }
        }
      }
    }

    // Part 2 — card points, counted the common way (whole pile in threes,
    // face values minus 2 per group). Only shown for contracts decided by
    // card points; klop is per-individual and beggar/valat are decided by
    // tricks, so the per-side point count would just mislead.
    if (contract !== 'klop' && handScore) {
      const decSide: Seat[] = partner !== null ? [declarer, partner] : [declarer]
      const decTricks = completedTricks.filter(t => t.winner === declarer || (partner !== null && t.winner === partner)).length
      const decNames = decSide.map(s => playerNames[s]).join(' + ')
      lines.push(`Tricks won — ${decNames}: ${decTricks}   others: ${completedTricks.length - decTricks}`)

      const cardPointContract = contract !== 'beggar' && contract !== 'open-beggar'
        && contract !== 'valat-without' && contract !== 'color-valat-without'
      if (cardPointContract) {
        const oppSide = seats.filter(s => !decSide.includes(s))
        lines.push('')
        lines.push('--- Card points (whole pile in threes) ---')
        for (const side of [decSide, oppSide]) {
          const cards = side.flatMap(s => effectiveCaptured[s])
          const { chunks, values, total } = pileInThrees(cards)
          lines.push(`${side.map(s => playerNames[s]).join(' + ')} — ${cards.length} cards:`)
          chunks.forEach((ch, gi) => lines.push(`  [${ch.map(cardText).join('   ')}] ${ch.map(c => c.points).join(' + ')} − ${ch.length === 3 ? 2 : 1} = ${values[gi]}`))
          lines.push(`  Total: ${total} card points`)
        }
        lines.push('Total: 70')
      }
    }
    return lines
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 420, maxWidth: 560 }}>
        <h2>Round {roundId} Result</h2>

        {contract !== 'klop' ? (
          <p style={{ color: '#aaa', margin: '6px 0 14px', fontSize: 13 }}>
            <strong style={{ color: '#f0f0f0' }}>{CONTRACT_LABEL[contract]}</strong>
            {' — '}{playerNames[declarer]} declared
            {partner !== null ? `, ${playerNames[partner]} partnered` : ''}
            {(contract === 'valat-without' || contract === 'color-valat-without')
              ? <>{' — '}{declarerPts} card pts — {won ? 'all tricks won' : 'missed a trick'}</>
              : (contract === 'beggar' || contract === 'open-beggar')
                ? null
                : <>{' — '}{declarerPts} card pts ({Math.abs(declarerPts - 35)} {won ? 'over' : 'under'} 35)</>
            }
            {' — '}
            <strong style={{ color: won ? '#4f4' : '#f44' }}>{won ? 'Won hand' : 'Lost hand'}</strong>
          </p>
        ) : (
          <p style={{ color: '#aaa', margin: '6px 0 14px', fontSize: 13 }}>
            <strong style={{ color: '#f0f0f0' }}>Klop</strong> — individual scoring
          </p>
        )}

        {contract !== 'klop' && !isFlat && (
          <p style={{ color: '#aaa', margin: '-10px 0 14px', fontSize: 12 }}>
            {declarerPts} pts → rounds to {Math.round(declarerPts / 5) * 5} (nearest 5) → {Math.abs(Math.round(declarerPts / 5) * 5 - 35)} {won ? 'over' : 'under'} the 35 threshold
          </p>
        )}

        {/* Score breakdown — above the per-player table so the hand reads
            top-to-bottom as "how the points were earned/won" → "each player's
            resulting score". */}
        {handScore && contract !== 'klop' && (
          <div style={{ margin: '4px 0 12px', padding: '8px 10px', background: '#1a1a1a', borderRadius: 4, fontSize: 12, color: '#ccc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#aaa', fontWeight: 'bold' }}>Score breakdown</span>
              <span style={{ color: '#555', fontSize: 11 }}>default / announced</span>
            </div>
            {(() => {
              const gk = getKontraMultiplier(announcementState, 'game')
              const gkStr = kontraMultLabel(gk)
              if (isFlat) {
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Game ({CONTRACT_LABEL[contract]}): {CONTRACT_BASE[contract]} base (flat){gkStr}</span>
                    <span style={{ color: '#f0f0f0' }}>{won ? '+' : '−'}{CONTRACT_BASE[contract] * gk}</span>
                  </div>
                )
              }
              const gameNet = (CONTRACT_BASE[contract] + Math.abs(difference)) * gk
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Game ({CONTRACT_LABEL[contract]}): {CONTRACT_BASE[contract]} base + {Math.abs(difference)} {won ? 'over' : 'under'} threshold{gkStr}</span>
                  <span style={{ color: '#f0f0f0' }}>{won ? '+' : '−'}{gameNet}</span>
                </div>
              )
            })()}
            {handScore.bonusBreakdown.map((b, i) => {
              const net = b.value * b.kontraLevel
              const label = BONUS_LABEL[b.bonus] ?? b.bonus
              const kontraStr = kontraMultLabel(b.kontraLevel)
              const tag = b.announced ? `announced${kontraStr}` : 'unannounced'
              if (b.side === 'opponent') {
                // Opponents won the bonus → subtracted from the declarer's side.
                // Opponents attempted it and were beaten → added to the declarer's side.
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{label} (opponents, {tag}): {b.achieved ? '✓ won' : '✗ beaten'}</span>
                    <span style={{ color: b.achieved ? '#f44' : '#4f4' }}>{b.achieved ? '−' : '+'}{net}</span>
                  </div>
                )
              }
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{label} ({tag}): {b.achieved ? '✓' : '✗'}</span>
                  <span style={{ color: b.achieved ? '#4f4' : '#f44' }}>
                    {b.achieved ? '+' : '−'}{net}
                  </span>
                </div>
              )
            })}
            {handScore.radliApplied && (
              <div style={{ color: '#f0c040' }}>Radli: score doubled</div>
            )}
            {(() => {
              const sideScore = handScore.declarerScore - handScore.mondPenalties[declarer]
              return (
                <div style={{ borderTop: '1px solid #444', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Declarer net</span>
                  <span style={{ color: sideScore >= 0 ? '#4f4' : '#f44' }}>
                    {sideScore >= 0 ? '+' : ''}{sideScore}
                  </span>
                </div>
              )
            })()}
            {seats.filter(s => handScore.mondPenalties[s] !== 0).map(s => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa' }}>
                <span>Mond lost with Škis: {playerNames[s]} (individual)</span>
                <span style={{ color: '#f44' }}>{handScore.mondPenalties[s]}</span>
              </div>
            ))}
          </div>
        )}

        <table className="score-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>This round</th>
              <th>Session total</th>
              <th>
                Radli{' '}
                <button
                  onClick={() => setShowRadliInfo(v => !v)}
                  style={{ background: 'none', border: '1px solid #555', borderRadius: '50%', color: '#aaa', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: '1px 4px', verticalAlign: 'middle' }}
                >ℹ</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {seats.map(seat => (
              <tr key={seat} style={seat === 0 ? { fontWeight: 'bold' } : {}}>
                <td>{playerNames[seat]}</td>
                <td style={{ fontSize: 11, color: '#aaa' }}>
                  {contract === 'klop' ? '—'
                    : seat === declarer ? 'Declarer'
                    : seat === partner  ? 'Partner'
                    : 'Opponent'}
                </td>
                <td style={{ color: delta[seat] > 0 ? '#4f4' : delta[seat] < 0 ? '#f44' : undefined }}>
                  {delta[seat] >= 0 ? '+' : ''}{delta[seat]}
                </td>
                <td>{sessionScores[seat] + delta[seat] >= 0 ? '+' : ''}{sessionScores[seat] + delta[seat]}</td>
                <td>{projectedRadli.uncancelled[seat] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Radli info popup */}
        {showRadliInfo && (
          <div style={{ margin: '8px 0', padding: '10px 12px', background: '#1a1a1a', borderRadius: 4, fontSize: 12, color: '#ccc', lineHeight: 1.7 }}>
            <strong style={{ color: '#f0f0f0' }}>Radli</strong><br />
            All four players receive a new radlc after any hand where:<br />
            &bull; a <em>klop</em> was played<br />
            &bull; a contract of <em>Beggar</em> or higher was played<br />
            &bull; any kind of <em>valat</em> was won or lost<br />
            <br />
            When scoring, if the declarer holds outstanding radli, the declarer's score (and the partner's, if any) is <strong style={{ color: '#f0f0f0' }}>doubled</strong> and one radl is annulled — but only on a <em>win</em>. On a loss the score is still doubled but the radl is not canceled.<br />
            <br />
            Uncanceled radli at the end of the session cost <strong style={{ color: '#f0f0f0' }}>100 points each</strong>.
          </div>
        )}

        {/* Klop vitamin assignments */}
        {contract === 'klop' && completedTricks.some(t => t.vitamin) && (
          <div style={{ margin: '8px 0', padding: '8px 10px', background: '#1a1a1a', borderRadius: 4, fontSize: 12, color: '#ccc' }}>
            <div style={{ color: '#aaa', fontWeight: 'bold', marginBottom: 4 }}>Vitamins (tricks 1–6)</div>
            {completedTricks.slice(0, 6).map((t, idx) => t.vitamin ? (
              <div key={idx} style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#666', minWidth: 24 }}>#{idx + 1}:</span>
                <span style={{ color: '#f0c040', minWidth: 40 }}>{cardText(t.vitamin)}</span>
                <span style={{ color: '#666' }}>({t.vitamin.points} pt{t.vitamin.points !== 1 ? 's' : ''})</span>
                <span>→ {playerNames[t.winner ?? t.cards[0].seat]}</span>
              </div>
            ) : null)}
          </div>
        )}

        {/* Two independent logs: play record and point count */}
        <div style={{ marginTop: 12 }}>
          {/* Game log — the play record */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', flex: 1 }}
              onClick={() => setShowGameLog(v => !v)}
            >
              {showGameLog ? '▲ Hide game log' : '▼ Show game log'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => {
                navigator.clipboard.writeText(buildLogLines().join('\n'))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? '✓ Copied' : 'Copy log'}
            </button>
          </div>

          {showGameLog && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#ccc', maxHeight: 340, overflowY: 'auto' }}>

              {/* Talon discard */}
              {contract !== 'klop' && talonDiscard.length > 0 && (
                <div style={{ marginBottom: 8, padding: '8px 10px', background: '#1a1a1a', borderRadius: 4 }}>
                  <div style={{ color: '#aaa', marginBottom: 4, fontWeight: 'bold' }}>
                    Talon discard
                    <span style={{ fontWeight: 'normal', color: '#666', marginLeft: 6 }}>({countPoints(talonDiscard)} pts)</span>
                  </div>
                  <div>
                    {talonDiscard.map((card, i) => (
                      <span key={i} style={{ marginRight: 8 }}>
                        <span style={{
                          color: (card.kind === 'suit' && (card.suit === 'hearts' || card.suit === 'diamonds')) ? '#f88' : '#ddd'
                        }}>
                          {cardText(card)}
                        </span>
                        <span style={{ color: '#666', fontSize: 10, marginLeft: 2 }}>({card.points})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Trick log — play record only; no per-trick points (they group
                  each 4-card trick alone and never add up to the real total) */}
              <div style={{ padding: '8px 10px', background: '#1a1a1a', borderRadius: 4 }}>
                <div style={{ color: '#aaa', marginBottom: 4, fontWeight: 'bold' }}>
                  Tricks played ({completedTricks.length})
                </div>
                {completedTricks.map((trick, i) => {
                  const ledSeat = trick.cards[0]?.seat
                  const ordered = [...trick.cards].sort((a, b) => {
                    const order = [ledSeat, ((ledSeat+1)%4), ((ledSeat+2)%4), ((ledSeat+3)%4)]
                    return order.indexOf(a.seat) - order.indexOf(b.seat)
                  })
                  return (
                    <div key={i} style={{ marginBottom: 2, lineHeight: '1.5' }}>
                      <span style={{ color: '#666', marginRight: 4 }}>#{i + 1}</span>
                      {ordered.map(({ seat, card }, j) => (
                        <span key={j} style={{ marginRight: 6 }}>
                          <span style={{ color: '#888', fontSize: 10 }}>{playerNames[seat]}: </span>
                          <span style={{
                            color: (card.kind === 'suit' && (card.suit === 'hearts' || card.suit === 'diamonds')) ? '#f88' : '#ddd'
                          }}>
                            {cardText(card)}
                          </span>
                        </span>
                      ))}
                      {trick.vitamin && (
                        <span style={{ marginRight: 6 }}>
                          <span style={{ color: '#f0c040', fontSize: 10 }}>vitamin: </span>
                          <span style={{ color: '#f0c040' }}>{cardText(trick.vitamin)}</span>
                        </span>
                      )}
                      <span style={{ color: '#aaa' }}>→ {playerNames[trick.winner ?? ledSeat]}</span>
                    </div>
                  )
                })}
              </div>

            </div>
          )}

          {/* Score log — point count for normal contracts, klop breakdown for klop */}
          {(contract === 'klop' || !!handScore) && (
            <>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '4px 10px', width: '100%', marginTop: 8 }}
                onClick={() => setShowPointLog(v => !v)}
              >
                {contract === 'klop'
                  ? (showPointLog ? '▲ Hide score log' : '▼ Show score log')
                  : (showPointLog ? '▲ Hide point count' : '▼ Show point count')}
              </button>
              {showPointLog && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#ccc', maxHeight: 340, overflowY: 'auto' }}>
                  {contract === 'klop' ? (
                    <div style={{ padding: '8px 10px', background: '#1a1a1a', borderRadius: 4 }}>
                      <div style={{ color: '#aaa', marginBottom: 8, fontWeight: 'bold' }}>Klop Point Summary (Rounded to Nearest 5)</div>
                      {(seats as Seat[]).map(seat => {
                        const cards = effectiveCaptured[seat]
                        const sc = delta[seat]
                        if (cards.length === 0) {
                          return (
                            <div key={seat} style={{ marginBottom: 8, lineHeight: '1.6' }}>
                              <div style={{ color: '#aaa' }}>{playerNames[seat]}: took no tricks</div>
                              <div style={{ paddingLeft: 10, color: '#4f4', fontWeight: 'bold' }}>+70</div>
                            </div>
                          )
                        }
                        const { chunks, values, total } = pileInThrees(cards)
                        const rounded = Math.round(total / 5) * 5
                        const penalty70 = total > 35
                        return (
                          <div key={seat} style={{ marginBottom: 10, lineHeight: '1.6' }}>
                            <div style={{ color: '#aaa' }}>{playerNames[seat]} ({cards.length} cards):</div>
                            {chunks.map((ch, gi) => (
                              <div key={gi} style={{ color: '#bbb', paddingLeft: 10, whiteSpace: 'nowrap' }}>
                                [{ch.map((c, ci) => <span key={ci} style={{ marginRight: ci < ch.length - 1 ? '0.9em' : 0 }}>{cardText(c)}</span>)}]{' '}
                                <span style={{ color: '#888' }}>{ch.map(c => c.points).join(' + ')} − {ch.length === 3 ? 2 : 1}</span>
                                <span style={{ color: '#f0c040' }}> = {values[gi]}</span>
                              </div>
                            ))}
                            {penalty70 ? (
                              <div style={{ paddingLeft: 10, color: '#f44', fontWeight: 'bold' }}>
                                Total: {total} pts — exceeds 35 → −70
                              </div>
                            ) : (
                              <div style={{ paddingLeft: 10, fontWeight: 'bold' }}>
                                Total: <span style={{ color: '#ccc' }}>{total} pts</span>
                                {total !== rounded && <span style={{ color: '#888' }}> → rounds to {rounded}</span>}
                                <span style={{ color: '#f44' }}> → {sc}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (() => {
                const decSide: Seat[] = partner !== null ? [declarer, partner] : [declarer]
                const oppSide = seats.filter(s => !decSide.includes(s))
                const decTricks = completedTricks.filter(t => t.winner === declarer || (partner !== null && t.winner === partner)).length
                const cardPointContract = contract !== 'beggar' && contract !== 'open-beggar'
                  && contract !== 'valat-without' && contract !== 'color-valat-without'
                return (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#1a1a1a', borderRadius: 4 }}>
                    <div style={{ color: '#888', marginBottom: cardPointContract ? 6 : 0 }}>
                      Tricks won — {decSide.map(s => playerNames[s]).join(' + ')}: <span style={{ color: '#ccc' }}>{decTricks}</span>{' '}others: <span style={{ color: '#ccc' }}>{completedTricks.length - decTricks}</span>
                    </div>
                    {cardPointContract && (
                      <>
                        <div style={{ color: '#aaa', marginBottom: 4, fontWeight: 'bold' }}>Card points (whole pile in threes)</div>
                        {[decSide, oppSide].map((side, si) => {
                          const cards = side.flatMap(s => effectiveCaptured[s])
                          const { chunks, values, total } = pileInThrees(cards)
                          return (
                            <div key={si} style={{ marginBottom: 6, lineHeight: '1.6' }}>
                              <div style={{ color: '#aaa' }}>{side.map(s => playerNames[s]).join(' + ')} ({cards.length} cards):</div>
                              {chunks.map((ch, gi) => (
                                <div key={gi} style={{ color: '#bbb', paddingLeft: 10, whiteSpace: 'nowrap' }}>
                                  [{ch.map((c, ci) => <span key={ci} style={{ marginRight: ci < ch.length - 1 ? '0.9em' : 0 }}>{cardText(c)}</span>)}] <span style={{ color: '#888' }}>{ch.map(c => c.points).join(' + ')} − {ch.length === 3 ? 2 : 1}</span><span style={{ color: '#f0c040' }}> = {values[gi]}</span>
                                </div>
                              ))}
                              <div style={{ color: '#ccc', fontWeight: 'bold', paddingLeft: 10 }}>Total: {total}</div>
                            </div>
                          )
                        })}
                        <div style={{ color: '#666' }}>Total: 70</div>
                      </>
                    )}
                  </div>
                )
                  })()}
                </div>
              )}
            </>
          )}
        </div>

        {confirmEnd ? (
          <div className="modal-actions" style={{ flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#f0c040', margin: 0, textAlign: 'center', fontSize: 14 }}>
              End the game? Session scores will reset.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>Cancel</button>
              <button className="btn" style={{ background: '#8b2222' }} onClick={onEndGame}>Yes, End Game</button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmEnd(true)}>End Game</button>
            <button className="btn" onClick={() => onNewRound(buildLogLines().join('\n'))}>New Round</button>
          </div>
        )}
      </div>
    </div>
  )
}
