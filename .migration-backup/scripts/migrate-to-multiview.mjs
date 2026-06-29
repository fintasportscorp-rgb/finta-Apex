#!/usr/bin/env node
/**
 * Phase 2.2 — Migrate v1.0 scripts (src/scripts/*.json) to v1.1 (src/scripts-v2/*.json)
 * by reading the consolidated motion_views_matrix.json at the project root.
 *
 * HISTORICAL: Phase 7 already bascule'd the v1.1 catalog into src/scripts/.
 * Re-running this script requires restoring the original v1.0 catalog first
 * (or pointing V1_DIR to a backup) — otherwise the v1.0 sources are missing.
 *
 * For each motion in the matrix:
 *   1. Find the v1.0 source file (matrix.motions[].v1_source_files[0])
 *   2. Read its segmentation, phases, key_event, inputs, ball_tracking, etc.
 *   3. Build a v1.1 script object with:
 *        - dsl_version: "1.1"
 *        - available_views[]  ← from matrix.retained_views
 *        - segmentation/phases/key_event/etc preserved from v1.0
 *   4. Write to src/scripts-v2/<motion_id>.json
 *
 * Idempotent: re-running rebuilds src/scripts-v2/ from scratch.
 *
 * Usage: node cvapps/scripts/migrate-to-multiview.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CVAPPS = join(HERE, '..')
const ROOT = join(CVAPPS, '..')
const V1_DIR = join(CVAPPS, 'src', 'scripts')
const V2_DIR = join(CVAPPS, 'src', 'scripts-v2')
const MATRIX_FILE = join(ROOT, 'motion_views_matrix.json')

const LANDMARKS = new Set([
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky', 'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index',
  'hip_center', 'shoulder_center',
])

if (!existsSync(MATRIX_FILE)) {
  console.error(`Matrix file not found: ${MATRIX_FILE}`)
  console.error(`Run consolidate-motion-matrix.mjs first.`)
  process.exit(1)
}

// Reset v2 directory
if (existsSync(V2_DIR)) {
  rmSync(V2_DIR, { recursive: true, force: true })
}
mkdirSync(V2_DIR, { recursive: true })

const matrix = JSON.parse(readFileSync(MATRIX_FILE, 'utf8'))

const stats = {
  written: 0,
  missing_v1_source: 0,
  warnings: [],
}

for (const motion of matrix.motions) {
  const sourceFiles = motion.v1_source_files ?? []
  if (sourceFiles.length === 0) {
    stats.warnings.push(`${motion.motion_id}: no v1_source_files declared`)
    continue
  }
  const primaryV1 = sourceFiles[0]
  const v1Path = join(V1_DIR, primaryV1)
  if (!existsSync(v1Path)) {
    stats.missing_v1_source += 1
    stats.warnings.push(`${motion.motion_id}: v1 source not found: ${primaryV1}`)
    continue
  }

  const v1 = JSON.parse(readFileSync(v1Path, 'utf8'))

  // Build available_views from matrix.retained_views.
  const available_views = (motion.retained_views ?? []).map(rv => ({
    view: rv.view,
    priority: rv.priority,
    primary: rv.primary === true,
    rationale_fr: rv.rationale_fr,
    rationale_en: rv.rationale_en,
    feasibility_2d: rv.feasibility_2d,
    side: rv.side,
    required_visible: rv.required_visible,
    measures: (rv.measures ?? []).map(normaliseMeasure),
  }))

  // Sort by priority (1..N).
  available_views.sort((a, b) => a.priority - b.priority)

  // Inject missing utility measures from v1 into the primary view.
  // Many v1 segmentations reference `wrist_speed` / `foot_speed` / `hip_speed` (expose:false)
  // that the matrix's per-view selections omitted. We add them back to keep L-MV-8 satisfied.
  injectMissingUtilityMeasures(available_views, v1)

  // Prefer v1.movement_type when it disagrees with the matrix to keep segmentation consistent.
  // (The matrix occasionally classified a cyclic motion as "continuous" while v1 used "finite".)
  const movement_type = v1.movement_type ?? motion.movement_type

  const v11 = {
    id: motion.motion_id,
    version: '1.1.0',
    dsl_version: '1.1',
    discipline: v1.discipline,
    gesture: motion.gesture_fr ?? v1.gesture,
    description: v1.description,
    movement_type,
    cv_model: v1.cv_model ?? 'blazepose-full@1.x',
    height: v1.height,
    distance_rule: v1.distance_rule,
    available_views,
    segmentation: v1.segmentation,
  }

  // Optional fields — preserve from v1 when present.
  if (v1.phases) v11.phases = v1.phases
  if (v1.key_event) v11.key_event = v1.key_event
  if (v1.anchor_event) v11.anchor_event = v1.anchor_event
  // outputs is recomputed from the union of all view measures (with `expose !== false`).
  v11.outputs = collectOutputs(available_views)
  if (v1.report_highlights) v11.report_highlights = v1.report_highlights
  if (v1.inputs) v11.inputs = v1.inputs
  if (v1.symmetry_pairs) v11.symmetry_pairs = v1.symmetry_pairs
  if (v1.ball_tracking) v11.ball_tracking = v1.ball_tracking

  const outPath = join(V2_DIR, `${motion.motion_id}.json`)
  writeFileSync(outPath, JSON.stringify(v11, null, 2) + '\n')
  stats.written += 1
}

console.log(`✓ Migration complete`)
console.log(`  Wrote: ${stats.written} v1.1 scripts → ${V2_DIR}`)
if (stats.missing_v1_source > 0) {
  console.log(`  Missing v1 sources: ${stats.missing_v1_source}`)
}
if (stats.warnings.length > 0) {
  console.log(`  Warnings (${stats.warnings.length}):`)
  for (const w of stats.warnings) console.log(`    - ${w}`)
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function normaliseMeasure(m) {
  // Strip out_of_plane if present (L-MV-7 forbids it inside an AvailableView).
  // Default expose to true unless explicitly false (matches v1.0 conventions).
  const out = { ...m }
  if ('out_of_plane' in out) delete out.out_of_plane
  if (!('expose' in out)) out.expose = true
  return out
}

function collectOutputs(available_views) {
  const seen = new Set()
  const result = []
  for (const v of available_views) {
    for (const m of v.measures ?? []) {
      if (m.expose !== false && !seen.has(m.id)) {
        seen.add(m.id)
        result.push(m.id)
      }
    }
  }
  return result
}

function collectSignalRefs(v1) {
  const refs = new Set()
  const cond = obj => {
    if (!obj || typeof obj !== 'object') return
    if (typeof obj.signal === 'string') {
      const m = obj.signal.match(/^(speed|angle|position):(.+)$/)
      if (m) refs.add(m[2])
    }
  }
  const seg = v1.segmentation ?? {}
  cond(seg.start)
  cond(seg.end)
  if (seg.cycle_signal && typeof seg.cycle_signal === 'string') refs.add(seg.cycle_signal)
  for (const ph of v1.phases ?? []) {
    if (ph.until && typeof ph.until === 'object') cond(ph.until)
  }
  if (v1.key_event) cond(v1.key_event)
  if (v1.anchor_event) cond(v1.anchor_event)
  return refs
}

function injectMissingUtilityMeasures(available_views, v1) {
  if (!Array.isArray(available_views) || available_views.length === 0) return
  const refs = collectSignalRefs(v1)
  if (refs.size === 0) return

  // Identify which refs are not satisfied by any view's measures, and not a raw landmark.
  const allViewMeasureIds = new Set()
  for (const v of available_views) for (const m of v.measures ?? []) allViewMeasureIds.add(m.id)

  const missing = [...refs].filter(r => !allViewMeasureIds.has(r) && !LANDMARKS.has(r))
  if (missing.length === 0) return

  // Find these measures in v1.measures and inject them into the primary view (expose:false).
  const v1ById = new Map((v1.measures ?? []).map(m => [m.id, m]))
  const primary = available_views.find(v => v.primary) ?? available_views[0]
  for (const id of missing) {
    const src = v1ById.get(id)
    if (!src) continue
    const cleaned = { ...src }
    if ('out_of_plane' in cleaned) delete cleaned.out_of_plane
    cleaned.expose = false
    primary.measures = [...primary.measures, cleaned]
  }
}
