// Spec-01: 33 MediaPipe BlazePose landmark names (index = position in array)
export const LANDMARK_NAMES = [
  'nose',           // 0
  'left_eye_inner', // 1
  'left_eye',       // 2
  'left_eye_outer', // 3
  'right_eye_inner',// 4
  'right_eye',      // 5
  'right_eye_outer',// 6
  'left_ear',       // 7
  'right_ear',      // 8
  'mouth_left',     // 9
  'mouth_right',    // 10
  'left_shoulder',  // 11
  'right_shoulder', // 12
  'left_elbow',     // 13
  'right_elbow',    // 14
  'left_wrist',     // 15
  'right_wrist',    // 16
  'left_pinky',     // 17
  'right_pinky',    // 18
  'left_index',     // 19
  'right_index',    // 20
  'left_thumb',     // 21
  'right_thumb',    // 22
  'left_hip',       // 23
  'right_hip',      // 24
  'left_knee',      // 25
  'right_knee',     // 26
  'left_ankle',     // 27
  'right_ankle',    // 28
  'left_heel',      // 29
  'right_heel',     // 30
  'left_foot_index',// 31
  'right_foot_index',// 32
] as const

export type LandmarkName = (typeof LANDMARK_NAMES)[number]

// Raw landmark from MediaPipe: y-down, x in [0,1], y in [0,1], z is depth relative to hip midpoint
export interface RawLandmark {
  x: number
  y: number
  z: number  // MediaPipe depth: negative = in front of body midplane, positive = behind
  confidence: number
}

// Landmark converted to y-up reference frame (y_up = 1 - y), z kept as-is
export interface Landmark2D {
  x: number
  yUp: number
  z: number
  confidence: number
}

// Converts MediaPipe y-down to y-up. Spec-01 §1.1: y_up = 1 − y
export function toY_up(lm: RawLandmark): Landmark2D {
  return { x: lm.x, yUp: 1 - lm.y, z: lm.z, confidence: lm.confidence }
}

// Spec-01 §1.2bis: circular difference, always in (-180, 180] degrees
// atan2(sin(a-b), cos(a-b)) — eliminates 360°/0° wrap artefact
export function circularDiff(aDeg: number, bDeg: number): number {
  const aRad = (aDeg * Math.PI) / 180
  const bRad = (bDeg * Math.PI) / 180
  const diffRad = Math.atan2(Math.sin(aRad - bRad), Math.cos(aRad - bRad))
  return (diffRad * 180) / Math.PI
}

// Spec-01 §1.2bis: circular mean of an array of degree values
export function circularMean(anglesDeg: number[]): number {
  if (anglesDeg.length === 0) return 0
  const sinSum = anglesDeg.reduce((s, a) => s + Math.sin((a * Math.PI) / 180), 0)
  const cosSum = anglesDeg.reduce((s, a) => s + Math.cos((a * Math.PI) / 180), 0)
  return (Math.atan2(sinSum, cosSum) * 180) / Math.PI
}

// One frame in a raw pose sequence
export interface PoseFrame {
  t: number
  landmarks: RawLandmark[]
}

// Thresholds (spec-01 §B in spec-00)
export const TAU_CONF = 0.5
export const TAU_RELIABLE = 0.7
export const TORSO_EPSILON = 0.01  // avoid division by zero in normalisation

// A single data point in a measure's time series
export interface MeasureSample {
  t: number
  value: number
  reliable: boolean
}

// Summary stats for a measure's time series
export interface MeasureSummary {
  min: number
  max: number
  mean: number
  sd: number
  range: number
  peak: number | null
  t_peak: number | null
}

// Reliability metadata for a measure
export interface MeasureReliability {
  fraction_reliable: number
  out_of_plane: boolean
  reasons: string[]
}

// Spec-01: output of one computed primitive measure
export interface MeasureResult {
  id: string
  type: 'angle' | 'rotation' | 'speed' | 'position' | 'acceleration' | 'hitting_plane' | 'cadence'
  unit: 'deg' | 'deg/s' | 'deg/s²' | 'TL/s' | 'TL/s²' | 'TL' | 'cycles/min'
  series: MeasureSample[]
  summary: MeasureSummary
  reliability: MeasureReliability
}
