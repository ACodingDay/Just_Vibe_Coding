/**
 * Standalone visual demo of the GrokBot engine + painter: the big canvas
 * cycles idle → thinking → working (a turn settle arms the celebration),
 * a click spins the bot, the pointer drives the gaze, and the grid renders
 * all 25 expressions statically. No DSH imports — build with `pnpm build`
 * and open demo/index.html in any browser.
 */

import {
  advance, blinkScaleOf, displayedRings, initialState, type GrokBotEngine, type GrokBotMood,
} from '../src/client/animation.ts'
import { DARK_THEME, LIGHT_THEME, MONO_THEME, expressionRings, paintGrokBot, type GrokBotTheme } from '../src/client/render.ts'
import { GROKBOT_SHAPES, type GrokBotShape } from '../src/client/data/models.ts'
import { EXPRESSION_COUNT } from '../src/client/data/expressions.ts'

const CYCLE: readonly GrokBotMood[] = ['idle', 'thinking', 'working']
const HOLD_MS: Record<GrokBotMood, number> = {
  idle: 5000, thinking: 4500, working: 5500, writing: 3000, sleeping: 0, celebrate: 0,
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`missing #${id}`)
  return node as T
}

const main = el<HTMLCanvasElement>('grokbot-main')
const status = el<HTMLSpanElement>('grokbot-status')
const shapeSelect = el<HTMLSelectElement>('grokbot-shape')
const themeSelect = el<HTMLSelectElement>('grokbot-theme')
const guides = el<HTMLInputElement>('grokbot-guides')
const grid = el<HTMLDivElement>('grokbot-grid')

for (const shape of GROKBOT_SHAPES) {
  const option = document.createElement('option')
  option.value = shape
  option.textContent = shape
  shapeSelect.appendChild(option)
}

const MAIN_CSS = 240
const DPR = Math.min(window.devicePixelRatio || 1, 2)

function sizeCanvas(canvas: HTMLCanvasElement, css: number): CanvasRenderingContext2D {
  canvas.width = Math.round(css * DPR)
  canvas.height = Math.round(css * DPR)
  canvas.style.width = `${css}px`
  canvas.style.height = `${css}px`
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d unavailable')
  return ctx
}

const mainCtx = sizeCanvas(main, MAIN_CSS)

function theme(): GrokBotTheme {
  if (themeSelect.value === 'dark') return DARK_THEME
  if (themeSelect.value === 'mono') return MONO_THEME
  return LIGHT_THEME
}

function shape(): GrokBotShape {
  return shapeSelect.value as GrokBotShape
}

function showGuides(): boolean {
  return guides.checked
}

/** Static thumbnails: one per expression, re-rendered on shape/theme change. */
function renderGrid(): void {
  grid.replaceChildren()
  for (let index = 0; index < EXPRESSION_COUNT; index += 1) {
    const cell = document.createElement('div')
    cell.className = 'thumb'
    const canvas = document.createElement('canvas')
    const ctx = sizeCanvas(canvas, 120)
    paintGrokBot(ctx, canvas.width, canvas.height, {
      rings: expressionRings(index),
      shape: shape(),
      theme: theme(),
    })
    const label = document.createElement('div')
    label.textContent = String(index)
    cell.append(canvas, label)
    grid.appendChild(cell)
  }
}

renderGrid()
shapeSelect.addEventListener('change', renderGrid)
themeSelect.addEventListener('change', renderGrid)

let engine: GrokBotEngine = initialState()
let cycleIndex = 0
let cycleLeft = HOLD_MS[CYCLE[0]!]!
let gaze = { x: 0, y: 0 }
let last = performance.now()

main.addEventListener('pointermove', (event) => {
  const rect = main.getBoundingClientRect()
  gaze = {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
  }
})
main.addEventListener('pointerleave', () => { gaze = { x: 0, y: 0 } })
main.addEventListener('click', () => {
  engine = advance(engine, 0, { mood: CYCLE[cycleIndex]!, spinRequested: true })
})

function frame(now: number): void {
  const dt = Math.min(now - last, 100)
  last = now
  cycleLeft -= dt
  if (cycleLeft <= 0) {
    cycleIndex = (cycleIndex + 1) % CYCLE.length
    cycleLeft = HOLD_MS[CYCLE[cycleIndex]!]!
  }
  engine = advance(engine, dt, { mood: CYCLE[cycleIndex]! })
  const blink = engine.blinkMs === null ? '—' : engine.blinkMs.toFixed(0)
  status.textContent = `${engine.mood} / ${engine.state} · expr ${engine.target} · morph ${engine.morph.toFixed(2)} · blink ${blink}`
  paintGrokBot(mainCtx, main.width, main.height, {
    rings: displayedRings(engine),
    shape: shape(),
    gaze,
    turn: engine.spinAngle,
    blinkScale: blinkScaleOf(engine),
    showGuides: showGuides(),
    theme: theme(),
  })
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
