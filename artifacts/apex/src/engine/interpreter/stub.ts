// Stub interpreter: returns pre-computed MeasureResults from fixture data
// In Plan 02, this will be replaced by the real DSL interpreter (spec-02)
import type { MeasureResult, PoseFrame, MeasureSample } from '../types'
import { toY_up, TAU_CONF, TAU_RELIABLE, circularDiff } from '../types'

interface Script {
  measures: Array<{
    id: string
    primitive: 'angle' | 'rotation' | 'speed' | 'position'
    mode: string
    points?: string[]
    point?: string
    axis?: string
    source_measure?: string
    out_of_plane?: boolean
    expose: boolean
  }>
}

// Landmark name → index mapping (spec-01)
const LANDMARK_INDEX: Record<string, number> = {
  nose: 0, left_eye_inner: 1, left_eye: 2, left_eye_outer: 3,
  right_eye_inner: 4, right_eye: 5, right_eye_outer: 6,
  left_ear: 7, right_ear: 8, mouth_left: 9, mouth_right: 10,
  left_shoulder: 11, right_shoulder: 12,
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
  left_pinky: 17, right_pinky: 18,
  left_index: 19, right_index: 20,
  left_thumb: 21, right_thumb: 22,
  left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26,
  left_ankle: 27, right_ankle: 28,
  left_heel: 29, right_heel: 30,
  left_foot_index: 31, right_foot_index: 32,
}

function getLandmark(frames: PoseFrame[], frameIdx: number, name: string) {
  const frame = frames[frameIdx]
  if (!frame) return null
  const idx = LANDMARK_INDEX[name]
  if (idx === undefined) return null
  const raw = frame.landmarks[idx]
  if (!raw) return null
  return { ...toY_up(raw), confident: raw.confidence >= TAU_CONF }
}

function dot2d(ax: number, ay: number, bx: number, by: number) {
  return ax * bx + ay * by
}

function norm2d(x: number, y: number) {
  return Math.sqrt(x * x + y * y)
}

// Spec-01 §A: joint angle at vertex b between a and c — unsigned, [0,180]°
function jointAngle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  const v1x = ax - bx, v1y = ay - by
  const v2x = cx - bx, v2y = cy - by
  const n1 = norm2d(v1x, v1y), n2 = norm2d(v2x, v2y)
  if (n1 < 1e-6 || n2 < 1e-6) return 0
  const cosVal = Math.max(-1, Math.min(1, dot2d(v1x, v1y, v2x, v2y) / (n1 * n2)))
  return (Math.acos(cosVal) * 180) / Math.PI
}

// Spec-01 §A: segment_axis angle vs vertical, y-up coords, signed, anti-clockwise positive
function segmentAxisAngle(
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  axis: 'vertical' | 'horizontal',
): number {
  const vx = p2x - p1x, vy = p2y - p1y
  const theta = (Math.atan2(vy, vx) * 180) / Math.PI
  if (axis === 'vertical') {
    // angle from vertical = angle from y-axis = 90° - angle from x-axis
    return theta - 90
  }
  return theta
}

function summaryStats(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, sd: 0, range: 0, peak: null, t_peak: null }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  const peakIdx = values.reduce((bi, v, i) => (Math.abs(v) > Math.abs(values[bi]) ? i : bi), 0)
  return { min, max, mean, sd, range: max - min, peak: values[peakIdx], t_peak: null as null }
}

