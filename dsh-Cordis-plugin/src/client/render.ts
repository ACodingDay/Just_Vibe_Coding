/**
 * Canvas 2D painter ported from GrokBot's grokbot_painter.dart and
 * geometry.dart (nasawz/GrokBot, BSD-3-Clause): body rounded rectangle,
 * two 48-point eye rings with spherical head-turn projection, gaze offset,
 * blink scale, and optional guides.
 */

import { grokbotExpressions, type ExpressionRings } from './data/expressions.ts'
import type { GrokBotShape } from './data/models.ts'
import { grokbotShapeData } from './data/shapes.ts'
import {
  bodyPathFor, centroid, grokBotBodyWidth, grokBotFaceCenter, grokBotViewBoxInset, grokBotViewBoxSize,
  mapNormalizedGaze, projectEye, type BodyPath, type Vec2,
} from './geometry.ts'

export interface GrokBotTheme {
  readonly bodyColor: string
  readonly eyeColor: string
  readonly guideColor: string
  readonly centroidColor: string
}

/** GrokBot's default light-surface theme. */
export const LIGHT_THEME: GrokBotTheme = {
  bodyColor: '#5b7fe5',
  eyeColor: '#fffdf7',
  guideColor: '#6e7067',
  centroidColor: '#e36f3d',
}

/** GrokBot's dark-surface preset. */
export const DARK_THEME: GrokBotTheme = {
  bodyColor: '#6689ea',
  eyeColor: '#181a15',
  guideColor: '#a5a89d',
  centroidColor: '#ff8b5e',
}

/** Black & white palette for light GUI surfaces (dsh-ui-grokbot addition). */
export const MONO_THEME: GrokBotTheme = {
  bodyColor: '#111318',
  eyeColor: '#ffffff',
  guideColor: '#8a8f98',
  centroidColor: '#ff6b4a',
}

export interface PaintOptions {
  /** The displayed eye rings (spring-interpolated, two eyes). */
  readonly rings: ExpressionRings
  readonly shape?: GrokBotShape
  /** Normalized gaze, each axis in [-1, 1]. */
  readonly gaze?: Vec2
  /** Head turn in radians. */
  readonly turn?: number
  readonly eyeScale?: number
  /** Eye vertical scale during a blink pass. */
  readonly blinkScale?: number
  readonly flipX?: boolean
  /** Enlarges the eyes by 18 percent. */
  readonly emphasis?: boolean
  /** Paints the spherical guide and projected eye centroids. */
  readonly showGuides?: boolean
  readonly theme?: GrokBotTheme
}

/** Trace one 48-point eye ring into a closed Path2D. */
function ringPath(ring: readonly Vec2[]): Path2D {
  const path = new Path2D()
  const first = ring[0]!
  path.moveTo(first.x, first.y)
  for (let index = 1; index < ring.length; index += 1) {
    const point = ring[index]!
    path.lineTo(point.x, point.y)
  }
  path.closePath()
  return path
}

/** Trace the body rounded rectangle with elliptical corners (CSS radius semantics). */
function bodyPath(body: BodyPath): Path2D {
  const { left, top, width, height, radii } = body
  const [tl, tr, br, bl] = radii
  const path = new Path2D()
  path.moveTo(left + tl.x, top)
  path.lineTo(left + width - tr.x, top)
  path.ellipse(left + width - tr.x, top + tr.y, tr.x, tr.y, 0, -Math.PI / 2, 0)
  path.lineTo(left + width, top + height - br.y)
  path.ellipse(left + width - br.x, top + height - br.y, br.x, br.y, 0, 0, Math.PI / 2)
  path.lineTo(left + bl.x, top + height)
  path.ellipse(left + bl.x, top + height - bl.y, bl.x, bl.y, 0, Math.PI / 2, Math.PI)
  path.lineTo(left, top + tl.y)
  path.ellipse(left + tl.x, top + tl.y, tl.x, tl.y, 0, Math.PI, Math.PI * 1.5)
  path.closePath()
  return path
}

/** Horizontal squash of body and clipped face around the face center (Dart's _applyBodySquash). */
function squashAroundFace(ctx: CanvasRenderingContext2D, bodyScale: number): void {
  ctx.translate(grokBotFaceCenter, grokBotFaceCenter)
  ctx.scale(bodyScale, 1)
  ctx.translate(-grokBotFaceCenter, -grokBotFaceCenter)
}

