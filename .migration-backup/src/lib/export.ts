// Spec-05: JSON export/import for kind: activity | capture | model
// RAM-only by default. vacuum() is called at beforeunload (invariant 3).

import type { MeasureResult } from '../engine/types'
import type { Script } from './scripts'
import type { ContactResult } from '../engine/ball/contactDetect'

export type { ContactResult }

export const SCHEMA_VERSION = '1.1'

// ─── Data hierarchy: Activity → Sequence → Instance ───────────────────────

export interface InputValue {
  id: string
  value: string | number | boolean | null
}

export interface GestureInstance {
  instance_id: string
  script_id: string
  started_at: number
  ended_at: number
  measures: MeasureResult[]
  inputs?: InputValue[]
  /** Ball-racket contact result — present when ball tracking is enabled and contact was detectable. */
  contact?: ContactResult
}

export interface SequenceNotes {
  coach?: string
  player?: string
}

export interface BallSpeedSample {
  t: number
  kmh: number
}

export interface Sequence {
  sequence_id: string
  script_id: string
  started_at: number
  instances: GestureInstance[]
  inputs?: InputValue[]
  is_reference?: boolean
  notes?: SequenceNotes
  ball_speed?: BallSpeedSample[]
}

export interface Activity {
  activity_id: string
  athlete_label?: string
  note?: string
  started_at: number
  sequences: Sequence[]
}

// ─── Export formats (spec-05 §5.9) ────────────────────────────────────────

export interface ExportActivity {
  kind: 'activity'
  schema_version: string
  exported_at: number
  script: Script
  activity: Activity
}

export interface ExportCapture {
  kind: 'capture'
  schema_version: string
  exported_at: number
  script_id: string
  sequence: Sequence
}

export interface ExportModel {
  kind: 'model'
  schema_version: string
  exported_at: number
  script_id: string
  reference_label: string
  sequences: Sequence[]
}

export interface ExportContext {
  kind: 'context'
  schema_version: string
  exported_at: number
  script_id: string
  inputs: InputValue[]
}

// ─── Export functions ──────────────────────────────────────────────────────

export function exportActivity(script: Script, activity: Activity): string {
  const payload: ExportActivity = {
    kind: 'activity',
    schema_version: SCHEMA_VERSION,
    exported_at: Date.now(),
    script,
    activity,
  }
  return JSON.stringify(payload, null, 2)
}

export function exportCapture(scriptId: string, sequence: Sequence, isReference = false): string {
  const seq = isReference ? { ...sequence, is_reference: true } : sequence
  const payload: ExportCapture = {
    kind: 'capture',
    schema_version: SCHEMA_VERSION,
    exported_at: Date.now(),
    script_id: scriptId,
    sequence: seq,
  }
  return JSON.stringify(payload, null, 2)
}

export function exportContext(scriptId: string, inputs: InputValue[]): string {
  const payload: ExportContext = {
    kind: 'context',
    schema_version: SCHEMA_VERSION,
    exported_at: Date.now(),
    script_id: scriptId,
    inputs,
  }
  return JSON.stringify(payload, null, 2)
}

export function exportModel(
  scriptId: string,
  sequences: Sequence[],
  referenceLabel: string,
): string {
  const payload: ExportModel = {
    kind: 'model',
    schema_version: SCHEMA_VERSION,
    exported_at: Date.now(),
    script_id: scriptId,
    reference_label: referenceLabel,
    sequences,
  }
  return JSON.stringify(payload, null, 2)
}

// ─── Import + validation ───────────────────────────────────────────────────

export type ImportedPayload = ExportActivity | ExportCapture | ExportModel

export function importFile(json: string): { payload: ImportedPayload | null; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { payload: null, error: 'Invalid JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null)
    return { payload: null, error: 'Root value must be an object' }

  const p = parsed as Record<string, unknown>
  if (!['activity', 'capture', 'model'].includes(p.kind as string))
    return { payload: null, error: `Unknown kind: ${p.kind}` }

  const [major] = String(p.schema_version ?? '').split('.')
  const [currentMajor] = SCHEMA_VERSION.split('.')
  if (major !== currentMajor)
    return { payload: null, error: `Incompatible schema_version: ${p.schema_version} (expected ${currentMajor}.x)` }

  return { payload: parsed as ImportedPayload, error: null }
}

// ─── Vacuum — invariant 3 ──────────────────────────────────────────────────

// In-memory session data store — sequences and context are keyed by script_id
let sessionData: {
  activity: Activity | null
  sequences: Record<string, Sequence[]>
  model: ExportModel | null
  contextInputs: Record<string, InputValue[]>
} = {
  activity: null,
  sequences: {},
  model: null,
  contextInputs: {},
}

export function getSessionActivity(): Activity | null {
  return sessionData.activity
}

export function setSessionActivity(a: Activity): void {
  sessionData = { ...sessionData, activity: a }
}

export function getSessionSequences(scriptId: string): Sequence[] {
  return sessionData.sequences[scriptId] ?? []
}

export function addSessionSequence(seq: Sequence): void {
  const existing = sessionData.sequences[seq.script_id] ?? []
  sessionData = {
    ...sessionData,
    sequences: { ...sessionData.sequences, [seq.script_id]: [...existing, seq] },
  }
}

export function updateSessionSequenceNotes(id: string, notes: SequenceNotes): void {
  const updated: Record<string, Sequence[]> = {}
  for (const [key, seqs] of Object.entries(sessionData.sequences)) {
    updated[key] = seqs.map(s => s.sequence_id === id ? { ...s, notes } : s)
  }
  sessionData = { ...sessionData, sequences: updated }
}

export function getSessionModel(): ExportModel | null {
  return sessionData.model
}

export function setSessionModel(m: ExportModel): void {
  sessionData = { ...sessionData, model: m }
}

export function getSessionContext(scriptId: string): InputValue[] {
  return sessionData.contextInputs[scriptId] ?? []
}

export function setSessionContext(scriptId: string, inputs: InputValue[]): void {
  sessionData = {
    ...sessionData,
    contextInputs: { ...sessionData.contextInputs, [scriptId]: inputs },
  }
}

// Clear all in-RAM session data (called at beforeunload — invariant 3)
export function vacuum(): void {
  sessionData = { activity: null, sequences: {}, model: null, contextInputs: {} }
}

// Download a file to the user's device
export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
