import type { Card, Seat, DealResult, DealOutcome } from './types'
import { buildDeck, isTrump } from './deck'
import { shuffle } from './shuffle'

// 3-player: forehand = (dealer+2)%3 (one seat anticlockwise from dealer)
// 16 cards each in two packets of 8; talon still 6 cards
// Seat 3 always has an empty hand

export function dealHands3(deck: Card[], dealer: Seat): DealResult {
  const forehand = ((dealer + 2) % 3) as Seat

  // Deal order anticlockwise: forehand, (forehand-1), dealer
  const activePlayers: Seat[] = [
    forehand,
    ((forehand + 2) % 3) as Seat,
    dealer,
  ]

  const talon = deck.slice(0, 6)
  const rest = deck.slice(6) // 48 cards → 16 each

  const hands: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] }

  // Two rounds of 3 players, 8 cards per packet
  for (let i = 0; i < 6; i++) {
    const seat = activePlayers[i % 3]
    const start = i * 8
    hands[seat].push(...rest.slice(start, start + 8))
  }

  return { hands, talon, dealer, forehand, dealOrder: [...activePlayers, 3 as Seat] }
}

export function deal3(dealer: Seat, rng: () => number = Math.random): DealOutcome {
  const deck = shuffle(buildDeck(), rng)
  const result = dealHands3(deck, dealer)

  for (const seat of [0, 1, 2] as Seat[]) {
    if (!result.hands[seat].some(isTrump)) {
      return { kind: 'void-deal', zeroTrumpSeat: seat, result }
    }
  }

  return { kind: 'normal', result }
}
