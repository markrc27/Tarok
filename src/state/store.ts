import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, GamePhase } from './gameState'
import type { Seat, BidAction, Contract, Suit, Card, PlayState, BonusName, PlayerCount } from '../engine/types'
import { deal } from '../engine/deal'
import { deal3 } from '../engine/deal3'
import { initBidding, applyBid, resolveBidding, legalBids } from '../engine/bidding'
import { initBidding3, applyBid3, resolveBidding3, legalBids3 } from '../engine/bidding3'
import {
  initTalonExchange, selectTalonGroup as selectGroup, resolveKingCall,
  discardHand, talonGroupSize,
} from '../engine/talon'
import { initPlay, playCard, isHandComplete } from '../engine/play'
import { initAnnouncements, applyAnnouncement } from '../engine/announce'
import {
  initRadli, computeHandScore, updateRadliAfterHand, applyRadli,
  scoreKlop, countDeclarerPoints, adjustCapturedForTalon,
} from '../engine/scoring'
import { CONTRACT_BASE } from '../engine/types'
import { evaluateHand, recommendBid, recommendKingCall, recommendTalonGroup, recommendDiscard, recommendAnnouncements } from '../ai/bidding-heuristic'
import { pickNames } from '../ui/names'
import { chooseCard, computeKnownPartner } from '../ai/play-heuristic'
import { saveGameRecord, consumeDraftRecord, postGameToApi } from './persistence'
import type { RoundRecord } from '../engine/types'

const BOT_DELAY = 400
const HUMAN = 0 as Seat

function makeInitialState(): GameState {
  const playerCount = (localStorage.getItem('tarok-player-count') as '3' | '4' | null) === '3' ? 3 : 4
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
    options: {
      soundEnabled: false,
      botDifficulty: (localStorage.getItem('tarok-bot-difficulty') as 'easy' | 'hard') || 'easy',
      playerCount: playerCount as PlayerCount,
    },
    cardAppearance: (localStorage.getItem('tarok-card-appearance') as 'simple' | 'traditional') || 'simple',
    statistics: [],
    skisRoundEndSeat: null,
    dealerSeat: 0 as Seat,
    pendingDiscardCount: 0,
    forehandChoiceContract: null,
    pendingTrick: null,
    roundId: 0,
    roundHistory: [],
    voidDealSeat: null,
    compulsoryKlopNext: false,
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
  acknowledgeScore: (logText: string) => void
  setOption: (key: keyof GameState['options'], value: boolean) => void
  setBotDifficulty: (d: 'easy' | 'hard') => void
  setPlayerCount: (n: PlayerCount) => void
  setForehandContract: (contract: Contract) => void
  setPlayerName: (name: string) => void
  endGame: () => void
  endGameFromMenu: () => void
  setCardAppearance: (appearance: 'simple' | 'traditional') => void
  resumeAfterReload: () => void
}

