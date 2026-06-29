// Differential engine — spec-04
// FORME: per-measure diff between capture and model
// SÉRIE: series-level stats (count, rhythm, regularity, drift)
// Phasewise alignment (default) or DTW opt-in
import type { MeasureResult } from '../types'
import { circularDiff, circularMean } from '../types'
import { circularSd, resampleLinear, resampleCircular } from './circular'
import { dtwAlign } from './dtw'

const N_POINTS = 101
const ENVELOPE_FACTOR = 1.5  // |diff_mean| > model.sd × ENVELOPE_FACTOR = out of envelope

export interface DiffConfig {
  useDtw?: boolean
  phases?: Array<{ id: string; captureFrameIdx: number; modelFrameIdx: number }>
}

export interface MeasureDiff {
  measureId: string
  diffSeries: number[]   // per-frame diff, N_POINTS long
  mean: number
  sd: number
  max: number
  range: number
  outOfEnvelope: boolean
}

export interface FormeDiff {
  measures: MeasureDiff[]
}

export interface KeyEventTiming {
  t_capture: number
  t_model: number
  delta_ms: number
  delta_pct: number
}

export interface SerieDiff {
  captureCount: number
  modelCount: number
  avgPeriod_s: number | null
  periodSd_s: number | null
  drift: number | null
}

export interface DifferentialResult {
  forme: FormeDiff
  serie: SerieDiff | null
  keyEvent: KeyEventTiming | null
}

function normalize(values: number[], n: number, isCircular: boolean): number[] {
  return isCircular ? resampleCircular(values, n) : resampleLinear(values, n)
}

export function computeDifferential(
  captureResults: MeasureResult[],
  modelResults: MeasureResult[],
  config: DiffConfig = {},
): DifferentialResult {
  const capMap = new Map(captureResults.map(m => [m.id, m]))

  const measureDiffs: MeasureDiff[] = []

  for (const modMeasure of modelResults) {
    const capMeasure = capMap.get(modMeasure.id)
    if (!capMeasure) continue

    const isCircular = modMeasure.type === 'angle' || modMeasure.type === 'rotation'
    const capValues = capMeasure.series.filter(s => s.reliable).map(s => s.value)
    const modValues = modMeasure.series.filter(s => s.reliable).map(s => s.value)

    let capNorm = normalize(capValues, N_POINTS, isCircular)
    const modNorm = normalize(modValues, N_POINTS, isCircular)

    if (config.useDtw) {
      capNorm = dtwAlign(capNorm, modNorm, isCircular)
    }

    const diffSeries = modNorm.map((mVal, i) => {
      const cVal = capNorm[i] ?? mVal
      return isCircular ? circularDiff(cVal, mVal) : cVal - mVal
    })

    const mean = isCircular ? circularMean(diffSeries) : diffSeries.reduce((a, b) => a + b, 0) / diffSeries.length
    const sd = isCircular
      ? circularSd(diffSeries, mean)
      : Math.sqrt(diffSeries.reduce((a, v) => a + (v - mean) ** 2, 0) / diffSeries.length)
    const absMax = Math.max(...diffSeries.map(Math.abs))
    const min = Math.min(...diffSeries)
    const max = Math.max(...diffSeries)

    const modSd = modMeasure.summary.sd
    const outOfEnvelope = Math.abs(mean) > modSd * ENVELOPE_FACTOR

    measureDiffs.push({
      measureId: modMeasure.id,
      diffSeries,
      mean,
      sd,
      max: absMax,
      range: max - min,
      outOfEnvelope,
    })
  }

  return {
    forme: { measures: measureDiffs },
    serie: null,
    keyEvent: null,
  }
}

export function computeSerieDiff(
  capturePeriods: number[],
  modelPeriods: number[],
): SerieDiff {
  const captureCount = capturePeriods.length + 1
  const modelCount = modelPeriods.length + 1
  if (capturePeriods.length === 0) return { captureCount, modelCount, avgPeriod_s: null, periodSd_s: null, drift: null }

  const avgPeriod = capturePeriods.reduce((a, b) => a + b, 0) / capturePeriods.length
  const periodSd = capturePeriods.length > 1
    ? Math.sqrt(capturePeriods.reduce((a, v) => a + (v - avgPeriod) ** 2, 0) / capturePeriods.length)
    : 0

  const modelAvg = modelPeriods.length > 0
    ? modelPeriods.reduce((a, b) => a + b, 0) / modelPeriods.length
    : null
  const drift = modelAvg !== null ? avgPeriod - modelAvg : null

  return { captureCount, modelCount, avgPeriod_s: avgPeriod, periodSd_s: periodSd, drift }
}
