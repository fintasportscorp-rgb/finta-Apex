// Kinetic chain — peak-onset analysis.
// For each measure: peak timing, rise onset, mean series (for Gantt + Piano Roll).
// When a reference sequence is supplied, exposes Δt and Δvalue per measure.

import type { MeasureSample } from '../engine/types'
import type { GestureInstance } from './export'

// ── Types ─────────────────────────────────────────────────────────────────

export interface PatternWindow {
  onsetT: number
  peakT:  number
}

export interface RepPattern {
  onsetT:    number
  peakT:     number
  peakValue: number
}

export interface MeasureChain {
  measureId: string
  unit: string
  colorIndex: number

  /** Normalised time [0,1] of peak amplitude (mean across reps) */
  peakT: number
  /** Mean peak amplitude across reps */
  peakValue: number
  /** Normalised time [0,1] where the rise toward the peak begins */
  riseOnsetT: number
  /** ±1σ spread on peak time (only when ≥3 reps) */
  peakTSd?: number
  /** ±1σ spread on peak value (only when ≥3 reps) */
  peakValueSd?: number
  /** Number of reps in which a valid peak was detected */
  repCount: number

  /** Individual per-rep peak data (one entry per detected cycle across all instances) */
  repPatterns: RepPattern[]

  /** 100-point mean time-series across reps (for Piano Roll / Gantt overlays) */
  meanSeries: MeasureSample[]

  /** All significant pattern windows detected on the mean series (onset → peak),
   *  sorted by time. Includes both local maxima and minima above the threshold. */
  patterns: PatternWindow[]

  /** Reference values (only when refInstances supplied) */
  refPeakT?: number
  refPeakValue?: number
  refRiseOnsetT?: number
  refMeanSeries?: MeasureSample[]

  /** Derived: peakT - refPeakT  (positive = current sequence is LATE) */
  delayT?: number
  /** Derived: peakValue - refPeakValue */
  amplitudeGap?: number

  /** Canonical firing rank among all measures (0 = first to peak on average) */
  sequenceRank: number
  /** Fraction [0,1] of reps where this measure fired at its canonical rank.
   *  1.0 when only one rep detected (perfect by definition). */
  rankConsistency: number
}

// ── Helpers ───────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function sdFn(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = avg(arr)
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
}

const N_SERIES = 100

function resampleSeries(series: MeasureSample[], n: number): MeasureSample[] {
  if (series.length === 0) return Array.from({ length: n }, (_, i) => ({ t: i / (n - 1), value: 0, reliable: false }))
  if (series.length === 1) return Array.from({ length: n }, (_, i) => ({ t: i / (n - 1), value: series[0]!.value, reliable: true }))
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (series.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, series.length - 1)
    return {
      t: i / (n - 1),
      value: series[lo]!.value * (1 - (t - lo)) + series[hi]!.value * (t - lo),
      reliable: true,
    }
  })
}

function computeMeanSeries(instances: GestureInstance[], measureId: string): MeasureSample[] {
  const cols = instances
    .map(inst => inst.measures.find(m => m.id === measureId))
    .filter(Boolean)
    .map(m => resampleSeries(m!.series, N_SERIES))

  if (cols.length === 0) return []
  return Array.from({ length: N_SERIES }, (_, i) => ({
    t: i / (N_SERIES - 1),
    value: cols.reduce((sum, s) => sum + (s[i]?.value ?? 0), 0) / cols.length,
    reliable: true,
  }))
}

/** Peak = most extreme excursion from the series median.
 *  Returns normalised time [0,1], absolute value, and the raw sample index. */
function findPeak(series: MeasureSample[]): { tNorm: number; value: number; idx: number } | null {
  if (series.length < 2) return null
  const tStart = series[0]!.t
  const tEnd   = series[series.length - 1]!.t
  const tRange = tEnd - tStart || 1
  const sorted = series.map(s => s.value).slice().sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  let bestIdx = 0
  let bestDev = -Infinity
  for (let i = 0; i < series.length; i++) {
    const dev = Math.abs(series[i]!.value - median)
    if (dev > bestDev) { bestDev = dev; bestIdx = i }
  }
  return {
    tNorm: (series[bestIdx]!.t - tStart) / tRange,
    value: series[bestIdx]!.value,
    idx: bestIdx,
  }
}

