import type { Card, Seat, DealResult, DealOutcome } from './types'
import { buildDeck, isTrump } from './deck'
import { shuffle } from './shuffle'

// Anticlockwise from seat X: X, X-1, X-2, X-3 (mod 4)
export function anticlockwiseSeatOrder(from: Seat): Seat[] {
  return [
    from,
    ((from + 3) % 4) as Seat,
    ((from + 2) % 4) as Seat,
    ((from + 1) % 4) as Seat,
  ]
}

export function hasZeroTrumps(hand: Card[]): boolean {
  return !hand.some(isTrump)
}

export function dealHands(deck: Card[], dealer: Seat): DealResult {
  // Forehand = player to dealer's right (anticlockwise direction)
  const forehand = ((dealer + 3) % 4) as Seat

  // Deal order for players: forehand → next anticlockwise → next → dealer
  const playerOrder: Seat[] = [
    forehand,
    ((forehand + 3) % 4) as Seat,
    ((forehand + 2) % 4) as Seat,
    ((forehand + 1) % 4) as Seat,
  ]

  // 54 cards: 6 talon + 4×12 per player (the spec mentions 16 but 54-6=48, 48/4=12)
  const talon = deck.slice(0, 6)
  const rest = deck.slice(6) // 48 cards

  const hands: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] }

  // Deal in packets of 6: 8 packets total (2 rounds of 4 players)
  for (let i = 0; i < 8; i++) {
    const seat = playerOrder[i % 4]
    const start = i * 6
    hands[seat].push(...rest.slice(start, start + 6))
  }

  return { hands, talon, dealer, forehand, dealOrder: playerOrder }
}

export function deal(dealer: Seat, rng: () => number = Math.random): DealOutcome {
  const deck = shuffle(buildDeck(), rng)
  const result = dealHands(deck, dealer)

  for (const seat of [0, 1, 2, 3] as Seat[]) {
    if (hasZeroTrumps(result.hands[seat])) {
      return { kind: 'void-deal', zeroTrumpSeat: seat, result }
    }
  }

  return { kind: 'normal', result }
}
