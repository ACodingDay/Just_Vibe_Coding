/**
 * GrokBotPet: the resident GrokBot avatar in the session header. Always
 * visible; the eye expression follows the live conversation snapshot with a
 * spring morph through the thinking/working pools, a turn settle arms a
 * celebration, continuous idle falls asleep, and a click spins the bot one
 * full turn. Rendering is Canvas 2D — a faithful port of GrokBot's
 * CustomPaint painter — driven by the pure engine in animation.ts.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  advance, blinkScaleOf, displayedRings, initialState, moodKey, moodOf,
  type GrokBotEngine, type GrokBotMood,
} from './animation.ts'
import { LIGHT_THEME, MONO_THEME, paintGrokBot } from './render.ts'
import { currentPalette, subscribePalette } from './theme.ts'
import css from './GrokBotPet.module.css'

/** Full props of the header pet: session standard kit + locale seat. */
export type GrokBotPetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'grokbot'>

/** Fallback CSS size before the stylesheet lays the canvas out (also jsdom). */
const FALLBACK_SIZE = 34

/** Whether the snapshot shows the model emitting reasoning with no tool in flight. */
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

/**
 * The header pet. Renders a canvas and drives it on requestAnimationFrame;
 * the fed mood comes from the conversation snapshot, the click arms a spin,
 * and the pointer drives the normalized gaze target.
 */
export function GrokBotPet({ useSession, t }: GrokBotPetProps) {
  const running = useSession(s => s.running)
  const thinking = useSession(isThinking)
  const toolRunning = useSession(s => s.runningCalls.length > 0)
  const seedMood: GrokBotMood = moodOf(running, thinking, toolRunning)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<GrokBotEngine>({ ...initialState(), mood: seedMood })
  const moodRef = useRef<GrokBotMood>(seedMood)
  const gazeTargetRef = useRef({ x: 0, y: 0 })
  const gazeRef = useRef({ x: 0, y: 0 })
  const [pose, setPose] = useState<GrokBotEngine>({ ...initialState(), mood: seedMood })
  const palette = useSyncExternalStore(subscribePalette, currentPalette)
  // The rAF loop's closure is created once; it reads the latest palette
  // through a ref (useSyncExternalStore re-renders but never recreates it).
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  // The loop reads the latest snapshot-derived mood without recreating itself.
  moodRef.current = seedMood

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      const dt = Math.min(now - last, 100)
      last = now
      const prev = engineRef.current
      const next = advance(prev, dt, { mood: moodRef.current })
      engineRef.current = next

      // Gaze eases toward its pointer target each frame.
      gazeRef.current = {
        x: gazeRef.current.x + (gazeTargetRef.current.x - gazeRef.current.x) * 0.12,
        y: gazeRef.current.y + (gazeTargetRef.current.y - gazeRef.current.y) * 0.12,
      }

      const canvas = canvasRef.current
      if (canvas !== null) {
        // The stylesheet owns the layout size (font-scale-linked, responsive);
        // the backing store follows the actual rendered size each frame.
        const cssSize = canvas.clientWidth > 0 ? canvas.clientWidth : FALLBACK_SIZE
        const dpr = Math.min(window.devicePixelRatio || 1, 3)
        const backing = Math.max(1, Math.round(cssSize * dpr))
        if (canvas.width !== backing) canvas.width = backing
        if (canvas.height !== backing) canvas.height = backing
        const ctx = canvas.getContext('2d')
        if (ctx !== null) {
          paintGrokBot(ctx, backing, backing, {
            rings: displayedRings(next),
            gaze: gazeRef.current,
            turn: next.spinAngle,
            blinkScale: blinkScaleOf(next),
            theme: paletteRef.current === 'mono' ? MONO_THEME : LIGHT_THEME,
          })
        }
      }

      if (next.mood !== prev.mood || (next.spinMs !== null) !== (prev.spinMs !== null)) {
        setPose(next)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    gazeTargetRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
    }
  }

  const onPointerLeave = (): void => {
    gazeTargetRef.current = { x: 0, y: 0 }
  }

  const onClick = (): void => {
    // Synchronous advance so the spin is observable even between frames.
    engineRef.current = advance(engineRef.current, 0, { mood: moodRef.current, spinRequested: true })
    setPose(engineRef.current)
  }

  const mood = pose.mood
  return (
    <button
      type="button"
      className={css.pet}
      data-grokbot-pet
      data-mood={mood}
      data-spinning={pose.spinMs !== null}
      role="img"
      aria-label={`${t('title')} · ${t(moodKey(mood))}`}
      title={t(moodKey(mood))}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <canvas ref={canvasRef} className={css.canvas} />
    </button>
  )
}