/** Walk backward from the peak to find when the measure starts its main excursion.
 *  Returns normalised time [0,1]. Falls back to 0 if no clear onset found. */
function findRiseOnset(series: MeasureSample[], peakIdx: number): number {
  const tStart = series[0]!.t
  const tEnd   = series[series.length - 1]!.t
  const tRange = tEnd - tStart || 1
  const peakVal = series[peakIdx]!.value
  const baselineN = Math.max(2, Math.floor(series.length * 0.10))
  const baseline = avg(series.slice(0, baselineN).map(s => s.value))
  const excursion = peakVal - baseline
  // 15% of excursion above baseline (or below, if it's a minimum)
  const threshold = baseline + 0.15 * excursion
  for (let i = peakIdx - 1; i >= 0; i--) {
    const crossed = excursion > 0
      ? series[i]!.value <= threshold
      : series[i]!.value >= threshold
    if (crossed) return (series[i]!.t - tStart) / tRange
  }
  return 0
}

// ── Shared peak detection ─────────────────────────────────────────────────

interface PeakCandidate { idx: number; dev: number }

/** Detect significant local extrema (same polarity as primary peak).
 *  Returns null when the series is flat or too short. */
function detectPeaks(series: MeasureSample[]): { peaks: PeakCandidate[]; primaryIsMax: boolean } | null {
  if (series.length < 5) return null
  const values = series.map(s => s.value)
  const globalMin = Math.min(...values)
  const globalMax = Math.max(...values)
  if (globalMax - globalMin < 1e-9) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const primaryIsMax = (globalMax - median) >= (median - globalMin)
  const primaryDev   = primaryIsMax ? globalMax - median : median - globalMin
  const minDev       = primaryDev * 0.70
  const W       = Math.max(2, Math.floor(series.length * 0.05))
  const MIN_SEP = Math.floor(series.length * 0.15)
  const raw: PeakCandidate[] = []
  for (let i = W; i < series.length - W; i++) {
    const v   = series[i]!.value
    const dev = primaryIsMax ? v - median : median - v
    if (dev < minDev) continue
    let ok = true
    for (let j = -W; j <= W; j++) {
      if (j === 0) continue
      if (primaryIsMax ? series[i + j]!.value > v : series[i + j]!.value < v) { ok = false; break }
    }
    if (ok) raw.push({ idx: i, dev })
  }
  const peaks: PeakCandidate[] = []
  for (const c of raw) {
    const last = peaks[peaks.length - 1]
    if (last && c.idx - last.idx < MIN_SEP) { if (c.dev > last.dev) peaks[peaks.length - 1] = c }
    else peaks.push(c)
  }
  return { peaks, primaryIsMax }
}

function findAllPatterns(series: MeasureSample[]): PatternWindow[] {
  const dp = detectPeaks(series)
  if (!dp || dp.peaks.length === 0) return []
  const tStart = series[0]!.t
  const tRange = (series[series.length - 1]!.t - tStart) || 1
  return dp.peaks.map(p => ({
    onsetT: findRiseOnset(series, p.idx),
    peakT:  (series[p.idx]!.t - tStart) / tRange,
  }))
}

// ── Multi-cycle raw peak detection ───────────────────────────────────────
// detectPeaks uses W=5% / MIN_SEP=15% — calibrated for a 100-pt mean series
// (one cycle). For raw series with N repetitions those constants merge all
// cycles together. findRawPatterns uses tighter constants (W=2%, MIN_SEP=6%)
// so it finds every individual cycle peak even in a long continuous recording.

interface RawPattern { onsetT: number; peakT: number; peakValue: number }

