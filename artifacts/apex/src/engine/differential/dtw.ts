// DTW alignment — spec-04 opt-in
// Sakoe-Chiba band: 10% of sequence length
// Minimizes temporal distortion between capture and model
import { circularDiff } from '../types'

type DistFn = (a: number, b: number) => number

function linearDist(a: number, b: number): number { return Math.abs(a - b) }
function circularDistFn(a: number, b: number): number { return Math.abs(circularDiff(a, b)) }

// Returns the warping path (pairs of indices) for aligning seq to ref
export function dtwWarpingPath(
  seq: number[],
  ref: number[],
  isCircular: boolean,
): Array<[number, number]> {
  const m = seq.length
  const n = ref.length
  if (m === 0 || n === 0) return []

  const band = Math.ceil(0.1 * Math.max(m, n))
  const dist: DistFn = isCircular ? circularDistFn : linearDist

  const INF = Infinity
  const cost: number[][] = Array.from({ length: m }, () => Array(n).fill(INF))

  for (let i = 0; i < m; i++) {
    const jMin = Math.max(0, i - band)
    const jMax = Math.min(n - 1, i + band)
    for (let j = jMin; j <= jMax; j++) {
      const d = dist(seq[i]!, ref[j]!)
      const prev = Math.min(
        i > 0 && j > 0 ? cost[i - 1]![j - 1]! : INF,
        i > 0 ? cost[i - 1]![j]! : INF,
        j > 0 ? cost[i]![j - 1]! : INF,
      )
      cost[i]![j] = d + (isFinite(prev) ? prev : 0)
    }
  }

  // Traceback
  const path: Array<[number, number]> = []
  let i = m - 1
  let j = n - 1
  path.push([i, j])

  while (i > 0 || j > 0) {
    if (i === 0) { j--; path.push([i, j]); continue }
    if (j === 0) { i--; path.push([i, j]); continue }
    const opts = [
      [i - 1, j - 1, cost[i - 1]![j - 1]!],
      [i - 1, j, cost[i - 1]![j]!],
      [i, j - 1, cost[i]![j - 1]!],
    ] as const
    const best = opts.reduce((a, b) => (a[2] < b[2] ? a : b))
    i = best[0]
    j = best[1]
    path.push([i, j])
  }

  return path.reverse()
}

// Apply DTW warping: project seq onto ref's time axis
export function dtwAlign(
  seq: number[],
  ref: number[],
  isCircular: boolean,
): number[] {
  if (seq.length === 0 || ref.length === 0) return Array(ref.length).fill(0)
  const path = dtwWarpingPath(seq, ref, isCircular)
  const aligned = Array(ref.length).fill(0)
  const counts = Array(ref.length).fill(0)

  for (const [si, ri] of path) {
    aligned[ri] += seq[si]!
    counts[ri]++
  }

  return aligned.map((sum, i) => counts[i] > 0 ? sum / counts[i]! : 0)
}
