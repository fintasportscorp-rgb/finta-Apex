// Primitive: hitting_plane
// Angle of the arm relative to the hip line projected onto the horizontal (XZ) plane.
// Based on BH_hitting_plane2.py: calculate_hitting_plane_angle()
// Requires MediaPipe z-coordinate (depth) to be stored in RawLandmark.
//
// Convention (same as Python reference):
//   Positive  = Open stance  (wrist ahead of hip line toward target)
//   Negative  = Closed stance (wrist behind hip line)
//   ~0°       = Neutral (arm perpendicular to hip line)
import type { PoseFrame, MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE } from '../types'
import { resolvePoint } from '../interpreter/resolver'

export interface HittingPlaneDef {
  id: string
  /** Playing-side hip landmark (e.g. "right_hip" for right-handed player). */
  hipPoint: string
  /** Non-playing-side hip landmark (e.g. "left_hip" for right-handed player). */
  otherHipPoint: string
  /** Playing-side wrist landmark (e.g. "right_wrist" for right-handed forehand). */
  wristPoint: string
  /** Determines sign convention for open/closed. 'right' for RH forehand, 'left' for LH forehand or RH backhand. */
  playerHand: 'right' | 'left'
}

export function computeHittingPlaneMeasure(frames: PoseFrame[], def: HittingPlaneDef): MeasureResult {
  const series: MeasureSample[] = []

  for (const frame of frames) {
    const t = frame.t
    const hip = resolvePoint(frame, def.hipPoint)
    const otherHip = resolvePoint(frame, def.otherHipPoint)
    const wrist = resolvePoint(frame, def.wristPoint)

    if (!hip || !otherHip || !wrist) {
      series.push({ t, value: 0, reliable: false })
      continue
    }

    const reliable = hip.confident && otherHip.confident && wrist.confident

    // Project hip vector and arm vector onto horizontal (XZ) plane.
    // z is depth from MediaPipe: consistent regardless of camera angle.
    const hipVecX = hip.x - otherHip.x
    const hipVecZ = hip.z - otherHip.z
    const armVecX = wrist.x - hip.x
    const armVecZ = wrist.z - hip.z

    const magHip = Math.sqrt(hipVecX ** 2 + hipVecZ ** 2)
    const magArm = Math.sqrt(armVecX ** 2 + armVecZ ** 2)

    if (magHip < 1e-6 || magArm < 1e-6) {
      series.push({ t, value: 0, reliable: false })
      continue
    }

    const cosAngle = Math.max(-1, Math.min(1, (hipVecX * armVecX + hipVecZ * armVecZ) / (magHip * magArm)))
    let hittingPlane = Math.acos(cosAngle) * (180 / Math.PI) - 90

    // Cross product in XZ plane to determine sign (open vs closed)
    const cross = hipVecX * armVecZ - hipVecZ * armVecX
    if (def.playerHand === 'right') {
      if (cross > 0) hittingPlane = -hittingPlane
    } else {
      if (cross < 0) hittingPlane = -hittingPlane
    }

    series.push({ t, value: hittingPlane, reliable })
  }

  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0

  return {
    id: def.id,
    type: 'rotation',
    unit: 'deg',
    series,
    summary: arithmeticSummary(reliableValues, reliableSamples),
    reliability: {
      fraction_reliable,
      out_of_plane: false,
      reasons: fraction_reliable < TAU_RELIABLE ? ['low_confidence'] : [],
    },
  }
}

/**
 * Average hitting-plane angle within a normalized time window [tStart, tEnd].
 * Works for both wall-clock series (individual instances) and pre-normalized
 * aggregated series (t already in [0,1]).
 */
export function hpWindowAvg(series: MeasureSample[], tStart: number, tEnd: number): number | null {
  if (series.length < 2) return null
  const t0 = series[0]!.t
  const t1 = series[series.length - 1]!.t
  const dur = t1 - t0
  const normalize = dur > 0 ? (t: number) => (t - t0) / dur : (t: number) => t

  const inWindow = series.filter(s => {
    const tn = normalize(s.t)
    return s.reliable && tn >= tStart && tn <= tEnd
  })
  if (inWindow.length === 0) return null
  return inWindow.reduce((sum, s) => sum + s.value, 0) / inWindow.length
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
