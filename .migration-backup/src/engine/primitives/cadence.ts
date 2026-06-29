// Primitive: cadence — cycle frequency from a periodic measure series.
// Detects local minima in source series, measures inter-minima period,
// returns cadence in cycles/min as a time series (constant within each cycle).
// Requires at least 2 detected cycles to produce reliable output.
import type { MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE } from '../types'

export interface CadenceDef {
  id: string
  sourceSamples: MeasureSample[]
  // Minimum time between cycles in seconds (anti-bounce). Default 0.25 s.
  minPeriodS?: number
  out_of_plane?: boolean
}

const DEFAULT_MIN_PERIOD_S = 0.25

export function computeCadenceMeasure(def: CadenceDef): MeasureResult {
  const src = def.sourceSamples
  const minGap = def.minPeriodS ?? DEFAULT_MIN_PERIOD_S

  if (src.length < 3) return emptyResult(def.id, def.out_of_plane ?? false)

  // Detect local minima (cycle troughs) among reliable samples
  const minima: number[] = []   // indices into src
  for (let i = 1; i < src.length - 1; i++) {
    const prev = src[i - 1]!
    const curr = src[i]!
    const next = src[i + 1]!
    if (!curr.reliable) continue
    if (curr.value < prev.value && curr.value < next.value) {
      // Anti-bounce: must be at least minGap after the last minimum
      if (minima.length === 0 || curr.t - src[minima[minima.length - 1]!]!.t >= minGap) {
        minima.push(i)
      }
    }
  }

  // Need at least 2 minima to compute one cycle period
  if (minima.length < 2) return emptyResult(def.id, def.out_of_plane ?? false)

  // Build cadence intervals: between consecutive minima
  // Each interval [t_start, t_end) gets cadence = 60 / (t_end - t_start)
  type Interval = { tStart: number; tEnd: number; cadence: number }
  const intervals: Interval[] = []
  for (let k = 0; k < minima.length - 1; k++) {
    const tStart = src[minima[k]!]!.t
    const tEnd = src[minima[k + 1]!]!.t
    const period = tEnd - tStart
    if (period < 1e-6) continue
    intervals.push({ tStart, tEnd, cadence: 60 / period })
  }

  if (intervals.length === 0) return emptyResult(def.id, def.out_of_plane ?? false)

  // Build per-frame time series
  const series: MeasureSample[] = src.map(s => {
    // Find the interval this frame belongs to
    const iv = intervals.find(i => s.t >= i.tStart && s.t < i.tEnd)
      ?? (s.t < intervals[0]!.tStart ? intervals[0] : intervals[intervals.length - 1])
    const reliable = s.reliable && iv !== undefined
    return { t: s.t, value: iv?.cadence ?? 0, reliable }
  })

  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0

  return {
    id: def.id,
    type: 'cadence',
    unit: 'cycles/min',
    series,
    summary: arithmeticSummary(reliableValues, reliableSamples),
    reliability: {
      fraction_reliable,
      out_of_plane: def.out_of_plane ?? false,
      reasons: fraction_reliable < TAU_RELIABLE ? ['low_confidence'] : [],
    },
  }
}

function emptyResult(id: string, out_of_plane: boolean): MeasureResult {
  return {
    id,
    type: 'cadence',
    unit: 'cycles/min',
    series: [],
    summary: { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null },
    reliability: { fraction_reliable: 0, out_of_plane, reasons: ['insufficient_cycles'] },
  }
}

function arithmeticSummary(values: number[], samples: MeasureSample[]): MeasureSummary {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
  const peakIdx = values.reduce((bi, v, i) => v > values[bi]! ? i : bi, 0)
  return { min, max, mean, sd, range: max - min, peak: values[peakIdx] ?? null, t_peak: samples[peakIdx]?.t ?? null }
}
