/**
 * Ported data integrity: the generated expression rings, the 39 state pools
 * with their cadences, and the 18 shape silhouettes.
 */

import { describe, expect, it } from 'vitest'
import { EXPRESSION_COUNT, RING_POINTS, grokbotExpressions } from '../src/client/data/expressions.ts'
import { EXPRESSION_COUNT as MODEL_EXPRESSION_COUNT, GROKBOT_SHAPES, GROKBOT_STATES } from '../src/client/data/models.ts'
import { grokbotShapeData } from '../src/client/data/shapes.ts'
import { grokbotStateData } from '../src/client/data/states.ts'

describe('expression data', () => {
  it('carries 25 expressions of two 48-point eyes', () => {
    expect(grokbotExpressions).toHaveLength(EXPRESSION_COUNT)
    expect(EXPRESSION_COUNT).toBe(MODEL_EXPRESSION_COUNT)
    for (const [left, right] of grokbotExpressions) {
      expect(left).toHaveLength(RING_POINTS)
      expect(right).toHaveLength(RING_POINTS)
    }
  })

  it('every point is finite and inside the 259-unit view box', () => {
    for (const rings of grokbotExpressions) {
      for (const eye of rings) {
        for (const [x, y] of eye) {
          expect(Number.isFinite(x)).toBe(true)
          expect(Number.isFinite(y)).toBe(true)
          expect(x).toBeGreaterThan(0)
          expect(x).toBeLessThan(259)
          expect(y).toBeGreaterThan(0)
          expect(y).toBeLessThan(259)
        }
      }
    }
  })

  it('rings are open loops (the painter closes them itself)', () => {
    for (const index of [0, 8, 16, 24]) {
      const left = grokbotExpressions[index]![0]
      expect(left[0]).not.toEqual(left[RING_POINTS - 1])
    }
  })
})

describe('state data', () => {
  it('covers all 39 states with valid pools and cadences', () => {
    expect(Object.keys(grokbotStateData).sort()).toEqual([...GROKBOT_STATES].sort())
    for (const state of GROKBOT_STATES) {
      const data = grokbotStateData[state]
      expect(data.expressions.length).toBeGreaterThan(0)
      for (const index of data.expressions) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(EXPRESSION_COUNT)
      }
      expect(data.expressionCadence.min).toBeGreaterThan(0)
      expect(data.expressionCadence.min).toBeLessThanOrEqual(data.expressionCadence.max)
      if (data.blinkCadence !== null) {
        expect(data.blinkCadence.min).toBeGreaterThan(0)
        expect(data.blinkCadence.min).toBeLessThanOrEqual(data.blinkCadence.max)
      }
    }
  })

  it('sleeping disables blinking (GrokBot contract)', () => {
    expect(grokbotStateData.sleeping.blinkCadence).toBeNull()
    expect(grokbotStateData.idle.blinkCadence).not.toBeNull()
  })
})

describe('shape data', () => {
  it('covers all 18 shapes', () => {
    expect(Object.keys(grokbotShapeData).sort()).toEqual([...GROKBOT_SHAPES].sort())
  })

  it('blob is the identity shape', () => {
    expect(grokbotShapeData.blob).toEqual({
      faceX: 0, faceY: 0, faceScaleX: 1, faceScaleY: 1, eyeScale: 1,
      squashOnTurn: false, radius: '50%', aspectX: 1, aspectY: 1,
    })
  })
})