function findRawPatterns(series: MeasureSample[]): RawPattern[] {
  if (series.length < 5) return []
  const values    = series.map(s => s.value)
  const globalMin = Math.min(...values)
  const globalMax = Math.max(...values)
  if (globalMax - globalMin < 1e-9) return []

  const tStart = series[0]!.t
  const tRange = (series[series.length - 1]!.t - tStart) || 1
  const norm   = (i: number) => (series[i]!.t - tStart) / tRange

  const sorted      = values.slice().sort((a, b) => a - b)
  const median      = sorted[Math.floor(sorted.length / 2)]!
  const primaryIsMax = (globalMax - median) >= (median - globalMin)
  const primaryDev  = primaryIsMax ? globalMax - median : median - globalMin
  const minDev      = primaryDev * 0.70

  const W       = Math.max(2, Math.floor(series.length * 0.02))
  const MIN_SEP = Math.max(5, Math.floor(series.length * 0.06))

  const raw: Array<{ idx: number; dev: number }> = []
  for (let i = W; i < series.length - W; i++) {
    const v   = series[i]!.value
    const dev = primaryIsMax ? v - median : median - v
    if (dev < minDev) continue
    let ok = true
    for (let j = -W; j <= W; j++) {
      if (j === 0) continue
      if (primaryIsMax ? series[i + j]!.value > v : series[i + j]!.value < v) { ok = false; break }
    }
    if (ok) raw.push({ idx: i, dev })
  }

  const peaks: Array<{ idx: number; dev: number }> = []
  for (const c of raw) {
    const last = peaks[peaks.length - 1]
    if (last && c.idx - last.idx < MIN_SEP) { if (c.dev > last.dev) peaks[peaks.length - 1] = c }
    else peaks.push(c)
  }

  if (peaks.length === 0) {
    const p = findPeak(series)
    return p ? [{ onsetT: findRiseOnset(series, p.idx), peakT: p.tNorm, peakValue: p.value }] : []
  }

  return peaks.map(p => ({
    onsetT:    findRiseOnset(series, p.idx),
    peakT:     norm(p.idx),
    peakValue: series[p.idx]!.value,
  }))
}

interface PeakResult {
  peakT: number
  peakValue: number
  riseOnsetT: number
  repCount: number
  peakTSd?: number
  peakValueSd?: number
}

/** Collects every individual cycle peak across all instances (handles both
 *  multiple-instance and single-instance multi-cycle recordings), then
 *  averages timing across all detected peaks. */
