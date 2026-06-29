// Adds a posterior view to every script that has a frontal view but no posterior view yet.
// The posterior view copies the same measures, required_visible, and side as the frontal view.
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SCRIPTS_DIR = resolve(__dirname, '../src/scripts')

const files = readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json'))
let modified = 0

for (const file of files) {
  const fullPath = join(SCRIPTS_DIR, file)
  const raw = readFileSync(fullPath, 'utf8')
  let script
  try {
    script = JSON.parse(raw)
  } catch {
    console.warn(`Skip (parse error): ${file}`)
    continue
  }

  const views = script.available_views
  if (!Array.isArray(views)) continue

  const hasFrontal = views.some(v => v.view === 'frontal')
  const hasPosterior = views.some(v => v.view === 'posterior')
  if (!hasFrontal || hasPosterior) continue

  const frontal = views.find(v => v.view === 'frontal')
  const maxPriority = Math.max(...views.map(v => v.priority ?? 0))

  const posterior = {
    view: 'posterior',
    priority: maxPriority + 1,
    primary: false,
    rationale_fr: `Vue arrière : mêmes mesures bilatérales que la vue frontale, capturées depuis le dos.`,
    rationale_en: `Rear view: same bilateral measures as the frontal view, captured from behind.`,
    feasibility_2d: frontal.feasibility_2d ?? 'ok',
    side: frontal.side,
    required_visible: [...(frontal.required_visible ?? [])],
    measures: JSON.parse(JSON.stringify(frontal.measures ?? [])),
  }

  script.available_views = [...views, posterior]

  writeFileSync(fullPath, JSON.stringify(script, null, 2) + '\n', 'utf8')
  console.log(`  + posterior → ${file}`)
  modified++
}

console.log(`\nDone. Added posterior view to ${modified} scripts.`)
