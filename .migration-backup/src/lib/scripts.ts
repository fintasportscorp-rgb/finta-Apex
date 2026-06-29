// DSL script loader and basic client-side validator
// Spec-02: validates required fields and landmark references before use
// v1.1: multi-view support via `available_views` (see spec-02-addendum-v1.1-multivue.md)

import { LANDMARK_NAMES } from '../engine/types'

// Load all JSON files from src/scripts/ at build time via Vite glob import
const _allModules = import.meta.glob('../scripts/*.json', { eager: true }) as Record<string, { default: unknown }>

export type MovementType = 'finite' | 'continuous'
export type ViewType =
  | 'sagittal_left' | 'sagittal_right' | 'frontal'
  | 'posterior' | 'oblique_left' | 'oblique_right' | 'overhead'

export type SideType = 'left' | 'right' | 'both' | 'auto'

export type Feasibility2D = 'ok' | 'limited'

export interface ScriptMeasure {
  id: string
  primitive: 'angle' | 'rotation' | 'speed' | 'position' | 'hitting_plane' | 'acceleration' | 'cadence'
  mode: string
  points?: string[]
  point?: string
  reference?: string
  axis?: string
  source_measure?: string
  out_of_plane?: boolean
  expose: boolean
}

export interface ScriptPhase {
  id: string
  until: unknown
}

export interface ScriptInput {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'single_select' | 'scale' | 'rpe' | 'rpe_readiness' | 'bool' | 'date'
  options?: string[]
  min?: number
  max?: number
  scope: 'sequence' | 'instance'
  required: boolean
}

export interface SymmetryPair {
  right: string
  left: string
}

/** Per-script configuration for the in-browser ball tracker.
 *  See lib/ballTracker.ts for the HSV-blob implementation and sport presets. */
export interface BallTrackingConfig {
  enabled: boolean
  /** Pick a built-in HSV preset by sport key (tennis | basketball | volleyball | ...). */
  sport_preset?: string
  /** Or override with explicit HSV bounds. H is 0-360, S/V are 0-1. */
  hsv_min?: [number, number, number]
  hsv_max?: [number, number, number]
  /** Optional radius hint in normalised image units (fraction of image height). */
  min_radius?: number
  max_radius?: number
}

/**
 * v1.1 — one recommended view for a motion, with its own measure set.
 * See spec-02-addendum-v1.1-multivue.md §2.
 */
export interface AvailableView {
  view: ViewType
  /** Distinct integer in 1..N, where N is `available_views.length`. */
  priority: number
  /** Exactly one view per script has primary:true (and priority:1). */
  primary: boolean
  rationale_fr?: string
  rationale_en?: string
  feasibility_2d: Feasibility2D
  side?: SideType
  required_visible?: string[]
  /**
   * Measures observable in this view.
   * v1.1 invariant L-MV-7: measures inside an AvailableView never carry `out_of_plane:true`.
   */
  measures: ScriptMeasure[]
}

export interface Script {
  id: string
  version: string
  /** "1.0" (legacy) or "1.1" (multi-view). */
  dsl_version: string
  discipline: string
  gesture: string
  movement_type: MovementType
  cv_model: string
  /** v1.0: the single declared view. v1.1: hydrated from the primary AvailableView for backward compat. */
  view: ViewType
  height?: string
  distance_rule?: string
  /** v1.0: top-level. v1.1: hydrated from the primary AvailableView. */
  side?: SideType
  description?: string
  /** v1.0: top-level. v1.1: hydrated from the primary AvailableView. */
  required_visible?: string[]
  /** v1.0: full measure list. v1.1: hydrated from the primary AvailableView (read-only convenience). */
  measures: ScriptMeasure[]
  /** v1.1 only — full multi-view declaration. */
  available_views?: AvailableView[]
  segmentation: unknown
  phases?: ScriptPhase[]
  key_event?: unknown
  anchor_event?: unknown
  outputs: string[]
  report_highlights?: string[]
  inputs?: ScriptInput[]
  symmetry_pairs?: SymmetryPair[]
  ball_tracking?: BallTrackingConfig
}

