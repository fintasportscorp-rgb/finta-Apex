// Differential engine tests — spec-04
import { describe, it, expect } from 'vitest'
import { computeDifferential, computeSerieDiff } from '../differential/differential'
import { resampleLinear, resampleCircular, circularSd } from '../differential/circular'
import type { MeasureResult } from '../types'

function makeMeasure(
  id: string,
  values: number[],
  type: 'angle' | 'speed' = 'angle',
): MeasureResult {
  const series = values.map((v, i) => ({ t: i * 0.033, value: v, reliable: true }))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  return {
    id, type, unit: type === 'angle' ? 'deg' : 'TL/s', series,
    summary: { min, max, mean, sd, range: max - min, peak: max, t_peak: null },
    reliability: { fraction_reliable: 1, out_of_plane: false, reasons: [] },
  }
}

// ── resampleLinear ───────────────────────────────────────────────────────────

describe('resampleLinear', () => {
  it('resamples 5 values to 101 points, preserving endpoints', () => {
    const input = [0, 25, 50, 75, 100]
    const out = resampleLinear(input, 101)
    expect(out).toHaveLength(101)
    expect(out[0]).toBeCloseTo(0)
    expect(out[100]).toBeCloseTo(100)
  })

  it('returns constant array for single-element input', () => {
    const out = resampleLinear([42], 10)
    expect(out).toHaveLength(10)
    expect(out.every(v => v === 42)).toBe(true)
  })

  it('fills zeros for empty input', () => {
    const out = resampleLinear([], 5)
    expect(out).toHaveLength(5)
    expect(out.every(v => v === 0)).toBe(true)
  })

  it('preserves monotonic increase', () => {
    const out = resampleLinear([0, 100], 11)
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]!)
    }
  })
})

// ── resampleCircular ─────────────────────────────────────────────────────────

describe('resampleCircular', () => {
  it('returns N points', () => {
    const out = resampleCircular([10, 20, 30], 101)
    expect(out).toHaveLength(101)
  })

  it('interpolates across 180°/−180° boundary (shortest arc)', () => {
    // 170° → −170°: crossing 180° boundary, shortest arc is +20°
    const out = resampleCircular([170, -170], 3)
    // midpoint should be near ±180° (not 0°)
    expect(Math.abs(out[1]!)).toBeGreaterThan(90)
  })

  it('returns constant for single-element input', () => {
    const out = resampleCircular([45], 5)
    expect(out.every(v => v === 45)).toBe(true)
  })
})

// ── circularSd ───────────────────────────────────────────────────────────────

describe('circularSd', () => {
  it('returns 0 for identical values', () => {
    expect(circularSd([45, 45, 45], 45)).toBeCloseTo(0)
  })

  it('handles empty array', () => {
    expect(circularSd([], 0)).toBe(0)
  })

  it('is small for a tight cluster near 180° wrap', () => {
    const angles = [178, 179, -179, -178]
    const mean = 180
    const sd = circularSd(angles, mean)
    expect(isNaN(sd)).toBe(false)
    expect(sd).toBeLessThan(5)
  })
})

// ── computeDifferential ──────────────────────────────────────────────────────

