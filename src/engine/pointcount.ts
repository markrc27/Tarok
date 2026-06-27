import type { Card } from './types'
import { cardPoints } from './deck'

export function countPoints(cards: Card[]): number {
  if (cards.length === 0) return 0

  const pts = cards.map(cardPoints)
  let total = 0
  const fullGroups = Math.floor(pts.length / 3)
  const remainder = pts.length % 3

  for (let i = 0; i < fullGroups; i++) {
    total += pts[i * 3] + pts[i * 3 + 1] + pts[i * 3 + 2] - 2
  }

  if (remainder > 0) {
    const start = fullGroups * 3
    let leftoverSum = 0
    for (let i = start; i < pts.length; i++) leftoverSum += pts[i]
    total += leftoverSum - 1
  }

  return total
}
