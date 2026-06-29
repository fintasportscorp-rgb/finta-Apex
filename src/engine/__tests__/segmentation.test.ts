// Segmentation tests — spec-03
import { describe, it, expect } from 'vitest'
import { segmentDiscrete } from '../segmentation/discrete'
import { detectCycles, countCyclesLive } from '../segmentation/cyclic'
import { computeWindowStats } from '../segmentation/continuous'
import type { MeasureResult } from '../types'

function makeMeasure(id: string, values: number[], reliable = true): MeasureResult {
  const series = values.map((v, i) => ({ t: i * 0.033, value: v, reliable }))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  return {
    id, type: 'angle', unit: 'deg', series,
    summary: { min, max, mean, sd, range: max - min, peak: max, t_peak: null },
    reliability: { fraction_reliable: reliable ? 1 : 0, out_of_plane: false, reasons: [] },
  }
}

// ── segmentDiscrete ──────────────────────────────────────────────────────────

describe('segmentDiscrete', () => {
  it('detects segment when signal rises above threshold (with debounce)', () => {
    // 3 frames above 100 → debounce satisfied → ACTIVE; 3 frames above 150 → end
    const values = [70, 80, 90, 105, 110, 115, 145, 155, 160, 165, 70, 70]
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.033)

    const segments = segmentDiscrete(
      [measure],
      {
        start: { signal: 'angle:knee_angle', op: 'rises_above', threshold: 100 },
        end:   { signal: 'angle:knee_angle', op: 'rises_above', threshold: 150 },
        min_duration_s: 0,
      },
      timestamps,
    )

    expect(segments.length).toBeGreaterThan(0)
  })

  it('rejects segment shorter than min_duration_s', () => {
    // Start and end conditions are both met quickly — total < 1 s
    const values = [70, 70, 70, 110, 115, 120, 155, 160, 165, 70, 70]
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.033) // ~0.36 s total

    const segments = segmentDiscrete(
      [measure],
      {
        start: { signal: 'angle:knee_angle', op: 'rises_above', threshold: 100 },
        end:   { signal: 'angle:knee_angle', op: 'rises_above', threshold: 150 },
        min_duration_s: 1.0,
      },
      timestamps,
    )

    expect(segments.length).toBe(0)
  })

  it('returns empty when measures array is empty', () => {
    const segments = segmentDiscrete(
      [],
      {
        start: { signal: 'angle:knee_angle', op: 'rises_above', threshold: 100 },
        end:   { signal: 'angle:knee_angle', op: 'falls_below', threshold: 80 },
      },
      [0, 0.033, 0.066],
    )
    expect(segments).toEqual([])
  })

  it('terminates at max_duration_s even without end condition being met', () => {
    // End condition requires 500° (never met); max_duration_s = 0.5 s
    const values = Array.from({ length: 60 }, (_, i) => 110 + i)
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.033)

    const segments = segmentDiscrete(
      [measure],
      {
        start: { signal: 'angle:knee_angle', op: 'rises_above', threshold: 100 },
        end:   { signal: 'angle:knee_angle', op: 'rises_above', threshold: 500 },
        min_duration_s: 0,
        max_duration_s: 0.5,
      },
      timestamps,
    )

    expect(segments.length).toBeGreaterThan(0)
    for (const seg of segments) {
      expect(seg.end_t - seg.start_t).toBeLessThanOrEqual(0.6)
    }
  })

  it('segment frame_start and frame_end are valid indices', () => {
    const values = [70, 70, 70, 110, 115, 120, 155, 160, 165, 70, 70]
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.1)

    const segments = segmentDiscrete(
      [measure],
      {
        start: { signal: 'angle:knee_angle', op: 'rises_above', threshold: 100 },
        end:   { signal: 'angle:knee_angle', op: 'rises_above', threshold: 150 },
        min_duration_s: 0,
      },
      timestamps,
    )

    for (const seg of segments) {
      expect(seg.frame_start).toBeGreaterThanOrEqual(0)
      expect(seg.frame_end).toBeLessThan(values.length)
      expect(seg.frame_end).toBeGreaterThanOrEqual(seg.frame_start)
    }
  })
})

// ── detectCycles ─────────────────────────────────────────────────────────────

