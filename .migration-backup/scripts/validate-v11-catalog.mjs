#!/usr/bin/env node
/**
 * Phase 2.3 — Validate every script in src/scripts-v2/ against the v1.1 linter.
 *
 * Reuses the linter exported from src/lib/scripts.ts (transpiled by tsx).
 * Reports counts of valid/invalid scripts and prints all error messages.
 *
 * Usage: node cvapps/scripts/validate-v11-catalog.mjs
 *
 * Note: this script reimplements the linter rules in plain JS (mirroring
 * src/lib/scripts.ts). We do this to avoid pulling Vite's import.meta.glob
 * into a Node context. Both code paths share the same rule numbering.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CVAPPS = join(HERE, '..')
// After Phase 7 bascule, the v1.1 catalog lives directly in src/scripts/.
const V2_DIR = join(CVAPPS, 'src', 'scripts')

const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
]

const DERIVED_POINTS = ['hip_center', 'shoulder_center']
const VALID_VIEWS = ['sagittal_left', 'sagittal_right', 'frontal', 'posterior', 'oblique_left', 'oblique_right', 'overhead']

function isValidLandmark(name) {
  return LANDMARK_NAMES.includes(name) || DERIVED_POINTS.includes(name)
}

function lintMeasures(measures, prefix, errors) {
  for (const m of measures) {
    const pts = [
      ...(m.points ?? []),
      ...(m.point ? [m.point] : []),
      ...(m.reference ? [m.reference] : []),
    ]
    for (const pt of pts) {
      if (!isValidLandmark(pt)) {
        errors.push({ field: `${prefix}.${m.id}.points`, message: `Unknown landmark: ${pt}` })
      }
    }
    if (m.primitive === 'angle' && m.mode === 'joint' && (m.points?.length ?? 0) !== 3) {
      errors.push({ field: `${prefix}.${m.id}`, message: 'angle.joint requires exactly 3 points' })
    }
    if (m.primitive === 'angle' && m.mode === 'segment_axis' && (m.points?.length ?? 0) !== 2) {
      errors.push({ field: `${prefix}.${m.id}`, message: 'angle.segment_axis requires exactly 2 points' })
    }
  }
  const ids = new Set(measures.map(m => m.id))
  for (const m of measures) {
    if (m.source_measure && !ids.has(m.source_measure)) {
      errors.push({
        field: `${prefix}.${m.id}.source_measure`,
        message: `source_measure "${m.source_measure}" not defined in this view`,
      })
    }
  }
}

function checkSignalRef(cond, measureIds, path, errors) {
  if (!cond || typeof cond !== 'object') return
  const signal = cond.signal
  if (typeof signal !== 'string') return
  const match = signal.match(/^(speed|angle|position):(.+)$/)
  if (!match) return
  const ref = match[2]
  if (!measureIds.has(ref) && !isValidLandmark(ref)) {
    errors.push({ field: path, message: `L-MV-8: signal "${signal}" references unknown measure/landmark "${ref}"` })
  }
}

function lintV11(s) {
  const errors = []
  if (!s.id || typeof s.id !== 'string') errors.push({ field: 'id', message: 'id is required' })
  if (s.dsl_version !== '1.1') errors.push({ field: 'dsl_version', message: `expected "1.1", got ${s.dsl_version}` })
  if (!['finite', 'continuous'].includes(s.movement_type)) {
    errors.push({ field: 'movement_type', message: 'must be finite or continuous' })
  }
  const av = s.available_views
  if (!Array.isArray(av) || av.length === 0) {
    errors.push({ field: 'available_views', message: 'L-MV-1: at least one view required' })
    return errors
  }
  if (av.length > 3) errors.push({ field: 'available_views', message: `L-MV-2: max 3 views (got ${av.length})` })
  const views = av.map(v => v.view)
  if (new Set(views).size !== views.length) errors.push({ field: 'available_views', message: 'L-MV-3: duplicate view' })
  const prios = av.map(v => v.priority)
  const expected = new Set(Array.from({ length: av.length }, (_, i) => i + 1))
  if (new Set(prios).size !== prios.length || !prios.every(p => expected.has(p))) {
    errors.push({ field: 'available_views', message: `L-MV-4: priorities must be distinct 1..${av.length}` })
  }
  const primaries = av.filter(v => v.primary === true)
  if (primaries.length !== 1) errors.push({ field: 'available_views', message: `L-MV-5: exactly one primary view (got ${primaries.length})` })
  if (primaries.length === 1 && primaries[0].priority !== 1) {
    errors.push({ field: 'available_views', message: 'L-MV-6: primary must be priority 1' })
  }
  if (views.includes('sagittal_left') && views.includes('sagittal_right')) {
    errors.push({ field: 'available_views', message: 'L-MV-11: sagittal_left/right mutually exclusive' })
  }

  const allMeasureIds = new Set()
  for (const view of av) {
    if (!VALID_VIEWS.includes(view.view)) {
      errors.push({ field: `available_views.${view.view}`, message: `Invalid view: ${view.view}` })
    }
    if (!view.measures || view.measures.length === 0) {
      errors.push({ field: `available_views.${view.view}.measures`, message: 'L-MV-9: at least one measure required' })
      continue
    }
    for (const m of view.measures) {
      allMeasureIds.add(m.id)
      if (m.out_of_plane === true) {
        errors.push({ field: `available_views.${view.view}.measures.${m.id}`, message: 'L-MV-7: out_of_plane:true not allowed in available_views' })
      }
    }
    lintMeasures(view.measures, `available_views.${view.view}.measures`, errors)
  }

  // Segmentation consistency
  const seg = s.segmentation
  if (seg) {
    if (s.movement_type === 'finite' && seg.mode !== 'discrete') {
      errors.push({ field: 'segmentation.mode', message: 'finite requires discrete segmentation' })
    }
    if (s.movement_type === 'continuous' && seg.mode === 'discrete') {
      errors.push({ field: 'segmentation.mode', message: 'continuous cannot use discrete segmentation' })
    }
    if (seg.start) checkSignalRef(seg.start, allMeasureIds, 'segmentation.start', errors)
    if (seg.end) checkSignalRef(seg.end, allMeasureIds, 'segmentation.end', errors)
  }

  return errors
}

// ────────────────────────────────────────────────────────────────────────

if (!existsSync(V2_DIR)) {
  console.error(`v1.1 catalog not found: ${V2_DIR}`)
  process.exit(1)
}

const files = readdirSync(V2_DIR).filter(f => f.endsWith('.json')).sort()
let valid = 0
let invalid = 0
const allErrors = []

for (const file of files) {
  const path = join(V2_DIR, file)
  let script
  try {
    script = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    invalid += 1
    allErrors.push({ file, errors: [{ field: 'json', message: e.message }] })
    continue
  }
  const errors = lintV11(script)
  if (errors.length === 0) {
    valid += 1
  } else {
    invalid += 1
    allErrors.push({ file, errors })
  }
}

console.log(`\n📊 v1.1 linter report — ${files.length} scripts`)
console.log(`  ✓ Valid:   ${valid}`)
console.log(`  ✗ Invalid: ${invalid}`)

if (allErrors.length > 0) {
  console.log(`\n❌ Issues:\n`)
  for (const { file, errors } of allErrors) {
    console.log(`  ${file}`)
    for (const e of errors) {
      console.log(`    [${e.field}] ${e.message}`)
    }
  }
  process.exit(1)
}

console.log(`\n✓ All ${valid} scripts pass the v1.1 linter\n`)
