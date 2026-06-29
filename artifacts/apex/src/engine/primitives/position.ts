// Primitive: position — spec-01 §D
// Outputs normalized position in Torso Lengths (TL)
// hip_center = mean(left_hip, right_hip) in yUp coords
// shoulder_center = mean(left_shoulder, right_shoulder)
// torso_length_ref = median(|shoulder_center − hip_center|) over the sequence
import type { PoseFrame, MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE, TORSO_EPSILON } from '../types'
import { resolvePoint, computeTorsoLengthRef } from '../interpreter/resolver'

export interface PositionDef {
  id: string
  point: string   // landmark name or 'hip_center' | 'shoulder_center'
  axis?: 'x' | 'y' | null   // null = 2D norm
  out_of_plane?: boolean
}

export function computePositionMeasure(frames: PoseFrame[], def: PositionDef): MeasureResult {
  const torsoRef = computeTorsoLengthRef(frames)
  const tl = Math.max(torsoRef, TORSO_EPSILON)
  const series: MeasureSample[] = []

  for (const frame of frames) {
    const t = frame.t
    const pt = resolvePoint(frame, def.point)
    if (!pt) { series.push({ t, value: 0, reliable: false }); continue }
    let raw: number
    if (def.axis === 'x') {
      raw = pt.x
    } else if (def.axis === 'y') {
      raw = pt.yUp
    } else {
      // 2D norm from origin — less common but valid
      raw = Math.sqrt(pt.x * pt.x + pt.yUp * pt.yUp)
    }
    series.push({ t, value: raw / tl, reliable: pt.confident })
  }

  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0
  return {
    id: def.id,
    type: 'position',
    unit: 'TL',
    series,
    summary: arithmeticSummary(reliableValues, reliableSamples),
    reliability: {
      fraction_reliable,
      out_of_plane: def.out_of_plane ?? false,
      reasons: fraction_reliable < TAU_RELIABLE ? ['low_confidence'] : [],
    },
  }
}

function arithmeticSummary(values: number[], samples: MeasureSample[]): MeasureSummary {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
  const peakIdx = values.reduce((bi, v, i) => Math.abs(v) > Math.abs(values[bi]!) ? i : bi, 0)
  return { min, max, mean, sd, range: max - min, peak: values[peakIdx] ?? null, t_peak: samples[peakIdx]?.t ?? null }
}