describe('detectCycles', () => {
  it('detects local maxima in oscillating signal', () => {
    const n = 60
    const values = Array.from({ length: n }, (_, i) => 50 + 50 * Math.sin(i * 2 * Math.PI / 20))
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.033)

    const cycles = detectCycles(
      [measure],
      { cycle_signal: 'knee_angle', boundary: 'local_maxima' },
      timestamps,
    )

    expect(cycles.length).toBeGreaterThanOrEqual(2)
    for (const c of cycles) {
      expect(c.value).toBeGreaterThan(90)
    }
  })

  it('detects local minima', () => {
    const n = 60
    const values = Array.from({ length: n }, (_, i) => 50 + 50 * Math.sin(i * 2 * Math.PI / 20))
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.033)

    const cycles = detectCycles(
      [measure],
      { cycle_signal: 'knee_angle', boundary: 'local_minima' },
      timestamps,
    )

    expect(cycles.length).toBeGreaterThanOrEqual(2)
    for (const c of cycles) {
      expect(c.value).toBeLessThan(10)
    }
  })

  it('respects min_period_s anti-bounce', () => {
    const n = 60
    const values = Array.from({ length: n }, (_, i) => 50 + 50 * Math.sin(i * 2 * Math.PI / 5))
    const measure = makeMeasure('knee_angle', values)
    const timestamps = values.map((_, i) => i * 0.033)

    const unfiltered = detectCycles([measure], { cycle_signal: 'knee_angle', boundary: 'local_maxima', min_period_s: 0 }, timestamps)
    const filtered   = detectCycles([measure], { cycle_signal: 'knee_angle', boundary: 'local_maxima', min_period_s: 0.5 }, timestamps)

    expect(filtered.length).toBeLessThan(unfiltered.length)
  })

  it('returns empty when measure id not found', () => {
    const measure = makeMeasure('other_measure', [1, 2, 3])
    const cycles = detectCycles(
      [measure],
      { cycle_signal: 'knee_angle', boundary: 'local_maxima' },
      [0, 0.033, 0.066],
    )
    expect(cycles).toEqual([])
  })

  it('returns empty for fewer than 3 frames', () => {
    const measure = makeMeasure('knee_angle', [50, 100])
    const cycles = detectCycles([measure], { cycle_signal: 'knee_angle', boundary: 'local_maxima' }, [0, 0.033])
    expect(cycles).toEqual([])
  })
})

describe('countCyclesLive', () => {
  it('detects cycle when peak descends from above threshold', () => {
    const series = [{ value: 125, reliable: true }]
    const result = countCyclesLive(series, 135, 'local_maxima', 120)
    expect(result.cycleDetected).toBe(true)
    expect(result.newPeak).toBe(125)
  })

  it('no cycle when value still rising', () => {
    const series = [{ value: 140, reliable: true }]
    const result = countCyclesLive(series, 130, 'local_maxima', 120)
    expect(result.cycleDetected).toBe(false)
  })

  it('no cycle when previous peak below threshold', () => {
    const series = [{ value: 100, reliable: true }]
    const result = countCyclesLive(series, 115, 'local_maxima', 120)
    expect(result.cycleDetected).toBe(false)
  })

  it('returns prevPeak unchanged when series is empty', () => {
    const result = countCyclesLive([], 80, 'local_maxima', 60)
    expect(result.newPeak).toBe(80)
    expect(result.cycleDetected).toBe(false)
  })
})

// ── computeWindowStats ───────────────────────────────────────────────────────

describe('computeWindowStats', () => {
  it('computes correct mean and range over window', () => {
    const values = [10, 20, 30, 40, 50]
    const timestamps = values.map((_, i) => i * 1.0)
    const measure = makeMeasure('knee_angle', values)

    // At frame 4 (t=4), windowStart=1 → frames t=1,2,3,4 → values 20,30,40,50 → mean=35
    const stats = computeWindowStats(measure, 4, 3, timestamps)

    expect(stats.windowMean).toBeCloseTo(35, 0)
    expect(stats.windowMin).toBeCloseTo(20, 0)
    expect(stats.windowMax).toBeCloseTo(50, 0)
    expect(stats.id).toBe('knee_angle')
  })

  it('current matches series value at given frame', () => {
    const values = [10, 20, 30]
    const measure = makeMeasure('knee_angle', values)
    const stats = computeWindowStats(measure, 1, 10, [0, 1, 2])
    expect(stats.current).toBeCloseTo(20, 0)
  })

  it('handles single-frame gracefully with no NaN', () => {
    const measure = makeMeasure('knee_angle', [42])
    const stats = computeWindowStats(measure, 0, 5, [0])
    expect(isNaN(stats.windowMean)).toBe(false)
    expect(isNaN(stats.windowSd)).toBe(false)
  })
})
