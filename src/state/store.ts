import { create } from 'zustand'
import type { GameState, GamePhase } from './gameState'
import type { Seat, BidAction, Contract, Suit, Card, PlayState, BonusName } from '../engine/types'
import { deal } from '../engine/deal'
import { initBidding, applyBid, resolveBidding, legalBids } from '../engine/bidding'
import {
  initTalonExchange, selectTalonGroup as selectGroup, resolveKingCall,
  discardHand, canDiscard, talonGroupSize,
} from '../engine/talon'
import { initPlay, playCard, isHandComplete } from '../engine/play'
import { initAnnouncements, applyAnnouncement } from '../engine/announce'
import {
  initRadli, computeHandScore, updateRadliAfterHand, applyRadli,
  scoreKlop, countDeclarerPoints,
} from '../engine/scoring'
import { CONTRACT_BASE } from '../engine/types'
import { evaluateHand, recommendBid, recommendKingCall } from '../ai/bidding-heuristic'
import { pickNames } from '../ui/names'
import { chooseCard } from '../ai/play-heuristic'

const BOT_DELAY = 400
const HUMAN = 0 as Seat

function makeInitialState(): GameState {
  return {
    phase: 'setup',
    dealResult: null,
    biddingState: null,
    talonExchange: null,
    kingCall: null,
    announcementState: null,
    playState: null,
    radliState: initRadli(),
    sessionScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    playerNames: (() => { const [a, b, c] = pickNames(); return { 0: 'You', 1: a, 2: b, 3: c } })(),
    missdealStrikes: { 0: 0, 1: 0, 2: 0, 3: 0 },
    options: { soundEnabled: false },
    statistics: [],
    skisRoundEndSeat: null,
    dealerSeat: 0 as Seat,
    pendingDiscardCount: 0,
    forehandChoiceContract: null,
    pendingTrick: null,
    roundId: 0,
  }
}

type Store = GameState & {
  startNewGame: () => void
  placeBid: (action: BidAction) => void
  chooseTalonGroup: (groupIndex: number) => void
  applyDiscard: (cards: Card[]) => void
  callKing: (suit: Suit) => void
  finishAnnouncements: (bonuses: BonusName[], kontraGame: boolean) => void
  playCardAction: (card: Card) => void
  acknowledgeScore: () => void
  setOption: (key: keyof GameState['options'], value: boolean) => void
  setForehandContract: (contract: Contract) => void
  setPlayerName: (name: string) => void
  endGame: () => void
}

