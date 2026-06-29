// DSL linter — 10 rules spec-02 §2.3
import { ALL_VALID_POINTS } from './resolver'

export interface LintError {
  rule: number
  field: string
  message: string
}

export interface LintResult {
  valid: boolean
  errors: LintError[]
}

const VALID_PRIMITIVES = new Set(['angle', 'rotation', 'speed', 'position', 'hitting_plane', 'acceleration', 'cadence'])
const VALID_ANGLE_MODES = new Set(['joint', 'segment_axis'])
const VALID_ROTATION_MODES = new Set(['orientation', 'orientation_folded', 'angular_displacement', 'separation'])
// orientation_folded and separation are view-invariant and never need out_of_plane:true
const ROTATION_MODES_EXEMPT_FROM_FRONTAL = new Set(['orientation_folded', 'separation'])
const VALID_SPEED_MODES = new Set(['linear', 'angular'])
const VALID_ACCELERATION_MODES = new Set(['linear', 'angular'])
const VALID_INPUT_TYPES = new Set(['text', 'textarea', 'number', 'single_select', 'scale', 'bool', 'date'])
const VALID_SEGMENTATION_MODES = new Set(['discrete', 'cyclic', 'continuous'])
const VALID_MOVEMENT_TYPES = new Set(['finite', 'continuous'])
const FRONTAL_VIEWS = new Set(['frontal', 'posterior'])

