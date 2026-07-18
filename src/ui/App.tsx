import React, { useState, useEffect } from 'react'
import { useGameStore } from '../state/store'
import type { Seat } from '../engine/types'
import { legalCards } from '../engine/play'
import { legalBids } from '../engine/bidding'
import { talonGroupSize } from '../engine/talon'
import { saveGameRecord, saveDraftRecord, consumeDraftRecord, opfsLoad } from '../state/persistence'
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
import HistoryDialog from './dialogs/HistoryDialog'
import HelpDialog from './dialogs/HelpDialog'
import RoundHistoryDialog from './dialogs/RoundHistoryDialog'
import { BONUS_LABEL } from './labels'

const AI_SEATS: { seat: Seat; pos: string; dir: 'h' | 'v'; flip?: boolean }[] = [
  { seat: 2, pos: 'seat-top', dir: 'h' },
  { seat: 1, pos: 'seat-left', dir: 'v', flip: true },
  { seat: 3, pos: 'seat-right', dir: 'v' },
]

export default function App() {
  const store = useGameStore()
  const [showHistory, setShowHistory] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showRoundHistory, setShowRoundHistory] = useState(false)

  const {
    phase, dealResult, biddingState, talonExchange, kingCall,
    announcementState, playState, sessionScores, playerNames,
    radliState, pendingDiscardCount, roundId, roundHistory, cardAppearance,
    voidDealSeat, options,
  } = store

  // On mount: load from OPFS file (merges into localStorage), then recover any draft
  useEffect(() => {
    opfsLoad().then(() => {
      const draft = consumeDraftRecord()
      if (draft && draft.rounds > 0) saveGameRecord(draft)
    }).catch(() => {
      const draft = consumeDraftRecord()
      if (draft && draft.rounds > 0) saveGameRecord(draft)
    })
  }, [])

  // Save draft + trigger browser "Leave site?" prompt on refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useGameStore.getState()
      const completedRounds = s.phase === 'setup' ? s.roundId : Math.max(0, s.roundId - 1)
      if (completedRounds > 0) {
        saveDraftRecord({
          id: String(Date.now()),
          playedAt: Date.now(),
          playerNames: s.playerNames,
          finalScores: s.sessionScores,
          rounds: completedRounds,
        })
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    if (cardAppearance !== 'traditional') return
    const urls: string[] = []
    for (let i = 1; i <= 22; i++) urls.push(`./cards/trump-${i}.png?v=7`)
    const hdRanks = ['K', 'Q', 'Kn', 'J', '1', '2', '3', '4']
    const scRanks = ['K', 'Q', 'Kn', 'J', '7', '8', '9', '10']
    for (const suit of ['hearts', 'diamonds']) hdRanks.forEach(r => urls.push(`./cards/${suit}-${r}.png?v=7`))
    for (const suit of ['spades', 'clubs']) scRanks.forEach(r => urls.push(`./cards/${suit}-${r}.png?v=7`))
    urls.forEach(url => { fetch(url).catch(() => {}) })
  }, [cardAppearance])

  const [nameInput, setNameInput] = useState('')

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
        onEndGame={() => {
          if (phase === 'scoring') {
            alert('Use the buttons in the score summary to end the game or start a new round.')
            return
          }
          const completedRounds = phase === 'setup' ? roundId : Math.max(0, roundId - 1)
          const msg = completedRounds > 0
            ? 'End the current game? The current round will be discarded and your score will be saved.'
            : 'Start over? No rounds have been completed yet.'
          if (window.confirm(msg)) {
            setShowRoundHistory(false)
            store.endGameFromMenu()
          }
        }}
        onHistory={() => setShowHistory(true)}
        onHelp={() => setShowHelp(true)}
        onAbout={() => setShowAbout(true)}
        cardAppearance={cardAppearance}
        onSetCardAppearance={store.setCardAppearance}
      />

      <div className="game-table">
        {/* Setup / start screen */}
        {phase === 'setup' && (
          <div className="idle-screen">
            <h1>Tarok</h1>
            <p>Slovenian card game — 4 players</p>
            <p style={{ fontSize: 13, marginTop: -8 }}>v{__APP_VERSION__}</p>
            <div style={{ margin: '14px 0 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <label style={{ color: '#aaa', fontSize: 13 }}>Your name</label>
              <input
                type="text"
                autoFocus
                value={nameInput}
                maxLength={20}
                onChange={e => setNameInput(e.target.value)}
                onBlur={() => { const n = nameInput.trim(); setNameInput(n); store.setPlayerName(n) }}
                onKeyDown={e => { if (e.key === 'Enter') { const n = nameInput.trim(); store.setPlayerName(n); store.startNewGame() } }}
                style={{
                  background: '#2a2a2a', border: '1px solid #555', borderRadius: 4,
                  color: '#f0f0f0', fontSize: 15, padding: '6px 10px',
                  textAlign: 'center', width: 180, outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 4, overflow: 'hidden', border: '1px solid #555' }}>
              {(['easy', 'hard'] as const).map(d => {
                const selected = options.botDifficulty === d
                return (
                  <button
                    key={d}
                    onClick={() => store.setBotDifficulty(d)}
                    style={{
                      background: selected ? '#0078d4' : '#555',
                      border: 'none',
                      color: selected ? '#fff' : '#ccc',
                      padding: '6px 24px', cursor: 'pointer', fontSize: 13,
                      fontWeight: selected ? 'bold' : 'normal',
                    }}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                )
              })}
            </div>
            <button className="btn" style={{ fontSize: 16, padding: '10px 30px' }} onClick={() => { const n = nameInput.trim(); store.setPlayerName(n); store.startNewGame() }}>
              New Game
            </button>
          </div>
        )}

        {/* AI seats */}
        {dealResult && AI_SEATS.map(({ seat, pos, dir, flip }) => (
          <div key={seat} className={`seat ${pos}`}>
            <div className="seat-label">{playerNames[seat]}</div>
            {phase !== 'idle' && phase !== 'setup' && phase !== 'scoring' && (
              <div style={flip ? { transform: 'rotate(180deg)', marginTop: 20 } : undefined}>
                <Hand cards={(phase === 'playing' && playState ? playState.hands[seat] : dealResult.hands[seat])} faceUp={false} vertical={dir === 'v'} />
              </div>
            )}
          </div>
        ))}

        {/* Human seat */}
        {dealResult && phase !== 'idle' && phase !== 'setup' && phase !== 'scoring' && (
          <div className="seat seat-bottom">
            <div className="seat-label" style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8, whiteSpace: 'nowrap' }}>{playerNames[0]}</div>
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

        {/* Void-deal notice — top centre */}
        {phase === 'bidding' && voidDealSeat !== null && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: '#1e1a10', border: '1px solid #6b5a20',
            borderRadius: 6, padding: '7px 14px',
            fontSize: 12, color: '#d4b86a', whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 5,
            textAlign: 'center',
          }}>
            <strong>{playerNames[voidDealSeat]}</strong> had no taroks — cards were redealt.
            {' '}Compulsory klop: bidding starts at Solo Without.
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

      {phase !== 'setup' && <StatusBar playState={playState} biddingState={biddingState} playerNames={playerNames} sessionScores={sessionScores} roundsPlayed={roundId} onShowRoundHistory={() => setShowRoundHistory(v => !v)} />}

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
          roundId={roundId}
          onNewRound={(logText) => { store.acknowledgeScore(logText); store.startNewGame() }}
          onEndGame={() => { setShowRoundHistory(false); store.endGame() }}
        />
      )}

      {showHistory && (
        <HistoryDialog onClose={() => setShowHistory(false)} />
      )}

      {showHelp && (
        <HelpDialog onClose={() => setShowHelp(false)} />
      )}

      {showRoundHistory && (
        <RoundHistoryDialog
          roundHistory={roundHistory}
          playerNames={playerNames}
          onClose={() => setShowRoundHistory(false)}
        />
      )}

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 320 }}>
            <h2 style={{ marginBottom: 6 }}>Tarok</h2>
            <p style={{ color: '#aaa', fontSize: 13, marginBottom: 4 }}>Slovenian card game — 4 players</p>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>v{__APP_VERSION__}</p>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>Built with Claude</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setShowAbout(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
