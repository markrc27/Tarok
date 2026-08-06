import { describe, it, expect } from 'vitest'
import { initBidding3, applyBid3, resolveBidding3, legalBids3, biddingOrder3 } from '../src/engine/bidding3'
import { mondPenalty, scoreKlop } from '../src/engine/scoring'
import type { Seat } from '../src/engine/types'

describe('biddingOrder3', () => {
  it('dealer=0 → order [1, 0, 2] (forehand=2 last)', () => {
    expect(biddingOrder3(0)).toEqual([1, 0, 2])
  })
  it('dealer=1 → order [2, 1, 0] (forehand=0 last)', () => {
    expect(biddingOrder3(1)).toEqual([2, 1, 0])
  })
  it('dealer=2 → order [0, 2, 1] (forehand=1 last)', () => {
    expect(biddingOrder3(2)).toEqual([0, 2, 1])
  })
})

describe('legalBids3', () => {
  it('first bidder can bid three through valat-without (no solo-three/two/one)', () => {
    const state = initBidding3(0, false)
    const legal = legalBids3(state, 1) // first in order for dealer=0
    expect(legal).toContain('two')
    expect(legal).toContain('three')
    expect(legal).toContain('valat-without')
    expect(legal).not.toContain('klop')
    expect(legal).not.toContain('solo-three')
    expect(legal).not.toContain('solo-two')
    expect(legal).not.toContain('solo-one')
  })

  it('three is available to all in 3-player (not forehand-only)', () => {
    const state = initBidding3(0, false)
    const legal = legalBids3(state, 1)
    expect(legal).toContain('three')
  })

  it('klop is never in legal bids during normal bidding', () => {
    const state = initBidding3(0, false)
    expect(legalBids3(state, 1)).not.toContain('klop')
  })

  it('passed seat has no legal bids', () => {
    let state = initBidding3(0, false)
    state = applyBid3(state, { kind: 'pass' }) // seat 1 passes
    expect(legalBids3(state, 1)).toEqual([])
  })
})

describe('applyBid3 and resolveBidding3', () => {
  it('all three pass → klop for forehand', () => {
    let state = initBidding3(0, false) // forehand=2
    state = applyBid3(state, { kind: 'pass' }) // seat 1
    state = applyBid3(state, { kind: 'pass' }) // seat 0
    state = applyBid3(state, { kind: 'pass' }) // seat 2 (forehand)
    expect(state.done).toBe(true)
    const result = resolveBidding3(state)
    expect(result?.contract).toBe('klop')
    expect(result?.declarer).toBe(2) // forehand
  })

  it('non-forehand bids two, forehand matches, non-forehand passes → forehand wins', () => {
    let state = initBidding3(0, false) // dealer=0, order=[1,0,2], forehand=2
    state = applyBid3(state, { kind: 'pass' })              // seat 1 passes
    state = applyBid3(state, { kind: 'bid', contract: 'two' }) // seat 0 bids two
    state = applyBid3(state, { kind: 'bid', contract: 'two' }) // forehand=2 matches
    expect(state.done).toBe(false) // seat 0 still needs to act
    state = applyBid3(state, { kind: 'pass' })              // seat 0 passes (can't outbid)
    expect(state.done).toBe(true)
    const result = resolveBidding3(state)
    expect(result?.contract).toBe('two')
    expect(result?.declarer).toBe(2)
  })

  it('auction ends when 2 players have passed', () => {
    let state = initBidding3(1, false) // dealer=1, forehand=0
    state = applyBid3(state, { kind: 'bid', contract: 'three' }) // seat 2
    state = applyBid3(state, { kind: 'pass' }) // seat 1
    state = applyBid3(state, { kind: 'pass' }) // seat 0 (forehand) — can't beat three without matching
    // After 2 passes, only one active player (seat 2) remains
    expect(state.done).toBe(true)
    const result = resolveBidding3(state)
    expect(result?.declarer).toBe(2)
    expect(result?.contract).toBe('three')
  })

  it('non-forehand must strictly outbid; forehand may match', () => {
    let state = initBidding3(0, false) // forehand=2
    state = applyBid3(state, { kind: 'bid', contract: 'two' }) // seat 1
    // seat 0 must strictly exceed two
    const legal0 = legalBids3(state, 0)
    expect(legal0).not.toContain('two')
    expect(legal0).toContain('one')

    state = applyBid3(state, { kind: 'pass' }) // seat 0 passes
    // forehand=2 can match two
    const legalFH = legalBids3(state, 2)
    expect(legalFH).toContain('two')
    expect(legalFH).toContain('one')
  })
})

describe('3-player scoring: mond penalty -21', () => {
  it('mondPenalty is -21 in 3-player', () => {
    const result = mondPenalty(true, 1, 3)
    expect(result[1]).toBe(-21)
  })

  it('mondPenalty is -20 in 4-player', () => {
    const result = mondPenalty(true, 1, 4)
    expect(result[1]).toBe(-20)
  })
})

describe('3-player scoreKlop uses only active seats', () => {
  it('seat 3 gets 0 and does not get +70 for empty hand', () => {
    const captured = { 0: [] as never[], 1: [] as never[], 2: [] as never[], 3: [] as never[] }
    const result = scoreKlop(captured, [0, 1, 2])
    expect(result[0]).toBe(70)
    expect(result[1]).toBe(70)
    expect(result[2]).toBe(70)
    expect(result[3]).toBe(0)
  })
})
