/**
 * Geometry port behavior: centroid, gaze mapping, CSS radius parsing with
 * clamping, the body rectangle, and the spherical eye projection.
 */

import { describe, expect, it } from 'vitest'
import { grokbotShapeData } from '../src/client/data/shapes.ts'
import {
  bodyPathFor, centroid, grokBotFaceCenter, mapNormalizedGaze, parseBorderRadius, projectEye,
} from '../src/client/geometry.ts'

describe('centroid', () => {
  it('averages the ring points', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 3 }])).toEqual({ x: 1, y: 1 })
  })
})

describe('mapNormalizedGaze', () => {
  it('maps and clamps the normalized gaze', () => {
    expect(mapNormalizedGaze({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(mapNormalizedGaze({ x: 1, y: -1 })).toEqual({ x: 13.2, y: -8.4 })
    expect(mapNormalizedGaze({ x: 5, y: -5 })).toEqual({ x: 13.2, y: -8.4 })
  })
})

describe('parseBorderRadius', () => {
  it('expands the single-token form on both axes', () => {
    const radii = parseBorderRadius('50%', 100, 200)
    expect(radii[0]).toEqual({ x: 50, y: 100 })
  })

  it('parses the slash form per axis', () => {
    const radii = parseBorderRadius('50% / 32%', 200, 200)
    expect(radii[0]).toEqual({ x: 100, y: 64 })
  })

  it('clamps adjacent pairs that exceed the box', () => {
    const radii = parseBorderRadius('100%', 100, 100)
    expect(radii[0]!.x + radii[1]!.x).toBeLessThanOrEqual(100 + 1e-9)
    expect(radii[0]!.y + radii[3]!.y).toBeLessThanOrEqual(100 + 1e-9)
  })
})

describe('bodyPathFor', () => {
  it('centers the blob body on the face center at the base width', () => {
    const body = bodyPathFor(grokbotShapeData.blob)
    expect(body.left + body.width / 2).toBeCloseTo(grokBotFaceCenter, 6)
    expect(body.top + body.height / 2).toBeCloseTo(grokBotFaceCenter, 6)
    expect(body.width).toBe(210)
  })
})

describe('projectEye', () => {
  const origin = { x: grokBotFaceCenter, y: grokBotFaceCenter }
  const centroidPoint = { x: 80, y: 110 }
  const radius = 105

  it('is the identity at zero turn with zero gaze', () => {
    const projection = projectEye({ centroid: centroidPoint, origin, radius, turn: 0, gaze: { x: 0, y: 0 }, scale: 1, blinkScale: 1 })
    expect(projection.visible).toBe(true)
    expect(projection.center.x).toBeCloseTo(centroidPoint.x, 6)
    expect(projection.center.y).toBeCloseTo(centroidPoint.y, 6)
    expect(projection.scaleX).toBeCloseTo(1, 6)
    expect(projection.scaleY).toBeCloseTo(1, 6)
  })

  it('offsets the center by the mapped gaze and passes the blink scale through', () => {
    const projection = projectEye({ centroid: centroidPoint, origin, radius, turn: 0, gaze: { x: 13.2, y: 8.4 }, scale: 1, blinkScale: 0.5 })
    expect(projection.center.x).toBeCloseTo(80 + 13.2, 6)
    expect(projection.center.y).toBeCloseTo(110 + 8.4, 6)
    expect(projection.scaleY).toBeCloseTo(0.5, 6)
  })

  it('hides the eye past the horizon', () => {
    const projection = projectEye({ centroid: centroidPoint, origin, radius, turn: Math.PI, gaze: { x: 0, y: 0 }, scale: 1, blinkScale: 1 })
    expect(projection.visible).toBe(false)
  })
})
