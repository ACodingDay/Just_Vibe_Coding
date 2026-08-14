/**
 * GrokBot animation engine. Pure and timer-free: the component feeds elapsed
 * time and the snapshot-derived mood, this module decides everything — the
 * effective GrokBot state, expression retargets with a critically damped
 * spring morph, the 320 ms blink pass, the turn-settle celebration, the
 * 10 s idle sleep, and the click spin. Ported from GrokBot's grokbot.dart
 * state machine (nasawz/GrokBot, BSD-3-Clause) with the dsh-ui-whale mood
 * derivation.
 */

import { grokbotExpressions, type ExpressionRings } from './data/expressions.ts'
import type { GrokBotState } from './data/models.ts'
import { grokbotStateData } from './data/states.ts'
import { clampDouble } from './geometry.ts'

/** The pet's observable moods, from most to least idle. */
export type GrokBotMood = 'idle' | 'sleeping' | 'thinking' | 'working' | 'writing' | 'celebrate'

/** Natural frequency of the expression morph spring (GrokBot default). */
export const SPRING_FREQUENCY = 7

/** One blink pass: 320 ms, closing faster than opening. */
export const BLINK_MS = 320

/** Continuous idle before the bot falls asleep (10 s). */
export const SLEEP_DELAY_MS = 10_000

/** Celebration length after a turn settles (GrokBot's celebrate cadence ceiling). */
export const CELEBRATE_MS = 2600

/** Click spin: one full turn over 1200 ms with an easeInOutCubic curve. */
export const SPIN_MS = 1200

/**
 * Derive the pet mood from the conversation snapshot.
 * @param running - whether the session's turn is active.
 * @param thinking - whether the model is emitting reasoning (no tool in flight).
 * @param toolRunning - whether a tool call is in flight.
 */
export function moodOf(running: boolean, thinking: boolean, toolRunning: boolean): GrokBotMood {
  if (!running) return 'idle'
  if (toolRunning) return 'working'
  if (thinking) return 'thinking'
  return 'writing'
}

/** Mood → GrokBot state (expression pool + cadences from state_data.dart). */
const MOOD_STATE: Record<GrokBotMood, GrokBotState> = {
  idle: 'idle',
  sleeping: 'sleeping',
  thinking: 'thinking',
  working: 'working',
  writing: 'writing',
  celebrate: 'celebrate',
}

export interface GrokBotEngine {
  /** Effective mood: the fed base mood plus derived celebrate/sleeping. */
  readonly mood: GrokBotMood
  /** The GrokBot state owning the current expression pool and cadences. */
  readonly state: GrokBotState
  /** The expression currently morphing from (index). */
  readonly current: number
  /** The expression morphing to (index). */
  readonly target: number
  /** Spring position, 0 = current rings, 1 = target rings. */
  readonly morph: number
  /** Spring velocity. */
  readonly velocity: number
  /** Elapsed blink time in ms; null = not blinking. */
  readonly blinkMs: number | null
  /** Ticks until the next automatic blink; -1 = auto blink disabled. */
  readonly blinkTimerMs: number
  /** Ticks until the next automatic expression change. */
  readonly expressionTimerMs: number
  /** Celebration time remaining; > 0 keeps the celebrate mood. */
  readonly celebrateLeftMs: number
  /** Consecutive idle time; drives the sleep delay. */
  readonly idleStreakMs: number
  /** Elapsed spin time in ms; null = not spinning. */
  readonly spinMs: number | null
  /** Current spin angle in radians (eased). */
  readonly spinAngle: number
}

export interface AdvanceInput {
  readonly mood: GrokBotMood
  /** True when the pet was clicked: (re)arms the one-turn spin. */
  readonly spinRequested?: boolean
  /** True to force an immediate blink pass (not used by the pet today). */
  readonly blinkRequested?: boolean
}

/** Random cadence draw inside [min, max], ms. */
function randomCadence(minimum: number, maximum: number, rng: () => number): number {
  return minimum + Math.round(rng() * (maximum - minimum))
}

function randomIndex(length: number, rng: () => number): number {
  return Math.floor(rng() * length)
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** The initial engine: the idle pool's first expression, timers armed. */
export function initialState(rng: () => number = Math.random): GrokBotEngine {
  const data = grokbotStateData.idle
  const first = data.expressions[0]!
  return {
    mood: 'idle',
    state: 'idle',
    current: first,
    target: first,
    morph: 1,
    velocity: 0,
    blinkMs: null,
    blinkTimerMs: data.blinkCadence === null ? -1 : randomCadence(data.blinkCadence.min, data.blinkCadence.max, rng),
    expressionTimerMs: randomCadence(data.expressionCadence.min, data.expressionCadence.max, rng),
    celebrateLeftMs: 0,
    idleStreakMs: 0,
    spinMs: null,
    spinAngle: 0,
  }
}

/** The rings currently displayed: the spring interpolation between current and target. */
export function displayedRings(state: GrokBotEngine): ExpressionRings {
  if (state.morph >= 1) return grokbotExpressions[state.target]!
  const from = grokbotExpressions[state.current]!
  const to = grokbotExpressions[state.target]!
  const amount = clampDouble(state.morph, 0, 1)
  const eye = (index: 0 | 1) => Array.from({ length: from[index].length }, (_, point) => {
    const a = from[index][point]!
    const b = to[index][point]!
    return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount] as const
  })
  return [eye(0), eye(1)]
}

/** The eye vertical scale during the 320 ms blink pass (GrokBot's curve). */
export function blinkScaleOf(state: GrokBotEngine): number {
  const ms = state.blinkMs
  if (ms === null) return 1
  const progress = ms / BLINK_MS
  return Math.max(progress < 0.42 ? 1 - progress / 0.42 : (progress - 0.42) / 0.58, 0.04)
}

