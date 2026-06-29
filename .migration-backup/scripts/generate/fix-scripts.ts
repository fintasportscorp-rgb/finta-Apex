#!/usr/bin/env tsx
// One-shot repair script for batch-generated DSL scripts with structural issues.
// Fixes: meta→top-level fields, type→primitive, method→mode, joint/segment_axis arrays,
//        select→single_select, condition→op, primitive:X→realPrimitive:X
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintScript } from '../../src/engine/interpreter/linter'

const SCRIPTS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../src/scripts')

const files = readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json'))
let fixed = 0, skipped = 0, stillBroken = 0

for (const file of files) {
  const raw = readFileSync(resolve(SCRIPTS_DIR, file), 'utf-8')
  const s = JSON.parse(raw) as Record<string, unknown>

  // Already valid — skip
  if (lintScript(s).valid) { skipped++; continue }

  // ── 1. Hoist meta block to top-level fields ──────────────────────────────
  const meta = s.meta as Record<string, unknown> | undefined
  if (meta) {
    if (!s.discipline) s.discipline = meta.sport ?? meta.discipline ?? 'unknown'
    if (!s.gesture)    s.gesture    = meta.label ?? meta.gesture ?? 'unknown'
    if (!s.view)       s.view       = meta.view ?? 'sagittal_right'
    if (!s.side)       s.side       = meta.side ?? 'right'
    if (!s.movement_type) {
      s.movement_type = meta.modality ?? meta.movement_type ?? meta.mode ?? 'finite'
    }
    // Normalise "modality" synonym
    if (s.movement_type === 'cyclic') s.movement_type = 'continuous'
    delete s.meta
  }

  if (!s.dsl_version) s.dsl_version = '1.0'
  if (!s.cv_model)    s.cv_model    = 'blazepose-full@1.x'

  // ── 2. Fix measures ───────────────────────────────────────────────────────
  const primitiveMap: Record<string, string> = {} // measure_id → primitive

  if (Array.isArray(s.measures)) {
    s.measures = (s.measures as Record<string, unknown>[]).map(m => {
      const out: Record<string, unknown> = {}

      // id
      out.id = m.id

      // primitive: prefer 'primitive' key, fall back to 'type'
      const prim = (m.primitive ?? m.type) as string | undefined
      out.primitive = prim ?? 'angle'

      // mode: prefer 'mode', fall back to 'method'
      let mode = (m.mode ?? m.method) as string | undefined

      // If measure had shorthand keys 'joint' or 'segment_axis' as arrays
      if (!mode) {
        if (Array.isArray(m.joint))         { mode = 'joint' }
        else if (Array.isArray(m.segment_axis)) { mode = 'segment_axis' }
        else if (out.primitive === 'speed') { mode = m.point ? 'linear' : 'angular' }
        else if (out.primitive === 'rotation') { mode = 'orientation' }
        else { mode = 'joint' }
      }
      out.mode = mode

      // points: prefer 'points', fall back to 'joint' / 'segment_axis' shorthand
      if (Array.isArray(m.points)) {
        out.points = m.points
      } else if (Array.isArray(m.joint)) {
        out.points = m.joint
      } else if (Array.isArray(m.segment_axis)) {
        out.points = m.segment_axis
      }

      // point (singular, for speed.linear)
      if (m.point) out.point = m.point

      // axis
      if (m.axis) out.axis = m.axis

      // source_measure (speed.angular)
      if (m.source_measure) out.source_measure = m.source_measure

      // out_of_plane
      out.out_of_plane = m.out_of_plane ?? false

      // expose
      out.expose = m.expose ?? true

      // Track for signal repair
      primitiveMap[out.id as string] = out.primitive as string

      return out
    })
  }

  // ── 3. Fix segmentation signals ───────────────────────────────────────────
  const speedLandmarks = new Set([
    'right_wrist','left_wrist','right_foot_index','left_foot_index',
    'right_ankle','left_ankle','right_knee','left_knee','right_hip','left_hip',
    'right_shoulder','left_shoulder','right_elbow','left_elbow',
    'right_heel','left_heel',
  ])

  function fixSignal(sig: unknown): unknown {
    if (typeof sig !== 'string') return sig
    if (sig === 'rest') return sig
    const parts = sig.split(':')
    if (parts.length === 2) {
      const [pfx, tgt] = parts as [string, string]
      // "primitive:X" — literal word "primitive", need to look up real primitive
      if (pfx === 'primitive') {
        const realPrim = primitiveMap[tgt]
          ?? (speedLandmarks.has(tgt) ? 'speed' : 'angle')
        return `${realPrim}:${tgt}`
      }
      return sig // already correct format (e.g. "angle:knee_angle")
    }
    // No colon — bare measure_id or landmark name; prefix with real primitive
    const realPrim = primitiveMap[sig]
      ?? (speedLandmarks.has(sig) ? 'speed' : 'angle')
    return `${realPrim}:${sig}`
  }

  function fixEventBlock(ev: unknown): unknown {
    if (!ev || typeof ev !== 'object') return ev
    const e = ev as Record<string, unknown>
    const out: Record<string, unknown> = {}
    out.signal = fixSignal(e.signal)
    // condition → op
    if (e.condition !== undefined) out.op = e.condition
    else if (e.op !== undefined)   out.op = e.op
    if (e.threshold !== undefined) out.threshold = e.threshold
    if (e.unit !== undefined)      out.unit = e.unit
    if (e.duration_s !== undefined) out.duration_s = e.duration_s
    return out
  }

  if (s.segmentation && typeof s.segmentation === 'object') {
    const seg = s.segmentation as Record<string, unknown>
    if (seg.start) seg.start = fixEventBlock(seg.start)
    if (seg.end)   seg.end   = fixEventBlock(seg.end)
  }

  // ── 4. Fix inputs ─────────────────────────────────────────────────────────
  if (Array.isArray(s.inputs)) {
    s.inputs = (s.inputs as Record<string, unknown>[]).map(inp => {
      if (inp.type === 'select') inp.type = 'single_select'
      inp.required = false
      // Remove 'default' key (not part of DSL spec)
      delete inp.default
      return inp
    })
  }

  // ── 5. Ensure required top-level fields ──────────────────────────────────
  if (!s.height)       s.height = 'full'
  if (!s.outputs && Array.isArray(s.measures)) {
    s.outputs = (s.measures as Record<string, unknown>[]).map(m => m.id)
  }
  if (!s.report_highlights && Array.isArray(s.outputs)) {
    s.report_highlights = (s.outputs as string[]).slice(0, 2)
  }

  // ── 6. Write and re-validate ──────────────────────────────────────────────
  const result = lintScript(s)
  if (result.valid) {
    writeFileSync(resolve(SCRIPTS_DIR, file), JSON.stringify(s, null, 2))
    console.log(`✓ fixed  ${file}`)
    fixed++
  } else {
    console.error(`✗ still broken ${file}:`)
    for (const e of result.errors) {
      console.error(`    [rule ${e.rule}] ${e.field}: ${e.message}`)
    }
    stillBroken++
  }
}

console.log(`\n${skipped} already valid, ${fixed} fixed, ${stillBroken} still broken / ${files.length} total`)
if (stillBroken > 0) process.exit(1)
