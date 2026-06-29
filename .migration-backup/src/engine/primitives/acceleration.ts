// Primitive: acceleration — derivative of a speed series
// a(t) = (v(t+1) − v(t−1]) / (2·Δt)  centered differences
// Always derived from a previously computed speed series (source_measure).
// Unreliable at boundaries and when Δt > 3×(1/30 s).
import type { MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE, TORSO_EPSILON } from '../types'

export interface AccelerationDef {
  id: string
  mode: 'linear' | 'angular'
  sourceSamples: MeasureSample[]
  out_of_plane?: boolean
}

const MAX_DT = 3 / 30

export function computeAccelerationMeasure(def: AccelerationDef): MeasureResult {
  const src = def.sourceSamples
  const unit = def.mode === 'angular' ? 'deg/s²' : 'TL/s²'
  const series: MeasureSample[] = []

  for (let i = 0; i < src.length; i++) {
    const t = src[i]!.t
    if (i === 0 || i === src.length - 1) {
      series.push({ t, value: 0, reliable: false }); continue
    }
    const prev = src[i - 1]!
    const next = src[i + 1]!
    const dt = next.t - prev.t
    if (dt < 1e-6 || dt > MAX_DT) {
      series.push({ t, value: 0, reliable: false }); continue
    }
    const accel = (next.value - prev.value) / dt
    const reliable = prev.reliable && next.reliable
    series.push({ t, value: accel, reliable })
  }

  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0

  return {
    id: def.id,
    type: 'acceleration',
    unit,
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
