import { describe, it, expect, afterEach } from 'vitest'
import {
  exportActivity,
  exportCapture,
  exportModel,
  importFile,
  vacuum,
  getSessionActivity,
  setSessionActivity,
  addSessionSequence,
  getSessionSequences,
} from '../lib/export'
import type { Activity, Sequence } from '../lib/export'

const mockSequence: Sequence = {
  sequence_id: 'seq_test_001',
  script_id: 'tennis_service_sagittal_v1',
  started_at: 1700000000,
  instances: [],
}

const mockActivity: Activity = {
  activity_id: 'act_test_001',
  started_at: 1700000000,
  sequences: [mockSequence],
}

afterEach(() => {
  vacuum()
})

describe('exportActivity / importFile round-trip', () => {
  it('round-trip: import(export(activity)) produces valid activity kind', () => {
    const script = { id: 'test', version: '1.0.0', dsl_version: '1.0', discipline: 'test', gesture: 'test', movement_type: 'finite' as const, cv_model: 'x', view: 'frontal' as const, measures: [], segmentation: { mode: 'discrete' }, outputs: [] }
    const json = exportActivity(script, mockActivity)
    const { payload, error } = importFile(json)
    expect(error).toBeNull()
    expect(payload?.kind).toBe('activity')
  })
})

describe('exportCapture / importFile round-trip', () => {
  it('round-trip: import(exportCapture(seq)) is valid', () => {
    const json = exportCapture('tennis_service_sagittal_v1', mockSequence)
    const { payload, error } = importFile(json)
    expect(error).toBeNull()
    expect(payload?.kind).toBe('capture')
  })
})

describe('exportModel', () => {
  it('produces kind: model', () => {
    const json = exportModel('tennis_service_sagittal_v1', [mockSequence], 'reference A')
    const { payload, error } = importFile(json)
    expect(error).toBeNull()
    expect(payload?.kind).toBe('model')
  })
})

describe('importFile', () => {
  it('rejects invalid JSON', () => {
    const { error } = importFile('not json at all')
    expect(error).not.toBeNull()
  })

  it('rejects unknown kind', () => {
    const { error } = importFile(JSON.stringify({ kind: 'invalid', schema_version: '1.1' }))
    expect(error).not.toBeNull()
  })

  it('rejects incompatible schema major version', () => {
    const json = JSON.stringify({ kind: 'capture', schema_version: '2.0' })
    const { error } = importFile(json)
    expect(error).not.toBeNull()
  })
})

describe('vacuum — invariant 3', () => {
  it('clears all session data after vacuum()', () => {
    setSessionActivity(mockActivity)
    addSessionSequence(mockSequence)

    expect(getSessionActivity()).not.toBeNull()
    expect(getSessionSequences(mockSequence.script_id).length).toBeGreaterThan(0)

    vacuum()

    expect(getSessionActivity()).toBeNull()
    expect(getSessionSequences(mockSequence.script_id)).toHaveLength(0)
  })
})
