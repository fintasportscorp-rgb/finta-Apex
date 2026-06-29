// Phase A tests — spec-01 math primitives
import { describe, it, expect } from 'vitest'
import { circularDiff, toY_up, circularMean } from '../engine/types'

describe('circularDiff', () => {
  it('returns ~2° for 1° and 359°', () => {
    const result = circularDiff(1, 359)
    expect(Math.abs(result)).toBeCloseTo(2, 1)
  })

  it('returns 0 for equal angles', () => {
    expect(circularDiff(90, 90)).toBeCloseTo(0, 5)
  })

  it('handles the 350°→10° MediaPipe artefact: diff = +20°', () => {
    // 10° - 350° in circular = +20° (not -340°)
    expect(circularDiff(10, 350)).toBeCloseTo(20, 1)
  })

  it('returns values in (-180, 180]', () => {
    for (let a = 0; a < 360; a += 45) {
      for (let b = 0; b < 360; b += 45) {
        const d = circularDiff(a, b)
        expect(d).toBeGreaterThan(-180.001)
        expect(d).toBeLessThanOrEqual(180.001)
      }
    }
  })
})

describe('toY_up', () => {
  it('converts y=0.3 to yUp=0.7', () => {
    const result = toY_up({ x: 0.5, y: 0.3, confidence: 1.0 })
    expect(result.yUp).toBeCloseTo(0.7, 5)
    expect(result.x).toBe(0.5)
    expect(result.confidence).toBe(1.0)
  })

  it('converts y=0.0 to yUp=1.0', () => {
    const result = toY_up({ x: 0.2, y: 0.0, confidence: 0.8 })
    expect(result.yUp).toBeCloseTo(1.0, 5)
  })

  it('converts y=1.0 to yUp=0.0', () => {
    const result = toY_up({ x: 0.3, y: 1.0, confidence: 0.6 })
    expect(result.yUp).toBeCloseTo(0.0, 5)
  })
})

describe('circularMean', () => {
  it('returns 0° for {350°, 10°} — not 180°', () => {
    const result = circularMean([350, 10])
    // Mean of 350° and 10° should be 0° (wrapping through zero)
    expect(Math.abs(result)).toBeLessThan(1)
  })

  it('returns 90° for {80°, 100°}', () => {
    expect(circularMean([80, 100])).toBeCloseTo(90, 1)
  })

  it('returns 0 for empty array', () => {
    expect(circularMean([])).toBe(0)
  })
})