// ──────────────────────────────────────────────────────────────────────────
// v1.1 helpers
// ──────────────────────────────────────────────────────────────────────────

const VIEW_LABELS_FR: Record<ViewType, string> = {
  sagittal_right: 'Profil droit',
  sagittal_left: 'Profil gauche',
  frontal: 'Face',
  posterior: 'Dos',
  oblique_left: 'Oblique G',
  oblique_right: 'Oblique D',
  overhead: 'Plongée',
}

const VIEW_LABELS_EN: Record<ViewType, string> = {
  sagittal_right: 'Right profile',
  sagittal_left: 'Left profile',
  frontal: 'Front',
  posterior: 'Back',
  oblique_left: 'Oblique L',
  oblique_right: 'Oblique R',
  overhead: 'Overhead',
}

/** Returns the localized display label for a view type. */
export function getViewLabel(view: ViewType, lang: 'fr' | 'en' = 'fr'): string {
  const labels = lang === 'en' ? VIEW_LABELS_EN : VIEW_LABELS_FR
  return labels[view] ?? view
}

/** Returns the primary view of a v1.1 script, or undefined if not available. */
export function getRecommendedView(script: Script): AvailableView | undefined {
  if (!script.available_views || script.available_views.length === 0) return undefined
  return script.available_views.find(v => v.primary) ?? script.available_views[0]
}

/** Returns all available views, sorted by priority. */
export function getAvailableViews(script: Script): AvailableView[] {
  if (!script.available_views) return []
  return [...script.available_views].sort((a, b) => a.priority - b.priority)
}

/**
 * Returns the union of measures (deduplicated by id) collected when the user selects
 * the given views. If a measure id appears in multiple views, the first occurrence
 * (lowest priority view) wins.
 */
export function getMeasuresForViews(script: Script, selectedViews: ViewType[]): ScriptMeasure[] {
  if (!script.available_views) return script.measures ?? []
  const seen = new Set<string>()
  const result: ScriptMeasure[] = []
  // Iterate by priority so lower-priority views win id collisions.
  const sorted = [...script.available_views].sort((a, b) => a.priority - b.priority)
  for (const view of sorted) {
    if (!selectedViews.includes(view.view)) continue
    for (const m of view.measures) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        result.push(m)
      }
    }
  }
  return result
}

// ──────────────────────────────────────────────────────────────────────────
// Laterality mirroring
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pairs of landmark names that swap when mirroring left ↔ right.
 * Derived points (`hip_center`, `shoulder_center`) and side-neutral landmarks
 * (`nose`, `mouth_left`/`mouth_right` — kept as-is) are not flipped.
 */
const LATERALITY_FLIP_MAP: Record<string, string> = {
  left_eye_inner: 'right_eye_inner', right_eye_inner: 'left_eye_inner',
  left_eye: 'right_eye',             right_eye: 'left_eye',
  left_eye_outer: 'right_eye_outer', right_eye_outer: 'left_eye_outer',
  left_ear: 'right_ear',             right_ear: 'left_ear',
  left_shoulder: 'right_shoulder',   right_shoulder: 'left_shoulder',
  left_elbow: 'right_elbow',         right_elbow: 'left_elbow',
  left_wrist: 'right_wrist',         right_wrist: 'left_wrist',
  left_pinky: 'right_pinky',         right_pinky: 'left_pinky',
  left_index: 'right_index',         right_index: 'left_index',
  left_thumb: 'right_thumb',         right_thumb: 'left_thumb',
  left_hip: 'right_hip',             right_hip: 'left_hip',
  left_knee: 'right_knee',           right_knee: 'left_knee',
  left_ankle: 'right_ankle',         right_ankle: 'left_ankle',
  left_heel: 'right_heel',           right_heel: 'left_heel',
  left_foot_index: 'right_foot_index', right_foot_index: 'left_foot_index',
}

