// Adversarial test suite — spec-09
// 5 fixtures: zéro crash · zéro NaN · uniquement reliable:false
import { describe, it, expect } from 'vitest'
import { computeAngleMeasure } from '../primitives/angle'
import { computeSpeedMeasure } from '../primitives/speed'
import { computePositionMeasure } from '../primitives/position'
import { computeRotationMeasure } from '../primitives/rotation'
import { makeFrame } from './helpers'
import type { PoseFrame } from '../types'

function noNaN(measureFn: () => { series: Array<{ value: number }> }) {
  const result = measureFn()
  for (const s of result.series) {
    if (!isFinite(s.value)) throw new Error(`NaN/Infinity in series: ${s.value}`)
  }
}

// Fixture 1: torso_zero — all landmarks at same position
describe('adversarial: torso_zero', () => {
  const zeroFrames = Array.from({ length: 5 }, (_, i) =>
    makeFrame(i * 0.033, {
      right_hip:      { x: 0.5, y: 0.5, confidence: 0.9 },
      right_knee:     { x: 0.5, y: 0.5, confidence: 0.9 },
      right_ankle:    { x: 0.5, y: 0.5, confidence: 0.9 },
      right_shoulder: { x: 0.5, y: 0.5, confidence: 0.9 },
      left_shoulder:  { x: 0.5, y: 0.5, confidence: 0.9 },
      left_hip:       { x: 0.5, y: 0.5, confidence: 0.9 },
    }),
  )

  it('angle: no NaN, reliable=false when landmarks identical', () => {
    noNaN(() => computeAngleMeasure(zeroFrames, {
      id: 'knee_angle', mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    }))
    const result = computeAngleMeasure(zeroFrames, {
      id: 'knee_angle', mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    for (const s of result.series) expect(s.reliable).toBe(false)
  })

  it('position: no NaN when torso_length ≈ 0', () => {
    noNaN(() => computePositionMeasure(zeroFrames, {
      id: 'pos', point: 'hip_center', axis: 'x',
    }))
  })
})

// Fixture 2: trou_frames — frame gap > 3×(1/30) at index 2
describe('adversarial: trou_frames', () => {
  const trouTimestamps = [0, 0.033, 0.2, 0.233]
  const trouValues = [0, 30, 60, 90]

  it('speed: reliable=false at frame gap (dt > 0.1 s)', () => {
    const samples = trouValues.map((value, i) => ({
      t: trouTimestamps[i]!,
      value,
      reliable: true,
    }))
    const result = computeSpeedMeasure([], {
      kind: 'from_series', id: 'spd', mode: 'angular',
      sourceSamples: samples, torsoLengthRef: 0.25,
    })
    // At index 2: prev=0.033, next=0.233 → dt=0.2 > MAX_DT=0.1
    expect(result.series[2]!.reliable).toBe(false)
  })
})

// Fixture 3: saut_360 — angle 179°→−179° should unwrap to ≈ 2° displacement
describe('adversarial: saut_360', () => {
  function makeSegFrame(theta: number, i: number): PoseFrame {
    const rad = (theta * Math.PI) / 180
    return makeFrame(i * 0.033, {
      right_hip:      { x: 0.5, y: 0.5, confidence: 0.95 },
      right_shoulder: { x: 0.5 + 0.1 * Math.cos(rad), y: 0.5 - 0.1 * Math.sin(rad), confidence: 0.95 },
    })
  }

  it('angular_displacement ≈ 2° when crossing 179°→−179°', () => {
    const thetas = [179, -179]
    const frames = thetas.map(makeSegFrame)
    const result = computeRotationMeasure(frames, {
      id: 'rotation_test', mode: 'angular_displacement',
      points: ['right_hip', 'right_shoulder'],
    })
    const last = result.series[result.series.length - 1]!
    expect(isNaN(last.value)).toBe(false)
    expect(Math.abs(last.value)).toBeCloseTo(2, 0)
  })
})

// Fixture 4: confidence_zero — one landmark with confidence=0
describe('adversarial: confidence_zero', () => {
  const frames = Array.from({ length: 5 }, (_, i) =>
    makeFrame(i * 0.033, {
      right_hip:   { x: 0.5, y: 0.2, confidence: 0.0 },  // zero confidence
      right_knee:  { x: 0.5, y: 0.5, confidence: 0.9 },
      right_ankle: { x: 0.5, y: 0.8, confidence: 0.9 },
      right_shoulder: { x: 0.5, y: 0.05, confidence: 0.9 },
      left_shoulder:  { x: 0.5, y: 0.05, confidence: 0.9 },
      left_hip:       { x: 0.5, y: 0.2, confidence: 0.9 },
    }),
  )

  it('angle: reliable=false when any landmark has confidence=0', () => {
    const result = computeAngleMeasure(frames, {
      id: 'knee_angle', mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    for (const s of result.series) {
      expect(s.reliable).toBe(false)
      expect(isNaN(s.value)).toBe(false)
    }
  })
})

// Fixture 5: landmark_identique — a == b in joint angle → ‖v‖ < ε
describe('adversarial: landmark_identique', () => {
  const frames = Array.from({ length: 5 }, (_, i) =>
    makeFrame(i * 0.033, {
      right_hip:   { x: 0.5, y: 0.5, confidence: 0.95 },  // same as knee
      right_knee:  { x: 0.5, y: 0.5, confidence: 0.95 },  // identical to hip
      right_ankle: { x: 0.5, y: 0.8, confidence: 0.95 },
      right_shoulder: { x: 0.5, y: 0.1, confidence: 0.95 },
      left_shoulder:  { x: 0.5, y: 0.1, confidence: 0.95 },
      left_hip:       { x: 0.5, y: 0.5, confidence: 0.95 },
    }),
  )

  it('no NaN when a == b (‖v1‖ < ε)', () => {
    const result = computeAngleMeasure(frames, {
      id: 'knee_angle', mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    for (const s of result.series) {
      expect(isNaN(s.value)).toBe(false)
      expect(s.reliable).toBe(false)
    }
  })
})
