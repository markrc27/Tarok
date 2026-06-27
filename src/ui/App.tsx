import React, { useState } from 'react'
import { useGameStore } from '../state/store'
import type { Seat } from '../engine/types'
import { legalCards } from '../engine/play'
import { legalBids } from '../engine/bidding'
import { talonGroupSize } from '../engine/talon'
import MenuBar from './MenuBar'
import StatusBar from './StatusBar'
import Hand from './Hand'
import TrickArea from './TrickArea'
import CardSprite from './CardSprite'
import BiddingDialog from './dialogs/BiddingDialog'
import TalonDialog from './dialogs/TalonDialog'
import CallKingDialog from './dialogs/CallKingDialog'
import ScoreDialog from './dialogs/ScoreDialog'
import AnnouncementsDialog from './dialogs/AnnouncementsDialog'
import OptionsDialog from './dialogs/OptionsDialog'
import StatisticsDialog from './dialogs/StatisticsDialog'
const BONUS_LABEL: Record<string, string> = {
  trula: 'Trula', kings: 'Kings',
  'king-ultimo': 'King Ultimo', 'pagat-ultimo': 'Pagat Ultimo', valat: 'Valat',
}

const AI_SEATS: { seat: Seat; pos: string; dir: 'h' | 'v' }[] = [
  { seat: 2, pos: 'seat-top', dir: 'h' },
  { seat: 1, pos: 'seat-left', dir: 'v' },
  { seat: 3, pos: 'seat-right', dir: 'v' },
]