describe('computeDifferential', () => {
  it('returns zero mean diff when capture equals model', () => {
    const values = [90, 95, 100, 95, 90]
    const capture = [makeMeasure('knee_angle', values)]
    const model   = [makeMeasure('knee_angle', values)]

    const result = computeDifferential(capture, model)

    expect(result.forme.measures).toHaveLength(1)
    expect(result.forme.measures[0]!.mean).toBeCloseTo(0, 1)
    expect(result.forme.measures[0]!.outOfEnvelope).toBe(false)
  })

  it('detects non-zero diff when signals diverge', () => {
    const capture = [makeMeasure('knee_angle', [70, 75, 80, 75, 70])]
    const model   = [makeMeasure('knee_angle', [90, 95, 100, 95, 90])]

    const result = computeDifferential(capture, model)

    expect(Math.abs(result.forme.measures[0]!.mean)).toBeGreaterThan(5)
  })

  it('diffSeries always has 101 points', () => {
    const capture = [makeMeasure('knee_angle', Array.from({ length: 30 }, (_, i) => 90 + i))]
    const model   = [makeMeasure('knee_angle', Array.from({ length: 30 }, (_, i) => 95 + i))]

    const result = computeDifferential(capture, model)
    expect(result.forme.measures[0]!.diffSeries).toHaveLength(101)
  })

  it('skips measures present in model but absent in capture', () => {
    const capture = [makeMeasure('knee_angle', [90, 90, 90])]
    const model   = [
      makeMeasure('knee_angle', [90, 90, 90]),
      makeMeasure('hip_angle',  [45, 45, 45]),
    ]

    const result = computeDifferential(capture, model)
    expect(result.forme.measures).toHaveLength(1)
    expect(result.forme.measures[0]!.measureId).toBe('knee_angle')
  })

  it('marks outOfEnvelope when |diff_mean| > model.sd × 1.5', () => {
    // Model is flat (sd ≈ 0); capture is 20° away → easily out of envelope
    const model   = [makeMeasure('knee_angle', [90, 90, 90, 90, 90])]
    const capture = [makeMeasure('knee_angle', [70, 70, 70, 70, 70])]

    const result = computeDifferential(capture, model)
    expect(result.forme.measures[0]!.outOfEnvelope).toBe(true)
  })

  it('DTW opt-in produces same structure without crashing', () => {
    const vals = [80, 90, 100, 90, 80]
    const capture = [makeMeasure('knee_angle', vals)]
    const model   = [makeMeasure('knee_angle', vals.map(v => v + 5))]

    const result = computeDifferential(capture, model, { useDtw: true })
    expect(result.forme.measures).toHaveLength(1)
    expect(result.forme.measures[0]!.diffSeries).toHaveLength(101)
    expect(isNaN(result.forme.measures[0]!.mean)).toBe(false)
  })

  it('handles speed (non-circular) measure with correct sign', () => {
    const capture = [makeMeasure('wrist_speed', [1.0, 1.5, 2.0, 1.5, 1.0], 'speed')]
    const model   = [makeMeasure('wrist_speed', [1.3, 1.8, 2.3, 1.8, 1.3], 'speed')]

    const result = computeDifferential(capture, model)
    // capture is ~0.3 lower than model → diff ≈ −0.3
    expect(result.forme.measures[0]!.mean).toBeCloseTo(-0.3, 1)
  })

  it('returns empty forme.measures when capture is empty', () => {
    const model = [makeMeasure('knee_angle', [90, 90, 90])]
    const result = computeDifferential([], model)
    expect(result.forme.measures).toHaveLength(0)
  })
})

// ── computeSerieDiff ─────────────────────────────────────────────────────────

describe('computeSerieDiff', () => {
  it('returns null stats for empty period arrays', () => {
    const result = computeSerieDiff([], [])
    expect(result.avgPeriod_s).toBeNull()
    expect(result.periodSd_s).toBeNull()
    expect(result.drift).toBeNull()
    expect(result.captureCount).toBe(1)
    expect(result.modelCount).toBe(1)
  })

  it('computes correct average period and count', () => {
    const capturePeriods = [1.0, 1.1, 0.9]
    const modelPeriods   = [1.0, 1.0, 1.0]
    const result = computeSerieDiff(capturePeriods, modelPeriods)
    expect(result.avgPeriod_s).toBeCloseTo(1.0, 1)
    expect(result.captureCount).toBe(4)
    expect(result.modelCount).toBe(4)
  })

  it('drift is positive when capture is slower than model', () => {
    const result = computeSerieDiff([1.5, 1.5], [1.0, 1.0])
    expect(result.drift).toBeCloseTo(0.5, 1)
  })

  it('drift is negative when capture is faster than model', () => {
    const result = computeSerieDiff([0.8, 0.8], [1.0, 1.0])
    expect(result.drift!).toBeLessThan(0)
  })

  it('periodSd is 0 for single period', () => {
    const result = computeSerieDiff([1.0], [])
    expect(result.periodSd_s).toBe(0)
  })

  it('periodSd is positive for variable periods', () => {
    const result = computeSerieDiff([0.8, 1.2, 1.0, 0.9, 1.1], [])
    expect(result.periodSd_s).toBeGreaterThan(0)
  })
})
