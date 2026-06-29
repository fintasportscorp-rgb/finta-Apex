#!/usr/bin/env node
// One-off: inject ball_tracking config into ball-sport scripts that don't have it yet.
// Re-running is idempotent. Reformats JSON to 2-space indent (matches existing).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'scripts')

const PRESETS = {
  tennis:     'tennis',
  padel:      'padel',
  basketball: 'basketball',
  volleyball: 'volleyball',
  football:   'football',
  handball:   'handball',
  golf:       'golf',
  badminton:  'badminton',
}

let updated = 0, skipped = 0

for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith('.json')) continue
  const path = join(DIR, file)
  const raw = readFileSync(path, 'utf8')
  let json
  try { json = JSON.parse(raw) } catch (e) {
    console.error(`skip ${file}: invalid JSON — ${e.message}`)
    continue
  }
  const preset = PRESETS[json.discipline]
  if (!preset)         { skipped++; continue }
  if (json.ball_tracking) { skipped++; continue }

  json.ball_tracking = { enabled: true, sport_preset: preset }

  writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8')
  console.log(`+ ${file} (${json.discipline} → ${preset})`)
  updated++
}

console.log(`\ndone — ${updated} updated, ${skipped} already had it or are not ball-sports`)
