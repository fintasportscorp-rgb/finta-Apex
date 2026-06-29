import { describe, it, expect } from 'vitest'
import { computeSpeedMeasure } from '../primitives/speed'
import { makeFrame } from './helpers'
import type { MeasureSample } from '../types'

function makeSamples(values: number[], timestamps: number[], reliable = true): MeasureSample[] {
  return values.map((value, i) => ({ t: timestamps[i]!, value, reliable }))
}

describe('speed — from_series angular', () => {
  it('constant angular speed: [0,30,60,90,120] at 30fps → ~900 deg/s', () => {
    const fps = 30
    const values = [0, 30, 60, 90, 120]
    const timestamps = values.map((_, i) => i / fps)
    const samples = makeSamples(values, timestamps)
    const result = computeSpeedMeasure([], {
      kind: 'from_series',
      id: 'knee_ang_speed',
      mode: 'angular',
      sourceSamples: samples,
      torsoLengthRef: 0.25,
    })
    // v(t) = circularDiff(next, prev) / (2*dt) = 60 / (2/30) = 60 * 15 = 900 deg/s
    const reliableSamples = result.series.filter(s => s.reliable)
    expect(reliableSamples.length).toBeGreaterThan(0)
    for (const s of reliableSamples) {
      expect(s.value).toBeCloseTo(900, 0)
    }
  })

  it('marks frame unreliable when dt > 3/30 s (frame gap)', () => {
    const values = [0, 30, 60, 90]
    const timestamps = [0, 0.033, 0.2, 0.233]  // gap at index 2: dt = 0.2 - 0.033 = 0.167 > 0.1
    const samples = makeSamples(values, timestamps)
    const result = computeSpeedMeasure([], {
      kind: 'from_series',
      id: 'spd',
      mode: 'angular',
      sourceSamples: samples,
      torsoLengthRef: 0.25,
    })
    // Frame 2 (index 2) should have dt = 0.2 - 0.033 = 0.167 > MAX_DT (0.1)
    expect(result.series[2]!.reliable).toBe(false)
  })

  it('edges (first and last) are always unreliable', () => {
    const samples = makeSamples([0, 10, 20, 30, 40], [0, 0.033, 0.066, 0.1, 0.133])
    const result = computeSpeedMeasure([], {
      kind: 'from_series', id: 'spd', mode: 'angular', sourceSamples: samples, torsoLengthRef: 0.25
    })
    expect(result.series[0]!.reliable).toBe(false)
    expect(result.series[result.series.length - 1]!.reliable).toBe(false)
  })

  it('unit is deg/s for angular', () => {
    const samples = makeSamples([0, 10, 20], [0, 0.033, 0.066])
    const result = computeSpeedMeasure([], {
      kind: 'from_series', id: 'spd', mode: 'angular', sourceSamples: samples, torsoLengthRef: 0.25
    })
    expect(result.unit).toBe('deg/s')
  })
})

describe('speed — from_point linear', () => {
  it('unit is TL/s for linear from_point', () => {
    const frames = [
      makeFrame(0, { right_wrist: { x: 0.4, y: 0.5, confidence: 0.9 } }),
      makeFrame(0.033, { right_wrist: { x: 0.5, y: 0.5, confidence: 0.9 } }),
      makeFrame(0.066, { right_wrist: { x: 0.6, y: 0.5, confidence: 0.9 } }),
    ]
    const result = computeSpeedMeasure(frames, {
      kind: 'from_point', id: 'wrist_speed', point: 'right_wrist', torsoLengthRef: 0.25
    })
    expect(result.unit).toBe('TL/s')
  })

  it('no NaN in output', () => {
    const frames = [
      makeFrame(0, { right_wrist: { x: 0.5, y: 0.5, confidence: 0.9 } }),
      makeFrame(0.033, { right_wrist: { x: 0.5, y: 0.5, confidence: 0.9 } }),
      makeFrame(0.066, { right_wrist: { x: 0.5, y: 0.5, confidence: 0.9 } }),
    ]
    const result = computeSpeedMeasure(frames, {
      kind: 'from_point', id: 'wrist_speed', point: 'right_wrist', torsoLengthRef: 0.25
    })
    for (const s of result.series) {
      expect(isNaN(s.value)).toBe(false)
    }
  })
})
