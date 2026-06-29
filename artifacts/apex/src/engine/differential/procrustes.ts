// Procrustes alignment — spec-04
// Translation: subtract hip_center
// Scale: normalize by torso_length
// Rotation: OFF (spec-00 §4 — no Procrustes rotation for 2D mono-cam)
// Angles are exempted (circular quantities, not coordinates)
import type { MeasureResult } from '../types'

export interface ProcrustesParams {
  hipCenterX: number
  hipCenterY: number
  torsoLength: number
}

// Normalize a single coordinate value
export function normalizeCoord(value: number, center: number, scale: number): number {
  if (scale < 1e-6) return 0
  return (value - center) / scale
}

// Apply Procrustes normalization to a position measure series
// Exempts angle/rotation measures (they are circular, not coordinates)
export function applyProcrustes(
  measure: MeasureResult,
  params: ProcrustesParams,
): MeasureResult {
  if (measure.type === 'angle' || measure.type === 'rotation') {
    return measure  // circular quantities — no spatial alignment
  }

  const scale = Math.max(params.torsoLength, 1e-6)
  const series = measure.series.map(s => ({
    ...s,
    value: s.reliable ? normalizeCoord(s.value, 0, scale) : 0,
  }))

  return { ...measure, series }
}