/** Returns the mirrored landmark name, or the input unchanged when no pair exists. */
export function flipLandmarkName(name: string): string {
  return LATERALITY_FLIP_MAP[name] ?? name
}

/** Side swap for the `side` field of a view. */
function flipSide(side: SideType | undefined): SideType | undefined {
  if (side === 'left') return 'right'
  if (side === 'right') return 'left'
  return side
}

/** Flip the landmark portion of a signal like `speed:right_wrist`. Measure-id signals are left untouched. */
function flipSignal(signal: unknown): unknown {
  if (typeof signal !== 'string') return signal
  const match = signal.match(/^(speed|angle|position):(.+)$/)
  if (!match) return signal
  const [, prim, ref] = match
  // Only flip if the ref is a known landmark (not a measure id).
  const flipped = LATERALITY_FLIP_MAP[ref!]
  return flipped ? `${prim}:${flipped}` : signal
}

/** Flip landmark references in a condition object (start/end/until/key_event). */
function flipCondition(cond: unknown): unknown {
  if (cond == null || typeof cond !== 'object') return cond
  const c = cond as Record<string, unknown>
  if (!('signal' in c)) return c
  return { ...c, signal: flipSignal(c.signal) }
}

function flipMeasure(m: ScriptMeasure): ScriptMeasure {
  return {
    ...m,
    points: m.points?.map(flipLandmarkName),
    point: m.point ? flipLandmarkName(m.point) : m.point,
    reference: m.reference ? flipLandmarkName(m.reference) : m.reference,
  }
}

function flipAvailableView(v: AvailableView): AvailableView {
  return {
    ...v,
    side: flipSide(v.side),
    required_visible: v.required_visible?.map(flipLandmarkName),
    measures: v.measures.map(flipMeasure),
  }
}

/**
 * Mirror a script left ↔ right. Used to handle left-handed users without duplicating
 * the catalog: a script declaring `right_*` landmarks is transformed on the fly into
 * one declaring `left_*` (and vice versa). Idempotent.
 *
 * Touches: top-level `view`, `side`, `measures`, `required_visible`;
 * each `available_views[]` entry (side/measures/required_visible);
 * segmentation start/end signals; phases until signals; key_event/anchor_event signals.
 */
export function mirrorScript(script: Script): Script {
  const view: ViewType = (() => {
    if (script.view === 'sagittal_left') return 'sagittal_right'
    if (script.view === 'sagittal_right') return 'sagittal_left'
    if (script.view === 'oblique_left') return 'oblique_right'
    if (script.view === 'oblique_right') return 'oblique_left'
    return script.view
  })()

  const segmentation = script.segmentation && typeof script.segmentation === 'object'
    ? (() => {
        const s = script.segmentation as Record<string, unknown>
        const out: Record<string, unknown> = { ...s }
        if (s.start) out.start = flipCondition(s.start)
        if (s.end) out.end = flipCondition(s.end)
        // cycle_signal references a measure id; landmark-named signals are rare but possible.
        if (typeof s.cycle_signal === 'string') {
          out.cycle_signal = LATERALITY_FLIP_MAP[s.cycle_signal] ?? s.cycle_signal
        }
        return out
      })()
    : script.segmentation

  const phases = script.phases?.map(p => ({
    ...p,
    until: typeof p.until === 'object' ? flipCondition(p.until) : p.until,
  }))

  return {
    ...script,
    view,
    side: flipSide(script.side),
    required_visible: script.required_visible?.map(flipLandmarkName),
    measures: script.measures?.map(flipMeasure) ?? [],
    available_views: script.available_views?.map(flipAvailableView),
    segmentation,
    phases,
    key_event: script.key_event ? flipCondition(script.key_event) : script.key_event,
    anchor_event: script.anchor_event ? flipCondition(script.anchor_event) : script.anchor_event,
  }
}

