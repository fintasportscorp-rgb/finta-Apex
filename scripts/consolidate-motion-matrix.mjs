#!/usr/bin/env node
/**
 * Phase 2.0 — Consolidate the 9 batch JSON files in `motion-views-matrix/`
 * into a single `motion_views_matrix.json` at the project root.
 *
 * Reads:   ../motion-views-matrix/B*-*.json
 * Writes:  ../motion_views_matrix.json
 *
 * Idempotent. Run from cvapps/scripts/ or via `node cvapps/scripts/consolidate-motion-matrix.mjs`.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..') // repo root (cvapps/.. = repo root)
const MATRIX_DIR = join(ROOT, 'motion-views-matrix')
const OUT_FILE = join(ROOT, 'motion_views_matrix.json')

if (!existsSync(MATRIX_DIR)) {
  console.error(`Matrix directory not found: ${MATRIX_DIR}`)
  process.exit(1)
}

const batchFiles = readdirSync(MATRIX_DIR)
  .filter(f => /^B\d+-.+\.json$/.test(f))
  .sort()

if (batchFiles.length === 0) {
  console.error('No batch files found.')
  process.exit(1)
}

const consolidated = {
  $schema: './spec-02-addendum-v1.1-grille-evaluation-vues.md#format',
  generated_at: new Date().toISOString(),
  generated_by: 'cvapps/scripts/consolidate-motion-matrix.mjs',
  total_batches: batchFiles.length,
  batches: [],
  motions: [],
}

const motionIds = new Set()

for (const file of batchFiles) {
  const path = join(MATRIX_DIR, file)
  const raw = readFileSync(path, 'utf8')
  let batch
  try {
    batch = JSON.parse(raw)
  } catch (e) {
    console.error(`Skip ${file}: invalid JSON — ${e.message}`)
    continue
  }

  consolidated.batches.push({
    batch_id: batch.batch_id,
    batch_label: batch.batch_label,
    disciplines: batch.disciplines ?? [batch.discipline],
    motions_count: batch.motions?.length ?? 0,
    checkpoint: batch.checkpoint,
  })

  for (const motion of batch.motions ?? []) {
    if (motionIds.has(motion.motion_id)) {
      console.error(`Duplicate motion_id: ${motion.motion_id} (in ${file})`)
      process.exit(1)
    }
    motionIds.add(motion.motion_id)
    consolidated.motions.push({
      ...motion,
      _batch_id: batch.batch_id,
    })
  }
}

consolidated.total_motions = consolidated.motions.length

const summary = {
  motions_with_1_view: 0,
  motions_with_2_views: 0,
  motions_with_3_views: 0,
  primary_view_distribution: {},
  secondary_view_distribution: {},
  feasibility_2d_ok: 0,
  feasibility_2d_limited: 0,
  total_measures: 0,
}

for (const motion of consolidated.motions) {
  const retained = motion.retained_views ?? []
  if (retained.length === 1) summary.motions_with_1_view += 1
  else if (retained.length === 2) summary.motions_with_2_views += 1
  else if (retained.length === 3) summary.motions_with_3_views += 1

  for (const view of retained) {
    summary.total_measures += (view.measures ?? []).length
    if (view.feasibility_2d === 'ok') summary.feasibility_2d_ok += 1
    if (view.feasibility_2d === 'limited') summary.feasibility_2d_limited += 1
    if (view.primary) {
      summary.primary_view_distribution[view.view] = (summary.primary_view_distribution[view.view] ?? 0) + 1
    } else {
      summary.secondary_view_distribution[view.view] = (summary.secondary_view_distribution[view.view] ?? 0) + 1
    }
  }
}
consolidated.summary = summary

writeFileSync(OUT_FILE, JSON.stringify(consolidated, null, 2) + '\n')

console.log(`✓ Consolidated ${batchFiles.length} batches → ${consolidated.total_motions} motions`)
console.log(`  Wrote: ${OUT_FILE}`)
console.log(`  Summary:`)
console.log(`    motions_with_1_view:  ${summary.motions_with_1_view}`)
console.log(`    motions_with_2_views: ${summary.motions_with_2_views}`)
console.log(`    motions_with_3_views: ${summary.motions_with_3_views}`)
console.log(`    feasibility_2d ok:    ${summary.feasibility_2d_ok}`)
console.log(`    feasibility_2d limited: ${summary.feasibility_2d_limited}`)
console.log(`    total measures: ${summary.total_measures}`)
