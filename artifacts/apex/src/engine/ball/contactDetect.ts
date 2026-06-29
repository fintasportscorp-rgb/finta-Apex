// Ball-racket contact detector.
//
// Strategy:
//   1. Normalize ball sample timestamps to [0,1] over the stroke window.
//   2. Smooth positions (3-sample rolling average) to reduce HSV noise.
//   3. Compute velocity vectors between consecutive samples.
//   4. Find the velocity pair with the largest direction reversal.
//   5. Gate: reversal must occur after hipPeakT (ball can't be hit before hip fires).
//   6. Bonus confidence when reversal coincides with a tracking gap
//      (racket occludes ball → null samples → large inter-sample dt).
//
// Confidence tiers:
//   'high'      – strong reversal (>140°) + occlusion gap + after hip gate
//   'medium'    – clear reversal (>100°) + after hip gate
//   'estimated' – weak reversal below threshold but best available
//   'none'      – insufficient data or no reversal found

import type { BallSample } from './BallTracker'

export type ContactTier = 'high' | 'medium' | 'estimated' | 'none'

export interface ContactResult {
  /** Normalized contact time [0,1] over the ball tracking window for this stroke. */
  contactT: number
  tier: ContactTier
  confidence: number
}

const MIN_REVERSAL_DEG = 100
const HIGH_REVERSAL_DEG = 140
// A gap larger than this fraction of stroke duration suggests occlusion by racket
const OCCLUSION_GAP = 0.06

function smooth3(arr: number[]): number[] {
  return arr.map((_, i, a) => {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(a.length - 1, i + 1)
    let sum = 0
    let n = 0
    for (let j = lo; j <= hi; j++) { sum += a[j]!; n++ }
    return sum / n
  })
}

function angleDeg(ax: number, ay: number, bx: number, by: number): number {
  const ma = Math.hypot(ax, ay)
  const mb = Math.hypot(bx, by)
  if (ma < 1e-9 || mb < 1e-9) return 0
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (ma * mb)))) * (180 / Math.PI)
}

/**
 * Detect ball-racket contact from a sequence of ball position samples.
 *
 * @param samples   Ball samples for this stroke, in any order, may include low-confidence samples.
 * @param hipPeakT  Normalized hip rotation peak time [0,1], or null if unknown.
 *                  Contact candidates before this threshold are rejected.
 */
export function detectContact(
  samples: BallSample[],
  hipPeakT: number | null,
): ContactResult {
  const NONE: ContactResult = { contactT: 0.5, tier: 'none', confidence: 0 }

  if (samples.length < 4) return NONE

  // Sort, filter low-confidence, normalize timestamps to [0,1]
  const sorted = [...samples]
    .sort((a, b) => a.t - b.t)
    .filter(s => s.confidence >= 0.2)

  if (sorted.length < 4) return NONE

  const t0 = sorted[0]!.t
  const t1 = sorted[sorted.length - 1]!.t
  const dur = t1 - t0
  if (dur < 0.08) return NONE  // stroke too short to be meaningful

  const pts = sorted.map(s => ({ t: (s.t - t0) / dur, x: s.x, y: s.y }))
  const xs = smooth3(pts.map(p => p.x))
  const ys = smooth3(pts.map(p => p.y))

  // Velocity vectors between consecutive samples
  type Vel = { t: number; vx: number; vy: number; dt: number }
  const vels: Vel[] = []
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i]!.t - pts[i - 1]!.t
    if (dt < 1e-4) continue
    vels.push({
      t: (pts[i]!.t + pts[i - 1]!.t) / 2,
      vx: (xs[i]! - xs[i - 1]!) / dt,
      vy: (ys[i]! - ys[i - 1]!) / dt,
      dt,
    })
  }
  if (vels.length < 3) return NONE

  const gate = hipPeakT ?? 0.20  // reject anything before 20% of stroke if hip peak unknown

  let bestT = -1
  let bestAngle = 0
  let bestHasGap = false

  for (let i = 1; i < vels.length; i++) {
    const a = vels[i - 1]!
    const b = vels[i]!
    // Gate: contact must happen after hip rotation peak
    if (b.t <= gate) continue
    const angle = angleDeg(a.vx, a.vy, b.vx, b.vy)
    if (angle > bestAngle) {
      bestAngle = angle
      bestT = (a.t + b.t) / 2
      // Large inter-sample dt = ball was lost = racket occluded it
      bestHasGap = a.dt > OCCLUSION_GAP || b.dt > OCCLUSION_GAP
    }
  }

  if (bestAngle < MIN_REVERSAL_DEG || bestT < 0) return NONE

  // Score: reversal magnitude + occlusion gap bonus
  const reversalNorm = Math.min(1, (bestAngle - MIN_REVERSAL_DEG) / (180 - MIN_REVERSAL_DEG))
  const score = reversalNorm * 0.65 + (bestHasGap ? 0.35 : 0)

  let tier: ContactTier
  if (bestAngle >= HIGH_REVERSAL_DEG && bestHasGap) {
    tier = 'high'
  } else if (bestAngle >= HIGH_REVERSAL_DEG || (bestAngle >= MIN_REVERSAL_DEG && bestHasGap)) {
    tier = 'medium'
  } else {
    tier = 'estimated'
  }

  return { contactT: bestT, tier, confidence: Math.min(0.95, score) }
}
