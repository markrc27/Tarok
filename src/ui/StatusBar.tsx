import React from 'react'
import type { PlayState, BiddingState, Seat, SuitCard } from '../engine/types'
import { countPoints } from '../engine/pointcount'
import { CONTRACT_LABEL } from './labels'

const SUIT_SYM: Record<string, string> = { clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦' }

interface Props {
  playState: PlayState | null
  biddingState: BiddingState | null
  playerNames: Record<Seat, string>
  sessionScores: Record<Seat, number>
  roundsPlayed: number
  onShowRoundHistory?: () => void
}

export default function StatusBar({ playState, biddingState, playerNames, sessionScores, roundsPlayed, onShowRoundHistory }: Props) {
  const rawContract = biddingState?.highestBid ?? playState?.contract ?? null
  const contractLabel = rawContract ? CONTRACT_LABEL[rawContract] : '—'
  const declarer = playState ? playerNames[playState.declarer] : '—'

  let partnerLabel = '—'
  if (playState) {
    if (playState.contract === 'klop' || !playState.kingCall || playState.partner === null) {
      partnerLabel = 'None'
    } else {
      const ck = playState.kingCall.calledKing
      const kingSeen = (c: { card: { kind: string } }) =>
        c.card.kind === 'suit' && (c.card as SuitCard).suit === ck.suit && (c.card as SuitCard).rank === 'K'
      const revealed = playState.completedTricks.some(t => t.cards.some(kingSeen))
        || playState.currentTrick.cards.some(kingSeen)
      partnerLabel = revealed ? playerNames[playState.partner] : 'Hidden'
    }
  }

  const calledKingSym = playState?.kingCall
    ? `K${SUIT_SYM[playState.kingCall.calledKing.suit] ?? '?'}`
    : null

  let pts = 0
  if (playState) {
    const declarerSide = ([0, 1, 2, 3] as Seat[]).filter(s => s === playState.declarer || s === playState.partner)
    const cards = declarerSide.flatMap(s => playState.capturedCards[s])
    pts = countPoints(cards)
  }

  // Hint when human must follow a specific suit/trump
  let followHint = ''
  if (playState && playState.currentTrick.cards.length > 0) {
    const ledSuit = playState.currentTrick.ledSuit
    if (ledSuit === 'trump') followHint = 'Must follow: tarok'
    else if (ledSuit) {
      const humanHasSuit = playState.hands[0].some(c => c.kind === 'suit' && c.suit === ledSuit)
      if (humanHasSuit) followHint = `Must follow: ${ledSuit}`
      else followHint = 'Must play tarok (no matching suit)'
    }
  }

  const seats: Seat[] = [0, 1, 2, 3]

  return (
    <div className="status-bar">
      <div className="status-item">Contract: <span>{contractLabel}</span></div>
      <div className="status-item">Declarer: <span>{declarer}</span></div>
      <div className="status-item">Partner: <span>{partnerLabel}</span></div>
      {calledKingSym && (
        <div className="status-item">Called: <span>{calledKingSym}</span></div>
      )}
      <div className="status-item">Points: <span>{pts} / 70</span></div>
      {followHint && <div className="status-item" style={{ color: '#facc15' }}>{followHint}</div>}
      <div style={{ flex: 1 }} />
      {roundsPlayed > 0 && (
        <>
          <button
            className="status-item"
            onClick={onShowRoundHistory}
            style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
            title="View round history"
          >
            Round <span style={{ color: '#aaa' }}>{roundsPlayed}</span>
          </button>
          <div className="status-item" style={{ borderLeft: '1px solid #333', paddingLeft: 12 }}>
            {seats.map(s => (
              <span key={s} style={{ marginRight: 10 }}>
                {playerNames[s]}: <span style={{ color: sessionScores[s] >= 0 ? '#4f4' : '#f66' }}>
                  {sessionScores[s] >= 0 ? '+' : ''}{sessionScores[s]}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