/**
 * Paint one GrokBot frame into a square-ish canvas area. The full frame is
 * composited here, so the canvas is cleared first — Canvas 2D does not clear
 * itself between frames, and skipping the clear leaves ghosts of the previous
 * frame (shape switches, blink, hidden eyes during spin).
 * @param ctx - the 2D context (null-safe callers must guard).
 * @param width - canvas width in CSS pixels.
 * @param height - canvas height in CSS pixels.
 * @param options - frame content.
 */
export function paintGrokBot(ctx: CanvasRenderingContext2D, width: number, height: number, options: PaintOptions): void {
  const shapeData = grokbotShapeData[options.shape ?? 'blob']
  const gaze = options.gaze ?? { x: 0, y: 0 }
  const turn = options.turn ?? 0
  const eyeScale = options.eyeScale ?? 1
  const blinkScale = options.blinkScale ?? 1
  const theme = options.theme ?? LIGHT_THEME

  ctx.clearRect(0, 0, width, height)

  const side = Math.min(width, height)
  const scaleToCanvas = side / grokBotViewBoxSize
  ctx.save()
  ctx.translate((width - side) / 2, (height - side) / 2)
  ctx.scale(scaleToCanvas, scaleToCanvas)
  ctx.translate(grokBotViewBoxInset, grokBotViewBoxInset)

  if (options.flipX === true) {
    ctx.translate(grokBotBodyWidth, 0)
    ctx.scale(-1, 1)
  }

  const body = bodyPathFor(shapeData)
  const bodyScale = shapeData.squashOnTurn ? Math.max(Math.cos(turn), 0.55) : 1

  ctx.save()
  squashAroundFace(ctx, bodyScale)
  ctx.fillStyle = theme.bodyColor
  ctx.fill(bodyPath(body))
  ctx.restore()

  const origin: Vec2 = {
    x: grokBotFaceCenter + shapeData.faceX,
    y: grokBotFaceCenter + shapeData.faceY,
  }

  if (options.showGuides === true) {
    ctx.save()
    ctx.strokeStyle = theme.guideColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(origin.x, origin.y, (210 * shapeData.faceScaleX) / 2, 70 / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  ctx.save()
  squashAroundFace(ctx, bodyScale)
  ctx.clip(bodyPath(body))
  ctx.translate(grokBotFaceCenter, grokBotFaceCenter)
  ctx.scale(1 / bodyScale, 1)
  ctx.translate(-grokBotFaceCenter, -grokBotFaceCenter)

  const mappedGaze = mapNormalizedGaze(gaze)
  const baseScale = eyeScale * (options.emphasis === true ? 1.18 : 1) * shapeData.eyeScale
  const radius = 105 * Math.min(shapeData.faceScaleX, shapeData.faceScaleY)
  const projectedCenters: Vec2[] = []

  for (const ring of options.rings) {
    const corrected: Vec2[] = ring.map(point => ({
      x: origin.x + (point[0] - grokBotFaceCenter) * shapeData.faceScaleX,
      y: origin.y + (point[1] - grokBotFaceCenter) * shapeData.faceScaleY,
    }))
    const center = centroid(corrected)
    const projection = projectEye({
      centroid: center,
      origin,
      radius,
      turn,
      gaze: mappedGaze,
      scale: baseScale,
      blinkScale,
    })
    projectedCenters.push(projection.center)
    if (!projection.visible) continue
    ctx.save()
    ctx.translate(projection.center.x, projection.center.y)
    ctx.scale(projection.scaleX, projection.scaleY)
    ctx.translate(-center.x, -center.y)
    ctx.fillStyle = theme.eyeColor
    ctx.fill(ringPath(corrected))
    ctx.restore()
  }
  ctx.restore()

  if (options.showGuides === true) {
    ctx.save()
    ctx.fillStyle = theme.centroidColor
    for (const point of projectedCenters) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  ctx.restore()
}

/** Static frame helper: the rings of one expression by index. */
export function expressionRings(index: number): ExpressionRings {
  const rings = grokbotExpressions[index]
  if (rings === undefined) throw new RangeError(`expression index out of range: ${index}`)
  return rings
}
