import { describe, it, expect } from 'vitest'
import { computeRotationMeasure } from '../primitives/rotation'
import { makeFrame } from './helpers'

// Builds frames where the segment angle changes over time
function makeSegmentFrames(thetasDeg: number[]): ReturnType<typeof makeFrame>[] {
  return thetasDeg.map((deg, i) => {
    const rad = (deg * Math.PI) / 180
    // p1 at center, p2 at angle deg from horizontal in yUp
    return makeFrame(i * 0.033, {
      right_hip:      { x: 0.5, y: 0.5, confidence: 0.95 },
      right_shoulder: { x: 0.5 + 0.1 * Math.cos(rad), y: 0.5 - 0.1 * Math.sin(rad), confidence: 0.95 },
    })
  })
}

describe('rotation — angular_displacement', () => {
  it('unwraps correctly: [170°,175°,179°,−178°,−174°] → displacement ≈ 16°', () => {
    const thetas = [170, 175, 179, -178, -174]
    const frames = makeSegmentFrames(thetas)
    const result = computeRotationMeasure(frames, {
      id: 'arm_rotation',
      mode: 'angular_displacement',
      points: ['right_hip', 'right_shoulder'],
    })
    const last = result.series[result.series.length - 1]!
    expect(Math.abs(last.value)).toBeCloseTo(16, 0)
  })

  it('does not produce a −344° jump when crossing 180°/−180° boundary', () => {
    const frames = makeSegmentFrames([170, -170])
    const result = computeRotationMeasure(frames, {
      id: 'test',
      mode: 'angular_displacement',
      points: ['right_hip', 'right_shoulder'],
    })
    // The displacement should be about 20° (not -340°)
    const last = result.series[result.series.length - 1]!
    expect(Math.abs(last.value)).toBeLessThan(30)
  })
})

describe('rotation — orientation', () => {
  it('returns orientation in (-180, 180]', () => {
    const thetas = [0, 45, 90, 135, -135, -90, -45]
    const frames = makeSegmentFrames(thetas)
    const result = computeRotationMeasure(frames, {
      id: 'arm_ori',
      mode: 'orientation',
      points: ['right_hip', 'right_shoulder'],
    })
    for (const s of result.series) {
      if (s.reliable) {
        expect(s.value).toBeGreaterThan(-180.001)
        expect(s.value).toBeLessThanOrEqual(180.001)
      }
    }
  })
})

describe('rotation — out_of_plane flag', () => {
  it('out_of_plane is copied from script (not inferred)', () => {
    const frames = makeSegmentFrames([0, 10, 20])
    const result = computeRotationMeasure(frames, {
      id: 'test',
      mode: 'orientation',
      points: ['right_hip', 'right_shoulder'],
      out_of_plane_declared: true,
    })
    expect(result.reliability.out_of_plane).toBe(true)
    expect(result.reliability.reasons).toContain('projection uniquement, pas une vraie rotation 3D')
  })

  it('out_of_plane is false by default', () => {
    const frames = makeSegmentFrames([0, 10])
    const result = computeRotationMeasure(frames, {
      id: 'test',
      mode: 'orientation',
      points: ['right_hip', 'right_shoulder'],
    })
    expect(result.reliability.out_of_plane).toBe(false)
  })
})
