// Primitive: rotation — spec-01 §B
// orientation: θ(t) = atan2(v.yUp, v.x) — time series of orientation in (-180°, 180°]
// orientation_folded: same but normalized to (-90°, 90°] — view-invariant for bilateral lines
//   e.g. shoulder/hip line gives same value whether filmed from front or back
// angular_displacement: Δθ cumulative with circular unwrapping
// separation: circularDiff of two folded line angles — X-factor / hip-shoulder separation
import type { PoseFrame, MeasureResult, MeasureSample, MeasureSummary } from '../types'
import { TAU_RELIABLE, circularMean, circularDiff } from '../types'
import { resolvePoint } from '../interpreter/resolver'

export interface RotationDef {
  id: string
  mode: 'orientation' | 'orientation_folded' | 'angular_displacement' | 'separation'
  points: string[]
  // orientation / orientation_folded / angular_displacement: [p1, p2]
  // separation: [line1_p1, line1_p2, line2_p1, line2_p2]
  out_of_plane_declared?: boolean
}

// Fold atan2 angle to (-90°, 90°] so an undirected line gives the same value
// regardless of whether the vector points left→right or right→left.
// Eliminates the 180° flip between front and back camera views.
function foldAngleTo90(theta: number): number {
  let t = theta
  while (t > 90) t -= 180
  while (t <= -90) t += 180
  return t
}

export function computeRotationMeasure(frames: PoseFrame[], def: RotationDef): MeasureResult {
  if (def.mode === 'separation') {
    return computeSeparation(frames, def)
  }
  return computeLineRotation(frames, def)
}

function computeLineRotation(frames: PoseFrame[], def: RotationDef): MeasureResult {
  const series: MeasureSample[] = []
  let cumulative = 0
  let prevTheta: number | null = null

  for (const frame of frames) {
    const t = frame.t
    const [nameP1, nameP2] = def.points
    const p1 = resolvePoint(frame, nameP1!)
    const p2 = resolvePoint(frame, nameP2!)
    if (!p1 || !p2) { series.push({ t, value: 0, reliable: false }); continue }
    const reliable = p1.confident && p2.confident
    const theta = (Math.atan2(p2.yUp - p1.yUp, p2.x - p1.x) * 180) / Math.PI

    if (def.mode === 'orientation') {
      series.push({ t, value: theta, reliable })
    } else if (def.mode === 'orientation_folded') {
      series.push({ t, value: foldAngleTo90(theta), reliable })
    } else {
      // angular_displacement: cumulative with circular unwrapping
      if (prevTheta !== null) {
        cumulative += circularDiff(theta, prevTheta)
      }
      prevTheta = theta
      series.push({ t, value: cumulative, reliable })
    }
  }

  const reliableSamples = series.filter(s => s.reliable)
  const reliableValues = reliableSamples.map(s => s.value)
  const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0
  const out_of_plane = def.out_of_plane_declared ?? false

  return {
    id: def.id,
    type: 'rotation',
    unit: 'deg',
    series,
    summary: def.mode === 'angular_displacement'
      ? arithmeticSummary(reliableValues, reliableSamples)
      : circularSummary(reliableValues, reliableSamples),
    reliability: {
      fraction_reliable,
      out_of_plane,
      reasons: [
        ...(fraction_reliable < TAU_RELIABLE ? ['low_confidence'] : []),
        ...(out_of_plane ? ['projection uniquement, pas une vraie rotation 3D'] : []),
      ],
    },
  }
}

// Separation: angle between two bilateral lines (e.g. shoulder line vs hip line).
// Naturally view-invariant because both lines share the same camera-orientation offset.
// Positive = shoulder line leads hip line (open rotation); negative = hip leads shoulders.
function computeSeparation(frames: PoseFrame[], def: RotationDef): MeasureResult {
  const [n1, n2, n3, n4] = def.points
  const series: MeasureSample[] = []

  for (const frame of frames) {
    const t = frame.t
    const q1 = resolvePoint(frame, n1!)
    const q2 = resolvePoint(frame, n2!)
    const q3 = resolvePoint(frame, n3!)
    const q4 = resolvePoint(frame, n4!)
    if (!q1 || !q2 || !q3 || !q4) { series.push({ t, value: 0, reliable: false }); continue }
    const reliable = q1.confident && q2.confident && q3.confident && q4.confident
    const theta1 = foldAngleTo90((Math.atan2(q2.yUp - q1.yUp, q2.x - q1.x) * 180) / Math.PI)
    const theta2 = foldAngleTo90((Math.atan2(q4.yUp - q3.yUp, q4.x - q3.x) * 180) / Math.PI)
    series.push({ t, value: circularDiff(theta1, theta2), reliable })
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

function circularSummary(values: number[], samples: MeasureSample[]): MeasureSummary {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = circularMean(values)
  const sd = Math.sqrt(values.reduce((a, v) => a + circularDiff(v, mean) ** 2, 0) / values.length)
  const peakIdx = values.reduce((bi, v, i) => Math.abs(v) > Math.abs(values[bi]!) ? i : bi, 0)
  return { min, max, mean, sd, range: max - min, peak: values[peakIdx] ?? null, t_peak: samples[peakIdx]?.t ?? null }
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
