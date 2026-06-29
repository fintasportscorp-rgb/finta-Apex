// Phasewise temporal alignment — spec-04 (default temporal alignment)
// Without phases: normalize entire instance to 101 points
// With phases: normalize each phase independently to 101 points
import { resampleLinear, resampleCircular } from './circular'
import type { MeasureResult } from '../types'

const N_POINTS = 101

export interface PhaseMarker {
  id: string
  frame_index: number
}

export interface AlignedSeries {
  measureId: string
  isCircular: boolean
  values: number[]   // always N_POINTS length
}

export function alignPhasewise(
  measure: MeasureResult,
  phases: PhaseMarker[] | null,
): AlignedSeries {
  const isCircular = measure.type === 'angle' || measure.type === 'rotation'
  const reliableValues = measure.series.map(s => s.reliable ? s.value : NaN)

  if (!phases || phases.length === 0) {
    const validValues = reliableValues.filter(v => !isNaN(v))
    const resampled = isCircular
      ? resampleCircular(validValues, N_POINTS)
      : resampleLinear(validValues, N_POINTS)
    return { measureId: measure.id, isCircular, values: resampled }
  }

  // Phase-by-phase resampling
  const ptsPerPhase = Math.floor(N_POINTS / phases.length)
  const allResampled: number[] = []

  let prevIdx = 0
  for (let p = 0; p < phases.length; p++) {
    const endIdx = p < phases.length - 1 ? phases[p]!.frame_index : measure.series.length
    const phaseVals = reliableValues.slice(prevIdx, endIdx).filter(v => !isNaN(v))
    const pts = p === phases.length - 1 ? N_POINTS - allResampled.length : ptsPerPhase
    const resampled = isCircular ? resampleCircular(phaseVals, pts) : resampleLinear(phaseVals, pts)
    allResampled.push(...resampled)
    prevIdx = endIdx
  }

  return { measureId: measure.id, isCircular, values: allResampled.slice(0, N_POINTS) }
}