export default function App() {
  const store = useGameStore()
  const [showOptions, setShowOptions] = useState(false)
  const [showStats, setShowStats] = useState(false)

  const {
    phase, dealResult, biddingState, talonExchange, kingCall,
    announcementState, playState, sessionScores, playerNames,
    options, statistics, radliState, pendingDiscardCount, roundId,
  } = store

  // Compute legal cards for human
  const humanLegal = playState && phase === 'playing'
    ? legalCards(playState, 0)
    : []

  // Compute legal bids for human
  const humanLegalBids = biddingState && phase === 'bidding' && biddingState.currentBidder === 0
    ? legalBids(biddingState, 0)
    : []

  const isHumanBidding = phase === 'bidding' && biddingState?.currentBidder === 0
  const isHumanPlaying = phase === 'playing' && (() => {
    if (!playState) return false
    const playedSeats = new Set(playState.currentTrick.cards.map(c => c.seat))
    const ledSeat = playState.currentTrick.ledSeat
    const order: Seat[] = [ledSeat, ((ledSeat+1)%4) as Seat, ((ledSeat+2)%4) as Seat, ((ledSeat+3)%4) as Seat]
    return order.find(s => !playedSeats.has(s)) === 0
  })()

  const humanHand = (phase === 'playing' && playState ? playState.hands[0] : dealResult?.hands[0]) ?? []
  const contract = biddingState?.highestBid ?? playState?.contract
  const groupSize = contract ? talonGroupSize(contract) : 3

  return (
    <>
      <MenuBar
        onNewGame={() => store.startNewGame()}
        onOptions={() => setShowOptions(true)}
        onStatistics={() => setShowStats(true)}
      />

      <div className="game-table">
        {/* Setup / start screen */}
        {phase === 'setup' && (
          <div className="idle-screen">
            <h1>Tarok</h1>
            <p>Slovenian card game — 4 players</p>
            <div style={{ margin: '14px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <label style={{ color: '#aaa', fontSize: 13 }}>Your name</label>
              <input
                type="text"
                value={playerNames[0]}
                maxLength={20}
                onChange={e => store.setPlayerName(e.target.value)}
                style={{
                  background: '#2a2a2a', border: '1px solid #555', borderRadius: 4,
                  color: '#f0f0f0', fontSize: 15, padding: '6px 10px',
                  textAlign: 'center', width: 180, outline: 'none',
                }}
              />
            </div>
            <button className="btn" style={{ fontSize: 16, padding: '10px 30px' }} onClick={() => store.startNewGame()}>
              New Game
            </button>
          </div>
        )}

        {/* AI seats */}
        {dealResult && AI_SEATS.map(({ seat, pos, dir }) => (
          <div key={seat} className={`seat ${pos}`}>
            <div className="seat-label">{playerNames[seat]}</div>
            {phase !== 'idle' && phase !== 'setup' && phase !== 'scoring' && (
              <Hand cards={(phase === 'playing' && playState ? playState.hands[seat] : dealResult.hands[seat])} faceUp={false} vertical={dir === 'v'} />
            )}
          </div>
        ))}

        {/* Human seat */}
        {dealResult && phase !== 'idle' && phase !== 'setup' && phase !== 'scoring' && (
          <div className="seat seat-bottom">
            <Hand
              cards={humanHand}
              faceUp
              legalCards={isHumanPlaying ? humanLegal : []}
              onPlay={isHumanPlaying ? (c) => store.playCardAction(c) : undefined}
            />
          </div>
        )}

        {/* Trick area */}
        {playState && (
          <TrickArea
            playState={playState}
            pendingTrick={store.pendingTrick}
            playerNames={playerNames}
          />
        )}

        {/* Talon display (when not in exchange) */}
        {dealResult && phase === 'bidding' && (
          <div className="talon-area">
            {dealResult.talon.map((_, i) => (
              <CardSprite key={i} faceUp={false} />
            ))}
          </div>
        )}

        {/* Announcements overlay — top left */}
        {phase === 'playing' && announcementState && (() => {
          const { announcements, kontraTargets } = announcementState
          const gameKontra = kontraTargets.find(k => k.target === 'game')?.level ?? 1
          if (announcements.length === 0 && gameKontra === 1) return null
          return (
            <div style={{
              position: 'absolute', top: 8, left: 8,
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid #444',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              color: '#ccc',
              lineHeight: 1.8,
              pointerEvents: 'none',
              zIndex: 5,
              minWidth: 110,
            }}>
              <div style={{ color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 2, letterSpacing: 1 }}>ANNOUNCED</div>
              {gameKontra > 1 && (
                <div>Game <span style={{ color: '#f0c040' }}>×{gameKontra}</span></div>
              )}
              {announcements.map((ann, i) => (
                <div key={i}>
                  {BONUS_LABEL[ann.bonus] ?? ann.bonus}
                  {ann.kontraLevel > 1 && <span style={{ color: '#f0c040' }}> ×{ann.kontraLevel}</span>}
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      <StatusBar playState={playState} biddingState={biddingState} playerNames={playerNames} sessionScores={sessionScores} roundsPlayed={roundId} />

      {/* Modal dialogs */}
      {isHumanBidding && humanLegalBids.length > 0 && (
        <BiddingDialog
          legalBids={humanLegalBids}
          onBid={(action) => store.placeBid(action)}
          currentHighBid={biddingState?.highestBid ?? null}
          currentHighBidderName={biddingState?.highestBidder != null ? playerNames[biddingState.highestBidder] : null}
        />
      )}

      {phase === 'forehand-choice' && biddingState && (
        <BiddingDialog
          legalBids={['klop', 'three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one', 'beggar', 'solo-without', 'open-beggar', 'color-valat-without', 'valat-without']}
          onBid={(action) => action.kind === 'bid' && store.setForehandContract(action.contract)}
          isForehandChoice
        />
      )}

      {phase === 'talon' && talonExchange && dealResult && biddingState && (() => {
        const declarer = biddingState.highestBidder ?? biddingState.forehand
        if (declarer !== 0) return null
        const contract = biddingState.highestBid ?? 'three'
        return (
          <TalonDialog
            exchange={talonExchange}
            hand={dealResult.hands[0]}
            groupSize={groupSize}
            onSelectGroup={(i) => store.chooseTalonGroup(i)}
            onDiscard={(cards) => store.applyDiscard(cards)}
          />
        )
      })()}

      {phase === 'king-call' && (
        <CallKingDialog onCall={(suit) => store.callKing(suit)} />
      )}

      {phase === 'announcing' && biddingState && dealResult && (() => {
        const contract = biddingState.highestBid ?? 'klop'
        const declarer = biddingState.highestBidder ?? biddingState.forehand
        const partner = kingCall?.partner ?? null
        return (
          <AnnouncementsDialog
            contract={contract}
            declarer={declarer}
            partner={partner}
            hands={dealResult.hands}
            onFinish={(bonuses, kontraGame) => store.finishAnnouncements(bonuses, kontraGame)}
          />
        )
      })()}

      {phase === 'scoring' && playState && (
        <ScoreDialog
          playState={playState}
          announcementState={announcementState ?? { announcements: [], kontraTargets: [], phase: 'open' }}
          sessionScores={sessionScores}
          radliState={radliState}
          playerNames={playerNames}
          onNewRound={() => { store.acknowledgeScore(); store.startNewGame() }}
          onEndGame={() => store.endGame()}
        />
      )}

      {showOptions && (
        <OptionsDialog
          soundEnabled={options.soundEnabled}
          onToggleSound={() => store.setOption('soundEnabled', !options.soundEnabled)}
          onClose={() => setShowOptions(false)}
        />
      )}

      {showStats && (
        <StatisticsDialog
          history={statistics}
          playerNames={playerNames}
          sessionScores={sessionScores}
          onClose={() => setShowStats(false)}
        />
      )}
    </>
  )
}
