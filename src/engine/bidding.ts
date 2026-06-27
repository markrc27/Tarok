import type { Seat, Contract, BidAction, BiddingState, BiddingResult } from './types'

const CONTRACT_ORDER: Contract[] = [
  'klop', 'three', 'two', 'one',
  'solo-three', 'solo-two', 'solo-one',
  'beggar', 'solo-without', 'open-beggar',
  'color-valat-without', 'valat-without',
]

export function contractStrength(c: Contract): number {
  return CONTRACT_ORDER.indexOf(c)
}

// Speaking order: starts at the player two seats anticlockwise from dealer, going to forehand last
// Forehand = (dealer+3)%4
// Speaking: [(dealer+2)%4, (dealer+1)%4, dealer, forehand]
export function biddingOrder(dealer: Seat): Seat[] {
  const forehand = ((dealer + 3) % 4) as Seat
  return [
    ((dealer + 2) % 4) as Seat,
    ((dealer + 1) % 4) as Seat,
    dealer,
    forehand,
  ]
}

export function availableContracts(isCompulsoryKlop: boolean): Contract[] {
  if (isCompulsoryKlop) {
    // Floor is solo-without; klop through beggar removed (solo-without to valat-without)
    return CONTRACT_ORDER.slice(CONTRACT_ORDER.indexOf('solo-without'))
  }
  return [...CONTRACT_ORDER]
}

export function isForehandOnlyContract(c: Contract): boolean {
  return c === 'klop' || c === 'three'
}

export function legalBids(state: BiddingState, seat: Seat): Contract[] {
  if (state.passed.has(seat)) return []
  if (seat !== state.currentBidder) return []

  const forehand = ((state.dealer + 3) % 4) as Seat
  const available = availableContracts(state.isCompulsoryKlop)

  // Forehand-only contracts are only available when all others have passed (handled in resolve)
  // During normal bidding, klop and three cannot be bid by any player
  const biddable = state.highestBid === null
    ? available.filter(c => !isForehandOnlyContract(c))
    : available.filter(c => !isForehandOnlyContract(c))

  if (state.highestBid === null) {
    // First bid — anyone can bid from two upward (or solo-without in compulsory klop)
    return biddable
  }

  const currentStrength = contractStrength(state.highestBid)

  if (seat === forehand) {
    // Forehand may match or exceed
    return biddable.filter(c => contractStrength(c) >= currentStrength)
  } else {
    // Others must strictly exceed
    return biddable.filter(c => contractStrength(c) > currentStrength)
  }
}

export function initBidding(dealer: Seat, isCompulsoryKlop: boolean): BiddingState {
  const order = biddingOrder(dealer)
  return {
    dealer,
    forehand: ((dealer + 3) % 4) as Seat,
    bids: [],
    currentBidder: order[0],
    highestBid: null,
    highestBidder: null,
    isCompulsoryKlop,
    passed: new Set<Seat>(),
    done: false,
  }
}

export function applyBid(state: BiddingState, action: BidAction): BiddingState {
  const order = biddingOrder(state.dealer)
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

  // Find next bidder (skip passed players)
  let nextIdx = (currentIdx + 1) % 4
  while (newPassed.has(order[nextIdx]) && nextIdx !== currentIdx) {
    nextIdx = (nextIdx + 1) % 4
  }
  const nextBidder = order[nextIdx]

  // Auction ends when 3 players have passed (or all 4)
  const activePlayers = order.filter(s => !newPassed.has(s))
  const done = activePlayers.length <= 1 || newPassed.size === 4

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

export function resolveBidding(state: BiddingState): BiddingResult | null {
  if (!state.done) return null

  const forehand = ((state.dealer + 3) % 4) as Seat

  // All non-forehand players passed without bidding — Forehand chooses
  const nonForehandPassed = [0, 1, 2, 3]
    .filter(s => s !== forehand)
    .every(s => state.passed.has(s as Seat))

  if (nonForehandPassed && state.highestBid === null) {
    // Forehand must choose klop or three (or higher) — engine returns forehand as declarer
    // with klop as default; the UI dialog lets forehand pick
    return {
      contract: state.isCompulsoryKlop ? 'klop' : 'klop',
      declarer: forehand,
      isCompulsoryKlop: state.isCompulsoryKlop,
    }
  }

  // All four passed during compulsory klop → force klop
  if (state.passed.size === 4) {
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