export function lintScript(script: unknown): LintResult {
  const errors: LintError[] = []

  if (typeof script !== 'object' || script === null) {
    return { valid: false, errors: [{ rule: 8, field: 'root', message: 'Script must be a JSON object' }] }
  }

  const s = script as Record<string, unknown>

  // Rule 8: cv_model or dsl_version absent
  if (!s.dsl_version || typeof s.dsl_version !== 'string') {
    errors.push({ rule: 8, field: 'dsl_version', message: 'dsl_version is required' })
  }
  if (!s.cv_model || typeof s.cv_model !== 'string') {
    errors.push({ rule: 8, field: 'cv_model', message: 'cv_model is required' })
  }

  // Rule 9: movement_type absent or inconsistent with segmentation.mode
  const movType = s.movement_type as string | undefined
  if (!movType || !VALID_MOVEMENT_TYPES.has(movType)) {
    errors.push({ rule: 9, field: 'movement_type', message: `movement_type must be one of: ${[...VALID_MOVEMENT_TYPES].join(', ')}` })
  }

  const seg = s.segmentation as Record<string, unknown> | undefined
  if (seg) {
    const segMode = seg.mode as string | undefined
    if (!segMode || !VALID_SEGMENTATION_MODES.has(segMode)) {
      errors.push({ rule: 9, field: 'segmentation.mode', message: `segmentation.mode must be one of: ${[...VALID_SEGMENTATION_MODES].join(', ')}` })
    } else if (movType) {
      if (movType === 'finite' && segMode !== 'discrete') {
        errors.push({ rule: 9, field: 'segmentation.mode', message: 'finite movement_type requires discrete segmentation' })
      }
      if (movType === 'continuous' && segMode === 'discrete') {
        errors.push({ rule: 9, field: 'segmentation.mode', message: 'continuous movement_type cannot use discrete segmentation' })
      }
    }
  }

  if (!Array.isArray(s.measures) || (s.measures as unknown[]).length === 0) {
    errors.push({ rule: 8, field: 'measures', message: 'At least one measure is required' })
    return { valid: errors.length === 0, errors }
  }

  type MeasureRaw = Record<string, unknown>
  const measures = s.measures as MeasureRaw[]
  const measureIds = new Set(measures.map(m => m.id as string))
  const viewType = s.view as string | undefined
  const isFrontal = FRONTAL_VIEWS.has(viewType ?? '')

  for (const m of measures) {
    const mid = `measures.${String(m.id)}`
    const primitive = m.primitive as string | undefined
    const mode = m.mode as string | undefined

    if (!VALID_PRIMITIVES.has(primitive ?? '')) {
      errors.push({ rule: 2, field: `${mid}.primitive`, message: `Unknown primitive: ${String(primitive)}` })
      continue
    }

    // Rule 2: arity check per primitive/mode
    if (primitive === 'angle') {
      if (!VALID_ANGLE_MODES.has(mode ?? '')) {
        errors.push({ rule: 2, field: `${mid}.mode`, message: `angle mode must be joint or segment_axis` })
      } else if (mode === 'joint') {
        const pts = m.points as string[] | undefined
        if (!Array.isArray(pts) || pts.length !== 3) {
          errors.push({ rule: 2, field: `${mid}.points`, message: 'angle.joint requires exactly 3 points' })
        }
      } else if (mode === 'segment_axis') {
        const pts = m.points as string[] | undefined
        if (!Array.isArray(pts) || pts.length !== 2) {
          errors.push({ rule: 2, field: `${mid}.points`, message: 'angle.segment_axis requires exactly 2 points' })
        }
      }
    }

    if (primitive === 'rotation') {
      if (!VALID_ROTATION_MODES.has(mode ?? '')) {
        errors.push({ rule: 2, field: `${mid}.mode`, message: `rotation mode must be one of: ${[...VALID_ROTATION_MODES].join(', ')}` })
      } else {
        const pts = m.points as string[] | undefined
        const expectedCount = mode === 'separation' ? 4 : 2
        if (!Array.isArray(pts) || pts.length !== expectedCount) {
          errors.push({ rule: 2, field: `${mid}.points`, message: `rotation.${mode} requires exactly ${expectedCount} points` })
        }
      }
    }

    if (primitive === 'hitting_plane') {
      const pts = m.points as string[] | undefined
      if (!Array.isArray(pts) || pts.length !== 3) {
        errors.push({ rule: 2, field: `${mid}.points`, message: 'hitting_plane requires exactly 3 points (hip, other_hip, wrist)' })
      }
    }

    if (primitive === 'speed') {
      if (!VALID_SPEED_MODES.has(mode ?? '')) {
        errors.push({ rule: 2, field: `${mid}.mode`, message: `speed mode must be linear or angular` })
      }
    }

    if (primitive === 'acceleration') {
      if (!VALID_ACCELERATION_MODES.has(mode ?? '')) {
        errors.push({ rule: 2, field: `${mid}.mode`, message: `acceleration mode must be linear or angular` })
      }
    }

    // Rule 1: Landmark names must be valid
    const points = [
      ...((m.points as string[] | undefined) ?? []),
      ...((m.point as string | undefined) ? [m.point as string] : []),
    ]
    for (const pt of points) {
      if (!ALL_VALID_POINTS.has(pt)) {
        errors.push({ rule: 1, field: `${mid}.points`, message: `Unknown landmark: '${pt}'` })
      }
    }

    // Rule 3: side field validation (if script has side, landmarks must match)
    // Bilateral primitives (orientation_folded, separation, hitting_plane) require both sides by definition
    const isBilateral =
      primitive === 'hitting_plane' ||
      (primitive === 'rotation' && (mode === 'orientation_folded' || mode === 'separation'))
    const scriptSide = s.side as string | undefined
    if (!isBilateral && scriptSide && scriptSide !== 'both' && scriptSide !== 'auto') {
      for (const pt of points) {
        if ((pt.startsWith('left_') || pt.startsWith('right_')) && !pt.startsWith(`${scriptSide}_`)) {
          // Only warn if the point is clearly the wrong side (not a derived or neutral point)
          if (!['hip_center', 'shoulder_center', 'nose', 'mouth_left', 'mouth_right'].includes(pt)) {
            errors.push({ rule: 3, field: `${mid}.points`, message: `Landmark '${pt}' does not match script side '${scriptSide}'` })
          }
        }
      }
    }

    // Rule 4: source_measure must exist and not form a cycle
    if (primitive === 'speed' && mode === 'angular') {
      const srcId = m.source_measure as string | undefined
      if (!srcId) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: 'speed.angular requires source_measure' })
      } else if (!measureIds.has(srcId)) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: `source_measure '${srcId}' is not defined` })
      } else if (srcId === m.id) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: 'source_measure cannot reference itself (cycle)' })
      }
    }

    if (primitive === 'acceleration') {
      const srcId = m.source_measure as string | undefined
      if (!srcId) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: 'acceleration requires source_measure (a speed measure id)' })
      } else if (!measureIds.has(srcId)) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: `source_measure '${srcId}' is not defined` })
      } else if (srcId === m.id) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: 'source_measure cannot reference itself (cycle)' })
      }
    }

    if (primitive === 'cadence') {
      const srcId = m.source_measure as string | undefined
      if (!srcId) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: 'cadence requires source_measure (a cyclic measure id, e.g. the cycle_signal)' })
      } else if (!measureIds.has(srcId)) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: `source_measure '${srcId}' is not defined` })
      } else if (srcId === m.id) {
        errors.push({ rule: 4, field: `${mid}.source_measure`, message: 'source_measure cannot reference itself (cycle)' })
      }
    }

    // Rule 5: transverse rotation without out_of_plane:true in frontal view
    // orientation_folded and separation are view-invariant — no out_of_plane flag needed
    // hitting_plane uses 3D depth (z) — not a 2D projection
    const isFrontalRotation = primitive === 'rotation' && isFrontal && !ROTATION_MODES_EXEMPT_FROM_FRONTAL.has(mode ?? '')
    if (isFrontalRotation && !m.out_of_plane) {
      errors.push({ rule: 5, field: `${mid}.out_of_plane`, message: 'rotation in frontal view requires out_of_plane: true' })
    }

    // Rule 7: unit consistency with primitive
    if (m.unit !== undefined) {
      const unitVal = m.unit as string
      if (primitive === 'angle' && unitVal !== 'deg') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `angle primitive produces 'deg', got '${unitVal}'` })
      }
      if (primitive === 'rotation' && unitVal !== 'deg') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `rotation primitive produces 'deg', got '${unitVal}'` })
      }
      if (primitive === 'speed' && mode === 'angular' && unitVal !== 'deg/s') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `speed.angular produces 'deg/s', got '${unitVal}'` })
      }
      if (primitive === 'speed' && mode === 'linear' && unitVal !== 'TL/s') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `speed.linear produces 'TL/s', got '${unitVal}'` })
      }
      if (primitive === 'acceleration' && mode === 'angular' && unitVal !== 'deg/s²') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `acceleration.angular produces 'deg/s²', got '${unitVal}'` })
      }
      if (primitive === 'acceleration' && mode === 'linear' && unitVal !== 'TL/s²') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `acceleration.linear produces 'TL/s²', got '${unitVal}'` })
      }
      if (primitive === 'cadence' && unitVal !== 'cycles/min') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `cadence produces 'cycles/min', got '${unitVal}'` })
      }
      if (primitive === 'position' && unitVal !== 'TL') {
        errors.push({ rule: 7, field: `${mid}.unit`, message: `position primitive produces 'TL', got '${unitVal}'` })
      }
    }
  }

  // Rule 6: segmentation signal must reference valid measure or use accepted grammar
  if (seg) {
    // cycle_signal is a bare measure_id
    const cycleSignal = seg.cycle_signal
    if (cycleSignal !== undefined) {
      if (typeof cycleSignal !== 'string' || !measureIds.has(cycleSignal)) {
        errors.push({ rule: 6, field: 'segmentation.cycle_signal', message: `cycle_signal '${String(cycleSignal)}' does not reference a defined measure` })
      }
    }

    // start.signal / end.signal: "primitive:target" or "rest"
    const checkEventSignal = (signal: unknown, fieldPath: string) => {
      if (typeof signal !== 'string') return
      if (signal === 'rest') return
      const parts = signal.split(':')
      if (parts.length !== 2) {
        errors.push({ rule: 6, field: fieldPath, message: `Invalid signal format: '${signal}' (expected primitive:target or 'rest')` })
        return
      }
      const [prim] = parts
      if (!VALID_PRIMITIVES.has(prim!)) {
        errors.push({ rule: 6, field: fieldPath, message: `Unknown primitive in signal: '${prim}'` })
      }
      // Note: target may be a measure_id or a landmark name — both are valid
    }
    const startSig = (seg.start as Record<string, unknown> | undefined)?.signal
    if (startSig) checkEventSignal(startSig, 'segmentation.start.signal')
    const endSig = (seg.end as Record<string, unknown> | undefined)?.signal
    if (endSig) checkEventSignal(endSig, 'segmentation.end.signal')
  }

  // Rule 10: inputs validation
  if (Array.isArray(s.inputs)) {
    for (const inp of s.inputs as Record<string, unknown>[]) {
      const iid = `inputs.${String(inp.id)}`
      if (!VALID_INPUT_TYPES.has(inp.type as string)) {
        errors.push({ rule: 10, field: `${iid}.type`, message: `Invalid input type: '${String(inp.type)}'` })
      }
      if (inp.type === 'single_select' && (!Array.isArray(inp.options) || (inp.options as unknown[]).length === 0)) {
        errors.push({ rule: 10, field: `${iid}.options`, message: 'single_select input requires non-empty options' })
      }
      if (inp.type === 'scale') {
        if (inp.min === undefined || inp.max === undefined) {
          errors.push({ rule: 10, field: `${iid}`, message: 'scale input requires min and max' })
        }
      }
      if (inp.required === true) {
        errors.push({ rule: 10, field: `${iid}.required`, message: 'inputs[].required must be false (spec invariant)' })
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
