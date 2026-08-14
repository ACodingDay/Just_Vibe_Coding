/**
 * Animation engine behavior: mood derivation from snapshot signals, the
 * spring morph (convergence, no overshoot), the blink pass, the turn-settle
 * celebration, the sleep delay, and automatic expression retargets.
 * Pure-function tests — no timers.
 */

import { describe, expect, it } from 'vitest'
import {
  advance, BLINK_MS, blinkScaleOf, CELEBRATE_MS, displayedRings, initialState, moodKey, moodOf, SLEEP_DELAY_MS,
} from '../src/client/animation.ts'
import { RING_POINTS } from '../src/client/data/expressions.ts'
import { grokbotStateData } from '../src/client/data/states.ts'

/** Deterministic rng: always the given value in [0, 1]. */
const fixedRng = (value: number) => () => value

describe('moodOf', () => {
  it('maps snapshot signals to moods', () => {
    expect(moodOf(false, false, false)).toBe('idle')
    expect(moodOf(true, false, false)).toBe('writing')
    expect(moodOf(true, true, false)).toBe('thinking')
    expect(moodOf(true, false, true)).toBe('working')
    expect(moodOf(true, true, true)).toBe('working')
  })

  it('emits locale mood keys', () => {
    expect(moodKey('idle')).toBe('mood.idle')
    expect(moodKey('celebrate')).toBe('mood.celebrate')
  })
})

describe('spring morph', () => {
  it('retargets on a state change and converges to rest', () => {
    let s = initialState(fixedRng(1))
    s = advance(s, 0, { mood: 'working' }, fixedRng(1))
    expect(s.state).toBe('working')
    expect(s.target).toBe(grokbotStateData.working.expressions[0])
    expect(s.morph).toBe(0)
    for (let i = 0; i < 300 && s.morph < 1; i += 1) {
      s = advance(s, 8, { mood: 'working' }, fixedRng(1))
    }
    expect(s.morph).toBe(1)
    expect(s.velocity).toBe(0)
  })

  it('is critically damped: never overshoots the target', () => {
    let s = advance(initialState(fixedRng(1)), 0, { mood: 'thinking' }, fixedRng(1))
    for (let i = 0; i < 300; i += 1) {
      s = advance(s, 8, { mood: 'thinking' }, fixedRng(1))
      expect(s.morph).toBeLessThanOrEqual(1 + 1e-6)
      if (s.morph >= 1) break
    }
  })

  it('displayedRings interpolates the two eyes between current and target', () => {
    let s = advance(initialState(fixedRng(1)), 0, { mood: 'working' }, fixedRng(1))
    s = advance(s, 100, { mood: 'working' }, fixedRng(1))
    const rings = displayedRings(s)
    expect(rings[0]).toHaveLength(RING_POINTS)
    expect(rings[1]).toHaveLength(RING_POINTS)
    const from = displayedRings({ ...s, morph: 0 })
    const to = displayedRings({ ...s, morph: 1 })
    const mid = rings[0]![0]!
    const lo = Math.min(from[0]![0]![0], to[0]![0]![0])
    const hi = Math.max(from[0]![0]![0], to[0]![0]![0])
    expect(mid[0]).toBeGreaterThanOrEqual(lo - 1e-9)
    expect(mid[0]).toBeLessThanOrEqual(hi + 1e-9)
  })
})

describe('blink', () => {
  it('runs one 320 ms pass with the closing-first curve', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, 0, { mood: 'idle', blinkRequested: true }, fixedRng(0.5))
    expect(s.blinkMs).toBe(0)
    s = advance(s, BLINK_MS * 0.21, { mood: 'idle' }, fixedRng(0.5))
    expect(blinkScaleOf(s)).toBeCloseTo(0.5, 5)
    s = advance(s, BLINK_MS * 0.79 + 1, { mood: 'idle' }, fixedRng(0.5))
    expect(s.blinkMs).toBeNull()
    expect(blinkScaleOf(s)).toBe(1)
  })

  it('disables auto blink while sleeping (null cadence)', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, SLEEP_DELAY_MS + 1, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('sleeping')
    expect(s.blinkTimerMs).toBe(-1)
  })
})

describe('mood transitions', () => {
  it('arms the celebration on the turn-settle edge and returns to idle', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, 100, { mood: 'working' }, fixedRng(0.5))
    s = advance(s, 16, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('celebrate')
    expect(s.celebrateLeftMs).toBeGreaterThan(0)
    // The celebration expires during this frame, then the next frame is idle.
    s = advance(s, CELEBRATE_MS + 1, { mood: 'idle' }, fixedRng(0.5))
    expect(s.celebrateLeftMs).toBe(0)
    s = advance(s, 16, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('idle')
  })

  it('falls asleep after 10 s of continuous idle and wakes on activity', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, SLEEP_DELAY_MS - 1, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('idle')
    s = advance(s, 2, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('sleeping')
    s = advance(s, 16, { mood: 'thinking' }, fixedRng(0.5))
    expect(s.mood).toBe('thinking')
  })

  it('sleep is sticky across idle re-feeds', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, SLEEP_DELAY_MS + 1, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('sleeping')
    s = advance(s, 16, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('sleeping')
  })

  it('a click wakes the sleeping bot and re-arms the idle pool', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, SLEEP_DELAY_MS + 1, { mood: 'idle' }, fixedRng(0.5))
    expect(s.mood).toBe('sleeping')
    s = advance(s, 0, { mood: 'idle', spinRequested: true }, fixedRng(0.5))
    expect(s.mood).toBe('idle')
    expect(s.state).toBe('idle')
    expect(s.spinMs).toBe(0)
    expect(s.target).toBe(grokbotStateData.idle.expressions[0])
    expect(s.blinkTimerMs).toBeGreaterThanOrEqual(0)
  })

  it('picks a different pool member when the expression timer expires', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, 0, { mood: 'thinking' }, fixedRng(0.5))
    const before = s.current
    let guard = 0
    while (s.current === before && guard < 100) {
      s = advance(s, 1000, { mood: 'thinking' }, fixedRng(0.5))
      guard += 1
    }
    expect(guard).toBeLessThan(100)
    expect(s.current).not.toBe(before)
    expect(grokbotStateData[s.state].expressions).toContain(s.current)
  })
})

describe('spin', () => {
  it('completes one eased turn and resets', () => {
    let s = initialState(fixedRng(0.5))
    s = advance(s, 0, { mood: 'idle', spinRequested: true }, fixedRng(0.5))
    expect(s.spinMs).toBe(0)
    s = advance(s, 600, { mood: 'idle' }, fixedRng(0.5))
    expect(s.spinAngle).toBeCloseTo(Math.PI, 6)
    s = advance(s, 601, { mood: 'idle' }, fixedRng(0.5))
    expect(s.spinMs).toBeNull()
    expect(s.spinAngle).toBe(0)
  })
})
