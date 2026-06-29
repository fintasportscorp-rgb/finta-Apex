// Landmark resolver: maps names to frame data, handles derived points
import type { PoseFrame, Landmark2D, RawLandmark } from '../types'
import { toY_up, TAU_CONF, TORSO_EPSILON } from '../types'

export const LANDMARK_INDEX: Record<string, number> = {
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

export const ALL_VALID_POINTS = new Set([
  ...Object.keys(LANDMARK_INDEX),
  'hip_center',
  'shoulder_center',
])

export interface ResolvedPoint extends Landmark2D {
  confident: boolean
}

export function resolvePoint(frame: PoseFrame, name: string): ResolvedPoint | null {
  if (name === 'hip_center') {
    return averageOf(frame, LANDMARK_INDEX.left_hip, LANDMARK_INDEX.right_hip)
  }
  if (name === 'shoulder_center') {
    return averageOf(frame, LANDMARK_INDEX.left_shoulder, LANDMARK_INDEX.right_shoulder)
  }
  const idx = LANDMARK_INDEX[name]
  if (idx === undefined) return null
  const raw = frame.landmarks[idx] as RawLandmark | undefined
  if (!raw) return null
  const lm = toY_up(raw)
  return { ...lm, confident: raw.confidence >= TAU_CONF }
}

function averageOf(frame: PoseFrame, idxA: number, idxB: number): ResolvedPoint | null {
  const rA = frame.landmarks[idxA] as RawLandmark | undefined
  const rB = frame.landmarks[idxB] as RawLandmark | undefined
  if (!rA || !rB) return null
  const aUp = toY_up(rA)
  const bUp = toY_up(rB)
  return {
    x: (aUp.x + bUp.x) / 2,
    yUp: (aUp.yUp + bUp.yUp) / 2,
    z: (aUp.z + bUp.z) / 2,
    confidence: Math.min(rA.confidence, rB.confidence),
    confident: rA.confidence >= TAU_CONF && rB.confidence >= TAU_CONF,
  }
}

// Median torso length (|shoulder_center - hip_center|) over the sequence
export function computeTorsoLengthRef(frames: PoseFrame[]): number {
  const lengths: number[] = []
  for (const frame of frames) {
    const sc = resolvePoint(frame, 'shoulder_center')
    const hc = resolvePoint(frame, 'hip_center')
    if (!sc || !hc) continue
    const dx = sc.x - hc.x
    const dy = sc.yUp - hc.yUp
    lengths.push(Math.sqrt(dx * dx + dy * dy))
  }
  if (lengths.length === 0) return TORSO_EPSILON
  lengths.sort((a, b) => a - b)
  const mid = Math.floor(lengths.length / 2)
  const median = lengths.length % 2 === 0
    ? (lengths[mid - 1]! + lengths[mid]!) / 2
    : lengths[mid]!
  return Math.max(median, TORSO_EPSILON)
}
