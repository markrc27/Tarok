import React, { useState } from 'react'
import type { PlayState, RadliState, AnnouncementState, Seat, Card, SuitCard } from '../../engine/types'
import { CONTRACT_BASE } from '../../engine/types'
import { computeHandScore, scoreKlop, countDeclarerPoints, calcDifference, adjustCapturedForTalon, applyRadli, updateRadliAfterHand } from '../../engine/scoring'
import { countPoints } from '../../engine/pointcount'
import { bonusBaseValue, getKontraMultiplier } from '../../engine/announce'
import { CONTRACT_LABEL } from '../labels'

const BONUS_LABEL: Record<string, string> = {
  trula: 'Trula', kings: 'Kings', 'king-ultimo': 'King Ultimo',
  'pagat-ultimo': 'Pagat Ultimo', valat: 'Valat',
}

const SUIT_SYM: Record<string, string> = { clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦' }
const RANK_LABEL: Record<string, string> = { K: 'K', Q: 'Q', Kn: 'C', J: 'J' }

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

interface Props {
  playState: PlayState
  announcementState: AnnouncementState
  sessionScores: Record<Seat, number>
  radliState: RadliState
  playerNames: Record<Seat, string>
  onNewRound: () => void
  onEndGame: () => void
}

export default function ScoreDialog({ playState, announcementState, sessionScores, radliState, playerNames, onNewRound, onEndGame }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showRadliInfo, setShowRadliInfo] = useState(false)

  const { contract, declarer, partner, capturedCards, completedTricks,
          talonRemainder, talonDiscard, mondCapturedWithSkis, mondCapturedBy, kingCall,
          kingInTalonCaptured } = playState
  const effectiveCaptured = adjustCapturedForTalon(capturedCards, talonRemainder, declarer, partner, kingInTalonCaptured)

  const seats: Seat[] = [0, 1, 2, 3]

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
    won = (contract === 'beggar' || contract === 'open-beggar')
      ? effectiveCaptured[declarer].length === 0
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

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 420, maxWidth: 560 }}>
        <h2>Round Result</h2>

        {contract !== 'klop' ? (
          <p style={{ color: '#aaa', margin: '6px 0 14px', fontSize: 13 }}>
            <strong style={{ color: '#f0f0f0' }}>{CONTRACT_LABEL[contract]}</strong>
            {' — '}{playerNames[declarer]} declared
            {partner !== null ? `, ${playerNames[partner]} partnered` : ''}
            {' — '}{declarerPts} card pts (need 35, {difference >= 0 ? '+' : ''}{difference})
            {' — '}
            <strong style={{ color: won ? '#4f4' : '#f44' }}>{won ? 'Won hand' : 'Lost hand'}</strong>
          </p>
        ) : (
          <p style={{ color: '#aaa', margin: '6px 0 14px', fontSize: 13 }}>
            <strong style={{ color: '#f0f0f0' }}>Klop</strong> — individual scoring
          </p>
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
                <td style={{ color: delta[seat] >= 0 ? '#4f4' : '#f44' }}>
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
            When scoring, if the declarer holds outstanding radli, the declarer's score (and the partner's, if any) is <strong style={{ color: '#f0f0f0' }}>doubled</strong> and one radlc is annulled — but only on a <em>win</em>. On a loss the score is still doubled but the radlc is not cancelled.<br />
            <br />
            Uncancelled radli at the end of the session cost <strong style={{ color: '#f0f0f0' }}>100 points each</strong>.
          </div>
        )}

        {/* Expandable game log */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', flex: 1 }}
              onClick={() => setShowLog(v => !v)}
            >
              {showLog ? '▲ Hide game log' : '▼ Show game log'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => {
                const lines: string[] = []
                lines.push(`=== Round: ${CONTRACT_LABEL[contract]} ===`)
                if (contract !== 'klop' && handScore) {
                  lines.push(`Declarer: ${playerNames[declarer]}${partner !== null ? `, Partner: ${playerNames[partner]}` : ''}`)
                  lines.push(`Card points: ${declarerPts} scored (need 35, ${difference >= 0 ? '+' : ''}${difference} diff) — ${won ? 'WON HAND' : 'LOST HAND'}`)
                  lines.push('')
                  lines.push('--- Score breakdown ---')
                  const gameKontraLog = getKontraMultiplier(announcementState, 'game')
                  const gameNetLog = (CONTRACT_BASE[contract] + Math.abs(difference)) * gameKontraLog
                  const gameKontraStrLog = gameKontraLog > 1 ? ` x${gameKontraLog}` : ''
                  lines.push(`Game (${CONTRACT_LABEL[contract]}): ${CONTRACT_BASE[contract]} base ${difference >= 0 ? '+' : ''}${difference} over threshold${gameKontraStrLog} = ${won ? '+' : '-'}${gameNetLog}`)
                  for (const b of handScore.bonusBreakdown) {
                    const net = b.value * b.kontraLevel
                    const kontraStr = b.announced && b.kontraLevel > 1 ? ` x${b.kontraLevel}` : ''
                    const tag = b.announced ? `announced${kontraStr}` : 'unannounced'
                    if (b.side === 'opponent') {
                      lines.push(`${BONUS_LABEL[b.bonus] ?? b.bonus} (vs opponents, ${tag}): ACHIEVED = -${net}`)
                    } else {
                      lines.push(`${BONUS_LABEL[b.bonus] ?? b.bonus} (${tag}): ${b.achieved ? 'ACHIEVED' : 'NOT ACHIEVED'} = ${b.achieved ? '+' : '-'}${net}`)
                    }
                  }
                  if (handScore.radliApplied) lines.push('Radli: score doubled')
                  lines.push(`Declarer net: ${handScore.declarerScore >= 0 ? '+' : ''}${handScore.declarerScore}`)
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
                lines.push(`--- Tricks (${completedTricks.length}) ---`)
                completedTricks.forEach((trick, i) => {
                  const ledSeat = trick.cards[0]?.seat
                  const order = [ledSeat, ((ledSeat+1)%4), ((ledSeat+2)%4), ((ledSeat+3)%4)] as Seat[]
                  const ordered = [...trick.cards].sort((a, b) => order.indexOf(a.seat) - order.indexOf(b.seat))
                  const plays = ordered.map(({ seat, card }) => `${playerNames[seat]}:${cardText(card)}`).join('  ')
                  const trickPts = countPoints(trick.cards.map(c => c.card))
                  lines.push(`T${i+1}: ${plays}  -> ${playerNames[trick.winner ?? ledSeat]} (${trickPts} pts)`)
                })
                navigator.clipboard.writeText(lines.join('\n'))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? '✓ Copied' : 'Copy log'}
            </button>
          </div>

          {showLog && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#ccc', maxHeight: 340, overflowY: 'auto' }}>

              {/* Score breakdown */}
              {handScore && contract !== 'klop' && (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: '#1a1a1a', borderRadius: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#aaa', fontWeight: 'bold' }}>Score breakdown</span>
                    <span style={{ color: '#555', fontSize: 11 }}>default / announced</span>
                  </div>
                  {(() => {
                    const gk = getKontraMultiplier(announcementState, 'game')
                    const gameNet = (CONTRACT_BASE[contract] + Math.abs(difference)) * gk
                    const gkStr = gk > 1 ? ` ×${gk}` : ''
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Game ({CONTRACT_LABEL[contract]}): {CONTRACT_BASE[contract]} base {difference >= 0 ? '+' : ''}{difference} over threshold{gkStr}</span>
                        <span style={{ color: '#f0f0f0' }}>{won ? '+' : '−'}{gameNet}</span>
                      </div>
                    )
                  })()}
                  {handScore.bonusBreakdown.map((b, i) => {
                    const net = b.value * b.kontraLevel
                    const label = BONUS_LABEL[b.bonus] ?? b.bonus
                    const kontraStr = b.kontraLevel > 1 ? ` ×${b.kontraLevel}` : ''
                    const tag = b.announced ? `announced${kontraStr}` : 'unannounced'
                    if (b.side === 'opponent') {
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{label} (vs opponents, {tag}): ✓</span>
                          <span style={{ color: '#f44' }}>−{net}</span>
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
                  <div style={{ borderTop: '1px solid #444', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Declarer net</span>
                    <span style={{ color: handScore.declarerScore >= 0 ? '#4f4' : '#f44' }}>
                      {handScore.declarerScore >= 0 ? '+' : ''}{handScore.declarerScore}
                    </span>
                  </div>
                </div>
              )}

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

              {/* Trick log */}
              <div style={{ padding: '8px 10px', background: '#1a1a1a', borderRadius: 4 }}>
                <div style={{ color: '#aaa', marginBottom: 4, fontWeight: 'bold' }}>
                  Tricks ({completedTricks.length})
                </div>
                {completedTricks.map((trick, i) => {
                  const ledSeat = trick.cards[0]?.seat
                  const ordered = [...trick.cards].sort((a, b) => {
                    const order = [ledSeat, ((ledSeat+1)%4), ((ledSeat+2)%4), ((ledSeat+3)%4)]
                    return order.indexOf(a.seat) - order.indexOf(b.seat)
                  })
                  return (
                    <div key={i} style={{ marginBottom: 2, lineHeight: '1.5' }}>
                      <span style={{ color: '#666', marginRight: 4 }}>T{i + 1}</span>
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
                      <span style={{ color: '#aaa' }}>→ {playerNames[trick.winner ?? ledSeat]}</span>
                      <span style={{ color: '#666', marginLeft: 6 }}>({countPoints(trick.cards.map(c => c.card))} pts)</span>
                    </div>
                  )
                })}
              </div>

            </div>
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
            <button className="btn" onClick={onNewRound}>New Round</button>
          </div>
        )}
      </div>
    </div>
  )
}