export const useGameStore = create<Store>()(persist((set, get) => {
  // ── helpers ─────────────────────────────────────────────────────────────

  const botDelay = (fn: () => void) => setTimeout(fn, BOT_DELAY)

  const FLAT_CONTRACTS = new Set(['beggar', 'open-beggar', 'solo-without', 'color-valat-without', 'valat-without'])

  // Active seats for the current session's player count
  const activeSeats = (pc: PlayerCount): Seat[] =>
    pc === 3 ? [0, 1, 2] : [0, 1, 2, 3]

  // Next dealer rotation (anticlockwise)
  const nextDealer = (seat: Seat, pc: PlayerCount): Seat =>
    ((seat + (pc === 3 ? 2 : 3)) % pc) as Seat

  // Play order starting from ledSeat
  const trickOrder = (ledSeat: Seat, pc: PlayerCount): Seat[] => {
    if (pc === 3) {
      return [ledSeat, ((ledSeat + 1) % 3) as Seat, ((ledSeat + 2) % 3) as Seat]
    }
    return [ledSeat, ((ledSeat + 1) % 4) as Seat, ((ledSeat + 2) % 4) as Seat, ((ledSeat + 3) % 4) as Seat]
  }

  const advanceToAnnouncing = () => {
    const { biddingState, kingCall, dealResult, options } = get()
    if (!biddingState || !dealResult) return
    const contract = biddingState.highestBid ?? 'klop'

    if (contract === 'klop') {
      set({ announcementState: initAnnouncements() })
      advanceToPlay()
      return
    }

    const declarer = biddingState.highestBidder ?? biddingState.forehand
    const partner = kingCall?.partner ?? null
    const humanOnDeclarerSide = HUMAN === declarer || HUMAN === partner

    if (FLAT_CONTRACTS.has(contract) && humanOnDeclarerSide) {
      set({ announcementState: initAnnouncements() })
      advanceToPlay()
      return
    }

    let ann = initAnnouncements()
    if (options.botDifficulty === 'hard' && declarer !== HUMAN && !FLAT_CONTRACTS.has(contract)) {
      const botHand = dealResult.hands[declarer]
      for (const bonus of recommendAnnouncements(botHand)) {
        ann = applyAnnouncement(ann, { kind: 'announce', seat: declarer, bonus }, declarer, partner)
      }
    }

    set({ phase: 'announcing', announcementState: ann })
  }

  const advanceToPlay = () => {
    const { dealResult, biddingState, talonExchange, kingCall, options } = get()
    if (!dealResult || !biddingState) return
    const contract = biddingState.highestBid ?? 'klop'
    const declarer = biddingState.highestBidder ?? biddingState.forehand
    const partner = kingCall?.partner ?? null
    const pc = options.playerCount
    const playState = initPlay(
      dealResult, contract, declarer, partner, talonExchange,
      contract === 'color-valat-without', kingCall, dealResult.hands, pc,
    )
    set({ phase: 'playing', playState })
    botDelay(runBotPlay)
  }

  const botTalon = (contract: Contract, declarer: Seat) => {
    const { dealResult, biddingState, options } = get()
    if (!dealResult || !biddingState) return
    const pc = options.playerCount
    const exchange = initTalonExchange(dealResult.talon, contract)
    const groupIdx = recommendTalonGroup(exchange.groups)
    const { updatedHand, exchange: updated } = selectGroup(exchange, groupIdx, dealResult.hands[declarer])
    const groupSize = talonGroupSize(contract)
    const toDiscard = recommendDiscard(updatedHand, groupSize, options.botDifficulty)
    const newHand = discardHand(updatedHand, toDiscard)
    const newHands = { ...dealResult.hands, [declarer]: newHand }
    const newDealResult = { ...dealResult, hands: newHands }
    let kingCall = null
    // No king call in 3-player
    if (pc === 4 && ['three', 'two', 'one'].includes(contract)) {
      const suit = recommendKingCall(newHand, ['clubs', 'spades', 'hearts', 'diamonds'], updated.talonRemainder)
      kingCall = resolveKingCall(suit, newHands, dealResult.talon, declarer)
    }
    const discardedExchange = { ...updated, discard: toDiscard }
    set({ dealResult: newDealResult, talonExchange: discardedExchange, kingCall })
    advanceToAnnouncing()
  }

  const runBotBid = () => {
    const { biddingState, dealResult, phase, options } = get()
    if (phase !== 'bidding' || !biddingState || !dealResult) return
    const seat = biddingState.currentBidder
    if (seat === HUMAN) return
    const pc = options.playerCount
    const legal = pc === 3 ? legalBids3(biddingState, seat) : legalBids(biddingState, seat)
    const rec = recommendBid(evaluateHand(dealResult.hands[seat]), legal, biddingState.isCompulsoryKlop, dealResult.hands[seat], options.botDifficulty)
    const action: BidAction = rec === 'pass' ? { kind: 'pass' } : { kind: 'bid', contract: rec as Contract }
    get().placeBid(action)
  }

  const TRICK_PAUSE = 1200

  const resolveTrickDisplay = (newState: ReturnType<typeof initPlay>, winner: Seat, handComplete: boolean) => {
    const lastTrick = newState.completedTricks[newState.completedTricks.length - 1]
    const thisRoundId = get().roundId
    set({ playState: newState, pendingTrick: { cards: lastTrick.cards, winner, vitamin: lastTrick.vitamin } })
    setTimeout(() => {
      if (get().roundId !== thisRoundId) return
      set({ pendingTrick: null })
      if (handComplete) {
        set({ phase: 'scoring' })
      } else {
        botDelay(runBotPlay)
      }
    }, TRICK_PAUSE)
  }

  const runBotPlay = () => {
    const { playState, phase, options } = get()
    if (phase !== 'playing' || !playState) return
    if (isHandComplete(playState)) return
    const pc = options.playerCount
    const playedSeats = new Set(playState.currentTrick.cards.map(c => c.seat))
    const ledSeat = playState.currentTrick.ledSeat
    const order = trickOrder(ledSeat, pc)
    const seat = order.find(s => !playedSeats.has(s))
    if (!seat || seat === HUMAN) return
    const pagatUltimoAnnounced = !!(get().announcementState?.announcements.some(a => a.bonus === 'pagat-ultimo'))
    const card = chooseCard(playState, seat, { difficultyBias: 0.5, difficulty: options.botDifficulty, knownPartner: computeKnownPartner(playState), pagatUltimoAnnounced })
    const { newState, trickComplete, trickWinner, handComplete } = playCard(playState, seat, card)
    set({ playState: newState })
    if (trickComplete && trickWinner !== null) {
      resolveTrickDisplay(newState, trickWinner, handComplete)
    } else {
      botDelay(runBotPlay)
    }
  }

  const afterBidResolved = () => {
    const { biddingState, dealResult, options } = get()
    if (!biddingState || !dealResult) return
    const pc = options.playerCount
    const result = pc === 3 ? resolveBidding3(biddingState) : resolveBidding(biddingState)
    if (!result) return
    const { contract, declarer } = result
    const forehand = biddingState.forehand
    const noOneBid = biddingState.highestBid === null
    const nonForehandSeats = pc === 3
      ? ([0, 1, 2] as Seat[]).filter(s => s !== forehand)
      : ([0, 1, 2, 3] as Seat[]).filter(s => s !== forehand)
    const nonForehandAllPassed = nonForehandSeats.every(s => biddingState.passed.has(s))

    if (nonForehandAllPassed && noOneBid && forehand === HUMAN) {
      set({ phase: 'forehand-choice' })
      return
    }
    if (nonForehandAllPassed && noOneBid && forehand !== HUMAN) {
      const botHand = dealResult.hands[forehand]
      const eval_ = evaluateHand(botHand)
      const allContracts: Contract[] = pc === 3
        ? ['klop', 'three', 'two', 'one', 'beggar', 'solo-without', 'open-beggar', 'color-valat-without', 'valat-without']
        : ['klop', 'three', 'two', 'one', 'solo-three', 'solo-two', 'solo-one', 'beggar', 'solo-without', 'open-beggar', 'color-valat-without', 'valat-without']
      const rec = recommendBid(eval_, allContracts, biddingState.isCompulsoryKlop, botHand, get().options.botDifficulty)
      const pickedContract: Contract = rec === 'pass' ? 'klop' : rec
      const newBid = pc === 3
        ? applyBid3(biddingState, { kind: 'bid', contract: pickedContract })
        : applyBid(biddingState, { kind: 'bid', contract: pickedContract })
      set({ biddingState: newBid })
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
      // In 4-player, three/two/one without talon still need a king call
      if (pc === 4 && ['three', 'two', 'one'].includes(contract) && declarer !== HUMAN) {
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
      const { dealerSeat, sessionScores, statistics, playerNames, radliState, roundId, roundHistory, compulsoryKlopNext, options } = get()
      const pc = options.playerCount
      const dealFn = pc === 3 ? deal3 : deal
      let outcome = dealFn(dealerSeat)
      let voidDealSeat: Seat | null = null
      while (outcome.kind === 'void-deal') {
        if (voidDealSeat === null) voidDealSeat = outcome.zeroTrumpSeat
        outcome = dealFn(dealerSeat)
      }
      const isCompulsoryKlop = voidDealSeat !== null || compulsoryKlopNext
      const biddingState = pc === 3
        ? initBidding3(dealerSeat, isCompulsoryKlop)
        : initBidding(dealerSeat, isCompulsoryKlop)
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
        options,
        roundId: roundId + 1,
        roundHistory,
        voidDealSeat,
      })
      botDelay(runBotBid)
    },

    placeBid: (action) => {
      const { biddingState, options } = get()
      if (!biddingState) return
      const pc = options.playerCount
      const newBid = pc === 3 ? applyBid3(biddingState, action) : applyBid(biddingState, action)
      set({ biddingState: newBid })
      if (newBid.done) {
        afterBidResolved()
      } else if (newBid.currentBidder !== HUMAN) {
        botDelay(runBotBid)
      }
    },

    setForehandContract: (contract) => {
      const { dealResult, biddingState, options } = get()
      if (!dealResult || !biddingState) return
      const pc = options.playerCount
      const newBid = pc === 3
        ? applyBid3(biddingState, { kind: 'bid', contract })
        : applyBid(biddingState, { kind: 'bid', contract })
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
      const { dealResult, biddingState, talonExchange, options } = get()
      if (!dealResult || !biddingState) return
      const declarer = biddingState.highestBidder ?? biddingState.forehand
      const newHand = discardHand(dealResult.hands[declarer], cards)
      const newHands = { ...dealResult.hands, [declarer]: newHand }
      const newDealResult = { ...dealResult, hands: newHands }
      const contract = biddingState.highestBid ?? 'three'
      // King call only in 4-player
      const needsKingCall = options.playerCount === 4 && ['three', 'two', 'one'].includes(contract)
      const updatedExchange = talonExchange ? { ...talonExchange, discard: cards } : null
      set({ dealResult: newDealResult, pendingDiscardCount: 0, talonExchange: updatedExchange })
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

    acknowledgeScore: (logText) => {
      const { playState, announcementState, radliState, sessionScores, statistics, dealerSeat, roundId, roundHistory, options } = get()
      const pc = options.playerCount
      const nd = nextDealer(dealerSeat, pc)
      const seats = activeSeats(pc)

      if (!playState) {
        set({ phase: 'idle', dealerSeat: nd })
        return
      }

      const { contract, declarer, partner, capturedCards, completedTricks,
              talonRemainder, mondCapturedWithSkis, mondCapturedBy, kingCall,
              kingInTalonCaptured } = playState
      const ann = announcementState ?? initAnnouncements()
      const effectiveCaptured = adjustCapturedForTalon(capturedCards, talonRemainder, declarer, partner, kingInTalonCaptured)

      const declarerPts = countDeclarerPoints(effectiveCaptured, declarer, partner)
      const isValatContract = contract === 'valat-without' || contract === 'color-valat-without'
      const declarerWon = (contract === 'beggar' || contract === 'open-beggar')
        ? effectiveCaptured[declarer].length === 0
        : isValatContract
          ? completedTricks.every(t => t.winner === declarer)
          : declarerPts >= 36

      const delta: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
      let newStats = statistics
      let valatBonusAchieved = false

      if (contract === 'klop') {
        const klopScores = scoreKlop(capturedCards, seats)
        for (const s of seats) delta[s] = klopScores[s]
      } else {
        const handScore = computeHandScore({
          contract, declarer, partner, capturedCards: effectiveCaptured, talonRemainder,
          mondCapturedWithSkis, mondPlayedBySeat: mondCapturedBy,
          announcementState: ann, completedTricks,
          calledKing: kingCall?.calledKing ?? null,
          radliState, contractBase: CONTRACT_BASE[contract], won: declarerWon,
          playerCount: pc,
        })
        delta[declarer] = handScore.declarerScore
        if (partner !== null) {
          delta[partner] = (handScore.partnerScore ?? handScore.declarerScore) + handScore.mondPenalties[partner]
        }
        for (const s of seats) {
          if (s !== declarer && s !== partner) delta[s] = handScore.opponentScores[s]
        }
        newStats = [...statistics, handScore]
        valatBonusAchieved = handScore.bonusBreakdown.some(b => b.bonus === 'valat' && b.achieved)
      }

      const { newRadliState: afterCancel } = applyRadli(0, radliState, declarer, declarerWon)
      const newRadliState = updateRadliAfterHand(afterCancel, contract, declarerWon, valatBonusAchieved, seats)

      const newScores: Record<Seat, number> = {
        0: sessionScores[0] + delta[0],
        1: sessionScores[1] + delta[1],
        2: sessionScores[2] + delta[2],
        3: sessionScores[3] + delta[3],
      }

      const compulsoryKlopNext = seats.some(
        s => sessionScores[s] !== 0 && newScores[s] === 0,
      )

      const newRoundRecord: RoundRecord = {
        roundNumber: roundId,
        contract,
        declarer,
        scoreDelta: { 0: delta[0], 1: delta[1], 2: delta[2], 3: delta[3] },
        logText,
      }

      set({
        phase: 'setup',
        dealerSeat: nd,
        sessionScores: newScores,
        radliState: newRadliState,
        statistics: newStats,
        roundHistory: [...roundHistory, newRoundRecord],
        playState: null,
        announcementState: null,
        pendingTrick: null,
        biddingState: null,
        dealResult: null,
        talonExchange: null,
        kingCall: null,
        compulsoryKlopNext,
      })
    },

    setOption: (key, value) => {
      set(s => ({ options: { ...s.options, [key]: value } }))
    },

    setBotDifficulty: (d) => {
      localStorage.setItem('tarok-bot-difficulty', d)
      set(s => ({ options: { ...s.options, botDifficulty: d } }))
    },

    setPlayerCount: (n) => {
      localStorage.setItem('tarok-player-count', String(n))
      set(s => ({ options: { ...s.options, playerCount: n } }))
    },

    setPlayerName: (name) => {
      set(s => ({ playerNames: { ...s.playerNames, 0: name.trim() || 'You' } }))
    },

    endGame: () => {
      const { playState, announcementState, radliState, sessionScores, statistics, dealerSeat, playerNames, roundId, options } = get()
      const pc = options.playerCount
      const nd = nextDealer(dealerSeat, pc)
      const seats = activeSeats(pc)

      let newStats = statistics
      const delta: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }

      if (playState) {
        const { contract, declarer, partner, capturedCards, talonRemainder,
                mondCapturedWithSkis, mondCapturedBy, kingCall,
                kingInTalonCaptured } = playState
        const ann = announcementState ?? initAnnouncements()
        const effectiveCaptured = adjustCapturedForTalon(capturedCards, talonRemainder, declarer, partner, kingInTalonCaptured)

        if (contract === 'klop') {
          const klopScores = scoreKlop(capturedCards, seats)
          for (const s of seats) delta[s] = klopScores[s]
        } else {
          const declarerPts = countDeclarerPoints(effectiveCaptured, declarer, partner)
          const isValatContract = contract === 'valat-without' || contract === 'color-valat-without'
          const declarerWon = (contract === 'beggar' || contract === 'open-beggar')
            ? effectiveCaptured[declarer].length === 0
            : isValatContract
              ? playState.completedTricks.every(t => t.winner === declarer)
              : declarerPts >= 36
          const handScore = computeHandScore({
            contract, declarer, partner, capturedCards: effectiveCaptured, talonRemainder,
            mondCapturedWithSkis, mondPlayedBySeat: mondCapturedBy,
            announcementState: ann, completedTricks: playState.completedTricks,
            calledKing: kingCall?.calledKing ?? null,
            radliState, contractBase: CONTRACT_BASE[contract], won: declarerWon,
            playerCount: pc,
          })
          delta[declarer] = handScore.declarerScore
          if (partner !== null) {
            delta[partner] = (handScore.partnerScore ?? handScore.declarerScore) + handScore.mondPenalties[partner]
          }
          for (const s of seats) {
            if (s !== declarer && s !== partner) delta[s] = handScore.opponentScores[s]
          }
          newStats = [...statistics, handScore]
        }
      }

      const finalScores: Record<Seat, number> = {
        0: sessionScores[0] + delta[0],
        1: sessionScores[1] + delta[1],
        2: sessionScores[2] + delta[2],
        3: sessionScores[3] + delta[3],
      }

      const gameRecord = {
        id: crypto.randomUUID(),
        playedAt: Date.now(),
        playerNames: { ...playerNames },
        finalScores,
        rounds: roundId,
        difficulty: options.botDifficulty,
        playerCount: pc,
      }
      saveGameRecord(gameRecord)
      postGameToApi(gameRecord, playerNames[0], finalScores[0])
      consumeDraftRecord()

      const [a, b, c] = pickNames()
      set({
        ...makeInitialState(),
        phase: 'setup',
        playerNames: { ...playerNames, 1: a, 2: b, 3: c },
        dealerSeat: nd,
        statistics: newStats,
        options,
      })
    },

    endGameFromMenu: () => {
      const { sessionScores, playerNames, roundId, phase, dealerSeat, statistics, options } = get()
      const pc = options.playerCount
      const nd = nextDealer(dealerSeat, pc)

      const completedRounds = phase === 'setup' ? roundId : Math.max(0, roundId - 1)

      if (completedRounds > 0) {
        const gameRecord = {
          id: crypto.randomUUID(),
          playedAt: Date.now(),
          playerNames: { ...playerNames },
          finalScores: { ...sessionScores },
          rounds: completedRounds,
          difficulty: options.botDifficulty,
          playerCount: pc,
        }
        saveGameRecord(gameRecord)
        postGameToApi(gameRecord, playerNames[0], sessionScores[0])
      }
      consumeDraftRecord()

      const [a, b, c] = pickNames()
      set({
        ...makeInitialState(),
        phase: 'setup',
        playerNames: { ...playerNames, 1: a, 2: b, 3: c },
        dealerSeat: nd,
        statistics,
        options,
      })
    },

    setCardAppearance: (appearance) => {
      localStorage.setItem('tarok-card-appearance', appearance)
      set({ cardAppearance: appearance })
    },

    resumeAfterReload: () => {
      const { phase, biddingState, playState, options } = get()
      const pc = options.playerCount
      if (phase === 'playing' && playState && isHandComplete(playState)) {
        set({ phase: 'scoring', pendingTrick: null })
        return
      }
      if (phase === 'bidding' && biddingState && !biddingState.done && biddingState.currentBidder !== HUMAN) {
        botDelay(runBotBid)
        return
      }
      if (phase === 'playing' && playState) {
        const playedSeats = new Set(playState.currentTrick.cards.map(c => c.seat))
        const ledSeat = playState.currentTrick.ledSeat
        const order = trickOrder(ledSeat, pc)
        const nextSeat = order.find(s => !playedSeats.has(s))
        if (nextSeat !== undefined && nextSeat !== HUMAN) {
          botDelay(runBotPlay)
        }
      }
    },
  }
}, {
  name: 'tarok-game-state',
  version: 1,
  partialize: (state) => {
    const { pendingTrick: _pt, ...rest } = state
    return rest
  },
}))
