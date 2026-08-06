import type { Seat, Contract, BidAction, BiddingState, BiddingResult } from './types'
import { contractStrength, availableContracts } from './bidding'

// 3-player bidding:
// forehand = (dealer+2)%3
// Speaking order: [(dealer+1)%3, dealer, forehand] (farthest from forehand first)
// Auction ends when 2 players passed (or all 3)
// 'three' is NOT forehand-only in 3-player — any seat may bid it (it's a solo contract)
// Only 'klop' is forehand-only

export function biddingOrder3(dealer: Seat): Seat[] {
  const forehand = ((dealer + 2) % 3) as Seat
  return [
    ((dealer + 1) % 3) as Seat,
    dealer,
    forehand,
  ]
}

export function legalBids3(state: BiddingState, seat: Seat): Contract[] {
  if (state.passed.has(seat)) return []
  if (seat !== state.currentBidder) return []

  const forehand = ((state.dealer + 2) % 3) as Seat
  const available = availableContracts(state.isCompulsoryKlop)

  // In 3-player: klop is forehand-only; solo-three/two/one are redundant with three/two/one
  const biddable = available.filter(c => c !== 'klop' && c !== 'solo-three' && c !== 'solo-two' && c !== 'solo-one')

  if (state.highestBid === null) {
    return biddable
  }

  const currentStrength = contractStrength(state.highestBid)

  if (seat === forehand) {
    return biddable.filter(c => contractStrength(c) >= currentStrength)
  } else {
    return biddable.filter(c => contractStrength(c) > currentStrength)
  }
}

export function initBidding3(dealer: Seat, isCompulsoryKlop: boolean): BiddingState {
  const order = biddingOrder3(dealer)
  return {
    dealer,
    forehand: ((dealer + 2) % 3) as Seat,
    bids: [],
    currentBidder: order[0],
    highestBid: null,
    highestBidder: null,
    isCompulsoryKlop,
    passed: new Set<Seat>(),
    done: false,
  }
}

export function applyBid3(state: BiddingState, action: BidAction): BiddingState {
  const order = biddingOrder3(state.dealer)
  const currentIdx = order.indexOf(state.currentBidder)
  const newBids = [...state.bids, { seat: state.currentBidder, action }]
  const newPassed = new Set(state.passed)

  let newHighestBid = state.highestBid
  let newHighestBidder = state.highestBidder

  if (action.kind === 'pass') {
    newPassed.add(state.currentBidder)
  } else {
    newHighestBid = action.contract
    newHighestBidder = state.currentBidder
  }

  let nextIdx = (currentIdx + 1) % 3
  while (newPassed.has(order[nextIdx]) && nextIdx !== currentIdx) {
    nextIdx = (nextIdx + 1) % 3
  }
  const nextBidder = order[nextIdx]

  const activePlayers = order.filter(s => !newPassed.has(s))
  const done = activePlayers.length <= 1 || newPassed.size === 3

  return {
    ...state,
    bids: newBids,
    currentBidder: nextBidder,
    highestBid: newHighestBid,
    highestBidder: newHighestBidder,
    passed: newPassed,
    done,
  }
}

export function resolveBidding3(state: BiddingState): BiddingResult | null {
  if (!state.done) return null

  const forehand = ((state.dealer + 2) % 3) as Seat

  const nonForehandPassed = [0, 1, 2]
    .filter(s => s !== forehand)
    .every(s => state.passed.has(s as Seat))

  if (nonForehandPassed && state.highestBid === null) {
    return {
      contract: 'klop',
      declarer: forehand,
      isCompulsoryKlop: state.isCompulsoryKlop,
    }
  }

  if (state.passed.size === 3) {
    return {
      contract: 'klop',
      declarer: forehand,
      isCompulsoryKlop: state.isCompulsoryKlop,
    }
  }

  if (state.highestBidder === null || state.highestBid === null) return null

  return {
    contract: state.highestBid,
    declarer: state.highestBidder,
    isCompulsoryKlop: state.isCompulsoryKlop,
  }
}