export const useGameStore = create<Store>((set, get) => {
  // ── helpers ─────────────────────────────────────────────────────────────

  const botDelay = (fn: () => void) => setTimeout(fn, BOT_DELAY)

  // Called after exchange/king-call to route through announcing (or skip for klop).
  const advanceToAnnouncing = () => {
    const { biddingState } = get()
    if (!biddingState) return
    const contract = biddingState.highestBid ?? 'klop'
    if (contract === 'klop') {
      set({ announcementState: initAnnouncements() })
      advanceToPlay()
    } else {
      set({ phase: 'announcing', announcementState: initAnnouncements() })
    }
  }

  const advanceToPlay = () => {
    const { dealResult, biddingState, talonExchange, kingCall } = get()
    if (!dealResult || !biddingState) return
    const contract = biddingState.highestBid ?? 'klop'
    const declarer = biddingState.highestBidder ?? biddingState.forehand
    const partner = kingCall?.partner ?? null
    const playState = initPlay(
      dealResult, contract, declarer, partner, talonExchange, false, kingCall, dealResult.hands,
    )
    set({ phase: 'playing', playState })
    botDelay(runBotPlay)
  }

  const botTalon = (contract: Contract, declarer: Seat) => {
    const { dealResult, biddingState } = get()
    if (!dealResult || !biddingState) return
    const exchange = initTalonExchange(dealResult.talon, contract)
    const { updatedHand, exchange: updated } = selectGroup(exchange, 0, dealResult.hands[declarer])
    const groupSize = talonGroupSize(contract)
    const discardable = updatedHand.filter(c => canDiscard(c, updatedHand))
    const toDiscard = discardable.slice(0, groupSize)
    const newHand = discardHand(updatedHand, toDiscard)
    const newHands = { ...dealResult.hands, [declarer]: newHand }
    const newDealResult = { ...dealResult, hands: newHands }
    let kingCall = null
    if (['three', 'two', 'one'].includes(contract)) {
      const suit = recommendKingCall(newHand, ['clubs', 'spades', 'hearts', 'diamonds'])
      kingCall = resolveKingCall(suit, newHands, dealResult.talon, declarer)
    }
    set({ dealResult: newDealResult, talonExchange: updated, kingCall })
    advanceToAnnouncing()
  }

  const runBotBid = () => {
    const { biddingState, dealResult, phase } = get()
    if (phase !== 'bidding' || !biddingState || !dealResult) return
    const seat = biddingState.currentBidder
    if (seat === HUMAN) return
    const legal = legalBids(biddingState, seat)
    const rec = recommendBid(evaluateHand(dealResult.hands[seat]), legal, biddingState.isCompulsoryKlop)
    const action: BidAction = rec === 'pass' ? { kind: 'pass' } : { kind: 'bid', contract: rec as Contract }
    get().placeBid(action)
  }

  // Show completed trick for 1.2 s so the player can see all 4 cards and who won.
  const TRICK_PAUSE = 1200

  const resolveTrickDisplay = (newState: ReturnType<typeof initPlay>, winner: Seat, handComplete: boolean) => {
    const lastTrick = newState.completedTricks[newState.completedTricks.length - 1]
    const thisRoundId = get().roundId
    set({ playState: newState, pendingTrick: { cards: lastTrick.cards, winner } })
    setTimeout(() => {
      if (get().roundId !== thisRoundId) return  // new round started during the pause
      set({ pendingTrick: null })
      if (handComplete) {
        set({ phase: 'scoring' })
      } else {
        botDelay(runBotPlay)
      }
    }, TRICK_PAUSE)
  }

  const runBotPlay = () => {
    const { playState, phase } = get()
    if (phase !== 'playing' || !playState) return
    const playedSeats = new Set(playState.currentTrick.cards.map(c => c.seat))
    const ledSeat = playState.currentTrick.ledSeat
    const order: Seat[] = [ledSeat, ((ledSeat+1)%4) as Seat, ((ledSeat+2)%4) as Seat, ((ledSeat+3)%4) as Seat]
    const seat = order.find(s => !playedSeats.has(s))
    if (!seat || seat === HUMAN) return
    const card = chooseCard(playState, seat, { difficultyBias: 0.5 })
    const { newState, trickComplete, trickWinner, handComplete } = playCard(playState, seat, card)
    set({ playState: newState })
    if (trickComplete && trickWinner !== null) {
      resolveTrickDisplay(newState, trickWinner, handComplete)
    } else {
      botDelay(runBotPlay)
    }
  }

  const afterBidResolved = () => {
    const { biddingState, dealResult } = get()
    if (!biddingState || !dealResult) return
    const result = resolveBidding(biddingState)
    if (!result) return
    const { contract, declarer } = result
    const forehand = biddingState.forehand
    const noOneBid = biddingState.highestBid === null
    const nonForehandAllPassed = [0, 1, 2, 3]
      .filter(s => s !== forehand)
      .every(s => biddingState.passed.has(s as Seat))

    if (nonForehandAllPassed && noOneBid && forehand === HUMAN) {
      set({ phase: 'forehand-choice' })
      return
    }
    if (nonForehandAllPassed && noOneBid && forehand !== HUMAN) {
      // Bot forehand must pick — use ceiling logic across all contracts (klop/three included)
      const botHand = dealResult.hands[forehand]
      const eval_ = evaluateHand(botHand)
      const allContracts: Contract[] = [
        'klop', 'three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one',
        'beggar', 'solo-without', 'open-beggar', 'color-valat-without', 'valat-without',
      ]
      const rec = recommendBid(eval_, allContracts, biddingState.isCompulsoryKlop)
      const pickedContract: Contract = rec === 'pass' ? 'klop' : rec
      set({ biddingState: applyBid(biddingState, { kind: 'bid', contract: pickedContract }) })
      afterBidResolved()
      return
    }

    const needsTalon = ['three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one'].includes(contract)
    if (needsTalon) {
      if (declarer === HUMAN) {
        const exchange = initTalonExchange(dealResult.talon, contract)
        set({ talonExchange: exchange, phase: 'talon' })
      } else {
        botTalon(contract, declarer)
      }
    } else {
      if (['three', 'two', 'one'].includes(contract) && declarer !== HUMAN) {
        // Bot calls king
        const kc = resolveKingCall(
          recommendKingCall(dealResult.hands[declarer], ['clubs', 'spades', 'hearts', 'diamonds']),
          dealResult.hands, dealResult.talon, declarer,
        )
        set({ kingCall: kc })
      }
      advanceToAnnouncing()
    }
  }

  // ── actions ─────────────────────────────────────────────────────────────

  return {
    ...makeInitialState(),

    startNewGame: () => {
      const { dealerSeat, sessionScores, statistics, playerNames, radliState, roundId } = get()
      const outcome = deal(dealerSeat)
      const biddingState = initBidding(dealerSeat, outcome.kind === 'void-deal')
      set({
        ...makeInitialState(),
        phase: 'bidding',
        dealResult: outcome.result,
        biddingState,
        dealerSeat,
        sessionScores,
        statistics,
        playerNames,
        radliState,
        roundId: roundId + 1,
      })
      botDelay(runBotBid)
    },

    placeBid: (action) => {
      const { biddingState } = get()
      if (!biddingState) return
      const newBid = applyBid(biddingState, action)
      set({ biddingState: newBid })
      if (newBid.done) {
        afterBidResolved()
      } else if (newBid.currentBidder !== HUMAN) {
        botDelay(runBotBid)
      }
    },

    setForehandContract: (contract) => {
      const { dealResult, biddingState } = get()
      if (!dealResult || !biddingState) return
      const newBid = applyBid(biddingState, { kind: 'bid', contract })
      set({ biddingState: newBid, forehandChoiceContract: null })
      const needsTalon = ['three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one'].includes(contract)
      if (needsTalon) {
        const exchange = initTalonExchange(dealResult.talon, contract)
        set({ talonExchange: exchange, phase: 'talon' })
      } else {
        advanceToAnnouncing()
      }
    },

    chooseTalonGroup: (groupIndex) => {
      const { talonExchange, dealResult, biddingState } = get()
      if (!talonExchange || !dealResult || !biddingState) return
      const declarer = biddingState.highestBidder ?? biddingState.forehand
      const { updatedHand, exchange: updated } = selectGroup(talonExchange, groupIndex, dealResult.hands[declarer])
      const newHands = { ...dealResult.hands, [declarer]: updatedHand }
      const contract = biddingState.highestBid ?? 'three'
      const groupSize = talonGroupSize(contract)
      set({
        talonExchange: updated,
        dealResult: { ...dealResult, hands: newHands },
        pendingDiscardCount: groupSize,
      })
    },

    applyDiscard: (cards) => {
      const { dealResult, biddingState, talonExchange } = get()
      if (!dealResult || !biddingState) return
      const declarer = biddingState.highestBidder ?? biddingState.forehand
      const newHand = discardHand(dealResult.hands[declarer], cards)
      const newHands = { ...dealResult.hands, [declarer]: newHand }
      const newDealResult = { ...dealResult, hands: newHands }
      const contract = biddingState.highestBid ?? 'three'
      const needsKingCall = ['three', 'two', 'one'].includes(contract)
      set({ dealResult: newDealResult, pendingDiscardCount: 0 })
      if (needsKingCall) {
        set({ phase: 'king-call' })
      } else {
        advanceToPlay()
      }
    },

    callKing: (suit) => {
      const { dealResult, biddingState } = get()
      if (!dealResult || !biddingState) return
      const declarer = biddingState.highestBidder ?? biddingState.forehand
      const kc = resolveKingCall(suit, dealResult.hands, dealResult.talon, declarer)
      set({ kingCall: kc })
      advanceToAnnouncing()
    },

    finishAnnouncements: (bonuses, kontraGame) => {
      let ann = get().announcementState ?? initAnnouncements()
      const { biddingState, kingCall } = get()
      if (!biddingState) return
      const declarer = biddingState.highestBidder ?? biddingState.forehand
      const partner = kingCall?.partner ?? null
      for (const bonus of bonuses) {
        ann = applyAnnouncement(ann, { kind: 'announce', seat: HUMAN, bonus }, declarer, partner)
      }
      if (kontraGame) {
        ann = applyAnnouncement(ann, { kind: 'kontra', seat: HUMAN, target: 'game' }, declarer, partner)
      }
      set({ announcementState: ann })
      advanceToPlay()
    },

    playCardAction: (card) => {
      const { playState } = get()
      if (!playState) return
      const { newState, trickComplete, trickWinner, handComplete } = playCard(playState, HUMAN, card)
      set({ playState: newState })
      if (trickComplete && trickWinner !== null) {
        resolveTrickDisplay(newState, trickWinner, handComplete)
      } else {
        botDelay(runBotPlay)
      }
    },

    acknowledgeScore: () => {
      const { playState, announcementState, radliState, sessionScores, statistics, dealerSeat } = get()
      const nextDealer = ((dealerSeat + 3) % 4) as Seat

      if (!playState) {
        set({ phase: 'idle', dealerSeat: nextDealer })
        return
      }

      const { contract, declarer, partner, capturedCards, completedTricks,
              talonRemainder, mondCapturedWithSkis, mondCapturedBy, kingCall } = playState
      const ann = announcementState ?? initAnnouncements()

      // Determine win for radli bookkeeping
      const declarerPts = countDeclarerPoints(capturedCards, declarer, partner)
      const declarerWon = (contract === 'beggar' || contract === 'open-beggar')
        ? capturedCards[declarer].length === 0
        : declarerPts >= 36

      // Update radli: cancel one on win, then add new ones for klop/beggar+
      const { newRadliState: afterCancel } = applyRadli(0, radliState, declarer, declarerWon)
      const newRadliState = updateRadliAfterHand(afterCancel, contract, declarerWon)

      // Compute per-seat score deltas
      const delta: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
      let newStats = statistics

      if (contract === 'klop') {
        const klopScores = scoreKlop(capturedCards)
        for (const s of [0, 1, 2, 3] as Seat[]) delta[s] = klopScores[s]
      } else {
        const handScore = computeHandScore({
          contract, declarer, partner, capturedCards, talonRemainder,
          mondCapturedWithSkis, mondPlayedBySeat: mondCapturedBy,
          announcementState: ann, completedTricks,
          calledKing: kingCall?.calledKing ?? null,
          radliState, contractBase: CONTRACT_BASE[contract], won: declarerWon,
        })
        delta[declarer] = handScore.declarerScore
        if (partner !== null) {
          delta[partner] = (handScore.partnerScore ?? handScore.declarerScore) + handScore.mondPenalties[partner]
        }
        for (const s of [0, 1, 2, 3] as Seat[]) {
          if (s !== declarer && s !== partner) delta[s] = handScore.opponentScores[s]
        }
        newStats = [...statistics, handScore]
      }

      const newScores: Record<Seat, number> = {
        0: sessionScores[0] + delta[0],
        1: sessionScores[1] + delta[1],
        2: sessionScores[2] + delta[2],
        3: sessionScores[3] + delta[3],
      }

      set({
        phase: 'idle',
        dealerSeat: nextDealer,
        sessionScores: newScores,
        radliState: newRadliState,
        statistics: newStats,
        playState: null,
        announcementState: null,
        pendingTrick: null,
        biddingState: null,
        dealResult: null,
        talonExchange: null,
        kingCall: null,
      })
    },

    setOption: (key, value) => {
      set(s => ({ options: { ...s.options, [key]: value } }))
    },

    setPlayerName: (name) => {
      set(s => ({ playerNames: { ...s.playerNames, 0: name.trim() || 'You' } }))
    },

    endGame: () => {
      // Run the same score-tallying as acknowledgeScore so stats are saved,
      // then reset to the setup screen for a new game.
      const { playState, announcementState, radliState, sessionScores, statistics, dealerSeat, playerNames } = get()
      const nextDealer = ((dealerSeat + 3) % 4) as Seat

      let newStats = statistics
      if (playState) {
        const { contract, declarer, partner, capturedCards, talonRemainder,
                mondCapturedWithSkis, mondCapturedBy, kingCall } = playState
        const ann = announcementState ?? initAnnouncements()
        const declarerPts = countDeclarerPoints(capturedCards, declarer, partner)
        const declarerWon = (contract === 'beggar' || contract === 'open-beggar')
          ? capturedCards[declarer].length === 0
          : declarerPts >= 36
        const { newRadliState: afterCancel } = applyRadli(0, radliState, declarer, declarerWon)
        const newRadliState = updateRadliAfterHand(afterCancel, contract, declarerWon)
        if (contract !== 'klop') {
          const handScore = computeHandScore({
            contract, declarer, partner, capturedCards, talonRemainder,
            mondCapturedWithSkis, mondPlayedBySeat: mondCapturedBy,
            announcementState: ann, completedTricks: playState.completedTricks,
            calledKing: kingCall?.calledKing ?? null,
            radliState: newRadliState, contractBase: CONTRACT_BASE[contract], won: declarerWon,
          })
          newStats = [...statistics, handScore]
        }
      }

      const [a, b, c] = pickNames()
      set({
        ...makeInitialState(),
        phase: 'setup',
        playerNames: { ...playerNames, 1: a, 2: b, 3: c },
        dealerSeat: nextDealer,
        statistics: newStats,
      })
    },
  }
})
