import { buildDeck } from '../engine/deck'
import { cardImageSrc, CARD_BACK_SRC } from './CardSprite'

// Warm the browser cache with every traditional-mode card image (plus the card
// back) so a card's picture is already decoded by the time it's dealt or played.
// Without this, each PNG is fetched lazily on its first render, which shows as a
// blank/flashing card for a moment — sometimes not resolving before the trick
// moves on. Idempotent and cheap (54 small PNGs); safe to call more than once.
let started = false

export function preloadTraditionalCards(): void {
  if (started) return
  started = true

  const urls = [CARD_BACK_SRC, ...buildDeck().map(cardImageSrc)]
  for (const url of urls) {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}
