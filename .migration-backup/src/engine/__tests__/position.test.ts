import { describe, it, expect } from 'vitest'
import { computePositionMeasure } from '../primitives/position'
import { makeFrame } from './helpers'

describe('position — hip_center derived point', () => {
  it('hip_center x = mean(left_hip.x, right_hip.x)', () => {
    const frame = makeFrame(0, {
      left_hip:  { x: 0.4, y: 0.5, confidence: 0.9 },
      right_hip: { x: 0.6, y: 0.5, confidence: 0.9 },
      left_shoulder:  { x: 0.4, y: 0.3, confidence: 0.9 },
      right_shoulder: { x: 0.6, y: 0.3, confidence: 0.9 },
    })
    const result = computePositionMeasure([frame, frame, frame], {
      id: 'hip_pos',
      point: 'hip_center',
      axis: null,
    })
    // hip_center = {x:0.5, yUp:0.5}, shoulder_center = {x:0.5, yUp:0.7}
    // torso_length_ref = |0.7 - 0.5| = 0.2
    // 2D norm from origin = sqrt(0.5^2 + 0.5^2) / 0.2 ≈ 3.54
    expect(result.series[0]!.reliable).toBe(true)
    expect(isNaN(result.series[0]!.value)).toBe(false)
  })

  it('axis:x returns normalized x position', () => {
    const frame = makeFrame(0, {
      left_hip:  { x: 0.4, y: 0.5, confidence: 0.9 },
      right_hip: { x: 0.6, y: 0.5, confidence: 0.9 },
      left_shoulder:  { x: 0.4, y: 0.3, confidence: 0.9 },
      right_shoulder: { x: 0.6, y: 0.3, confidence: 0.9 },
    })
    const result = computePositionMeasure([frame, frame, frame], {
      id: 'hip_x',
      point: 'hip_center',
      axis: 'x',
    })
    // hip_center.x = 0.5, torso_length_ref ≈ 0.2
    // normalized = 0.5 / 0.2 = 2.5
    expect(result.series[0]!.reliable).toBe(true)
    expect(result.series[0]!.value).toBeCloseTo(0.5 / 0.2, 1)
  })

  it('no NaN even when torso_length is zero', () => {
    const frame = makeFrame(0, {
      left_hip:  { x: 0.5, y: 0.5, confidence: 0.9 },
      right_hip: { x: 0.5, y: 0.5, confidence: 0.9 },
      left_shoulder:  { x: 0.5, y: 0.5, confidence: 0.9 },
      right_shoulder: { x: 0.5, y: 0.5, confidence: 0.9 },
    })
    const result = computePositionMeasure([frame, frame, frame], {
      id: 'hip_x',
      point: 'hip_center',
      axis: 'x',
    })
    for (const s of result.series) {
      expect(isNaN(s.value)).toBe(false)
    }
  })
})

describe('position — unit', () => {
  it('unit is TL', () => {
    const frame = makeFrame(0, {
      right_wrist: { x: 0.5, y: 0.5, confidence: 0.9 },
      left_shoulder:  { x: 0.5, y: 0.3, confidence: 0.9 },
      right_shoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      left_hip:  { x: 0.5, y: 0.6, confidence: 0.9 },
      right_hip: { x: 0.5, y: 0.6, confidence: 0.9 },
    })
    const result = computePositionMeasure([frame, frame, frame], {
      id: 'wrist_pos',
      point: 'right_wrist',
      axis: 'y',
    })
    expect(result.unit).toBe('TL')
  })
})
