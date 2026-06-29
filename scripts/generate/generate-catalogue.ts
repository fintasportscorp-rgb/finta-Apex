#!/usr/bin/env tsx
// Catalogue generation — orchestration 03
// Calls Claude Opus 4.7 API to generate DSL scripts for sports gestures
// ANTHROPIC_API_KEY must be set in environment — NEVER bundled client-side
//
// Usage: ANTHROPIC_API_KEY=sk-... tsx scripts/generate/generate-catalogue.ts
// Options:
//   --gestures path/to/gestures.json   list of gestures to generate (default: market_matrix.json)
//   --out src/scripts/                 output directory (default: src/scripts/)
//   --max-retries 3                    linter retry limit per gesture (default: 3)
//   --dry-run                          print prompts but do not call API
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { lintScript } from '../../src/engine/interpreter/linter'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)

function arg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag)
  return idx >= 0 ? args[idx + 1] ?? fallback : fallback
}

const DRY_RUN = args.includes('--dry-run')
const MAX_RETRIES = parseInt(arg('--max-retries', '3'), 10)
const OUT_DIR = resolve(ROOT, arg('--out', 'src/scripts'))
const GESTURES_PATH = resolve(ROOT, arg('--gestures', 'scripts/generate/market_matrix.json'))

// ─── DSL generation prompt template ──────────────────────────────────────────
function buildPrompt(gesture: GestureSpec, linterErrors?: string): string {
  const errorSection = linterErrors ? `
The previous attempt failed linter validation:
${linterErrors}

Please fix all linter errors and regenerate.
` : ''

  return `You are a biomechanics expert and TypeScript developer generating a CVapps DSL script.

${errorSection}
Generate a complete JSON DSL script for:
- Discipline: ${gesture.discipline}
- Gesture: ${gesture.gesture}
- View: ${gesture.view}
- Movement type: ${gesture.movement_type}
- Description: ${gesture.description ?? ''}

Requirements:
1. Use only these landmark names: nose, left/right_eye_inner, left/right_eye, left/right_eye_outer, left/right_ear, mouth_left/right, left/right_shoulder, left/right_elbow, left/right_wrist, left/right_pinky, left/right_index, left/right_thumb, left/right_hip, left/right_knee, left/right_ankle, left/right_heel, left/right_foot_index — OR derived points: hip_center, shoulder_center
2. dsl_version: "1.0"
3. cv_model: "blazepose-full@1.x"
4. All inputs must have required: false
5. For angle measures: joint needs exactly 3 points, segment_axis needs exactly 2
6. For speed.angular: source_measure must reference a defined measure
7. For rotation in frontal/posterior view: out_of_plane must be true
8. movement_type must match segmentation.mode (finite→discrete, continuous→cyclic or continuous)
9. Use circularDiff convention for angles (never raw subtraction)
10. Mono-camera 2D only — do not reference 3D rotation

Output ONLY valid JSON, no markdown, no explanation.
Schema reference:
{
  "id": "discipline_gesture_view_v1",
  "version": "1.0.0",
  "dsl_version": "1.0",
  "discipline": "...",
  "gesture": "...",
  "movement_type": "finite|continuous",
  "cv_model": "blazepose-full@1.x",
  "view": "sagittal_left|sagittal_right|frontal|posterior|oblique_left|oblique_right|overhead",
  "height": "hip|knee|full",
  "distance_rule": "...",
  "side": "left|right|both|auto",
  "required_visible": [...],
  "measures": [
    {"id": "...", "primitive": "angle|rotation|speed|position", "mode": "...", "points": [...], "expose": true}
  ],
  "segmentation": {...},
  "outputs": [...],
  "report_highlights": [...],
  "inputs": [{"id": "...", "label": "...", "type": "...", "scope": "sequence|instance", "required": false}]
}`
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GestureSpec {
  discipline: string
  gesture: string
  view: string
  movement_type: 'finite' | 'continuous'
  description?: string
}

interface GenerateResult {
  gesture: GestureSpec
  script: unknown
  status: 'valid' | 'failed'
  errors?: string
  retries: number
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && !DRY_RUN) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required')
    process.exit(1)
  }

  let gestures: GestureSpec[]
  try {
    gestures = JSON.parse(readFileSync(GESTURES_PATH, 'utf-8')) as GestureSpec[]
  } catch {
    console.error(`Error reading gestures from ${GESTURES_PATH}`)
    console.error('Create the file or pass --gestures <path>')
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const results: GenerateResult[] = []

  for (const gesture of gestures) {
    console.log(`\n→ Generating: ${gesture.discipline} / ${gesture.gesture}`)
    const result = await generateScript(gesture, apiKey!, DRY_RUN)
    results.push(result)

    if (result.status === 'valid' && result.script) {
      const id = (result.script as Record<string, unknown>).id as string
      const outPath = resolve(OUT_DIR, `${id}.json`)
      writeFileSync(outPath, JSON.stringify(result.script, null, 2))
      console.log(`  ✓ saved → ${outPath}`)
    } else {
      console.error(`  ✗ failed after ${result.retries} retries`)
      if (result.errors) console.error(`    ${result.errors}`)
    }
  }

  // Summary
  const passed = results.filter(r => r.status === 'valid').length
  const failed = results.filter(r => r.status === 'failed').length
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Generated: ${passed} valid, ${failed} failed / ${results.length} total`)

  if (failed > 0) process.exit(1)
}

async function generateScript(
  gesture: GestureSpec,
  apiKey: string,
  dryRun: boolean,
): Promise<GenerateResult> {
  let linterErrors: string | undefined
  let attempt = 0

  while (attempt < MAX_RETRIES) {
    attempt++
    const prompt = buildPrompt(gesture, linterErrors)

    if (dryRun) {
      console.log(`  [dry-run] prompt length: ${prompt.length} chars`)
      return { gesture, script: null, status: 'failed', errors: 'dry-run', retries: attempt }
    }

    let rawText: string
    try {
      rawText = await callClaude(prompt, apiKey)
    } catch (err) {
      console.error(`  API error (attempt ${attempt}): ${String(err)}`)
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      linterErrors = `Invalid JSON response from API`
      continue
    }

    const lintResult = lintScript(parsed)
    if (lintResult.valid) {
      return { gesture, script: parsed, status: 'valid', retries: attempt }
    }

    linterErrors = lintResult.errors.map(e => `[rule ${e.rule}] ${e.field}: ${e.message}`).join('\n')
    console.log(`  attempt ${attempt}: linter errors, retrying...`)
  }

  return { gesture, script: null, status: 'failed', errors: linterErrors, retries: attempt }
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>
  }
  return data.content.find(c => c.type === 'text')?.text ?? ''
}

main().catch(err => { console.error(err); process.exit(1) })