/** Convenience: only allocate a mirrored copy when needed. */
export function applyLaterality(script: Script, isLeftHanded: boolean): Script {
  return isLeftHanded ? mirrorScript(script) : script
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * Hydrate a v1.1 script so the legacy top-level fields (`view`, `measures`, `side`,
 * `required_visible`) reflect the primary AvailableView. This keeps existing
 * components working without modification while they migrate to use the helpers.
 */
function hydrateV11(script: Script): Script {
  if (script.dsl_version !== '1.1' || !script.available_views) return script
  const primary = getRecommendedView(script)
  if (!primary) return script
  return {
    ...script,
    view: primary.view,
    measures: primary.measures,
    side: primary.side ?? script.side,
    required_visible: primary.required_visible ?? script.required_visible,
  }
}

/**
 * Convert a legacy v1.0 script (with top-level `view`/`measures`) into a v1.1 shape
 * with a single AvailableView entry. Used by importers and the runtime so the rest
 * of the app can assume v1.1 structure.
 *
 * Note: measures with `out_of_plane:true` are dropped from the AvailableView wrapper
 * (per L-MV-7). They remain in `script.measures` (top-level) for legacy code, but
 * they will not appear in `available_views[0].measures`.
 */
export function adaptV1ToV11(script: Script): Script {
  if (script.dsl_version === '1.1' && script.available_views && script.available_views.length > 0) {
    return hydrateV11(script)
  }
  const view: ViewType = script.view ?? 'sagittal_right'
  const measures = script.measures ?? []
  const hasOutOfPlane = measures.some(m => m.out_of_plane)
  const wrapped: AvailableView = {
    view,
    priority: 1,
    primary: true,
    rationale_fr: 'Script v1.0 importé — vue unique.',
    feasibility_2d: hasOutOfPlane ? 'limited' : 'ok',
    side: script.side,
    required_visible: script.required_visible,
    measures: measures.filter(m => !m.out_of_plane),
  }
  return hydrateV11({
    ...script,
    dsl_version: '1.1',
    available_views: [wrapped],
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Linter
// ──────────────────────────────────────────────────────────────────────────

export interface LintError {
  field: string
  message: string
}

const VALID_VIEWS: ReadonlyArray<ViewType> = [
  'sagittal_left', 'sagittal_right', 'frontal', 'posterior',
  'oblique_left', 'oblique_right', 'overhead',
]

const DERIVED_POINTS = ['hip_center', 'shoulder_center'] as const

function isValidLandmark(name: string): boolean {
  return (LANDMARK_NAMES as readonly string[]).includes(name)
    || (DERIVED_POINTS as readonly string[]).includes(name)
}

function lintMeasureArray(measures: ScriptMeasure[], fieldPrefix: string, errors: LintError[]): void {
  for (const m of measures) {
    const pts = [...(m.points ?? []), ...(m.point ? [m.point] : []), ...(m.reference ? [m.reference] : [])]
    for (const pt of pts) {
      if (!isValidLandmark(pt)) {
        errors.push({ field: `${fieldPrefix}.${m.id}.points`, message: `Unknown landmark: ${pt}` })
      }
    }
    if (m.primitive === 'angle' && m.mode === 'joint' && (m.points?.length ?? 0) !== 3) {
      errors.push({ field: `${fieldPrefix}.${m.id}`, message: `angle.joint requires exactly 3 points (start → vertex/sommet → end). Got ${m.points?.length ?? 0}.` })
    }
    if (m.primitive === 'angle' && m.mode === 'segment_axis' && (m.points?.length ?? 0) !== 2) {
      errors.push({ field: `${fieldPrefix}.${m.id}`, message: `angle.segment_axis requires exactly 2 points (segment start, segment end). Got ${m.points?.length ?? 0}.` })
    }
    if (m.primitive === 'rotation' && m.mode === 'separation' && (m.points?.length ?? 0) !== 4) {
      errors.push({ field: `${fieldPrefix}.${m.id}`, message: `rotation.separation requires exactly 4 points (line1_p1, line1_p2, line2_p1, line2_p2). Got ${m.points?.length ?? 0}.` })
    }
    if (m.primitive === 'hitting_plane' && (m.points?.length ?? 0) !== 3) {
      errors.push({ field: `${fieldPrefix}.${m.id}`, message: `hitting_plane requires exactly 3 points (hip, other_hip, wrist). Got ${m.points?.length ?? 0}.` })
    }
  }
  // source_measure resolution within this measure set
  const ids = new Set(measures.map(m => m.id))
  for (const m of measures) {
    if (m.source_measure && !ids.has(m.source_measure)) {
      errors.push({
        field: `${fieldPrefix}.${m.id}.source_measure`,
        message: `source_measure "${m.source_measure}" not defined in this view`,
      })
    }
  }
}

export function lintScript(script: unknown): LintError[] {
  const errors: LintError[] = []
  if (typeof script !== 'object' || script === null) {
    return [{ field: 'root', message: 'Script must be a JSON object' }]
  }
  const s = script as Record<string, unknown>

  if (!s.id || typeof s.id !== 'string') errors.push({ field: 'id', message: 'id is required (string slug)' })
  if (!s.dsl_version) errors.push({ field: 'dsl_version', message: 'dsl_version is required' })
  if (!['finite', 'continuous'].includes(s.movement_type as string)) {
    errors.push({ field: 'movement_type', message: 'movement_type must be "finite" or "continuous"' })
  }

  const isV11 = s.dsl_version === '1.1' && Array.isArray(s.available_views)

  // ── v1.1 path: lint available_views[] ──────────────────────────────────
  if (isV11) {
    const av = s.available_views as AvailableView[]

    // L-MV-1
    if (av.length === 0) {
      errors.push({ field: 'available_views', message: 'L-MV-1: at least one view required' })
    }
    // L-MV-2
    if (av.length > 3) {
      errors.push({ field: 'available_views', message: `L-MV-2: max 3 views (got ${av.length})` })
    }
    // L-MV-3: no duplicate view
    const views = av.map(v => v.view)
    if (new Set(views).size !== views.length) {
      errors.push({ field: 'available_views', message: 'L-MV-3: duplicate view in available_views' })
    }
    // L-MV-4: priorities are distinct and form 1..N
    const prios = av.map(v => v.priority)
    const distinctPrios = new Set(prios)
    const expected = new Set(Array.from({ length: av.length }, (_, i) => i + 1))
    const matches = prios.length === distinctPrios.size && prios.every(p => expected.has(p))
    if (!matches) {
      errors.push({ field: 'available_views', message: `L-MV-4: priorities must be distinct integers 1..${av.length}` })
    }
    // L-MV-5: exactly one primary
    const primaries = av.filter(v => v.primary === true)
    if (primaries.length !== 1) {
      errors.push({ field: 'available_views', message: `L-MV-5: exactly one primary view required (got ${primaries.length})` })
    }
    // L-MV-6: the primary view must be priority 1
    if (primaries.length === 1 && primaries[0].priority !== 1) {
      errors.push({ field: 'available_views', message: 'L-MV-6: primary view must have priority:1' })
    }
    // L-MV-11: sagittal_left and sagittal_right are mutually exclusive
    if (views.includes('sagittal_left') && views.includes('sagittal_right')) {
      errors.push({ field: 'available_views', message: 'L-MV-11: sagittal_left and sagittal_right are mutually exclusive (use `side`)' })
    }

    // Per-view checks
    for (const av_entry of av) {
      if (!VALID_VIEWS.includes(av_entry.view)) {
        errors.push({ field: `available_views.${av_entry.view}`, message: `Invalid view: ${av_entry.view}` })
      }
      // L-MV-9: each view must have ≥1 measure
      if (!av_entry.measures || av_entry.measures.length === 0) {
        errors.push({ field: `available_views.${av_entry.view}.measures`, message: 'L-MV-9: each view must declare at least one measure' })
        continue
      }
      // L-MV-7: no out_of_plane:true inside a view
      for (const m of av_entry.measures) {
        if (m.out_of_plane === true) {
          errors.push({
            field: `available_views.${av_entry.view}.measures.${m.id}`,
            message: 'L-MV-7: out_of_plane:true not allowed inside available_views',
          })
        }
      }
      // Lint the measure array (landmarks, arity, source_measure)
      lintMeasureArray(av_entry.measures, `available_views.${av_entry.view}.measures`, errors)
    }

    // L-MV-8 sketch: signals referenced by segmentation/phases/key_event must exist
    // in the union of all measures. (Strict per-view enforcement is deferred.)
    const allMeasureIds = new Set<string>()
    for (const v of av) for (const m of v.measures ?? []) allMeasureIds.add(m.id)
    const seg = s.segmentation as Record<string, unknown> | undefined
    if (seg?.start) checkSignalRef(seg.start, allMeasureIds, 'segmentation.start', errors)
    if (seg?.end) checkSignalRef(seg.end, allMeasureIds, 'segmentation.end', errors)
  } else {
    // ── v1.0 path: legacy top-level fields ─────────────────────────────
    const measures = s.measures as ScriptMeasure[] | undefined
    if (!measures || !Array.isArray(measures) || measures.length === 0) {
      errors.push({ field: 'measures', message: 'At least one measure is required' })
    } else {
      lintMeasureArray(measures, 'measures', errors)
    }
  }

  // Common segmentation consistency
  const seg = s.segmentation as Record<string, unknown> | undefined
  if (seg) {
    if (s.movement_type === 'finite' && seg.mode !== 'discrete') {
      errors.push({ field: 'segmentation.mode', message: 'finite movement_type requires discrete segmentation' })
    }
    if (s.movement_type === 'continuous' && seg.mode === 'discrete') {
      errors.push({ field: 'segmentation.mode', message: 'continuous movement_type cannot use discrete segmentation' })
    }
  }

  return errors
}

function checkSignalRef(
  cond: unknown,
  measureIds: ReadonlySet<string>,
  fieldPath: string,
  errors: LintError[],
): void {
  if (typeof cond !== 'object' || cond === null) return
  const c = cond as Record<string, unknown>
  const signal = c.signal
  if (typeof signal !== 'string') return
  // signal forms: "speed:<id>", "angle:<id>", "position:<id>", "rest"
  const match = signal.match(/^(speed|angle|position):(.+)$/)
  if (!match) return
  const ref = match[2]
  // The ref can be either a measure id OR a landmark id (e.g. "speed:right_wrist")
  if (!measureIds.has(ref) && !isValidLandmark(ref)) {
    errors.push({ field: fieldPath, message: `L-MV-8: signal "${signal}" references unknown measure/landmark "${ref}"` })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Loader & in-memory store
// ──────────────────────────────────────────────────────────────────────────

/** Built-in scripts loaded from src/scripts/*.json at build time. Hydrated to v1.1 shape. */
const BUILT_IN_SCRIPTS: Script[] = Object.values(_allModules)
  .map(m => m.default as Script)
  .map(s => adaptV1ToV11(s))

// Load and validate a script from a user-provided File (import flow).
export async function importScriptFile(file: File): Promise<{ script: Script; errors: LintError[] }> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { script: {} as Script, errors: [{ field: 'json', message: 'Invalid JSON' }] }
  }
  const errors = lintScript(parsed)
  const adapted = errors.length === 0 ? adaptV1ToV11(parsed as Script) : (parsed as Script)
  return { script: adapted, errors }
}

// In-memory script store (session-scoped, vacuum at beforeunload)
let sessionScripts: Script[] = [...BUILT_IN_SCRIPTS]

export function getAllScripts(): Script[] {
  return sessionScripts
}

export function addScript(script: Script): void {
  const adapted = adaptV1ToV11(script)
  sessionScripts = [...sessionScripts.filter(s => s.id !== adapted.id), adapted]
}

export function getScript(id: string): Script | undefined {
  return sessionScripts.find(s => s.id === id)
}

export function getBuiltInScripts(): Script[] {
  return BUILT_IN_SCRIPTS
}

export function deleteScript(id: string): void {
  sessionScripts = sessionScripts.filter(s => s.id !== id)
}