function aggregatePeaks(instances: GestureInstance[], measureId: string): PeakResult | null {
  const data: { tNorm: number; value: number; onset: number }[] = []
  for (const inst of instances) {
    const m = inst.measures.find(mm => mm.id === measureId)
    if (!m || m.series.length < 2) continue
    for (const p of findRawPatterns(m.series)) {
      data.push({ tNorm: p.peakT, value: p.peakValue, onset: p.onsetT })
    }
  }
  if (data.length === 0) return null
  const ts = data.map(d => d.tNorm)
  const vs = data.map(d => d.value)
  const os = data.map(d => d.onset)
  return {
    peakT:      avg(ts),
    peakValue:  avg(vs),
    riseOnsetT: avg(os),
    repCount:   data.length,
    ...(data.length >= 3 ? { peakTSd: sdFn(ts), peakValueSd: sdFn(vs) } : {}),
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export interface RepOnset {
  measureId:  string
  colorIndex: number
  onsetT:     number
  peakT:      number
}

/** Flattens per-rep patterns from a computed chain into RepOnset entries.
 *  colorIndex comes from the sorted chain so line-chart pattern areas
 *  always match the Gantt row color. */
export function computeRepOnsets(chain: MeasureChain[]): RepOnset[] {
  const result: RepOnset[] = []
  for (const m of chain) {
    for (const p of m.repPatterns) {
      result.push({ measureId: m.measureId, colorIndex: m.colorIndex, onsetT: p.onsetT, peakT: p.peakT })
    }
  }
  return result
}

/** For each measure, compute:
 *  - sequenceRank   : canonical position in the kinetic chain by average peakT (0 = first)
 *  - rankConsistency: fraction of reps where the measure fired at its canonical rank.
 *
 *  Reps are aligned by index (rep 0 of measure A ↔ rep 0 of measure B), which is
 *  reliable when findRawPatterns returns peaks in chronological order and all measures
 *  share the same instances. */
function assignSignatureRanks(result: MeasureChain[]): void {
  // Canonical rank = position sorted by average peakT (timing-based, always)
  const byPeak = [...result].sort((a, b) => a.peakT - b.peakT)
  const canonicalRank = new Map(byPeak.map((m, rank) => [m.measureId, rank]))
  result.forEach(m => { m.sequenceRank = canonicalRank.get(m.measureId) ?? 0 })

  const maxReps = result.reduce((mx, m) => Math.max(mx, m.repPatterns.length), 0)
  if (maxReps < 2) {
    result.forEach(m => { m.rankConsistency = 1 })
    return
  }

  const hits  = new Map<string, number>(result.map(m => [m.measureId, 0]))
  const total = new Map<string, number>(result.map(m => [m.measureId, 0]))

  for (let repIdx = 0; repIdx < maxReps; repIdx++) {
    const repPeaks: { measureId: string; peakT: number }[] = []
    for (const m of result) {
      const rp = m.repPatterns[repIdx]
      if (rp) repPeaks.push({ measureId: m.measureId, peakT: rp.peakT })
    }
    if (repPeaks.length < 2) continue

    repPeaks.sort((a, b) => a.peakT - b.peakT)
    repPeaks.forEach(({ measureId }, rank) => {
      total.set(measureId, (total.get(measureId) ?? 0) + 1)
      if (rank === canonicalRank.get(measureId)) {
        hits.set(measureId, (hits.get(measureId) ?? 0) + 1)
      }
    })
  }

  result.forEach(m => {
    const t = total.get(m.measureId) ?? 0
    m.rankConsistency = t > 0 ? (hits.get(m.measureId) ?? 0) / t : 1
  })
}

export function computeChain(
  instances: GestureInstance[],
  refInstances?: GestureInstance[],
): MeasureChain[] {
  if (!instances.length) return []

  const result: MeasureChain[] = []
  for (let i = 0; i < instances[0]!.measures.length; i++) {
    const ref = instances[0]!.measures[i]!

    // Timing = average across per-rep resampled peaks (not peak of mean series)
    // so N reps give N timing samples that are averaged → stable kinetic chain.
    const cur = aggregatePeaks(instances, ref.id)
    if (!cur) continue

    // Collect individual rep patterns for per-rep Gantt overlay and RepOnset derivation
    const repPatterns: RepPattern[] = []
    for (const inst of instances) {
      const m = inst.measures.find(mm => mm.id === ref.id)
      if (!m || m.series.length < 2) continue
      for (const p of findRawPatterns(m.series)) {
        repPatterns.push({ onsetT: p.onsetT, peakT: p.peakT, peakValue: p.peakValue })
      }
    }

    const meanSeries = computeMeanSeries(instances, ref.id)

    const entry: MeasureChain = {
      measureId:   ref.id,
      unit:        ref.unit,
      colorIndex:  i,  // temporary — reassigned after sort below
      peakT:       cur.peakT,
      peakValue:   cur.peakValue,
      riseOnsetT:  cur.riseOnsetT,
      repCount:    cur.repCount,
      peakTSd:     cur.peakTSd,
      peakValueSd: cur.peakValueSd,
      repPatterns,
      meanSeries,
      patterns:    findAllPatterns(meanSeries),
    }

    if (refInstances?.length) {
      const refAgg = aggregatePeaks(refInstances, ref.id)
      if (refAgg) {
        entry.refPeakT      = refAgg.peakT
        entry.refPeakValue  = refAgg.peakValue
        entry.refRiseOnsetT = refAgg.riseOnsetT
        entry.refMeanSeries = computeMeanSeries(refInstances, ref.id)
        entry.delayT        = cur.peakT - refAgg.peakT
        entry.amplitudeGap  = cur.peakValue - refAgg.peakValue
      }
    }

    result.push(entry)
  }

  // Sort by reference peak timing when a reference exists → canonical kinetic chain order
  // that is stable across all sequences (same ref = same row order everywhere).
  // Without a reference, keep script order so the Gantt row order never changes
  // between sequences (prevents the "measure order flip" bug).
  if (refInstances?.length) {
    result.sort((a, b) => (a.refPeakT ?? a.peakT) - (b.refPeakT ?? b.peakT))
  }

  // Assign colorIndex based on final sorted position so every downstream
  // consumer (Gantt rows, line-chart pattern areas) uses a consistent color map.
  result.forEach((m, idx) => { m.colorIndex = idx })

  assignSignatureRanks(result)

  return result
}
