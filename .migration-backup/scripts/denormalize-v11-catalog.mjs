#!/usr/bin/env node
/**
 * Phase 7 — Denormalize the v1.1 catalog by injecting top-level convenience
 * fields (`view`, `measures`, `side`, `required_visible`) populated from the
 * primary view. This keeps existing consumers that read `script.measures`
 * directly (engine interpreter, legacy tests) working without hydration.
 *
 * The `available_views[]` array remains the source of truth for multi-view
 * logic; the top-level fields are a denormalized projection of the primary.
 *
 * Idempotent: re-running detects already-denormalized scripts and only
 * refreshes the projection from the primary view.
 *
 * Usage: node cvapps/scripts/denormalize-v11-catalog.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = join(HERE, '..', 'src', 'scripts')

const files = readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json')).sort()

let updated = 0
for (const file of files) {
  const path = join(SCRIPTS_DIR, file)
  const raw = readFileSync(path, 'utf8')
  const script = JSON.parse(raw)

  if (script.dsl_version !== '1.1' || !Array.isArray(script.available_views) || script.available_views.length === 0) {
    continue
  }

  const primary = script.available_views.find(v => v.primary === true) ?? script.available_views[0]

  // Union of measures across all views, deduplicated by id (first occurrence wins).
  const seen = new Set()
  const unionMeasures = []
  for (const view of script.available_views) {
    for (const m of view.measures ?? []) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        unionMeasures.push(m)
      }
    }
  }

  // Build the denormalized script with the convenience fields placed near the top.
  const denormalized = {
    id: script.id,
    version: script.version,
    dsl_version: script.dsl_version,
    discipline: script.discipline,
    gesture: script.gesture,
    description: script.description,
    movement_type: script.movement_type,
    cv_model: script.cv_model,
    // Denormalized fields from the primary view (read by engine + legacy components).
    view: primary.view,
    side: primary.side ?? script.side,
    required_visible: primary.required_visible ?? script.required_visible,
    height: script.height,
    distance_rule: script.distance_rule,
    measures: unionMeasures,
    available_views: script.available_views,
    segmentation: script.segmentation,
    phases: script.phases,
    key_event: script.key_event,
    anchor_event: script.anchor_event,
    outputs: script.outputs,
    report_highlights: script.report_highlights,
    inputs: script.inputs,
    symmetry_pairs: script.symmetry_pairs,
    ball_tracking: script.ball_tracking,
  }

  // Drop undefined keys (JSON.stringify does this naturally but be explicit).
  for (const key of Object.keys(denormalized)) {
    if (denormalized[key] === undefined) delete denormalized[key]
  }

  writeFileSync(path, JSON.stringify(denormalized, null, 2) + '\n')
  updated += 1
}

console.log(`✓ Denormalized ${updated}/${files.length} v1.1 scripts`)
