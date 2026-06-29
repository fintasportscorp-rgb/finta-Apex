// Primitive: speed — spec-01 §C
// Centered differences: v(t) = (series[t+1] − series[t−1]) / (2·Δt)
// For angular: numerator = circularDiff(series[t+1], series[t-1])
// Unreliable if Δt > 3×(1/30 s) (frame gap)
// < 2 ms on 300 frames
import type { PoseFrame, MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE, circularDiff, TORSO_EPSILON } from '../types'
import { resolvePoint } from '../interpreter/resolver'

export interface SpeedFromSeries {
  kind: 'from_series'
  id: string
  mode: 'angular' | 'linear'
  sourceSamples: MeasureSample[]
  torsoLengthRef: number
  out_of_plane?: boolean
}

export interface SpeedFromPoint {
  kind: 'from_point'
  id: string
  point: string
  torsoLengthRef: number
  out_of_plane?: boolean
}

export type SpeedDef = SpeedFromSeries | SpeedFromPoint

const MAX_DT = 3 / 30   // 3 frame gaps at 30 fps

export function computeSpeedMeasure(frames: PoseFrame[], def: SpeedDef): MeasureResult {
  if (def.kind === 'from_series') {
    return computeFromSeries(def)
  }
  return computeFromPoint(frames, def)
}

function computeFromSeries(def: SpeedFromSeries): MeasureResult {
  const src = def.sourceSamples
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
    const diff = def.mode === 'angular'
      ? circularDiff(next.value, prev.value)
      : next.value - prev.value
    const speed = diff / dt
    const reliable = prev.reliable && next.reliable
    series.push({ t, value: speed, reliable })
  }

  return buildResult(def.id, def.mode === 'angular' ? 'deg/s' : 'TL/s', series, def.out_of_plane ?? false)
}

function computeFromPoint(frames: PoseFrame[], def: SpeedFromPoint): MeasureResult {
  const tl = Math.max(def.torsoLengthRef, TORSO_EPSILON)
  const series: MeasureSample[] = []

  for (let i = 0; i < frames.length; i++) {
    const t = frames[i]!.t
    if (i === 0 || i === frames.length - 1) {
      series.push({ t, value: 0, reliable: false }); continue
    }
    const prev = resolvePoint(frames[i - 1]!, def.point)
    const next = resolvePoint(frames[i + 1]!, def.point)
    if (!prev || !next) { series.push({ t, value: 0, reliable: false }); continue }
    const dt = frames[i + 1]!.t - frames[i - 1]!.t
    if (dt < 1e-6 || dt > MAX_DT) {
      series.push({ t, value: 0, reliable: false }); continue
    }
    const dx = next.x - prev.x
    const dy = next.yUp - prev.yUp
    const dist = Math.sqrt(dx * dx + dy * dy)
    const speed = dist / dt / tl
    const reliable = prev.confident && next.confident
    series.push({ t, value: speed, reliable })
  }

  return buildResult(def.id, 'TL/s', series, def.out_of_plane ?? false)
}

function buildResult(id: string, unit: 'deg/s' | 'TL/s', series: MeasureSample[], out_of_plane: boolean): MeasureResult {
  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0
  return {
    id,
    type: 'speed',
    unit,
    series,
    summary: arithmeticSummary(reliableValues, reliableSamples),
    reliability: {
      fraction_reliable,
      out_of_plane,
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