// Compute MeasureResults from pose frames given a script definition
export function interpretFrames(script: Script, frames: PoseFrame[]): MeasureResult[] {
  const results: MeasureResult[] = []
  const computedSeries: Record<string, MeasureSample[]> = {}

  for (const measure of script.measures) {
    const series: MeasureSample[] = []

    for (let fi = 0; fi < frames.length; fi++) {
      const t = frames[fi].t

      if (measure.primitive === 'angle' && measure.mode === 'joint' && measure.points?.length === 3) {
        const [pA, pB, pC] = measure.points
        const a = getLandmark(frames, fi, pA)
        const b = getLandmark(frames, fi, pB)
        const c = getLandmark(frames, fi, pC)
        if (!a || !b || !c) { series.push({ t, value: 0, reliable: false }); continue }
        const reliable = a.confident && b.confident && c.confident
        const value = jointAngle(a.x, a.yUp, b.x, b.yUp, c.x, c.yUp)
        series.push({ t, value: +value.toFixed(2), reliable })

      } else if (measure.primitive === 'angle' && measure.mode === 'segment_axis' && measure.points?.length === 2) {
        const [p1, p2] = measure.points
        const lm1 = getLandmark(frames, fi, p1)
        const lm2 = getLandmark(frames, fi, p2)
        if (!lm1 || !lm2) { series.push({ t, value: 0, reliable: false }); continue }
        const reliable = lm1.confident && lm2.confident
        const axis = (measure.axis as 'vertical' | 'horizontal') ?? 'vertical'
        const value = segmentAxisAngle(lm1.x, lm1.yUp, lm2.x, lm2.yUp, axis)
        series.push({ t, value: +value.toFixed(2), reliable })

      } else if (measure.primitive === 'speed' && measure.mode === 'angular' && measure.source_measure) {
        // Deferred — compute after parent series is done
        series.push({ t, value: 0, reliable: false })

      } else if (measure.primitive === 'speed' && measure.mode === 'linear' && measure.point) {
        if (fi === 0 || fi === frames.length - 1) {
          series.push({ t, value: 0, reliable: false }); continue
        }
        const prev = getLandmark(frames, fi - 1, measure.point)
        const next = getLandmark(frames, fi + 1, measure.point)
        if (!prev || !next) { series.push({ t, value: 0, reliable: false }); continue }
        const dt = frames[fi + 1].t - frames[fi - 1].t
        if (dt < 1e-6) { series.push({ t, value: 0, reliable: false }); continue }
        const dx = next.x - prev.x, dy = next.yUp - prev.yUp
        const dist = norm2d(dx, dy)
        // Normalize by torso_length estimate (~0.25 in image coords)
        const TL_ESTIMATE = 0.25
        const value = dist / (dt * TL_ESTIMATE)
        const reliable = prev.confident && next.confident
        series.push({ t, value: +value.toFixed(3), reliable })

      } else {
        series.push({ t, value: 0, reliable: false })
      }
    }

    computedSeries[measure.id] = series

    // Patch angular speed now that parent series exists
    if (measure.primitive === 'speed' && measure.mode === 'angular' && measure.source_measure) {
      const src = computedSeries[measure.source_measure]
      if (src) {
        for (let fi = 0; fi < frames.length; fi++) {
          if (fi === 0 || fi === frames.length - 1) continue
          const dt = frames[fi + 1].t - frames[fi - 1].t
          if (dt < 1e-6) continue
          const diff = circularDiff(src[fi + 1].value, src[fi - 1].value)
          const value = diff / dt
          series[fi] = { t: frames[fi].t, value: +value.toFixed(2), reliable: src[fi].reliable }
        }
        computedSeries[measure.id] = series
      }
    }

    const reliableValues = series.filter(s => s.reliable).map(s => s.value)
    const fraction_reliable = series.length > 0 ? reliableValues.length / series.length : 0

    results.push({
      id: measure.id,
      type: measure.primitive,
      unit: measure.primitive === 'angle' ? 'deg'
           : measure.primitive === 'speed' && measure.mode === 'angular' ? 'deg/s'
           : measure.primitive === 'speed' ? 'TL/s'
           : 'TL',
      series,
      summary: { ...summaryStats(reliableValues), t_peak: null },
      reliability: {
        fraction_reliable: +fraction_reliable.toFixed(3),
        out_of_plane: measure.out_of_plane ?? false,
        reasons: fraction_reliable < TAU_RELIABLE ? ['low_confidence'] : [],
      },
    })
  }

  return results
}
