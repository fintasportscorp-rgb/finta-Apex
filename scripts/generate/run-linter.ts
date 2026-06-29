#!/usr/bin/env tsx
// Validates all scripts in src/scripts/ via the DSL linter
// Run: tsx scripts/generate/run-linter.ts
// Exit code 0 = all pass, 1 = linter errors found
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintScript } from '../../src/engine/interpreter/linter'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SCRIPTS_DIR = resolve(__dirname, '../../src/scripts')

const files = readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json'))
let hasError = false

for (const file of files) {
  const raw = readFileSync(resolve(SCRIPTS_DIR, file), 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error(`✗ ${file}: invalid JSON`)
    hasError = true
    continue
  }
  const result = lintScript(parsed)
  if (result.valid) {
    console.log(`✓ ${file}`)
  } else {
    console.error(`✗ ${file}:`)
    for (const err of result.errors) {
      console.error(`    [rule ${err.rule}] ${err.field}: ${err.message}`)
    }
    hasError = true
  }
}

if (hasError) process.exit(1)
console.log(`\n${files.length} script(s) validated — all pass`)
