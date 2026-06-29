// Primitive: angle — spec-01 §A
// joint mode: acos(clamp(dot(v1,v2)/(|v1||v2|), -1, 1)) → [0°, 180°], unsigned
// segment_axis mode: atan2(v.yUp, v.x) → (-180°, 180°], signed, anti-clockwise positive
import type { PoseFrame, MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE, TORSO_EPSILON, circularMean, circularDiff } from '../types'
import { resolvePoint } from '../interpreter/resolver'

export interface AngleDef {
  id: string
  mode: 'joint' | 'segment_axis'
  points: string[]
  axis?: 'horizontal' | 'vertical'
  out_of_plane?: boolean
}

export function computeAngleMeasure(frames: PoseFrame[], def: AngleDef): MeasureResult {
  const series: MeasureSample[] = []

  for (const frame of frames) {
    const t = frame.t
    if (def.mode === 'joint') {
      const [nameA, nameB, nameC] = def.points
      const a = resolvePoint(frame, nameA!)
      const b = resolvePoint(frame, nameB!)
      const c = resolvePoint(frame, nameC!)
      if (!a || !b || !c) { series.push({ t, value: 0, reliable: false }); continue }
      const reliable = a.confident && b.confident && c.confident
      const v1x = a.x - b.x, v1y = a.yUp - b.yUp
      const v2x = c.x - b.x, v2y = c.yUp - b.yUp
      const n1 = Math.sqrt(v1x * v1x + v1y * v1y)
      const n2 = Math.sqrt(v2x * v2x + v2y * v2y)
      if (n1 < TORSO_EPSILON || n2 < TORSO_EPSILON) {
        series.push({ t, value: 0, reliable: false }); continue
      }
      const cosVal = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)))
      series.push({ t, value: (Math.acos(cosVal) * 180) / Math.PI, reliable })
    } else {
      const [nameP1, nameP2] = def.points
      const p1 = resolvePoint(frame, nameP1!)
      const p2 = resolvePoint(frame, nameP2!)
      if (!p1 || !p2) { series.push({ t, value: 0, reliable: false }); continue }
      const reliable = p1.confident && p2.confident
      const vx = p2.x - p1.x, vy = p2.yUp - p1.yUp
      let value = (Math.atan2(vy, vx) * 180) / Math.PI
      if (def.axis === 'vertical') value -= 90
      series.push({ t, value, reliable })
    }
  }

  return buildResult(def.id, 'angle', 'deg', series, def.out_of_plane ?? false)
}

function buildResult(
  id: string,
  type: MeasureResult['type'],
  unit: MeasureResult['unit'],
  series: MeasureSample[],
  out_of_plane: boolean,
): MeasureResult {
  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0
  return {
    id,
    type,
    unit,
    series,
    summary: circularSummary(reliableValues, reliableSamples),
    reliability: {
      fraction_reliable,
      out_of_plane,
      reasons: fraction_reliable < TAU_RELIABLE ? ['low_confidence'] : [],
    },
  }
}

function circularSummary(values: number[], samples: MeasureSample[]): MeasureSummary {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = circularMean(values)
  const sd = Math.sqrt(
    values.reduce((acc, v) => acc + circularDiff(v, mean) ** 2, 0) / values.length,
  )
  const peakIdx = values.reduce((bi, v, i) => Math.abs(v) > Math.abs(values[bi]!) ? i : bi, 0)
  return { min, max, mean, sd, range: max - min, peak: values[peakIdx] ?? null, t_peak: samples[peakIdx]?.t ?? null }
}

// Re-export for use in tests
export { buildResult as _buildAngleResult }
