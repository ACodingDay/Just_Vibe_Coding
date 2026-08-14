/** Geometry ported from GrokBot's geometry.dart (nasawz/GrokBot, BSD-3-Clause). */

import type { GrokBotShapeData } from './data/shapes.ts'

/** Shared view-box constants, in the same 259-unit space as the eye rings. */
export const grokBotFaceCenter = 114.2705
export const grokBotBodyWidth = 228.541
export const grokBotViewBoxSize = 259
export const grokBotViewBoxInset = 15

export interface Vec2 {
  readonly x: number
  readonly y: number
}

/** An elliptical corner radius pair (Dart's Radius.elliptical). */
export interface Radius {
  readonly x: number
  readonly y: number
}

export function clampDouble(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function centroid(ring: readonly Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const point of ring) {
    x += point.x
    y += point.y
  }
  return { x: x / ring.length, y: y / ring.length }
}

/** Maps the normalized gaze (-1..1 per axis) onto the ±13.2 × ±8.4 canvas offset. */
export function mapNormalizedGaze(gaze: Vec2): Vec2 {
  return {
    x: clampDouble(gaze.x, -1, 1) * 13.2,
    y: clampDouble(gaze.y, -1, 1) * 8.4,
  }
}

function expandRadius(values: readonly string[]): readonly string[] {
  if (values.length === 0) return ['0', '0', '0', '0']
  if (values.length === 1) return [values[0]!, values[0]!, values[0]!, values[0]!]
  if (values.length === 2) return [values[0]!, values[1]!, values[0]!, values[1]!]
  if (values.length === 3) return [values[0]!, values[1]!, values[2]!, values[1]!]
  return values.slice(0, 4)
}

function parseRadiusToken(token: string, axisSize: number): number {
  const value = token.trim()
  if (value.endsWith('%')) {
    return ((Number.parseFloat(value.slice(0, -1)) || 0) / 100) * axisSize
  }
  return Number.parseFloat(value) || 0
}

/** The four resolved body corner radii, after CSS-style clamping. */
export type BodyRadii = readonly [Radius, Radius, Radius, Radius]

/**
 * Parses the shape data's CSS border-radius string for a body of the given
 * size, applying the same adjacent-corner clamping as Dart's parseBorderRadius.
 */
export function parseBorderRadius(css: string, width: number, height: number): BodyRadii {
  const parts = css.split('/')
  const horizontalSource = parts[0] ?? ''
  const verticalSource = parts.length > 1 ? parts[1]! : parts[0]!
  const horizontal = expandRadius(horizontalSource.trim().split(/\s+/).filter(x => x.length > 0))
  const vertical = expandRadius(verticalSource.trim().split(/\s+/).filter(x => x.length > 0))
  const radii = Array.from({ length: 4 }, (_, index) => ({
    x: parseRadiusToken(horizontal[index]!, width),
    y: parseRadiusToken(vertical[index]!, height),
  })) as [Radius, Radius, Radius, Radius]

  const clampPair = (a: number, b: number, size: number, horizontalAxis: boolean): void => {
    const first = horizontalAxis ? radii[a]!.x : radii[a]!.y
    const second = horizontalAxis ? radii[b]!.x : radii[b]!.y
    const sum = first + second
    if (sum <= size || sum <= 0) return
    const scale = size / sum
    const scaled = (radius: Radius): Radius => horizontalAxis
      ? { x: radius.x * scale, y: radius.y }
      : { x: radius.x, y: radius.y * scale }
    radii[a] = scaled(radii[a]!)
    radii[b] = scaled(radii[b]!)
  }

  clampPair(0, 1, width, true)
  clampPair(3, 2, width, true)
  clampPair(0, 3, height, false)
  clampPair(1, 2, height, false)
  return radii
}

/** The body's rounded rectangle, resolved for one shape. */
export interface BodyPath {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly radii: BodyRadii
}

export function bodyPathFor(shape: GrokBotShapeData): BodyPath {
  const width = 210 * shape.aspectX
  const height = 210 * shape.aspectY
  const left = grokBotFaceCenter - width / 2
  const top = grokBotFaceCenter - height / 2
  const radii = parseBorderRadius(shape.radius, width, height)
  return { left, top, width, height, radii }
}

export interface ProjectedEye {
  readonly center: Vec2
  readonly scaleX: number
  readonly scaleY: number
  readonly visible: boolean
}

export interface ProjectEyeOptions {
  readonly centroid: Vec2
  readonly origin: Vec2
  readonly radius: number
  readonly turn: number
  readonly gaze: Vec2
  readonly scale: number
  readonly blinkScale: number
}

/**
 * Spherical eye projection: the eye centroid rides a sphere of `radius`
 * around the face origin; head turn moves it along the longitude, width
 * compresses with cos(depth), and the eye hides past the horizon.
 */
export function projectEye(options: ProjectEyeOptions): ProjectedEye {
  const { centroid: c, origin, radius, turn, gaze, scale, blinkScale } = options
  const offset = c.x - origin.x
  const baseLongitude = Math.asin(clampDouble(offset / Math.max(radius, 1), -1, 1))
  const longitude = baseLongitude + turn
  const depth = Math.cos(longitude)
  const perspective = Math.max(depth, 0.02) / Math.max(Math.cos(baseLongitude), 0.02)
  return {
    center: {
      x: origin.x + radius * Math.sin(longitude) + gaze.x,
      y: c.y + gaze.y,
    },
    scaleX: clampDouble(perspective * scale, 0.02, 2.4),
    scaleY: clampDouble(blinkScale * scale, 0.02, 2.4),
    visible: depth > 0.02,
  }
}
