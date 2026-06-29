// DSL interpreter — spec-02 §interpreter
// interpret(script, frames) → MeasureResult[]
// Deterministic: same input → same output
// Applies One-Euro filter before computing primitives
import type { MeasureResult, PoseFrame } from '../types'
import type { Script } from '../../lib/scripts'
import { filterFrames } from '../filters/oneEuro'
import { computeAngleMeasure } from '../primitives/angle'
import { computeRotationMeasure } from '../primitives/rotation'
import { computeSpeedMeasure } from '../primitives/speed'
import { computePositionMeasure } from '../primitives/position'
import { computeHittingPlaneMeasure } from '../primitives/hittingPlane'
import { computeAccelerationMeasure } from '../primitives/acceleration'
import { computeCadenceMeasure } from '../primitives/cadence'
import { computeTorsoLengthRef } from './resolver'
import { lintScript } from './linter'

export { lintScript }

export function interpretFrames(script: Script, frames: PoseFrame[]): MeasureResult[] {
  if (frames.length === 0) return []

  // 1. Apply One-Euro filter
  const filtered = filterFrames(frames)

  // 2. Pre-compute torso reference once per sequence
  const torsoRef = computeTorsoLengthRef(filtered)

  // 3. Process measures in declaration order
  const results: MeasureResult[] = []
  const seriesById: Record<string, import('../../engine/types').MeasureSample[]> = {}

  for (const m of script.measures) {
    let result: MeasureResult

    if (m.primitive === 'angle') {
      const mode = m.mode as 'joint' | 'segment_axis'
      result = computeAngleMeasure(filtered, {
        id: m.id,
        mode,
        points: m.points ?? [],
        axis: m.axis as 'horizontal' | 'vertical' | undefined,
        out_of_plane: m.out_of_plane,
      })

    } else if (m.primitive === 'rotation') {
      result = computeRotationMeasure(filtered, {
        id: m.id,
        mode: m.mode as 'orientation' | 'orientation_folded' | 'angular_displacement' | 'separation',
        points: m.points ?? [],
        out_of_plane_declared: m.out_of_plane,
      })

    } else if (m.primitive === 'speed') {
      if (m.mode === 'angular' && m.source_measure) {
        const srcSamples = seriesById[m.source_measure]
        if (!srcSamples) {
          // source_measure not yet computed — emit empty result
          result = emptyResult(m.id, 'speed', 'deg/s')
        } else {
          result = computeSpeedMeasure(filtered, {
            kind: 'from_series',
            id: m.id,
            mode: 'angular',
            sourceSamples: srcSamples,
            torsoLengthRef: torsoRef,
            out_of_plane: m.out_of_plane,
          })
        }
      } else if (m.mode === 'linear' && m.point) {
        result = computeSpeedMeasure(filtered, {
          kind: 'from_point',
          id: m.id,
          point: m.point,
          torsoLengthRef: torsoRef,
          out_of_plane: m.out_of_plane,
        })
      } else {
        result = emptyResult(m.id, 'speed', 'TL/s')
      }

    } else if (m.primitive === 'position') {
      result = computePositionMeasure(filtered, {
        id: m.id,
        point: m.point ?? '',
        axis: m.axis as 'x' | 'y' | undefined,
        out_of_plane: m.out_of_plane,
      })

    } else if (m.primitive === 'hitting_plane') {
      result = computeHittingPlaneMeasure(filtered, {
        id: m.id,
        hipPoint: m.points?.[0] ?? 'right_hip',
        otherHipPoint: m.points?.[1] ?? 'left_hip',
        wristPoint: m.points?.[2] ?? 'right_wrist',
        playerHand: m.mode === 'left' ? 'left' : 'right',
      })

    } else if (m.primitive === 'acceleration') {
      const srcSamples = m.source_measure ? seriesById[m.source_measure] : undefined
      if (!srcSamples) {
        result = emptyResult(m.id, 'acceleration', m.mode === 'angular' ? 'deg/s²' : 'TL/s²')
      } else {
        result = computeAccelerationMeasure({
          id: m.id,
          mode: m.mode as 'linear' | 'angular',
          sourceSamples: srcSamples,
          out_of_plane: m.out_of_plane,
        })
      }

    } else if (m.primitive === 'cadence') {
      const srcSamples = m.source_measure ? seriesById[m.source_measure] : undefined
      if (!srcSamples) {
        result = emptyResult(m.id, 'cadence', 'cycles/min')
      } else {
        result = computeCadenceMeasure({
          id: m.id,
          sourceSamples: srcSamples,
          out_of_plane: m.out_of_plane,
        })
      }

    } else {
      result = emptyResult(m.id, m.primitive as MeasureResult['type'], 'deg')
    }

    results.push(result)
    seriesById[m.id] = result.series
  }

  return results
}

function emptyResult(id: string, type: MeasureResult['type'], unit: MeasureResult['unit']): MeasureResult {
  return {
    id,
    type,
    unit,
    series: [],
    summary: { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null },
    reliability: { fraction_reliable: 0, out_of_plane: false, reasons: [] },
  }
}
