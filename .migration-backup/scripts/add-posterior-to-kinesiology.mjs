#!/usr/bin/env node
/**
 * One-shot: add a `posterior` AvailableView to 8 kinésiology motions.
 *
 * Patches in lockstep:
 *  - cvapps/src/scripts/<motion_id>.json (append the new view, refresh denormalised
 *    top-level fields)
 *  - motion-views-matrix/B8-kinesiology-rowing.json (append matching retained_views entry)
 *
 * Idempotent: if a motion already has a `posterior` AvailableView, it is skipped.
 *
 * After running this script, regenerate the consolidated matrix and validate:
 *   node cvapps/scripts/consolidate-motion-matrix.mjs
 *   node cvapps/scripts/validate-v11-catalog.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CVAPPS = join(HERE, '..')
const ROOT = join(CVAPPS, '..')
const SCRIPTS_DIR = join(CVAPPS, 'src', 'scripts')
const B8_FILE = join(ROOT, 'motion-views-matrix', 'B8-kinesiology-rowing.json')

// ────────────────────────────────────────────────────────────────────────
// Posterior view definitions per motion
// ────────────────────────────────────────────────────────────────────────

const POSTERIOR_PATCHES = [
  {
    motion_id: 'kinesiology_equilibre_statique',
    rationale_fr: "Vue arrière : alignement vertical de la colonne, niveau des épaules et des hanches en équilibre statique.",
    rationale_en: "Rear view: vertical spine alignment, shoulder/hip level during static balance.",
    measures: [
      { id: 'spine_alignment_post', primitive: 'angle', mode: 'segment_axis', points: ['hip_center', 'shoulder_center'], axis: 'vertical', expose: true },
      { id: 'shoulder_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
      { id: 'hip_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_fente',
    rationale_fr: "Vue arrière : alignement vertébral et bascule pelvienne (Trendelenburg) en fente.",
    rationale_en: "Rear view: spine alignment and pelvic drop (Trendelenburg) during lunge.",
    measures: [
      { id: 'spine_alignment_post', primitive: 'angle', mode: 'segment_axis', points: ['hip_center', 'shoulder_center'], axis: 'vertical', expose: true },
      { id: 'hip_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
      { id: 'shoulder_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_flexion_tronc',
    rationale_fr: "Vue arrière : test d'Adams (dépistage scoliose) — asymétrie scapulaire et bascule pelvienne en flexion.",
    rationale_en: "Rear view: Adams forward bend test (scoliosis screening) — scapular asymmetry and pelvic tilt.",
    measures: [
      { id: 'shoulder_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
      { id: 'hip_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
      { id: 'spine_alignment_post', primitive: 'angle', mode: 'segment_axis', points: ['hip_center', 'shoulder_center'], axis: 'vertical', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_marche',
    rationale_fr: "Vue arrière : Trendelenburg dynamique, oscillation latérale du bassin, alignement de la colonne en marche.",
    rationale_en: "Rear view: dynamic Trendelenburg, lateral pelvic sway, spine alignment during gait.",
    measures: [
      { id: 'hip_drop_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
      { id: 'shoulder_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
      { id: 'hip_sway_post', primitive: 'position', mode: 'amplitude', point: 'hip_center', axis: 'x', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_posture_sagittale',
    rationale_fr: "Vue arrière : alignement postural de la colonne et symétrie épaules/hanches — complément à l'examen sagittal.",
    rationale_en: "Rear view: spine alignment and shoulder/hip symmetry — complementary to the sagittal exam.",
    measures: [
      { id: 'spine_alignment_post', primitive: 'angle', mode: 'segment_axis', points: ['hip_center', 'shoulder_center'], axis: 'vertical', expose: true },
      { id: 'shoulder_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
      { id: 'hip_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_rom_membre_inf',
    rationale_fr: "Vue arrière : abduction de hanche, niveau pelvien et alignement du genou par rapport à la cheville.",
    rationale_en: "Rear view: hip abduction, pelvic level and knee-over-ankle alignment.",
    measures: [
      { id: 'hip_abduction_post', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_hip', 'right_knee'], expose: true },
      { id: 'knee_alignment_right_post', primitive: 'position', mode: 'distance', point: 'right_knee', reference: 'right_ankle', expose: true },
      { id: 'hip_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_rom_membre_sup',
    rationale_fr: "Vue arrière : élévation scapulaire bilatérale et niveau d'épaules pendant les amplitudes du membre supérieur.",
    rationale_en: "Rear view: bilateral scapular elevation and shoulder level during upper-limb range tests.",
    measures: [
      { id: 'right_arm_elevation_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'right_wrist'], axis: 'vertical', expose: true },
      { id: 'left_arm_elevation_post', primitive: 'angle', mode: 'segment_axis', points: ['left_shoulder', 'left_wrist'], axis: 'vertical', expose: true },
      { id: 'shoulder_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
    ],
  },
  {
    motion_id: 'kinesiology_squat_fonctionnel',
    rationale_fr: "Vue arrière : alignement vertébral, bascule pelvienne et knee tracking bilatéral en descente de squat.",
    rationale_en: "Rear view: spine alignment, pelvic tilt and bilateral knee tracking during squat descent.",
    measures: [
      { id: 'spine_alignment_post', primitive: 'angle', mode: 'segment_axis', points: ['hip_center', 'shoulder_center'], axis: 'vertical', expose: true },
      { id: 'hip_level_post', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'left_hip'], axis: 'horizontal', expose: true },
      { id: 'knee_alignment_right_post', primitive: 'position', mode: 'distance', point: 'right_knee', reference: 'right_ankle', expose: true },
    ],
  },
]

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

function unionMeasures(views) {
  const seen = new Set()
  const out = []
  for (const v of views) {
    for (const m of v.measures ?? []) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        out.push(m)
      }
    }
  }
  return out
}

function refreshDenormalised(script) {
  const primary = script.available_views.find(v => v.primary === true) ?? script.available_views[0]
  script.view = primary.view
  script.side = primary.side ?? script.side
  script.required_visible = primary.required_visible ?? script.required_visible
  script.measures = unionMeasures(script.available_views)
  return script
}

// ────────────────────────────────────────────────────────────────────────
// Patch v1.1 script JSON files
// ────────────────────────────────────────────────────────────────────────

const stats = { patched: 0, skipped: 0 }

for (const patch of POSTERIOR_PATCHES) {
  const path = join(SCRIPTS_DIR, `${patch.motion_id}.json`)
  const script = readJson(path)

  if (!Array.isArray(script.available_views)) {
    console.warn(`skip ${patch.motion_id}: no available_views[]`)
    stats.skipped += 1
    continue
  }
  if (script.available_views.some(v => v.view === 'posterior')) {
    console.log(`= ${patch.motion_id}: posterior already present`)
    stats.skipped += 1
    continue
  }
  if (script.available_views.length >= 3) {
    console.warn(`skip ${patch.motion_id}: already 3 views (L-MV-2 cap)`)
    stats.skipped += 1
    continue
  }

  const nextPriority = script.available_views.length + 1
  const newView = {
    view: 'posterior',
    priority: nextPriority,
    primary: false,
    rationale_fr: patch.rationale_fr,
    rationale_en: patch.rationale_en,
    feasibility_2d: 'ok',
    side: 'both',
    measures: patch.measures,
  }
  script.available_views.push(newView)

  // Sort by priority for canonical ordering
  script.available_views.sort((a, b) => a.priority - b.priority)

  // Refresh denormalised top-level fields (measures union, etc.)
  refreshDenormalised(script)

  writeJson(path, script)
  console.log(`+ ${patch.motion_id}: posterior view added at priority ${nextPriority}`)
  stats.patched += 1
}

// ────────────────────────────────────────────────────────────────────────
// Patch B8-kinesiology-rowing.json (source of truth for the matrix)
// ────────────────────────────────────────────────────────────────────────

const b8 = readJson(B8_FILE)
let b8Updated = 0

for (const patch of POSTERIOR_PATCHES) {
  const motion = b8.motions.find(m => m.motion_id === patch.motion_id)
  if (!motion) {
    console.warn(`B8 missing motion: ${patch.motion_id}`)
    continue
  }
  if (motion.retained_views.some(v => v.view === 'posterior')) continue

  const nextPriority = motion.retained_views.length + 1
  motion.retained_views.push({
    view: 'posterior',
    priority: nextPriority,
    primary: false,
    rationale_fr: patch.rationale_fr,
    rationale_en: patch.rationale_en,
    feasibility_2d: 'ok',
    side: 'both',
    measures: patch.measures,
  })

  // Also tag the posterior view in view_scores as retained (cosmetic — for trace).
  const score = motion.view_scores?.find(s => s.view === 'posterior')
  if (score) {
    score.retained = true
    score.priority = nextPriority
    score.note = '(ajouté en patch — posterior pour examen postural)'
  }

  b8Updated += 1
}

b8.checkpoint = 'patched_posterior'
b8.summary = b8.summary ?? {}
b8.summary.posterior_added = b8Updated
writeJson(B8_FILE, b8)

// ────────────────────────────────────────────────────────────────────────

console.log(`\n✓ Patched ${stats.patched} v1.1 scripts (skipped ${stats.skipped})`)
console.log(`✓ Patched ${b8Updated} entries in B8-kinesiology-rowing.json`)
console.log(`\nNext:`)
console.log(`  node cvapps/scripts/consolidate-motion-matrix.mjs`)
console.log(`  node cvapps/scripts/validate-v11-catalog.mjs`)
