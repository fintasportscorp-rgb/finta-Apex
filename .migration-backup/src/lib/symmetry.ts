import type { SymmetryPair } from './scripts'
import type { GestureInstance } from './export'

export interface SymmetryRow {
  rightId:   string
  leftId:    string
  rightMean: number
  leftMean:  number
  /** 0 = perfect symmetry, higher = more asymmetric (capped at 100) */
  si:        number
  unit:      string
}

/**
 * Auto-detect bilateral pairs from a list of measure IDs.
 * Handles three naming conventions:
 *   "foo"        + "foo_left"    → { right: "foo",         left: "foo_left" }
 *   "left_foo"   + "right_foo"   → { right: "right_foo",   left: "left_foo" }
 *   "foo_left"   + "foo_right"   → { right: "foo_right",   left: "foo_left" }
 */
export function inferSymmetryPairs(measureIds: string[]): SymmetryPair[] {
  const set  = new Set(measureIds)
  const used = new Set<string>()
  const pairs: SymmetryPair[] = []

  for (const id of measureIds) {
    if (used.has(id)) continue

    if (!id.endsWith('_left') && !id.endsWith('_right') && !id.startsWith('left_') && !id.startsWith('right_')) {
      const leftVariant = id + '_left'
      if (set.has(leftVariant)) {
        pairs.push({ right: id, left: leftVariant })
        used.add(id); used.add(leftVariant)
        continue
      }
    }

    if (id.startsWith('left_')) {
      const rightId = 'right_' + id.slice(5)
      if (set.has(rightId) && !used.has(rightId)) {
        pairs.push({ right: rightId, left: id })
        used.add(id); used.add(rightId)
        continue
      }
    }

    if (id.endsWith('_left')) {
      const rightId = id.slice(0, -5) + '_right'
      if (set.has(rightId) && !used.has(rightId)) {
        pairs.push({ right: rightId, left: id })
        used.add(id); used.add(rightId)
        continue
      }
    }
  }

  return pairs
}

/**
 * Compute bilateral symmetry rows from a list of instances.
 * For each pair, averages the per-instance series mean then computes:
 *   SI = |R − L| / ((|R| + |L|) / 2) × 100  [%]
 */
export function computeSymmetry(
  pairs:     SymmetryPair[],
  instances: GestureInstance[],
): SymmetryRow[] {
  if (instances.length === 0 || pairs.length === 0) return []

  const sums = new Map<string, { sum: number; count: number; unit: string }>()
  for (const inst of instances) {
    for (const m of inst.measures) {
      if (m.series.length === 0) continue
      const vals = m.series.map(s => s.value)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const existing = sums.get(m.id)
      if (existing) {
        existing.sum   += mean
        existing.count += 1
      } else {
        sums.set(m.id, { sum: mean, count: 1, unit: m.unit })
      }
    }
  }

  return pairs.flatMap(pair => {
    const R = sums.get(pair.right)
    const L = sums.get(pair.left)
    if (!R || !L) return []
    const rMean = R.sum / R.count
    const lMean = L.sum / L.count
    const denom = (Math.abs(rMean) + Math.abs(lMean)) / 2
    const si    = denom < 1e-9 ? 0 : Math.min(100, (Math.abs(rMean - lMean) / denom) * 100)
    return [{ rightId: pair.right, leftId: pair.left, rightMean: rMean, leftMean: lMean, si, unit: R.unit }]
  })
}
