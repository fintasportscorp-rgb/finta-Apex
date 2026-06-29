import { describe, it, expect } from 'vitest'
import { interpretFrames } from '../interpreter/interpreter'
import { makeKneeFrames } from './helpers'
import cyclingScript from '../../scripts/cycling_pedaling.json'
import tennisScript from '../../scripts/tennis_service.json'
import type { Script } from '../../lib/scripts'

describe('interpreter — determinism', () => {
  it('same frames produce same output (tolerance 0.01°)', () => {
    const frames = makeKneeFrames(20)
    const r1 = interpretFrames(cyclingScript as Script, frames)
    const r2 = interpretFrames(cyclingScript as Script, frames)
    for (let i = 0; i < r1.length; i++) {
      for (let j = 0; j < r1[i]!.series.length; j++) {
        expect(r1[i]!.series[j]!.value).toBeCloseTo(r2[i]!.series[j]!.value, 2)
      }
    }
  })
})

describe('interpreter — output structure', () => {
  it('returns one MeasureResult per measure in cycling script', () => {
    const frames = makeKneeFrames(10)
    const results = interpretFrames(cyclingScript as Script, frames)
    expect(results.length).toBe(cyclingScript.measures.length)
  })

  it('measure IDs match script measure IDs', () => {
    const frames = makeKneeFrames(10)
    const results = interpretFrames(cyclingScript as Script, frames)
    const ids = results.map(r => r.id)
    for (const m of cyclingScript.measures) {
      expect(ids).toContain(m.id)
    }
  })

  it('no NaN values in any series', () => {
    const frames = makeKneeFrames(20)
    const results = interpretFrames(cyclingScript as Script, frames)
    for (const mr of results) {
      for (const s of mr.series) {
        expect(isNaN(s.value)).toBe(false)
      }
    }
  })

  it('fraction_reliable is in [0, 1]', () => {
    const frames = makeKneeFrames(20)
    const results = interpretFrames(cyclingScript as Script, frames)
    for (const mr of results) {
      expect(mr.reliability.fraction_reliable).toBeGreaterThanOrEqual(0)
      expect(mr.reliability.fraction_reliable).toBeLessThanOrEqual(1)
    }
  })
})

describe('interpreter — tennis script', () => {
  it('computes wrist_speed as TL/s', () => {
    const frames = makeKneeFrames(10)
    const results = interpretFrames(tennisScript as Script, frames)
    const wristSpeed = results.find(r => r.id === 'wrist_speed')
    expect(wristSpeed).toBeDefined()
    expect(wristSpeed!.unit).toBe('TL/s')
  })
})

describe('interpreter — empty frames', () => {
  it('returns empty array for empty frames', () => {
    const results = interpretFrames(cyclingScript as Script, [])
    expect(results).toHaveLength(0)
  })
})
