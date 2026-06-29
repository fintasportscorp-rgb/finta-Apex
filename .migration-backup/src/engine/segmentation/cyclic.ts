// Segmentation: cyclic — spec-03
// Causal extrema detection (no lookahead)
// Supports local_maxima | local_minima | zero_crossing
// min_period_s: anti-bounce
import type { MeasureResult } from '../types'

export interface CyclicConfig {
  cycle_signal: string             // measure id
  boundary: 'local_maxima' | 'local_minima' | 'zero_crossing'
  min_period_s?: number
}

export interface Cycle {
  frame_index: number
  t: number
  value: number
}

export function detectCycles(
  measures: MeasureResult[],
  config: CyclicConfig,
  timestamps: number[],
): Cycle[] {
  const cycles: Cycle[] = []
  const m = measures.find(mr => mr.id === config.cycle_signal)
  if (!m) return cycles

  const minPeriod = config.min_period_s ?? 0
  let lastCycleT = -Infinity

  const series = m.series
  const n = Math.min(series.length, timestamps.length)
  if (n < 3) return cycles

  for (let i = 1; i < n - 1; i++) {
    const prev = series[i - 1]!
    const curr = series[i]!
    const next = series[i + 1]!
    const t = timestamps[i]!

    if (t - lastCycleT < minPeriod) continue

    let detected = false

    if (config.boundary === 'local_maxima') {
      detected = curr.value > prev.value && curr.value >= next.value && curr.reliable
    } else if (config.boundary === 'local_minima') {
      detected = curr.value < prev.value && curr.value <= next.value && curr.reliable
    } else if (config.boundary === 'zero_crossing') {
      detected = (prev.value <= 0 && curr.value > 0) || (prev.value >= 0 && curr.value < 0)
    }

    if (detected) {
      cycles.push({ frame_index: i, t, value: curr.value })
      lastCycleT = t
    }
  }

  return cycles
}

export function countCyclesLive(
  cycleSignalSeries: Array<{ value: number; reliable: boolean }>,
  prevPeak: number | null,
  boundary: 'local_maxima' | 'local_minima' = 'local_maxima',
  peakThreshold = 120,
): { newPeak: number | null; cycleDetected: boolean } {
  if (cycleSignalSeries.length === 0) return { newPeak: prevPeak, cycleDetected: false }
  const latest = cycleSignalSeries[cycleSignalSeries.length - 1]!.value
  if (boundary === 'local_maxima' && prevPeak !== null && prevPeak > latest && prevPeak > peakThreshold) {
    return { newPeak: latest, cycleDetected: true }
  }
  return { newPeak: latest, cycleDetected: false }
}
