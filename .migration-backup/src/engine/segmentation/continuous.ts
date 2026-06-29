// Segmentation: continuous — spec-03
// No instances: sliding window + cumulative stats
// Outputs live dashboard values (for expose:true measures)
import type { MeasureResult, MeasureSample } from '../types'
import { circularMean } from '../types'

export interface ContinuousConfig {
  window_s?: number   // default 5 s
}

export interface WindowStats {
  id: string
  current: number
  windowMean: number
  windowSd: number
  windowMin: number
  windowMax: number
  reliable: boolean
}

export function computeWindowStats(
  measure: MeasureResult,
  upToFrameIdx: number,
  windowS = 5,
  timestamps: number[],
): WindowStats {
  const t = timestamps[upToFrameIdx] ?? 0
  const windowStart = t - windowS
  const samples: MeasureSample[] = []

  for (let i = upToFrameIdx; i >= 0; i--) {
    const s = measure.series[i]
    if (!s || (timestamps[i] ?? 0) < windowStart) break
    if (s.reliable) samples.unshift(s)
  }

  const values = samples.map(s => s.value)
  const current = measure.series[upToFrameIdx]?.value ?? 0
  const reliable = measure.series[upToFrameIdx]?.reliable ?? false

  if (values.length === 0) {
    return { id: measure.id, current, windowMean: 0, windowSd: 0, windowMin: 0, windowMax: 0, reliable }
  }

  const isCircular = measure.type === 'angle' || (measure.type === 'rotation')
  const mean = isCircular ? circularMean(values) : values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
  return {
    id: measure.id,
    current,
    windowMean: mean,
    windowSd: sd,
    windowMin: Math.min(...values),
    windowMax: Math.max(...values),
    reliable,
  }
}