/**
 * Advance the engine one frame.
 * @param prev - the previous engine state.
 * @param dtMs - elapsed milliseconds since the previous frame.
 * @param input - the fed base mood and interaction requests.
 * @param rng - random source (injectable for deterministic tests).
 * @returns the next engine state.
 */
export function advance(prev: GrokBotEngine, dtMs: number, input: AdvanceInput, rng: () => number = Math.random): GrokBotEngine {
  const base = input.mood
  const dt = Math.max(0, dtMs)

  // A turn settle (an active mood → idle) arms the one-shot celebration; it
  // holds until the countdown ends, even if a new turn starts meanwhile.
  // Engine-derived moods (sleeping, celebrate) never re-arm it.
  const ACTIVE_MOODS: readonly GrokBotMood[] = ['thinking', 'working', 'writing']
  const armedCelebrate = base === 'idle' && ACTIVE_MOODS.includes(prev.mood)
  let celebrateLeft = armedCelebrate ? CELEBRATE_MS : prev.celebrateLeftMs
  let effective: GrokBotMood = celebrateLeft > 0 ? 'celebrate' : base

  // Sleep: sticky once asleep; activity (a non-idle base) or a direct
  // interaction (click spin / forced blink) wakes the bot.
  const interaction = input.spinRequested === true || input.blinkRequested === true
  const idleStreak = base === 'idle' && !interaction ? Math.min(prev.idleStreakMs + dt, SLEEP_DELAY_MS) : 0
  const asleep = prev.mood === 'sleeping' && !interaction
  if (base === 'idle' && (asleep || idleStreak >= SLEEP_DELAY_MS)) {
    effective = celebrateLeft > 0 ? 'celebrate' : 'sleeping'
  }

  const state: GrokBotState = MOOD_STATE[effective]
  const data = grokbotStateData[state]

  // Retarget when the state changed: morph from the displayed rings to the
  // new pool's first expression (Dart's _selectExpression(pool.first)).
  let current = prev.current
  let target = prev.target
  let morph = prev.morph
  let velocity = prev.velocity
  let expressionTimer = prev.expressionTimerMs
  let blinkTimer = prev.blinkTimerMs
  let blinkMs = prev.blinkMs

  const retarget = (next: number): void => {
    current = next
    target = next
    morph = 0
    velocity = 0
  }

  if (state !== prev.state) {
    retarget(data.expressions[0]!)
    expressionTimer = randomCadence(data.expressionCadence.min, data.expressionCadence.max, rng)
    blinkTimer = data.blinkCadence === null ? -1 : randomCadence(data.blinkCadence.min, data.blinkCadence.max, rng)
    if (data.blinkCadence === null) blinkMs = null
  }

  // Spring integration: critically damped (ζ = 1), ω = SPRING_FREQUENCY,
  // 1/120 s substeps capped at 100 ms per frame — GrokBot's exact scheme.
  const springDt = Math.min(dt / 1000, 0.1)
  let remaining = springDt
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120)
    velocity += (-2 * SPRING_FREQUENCY * velocity - SPRING_FREQUENCY * SPRING_FREQUENCY * (morph - 1)) * step
    morph += velocity * step
    remaining -= step
  }
  if (Math.abs(morph - 1) < 0.001 && Math.abs(velocity) < 0.001) {
    morph = 1
    velocity = 0
  }

  // Automatic expression changes: pick a pool member different from current.
  expressionTimer -= dt
  if (expressionTimer <= 0) {
    const alternatives = data.expressions.filter(item => item !== current)
    retarget(alternatives.length > 0 ? alternatives[randomIndex(alternatives.length, rng)]! : data.expressions[0]!)
    expressionTimer = randomCadence(data.expressionCadence.min, data.expressionCadence.max, rng)
  }

  // Blink: countdown only while the eyes are open; the pass re-arms the timer.
  if (blinkTimer >= 0) {
    if (blinkMs === null) {
      blinkTimer -= dt
      if (blinkTimer <= 0) blinkMs = 0
    }
  }
  if (input.blinkRequested === true) blinkMs = 0
  if (blinkMs !== null) {
    blinkMs += dt
    if (blinkMs >= BLINK_MS) {
      blinkMs = null
      if (blinkTimer >= 0) blinkTimer = randomCadence(data.blinkCadence!.min, data.blinkCadence!.max, rng)
    }
  }

  // Spin: one eased full turn; a new request replaces the active spin.
  let spinMs = prev.spinMs
  let spinAngle = prev.spinAngle
  if (input.spinRequested === true) spinMs = 0
  if (spinMs !== null) {
    spinMs += dt
    const progress = clampDouble(spinMs / SPIN_MS, 0, 1)
    spinAngle = easeInOutCubic(progress) * Math.PI * 2
    if (progress >= 1) {
      spinMs = null
      spinAngle = 0
    }
  }

  celebrateLeft = Math.max(0, celebrateLeft - dt)

  return {
    mood: effective,
    state,
    current,
    target,
    morph,
    velocity,
    blinkMs,
    blinkTimerMs: blinkTimer,
    expressionTimerMs: expressionTimer,
    celebrateLeftMs: celebrateLeft,
    idleStreakMs: idleStreak,
    spinMs,
    spinAngle,
  }
}

/** The mood label keys of the `grokbot` locale namespace. */
export type GrokBotMoodKey = `mood.${GrokBotMood}`

/** Human-readable mood key for the aria-label (locale namespace `grokbot`). */
export function moodKey(mood: GrokBotMood): GrokBotMoodKey {
  return `mood.${mood}`
}
