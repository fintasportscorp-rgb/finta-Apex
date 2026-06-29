import { describe, it, expect } from 'vitest'
import { computeAngleMeasure } from '../primitives/angle'
import { makeFrame, makeKneeFrames, makeStraightKneeFrames } from './helpers'

describe('angle — joint mode', () => {
  it('returns ~180° for a straight leg (hip/knee/ankle collinear vertical)', () => {
    const frames = makeStraightKneeFrames(5)
    const result = computeAngleMeasure(frames, {
      id: 'knee_angle',
      mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    for (const s of result.series) {
      if (s.reliable) expect(s.value).toBeCloseTo(180, 1)
    }
  })

  it('returns ~90° for a right-angle knee (hip-knee-ankle forms 90°)', () => {
    const frame = makeFrame(0, {
      right_hip:   { x: 0.5, y: 0.2, confidence: 0.95 },  // above
      right_knee:  { x: 0.5, y: 0.5, confidence: 0.95 },  // vertex
      right_ankle: { x: 0.8, y: 0.5, confidence: 0.95 },  // to the right
      right_shoulder: { x: 0.5, y: 0.05, confidence: 0.95 },
      left_shoulder: { x: 0.5, y: 0.05, confidence: 0.95 },
      left_hip: { x: 0.5, y: 0.2, confidence: 0.95 },
    })
    const result = computeAngleMeasure([frame, frame, frame], {
      id: 'knee_angle',
      mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    expect(result.series[0]!.reliable).toBe(true)
    expect(result.series[0]!.value).toBeCloseTo(90, 1)
  })

  it('marks frame unreliable when landmark confidence < 0.5', () => {
    const frame = makeFrame(0, {
      right_hip:   { x: 0.5, y: 0.2, confidence: 0.3 },  // low confidence
      right_knee:  { x: 0.5, y: 0.5, confidence: 0.95 },
      right_ankle: { x: 0.5, y: 0.8, confidence: 0.95 },
    })
    const result = computeAngleMeasure([frame, frame, frame], {
      id: 'knee_angle',
      mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    expect(result.series[0]!.reliable).toBe(false)
  })

  it('returns reliable=false and value=0 when landmarks identical (‖v‖ < ε)', () => {
    const frame = makeFrame(0, {
      right_hip:   { x: 0.5, y: 0.5, confidence: 0.95 },
      right_knee:  { x: 0.5, y: 0.5, confidence: 0.95 },  // identical to hip
      right_ankle: { x: 0.5, y: 0.8, confidence: 0.95 },
    })
    const result = computeAngleMeasure([frame, frame, frame], {
      id: 'knee_angle',
      mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    for (const s of result.series) {
      expect(isNaN(s.value)).toBe(false)
      expect(s.reliable).toBe(false)
    }
  })

  it('result value is always in [0, 180]', () => {
    const frames = makeKneeFrames(10)
    const result = computeAngleMeasure(frames, {
      id: 'knee_angle',
      mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    for (const s of result.series) {
      if (s.reliable) {
        expect(s.value).toBeGreaterThanOrEqual(0)
        expect(s.value).toBeLessThanOrEqual(180)
      }
    }
  })
})

describe('angle — segment_axis mode', () => {
  it('returns ~0° when segment points straight up (vertical)', () => {
    // In yUp: p1=(0.5,0.3→0.7), p2=(0.5,0.1→0.9) → vector (0, +0.2) → atan2(0.2,0) = 90° → minus 90° = 0°
    const frame = makeFrame(0, {
      right_hip:      { x: 0.5, y: 0.7, confidence: 0.95 },   // lower in image = higher yUp value
      right_shoulder: { x: 0.5, y: 0.3, confidence: 0.95 },   // higher in image = lower yUp
    })
    const result = computeAngleMeasure([frame, frame, frame], {
      id: 'shoulder_elev',
      mode: 'segment_axis',
      points: ['right_hip', 'right_shoulder'],
      axis: 'vertical',
    })
    expect(result.series[0]!.reliable).toBe(true)
    expect(result.series[0]!.value).toBeCloseTo(0, 5)
  })

  it('returns value in (-180, 180]', () => {
    const frames = makeKneeFrames(10)
    const result = computeAngleMeasure(frames, {
      id: 'seg_ax',
      mode: 'segment_axis',
      points: ['right_hip', 'right_knee'],
    })
    for (const s of result.series) {
      if (s.reliable) {
        expect(s.value).toBeGreaterThan(-180.001)
        expect(s.value).toBeLessThanOrEqual(180.001)
      }
    }
  })
})

describe('angle — summary stats', () => {
  it('does not produce NaN in summary', () => {
    const frames = makeKneeFrames(10)
    const result = computeAngleMeasure(frames, {
      id: 'knee_angle',
      mode: 'joint',
      points: ['right_hip', 'right_knee', 'right_ankle'],
    })
    expect(isNaN(result.summary.mean)).toBe(false)
    expect(isNaN(result.summary.sd)).toBe(false)
  })
})
