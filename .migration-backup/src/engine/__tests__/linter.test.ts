import { describe, it, expect } from 'vitest'
import { lintScript } from '../interpreter/linter'
import cyclingScript from '../../scripts/cycling_pedaling.json'
import tennisScript from '../../scripts/tennis_service.json'

describe('linter — valid scripts pass', () => {
  it('cycling_pedaling_sagittal_v1 is valid', () => {
    const result = lintScript(cyclingScript)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('tennis_service_sagittal_v1 is valid', () => {
    const result = lintScript(tennisScript)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

describe('linter — rule 1: unknown landmark', () => {
  it('rejects unknown landmark spine_mid', () => {
    const script = {
      ...cyclingScript,
      measures: [{ ...cyclingScript.measures[0], id: 'bad_angle', mode: 'joint', points: ['spine_mid', 'right_knee', 'right_ankle'] }],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 1 && e.message.includes('spine_mid'))).toBe(true)
  })
})

describe('linter — rule 2: arity', () => {
  it('rejects angle.joint with 2 points', () => {
    const script = {
      ...cyclingScript,
      measures: [{ id: 'bad', primitive: 'angle', mode: 'joint', points: ['right_hip', 'right_knee'], expose: true }],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 2)).toBe(true)
  })

  it('rejects angle.segment_axis with 3 points', () => {
    const script = {
      ...cyclingScript,
      measures: [{ id: 'bad', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'right_knee', 'right_ankle'], expose: true }],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 2)).toBe(true)
  })
})

describe('linter — rule 4: source_measure cycle/undefined', () => {
  it('rejects angular speed referencing undefined measure', () => {
    const script = {
      ...cyclingScript,
      measures: [
        { id: 'spd', primitive: 'speed', mode: 'angular', source_measure: 'nonexistent', expose: true },
      ],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 4)).toBe(true)
  })
})

describe('linter — rule 8: required fields', () => {
  it('rejects script without dsl_version', () => {
    const { dsl_version: _, ...noVersion } = cyclingScript as Record<string, unknown>
    const result = lintScript(noVersion)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 8 && e.field === 'dsl_version')).toBe(true)
  })

  it('rejects script without cv_model', () => {
    const { cv_model: _, ...noModel } = cyclingScript as Record<string, unknown>
    const result = lintScript(noModel)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 8 && e.field === 'cv_model')).toBe(true)
  })
})

describe('linter — rule 9: movement_type vs segmentation.mode', () => {
  it('rejects finite movement_type with cyclic segmentation', () => {
    const script = {
      ...tennisScript,
      movement_type: 'finite',
      segmentation: { mode: 'cyclic', cycle_signal: 'elbow_angle' },
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 9)).toBe(true)
  })
})

describe('linter — rule 10: inputs validation', () => {
  it('rejects required:true on input', () => {
    const script = {
      ...cyclingScript,
      inputs: [{ id: 'bad', label: 'Bad', type: 'text', scope: 'sequence', required: true }],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 10 && e.message.includes('required'))).toBe(true)
  })

  it('rejects single_select without options', () => {
    const script = {
      ...cyclingScript,
      inputs: [{ id: 'sel', label: 'Sel', type: 'single_select', scope: 'sequence', required: false }],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 10 && e.message.includes('options'))).toBe(true)
  })

  it('rejects scale without min/max', () => {
    const script = {
      ...cyclingScript,
      inputs: [{ id: 'sc', label: 'Scale', type: 'scale', scope: 'sequence', required: false }],
    }
    const result = lintScript(script)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.rule === 10)).toBe(true)
  })
})
