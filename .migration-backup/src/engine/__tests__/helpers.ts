// Test helpers: build PoseFrames programmatically
import type { PoseFrame, RawLandmark } from '../types'

const LANDMARK_NAMES = [
  'nose','left_eye_inner','left_eye','left_eye_outer',
  'right_eye_inner','right_eye','right_eye_outer',
  'left_ear','right_ear','mouth_left','mouth_right',
  'left_shoulder','right_shoulder',
  'left_elbow','right_elbow',
  'left_wrist','right_wrist',
  'left_pinky','right_pinky',
  'left_index','right_index',
  'left_thumb','right_thumb',
  'left_hip','right_hip',
  'left_knee','right_knee',
  'left_ankle','right_ankle',
  'left_heel','right_heel',
  'left_foot_index','right_foot_index',
] as const

export function makeLandmarks(overrides: Record<string, Partial<RawLandmark>> = {}): RawLandmark[] {
  return LANDMARK_NAMES.map((name) => {
    const ov = overrides[name] ?? {}
    return { x: 0.5, y: 0.5, z: 0, confidence: 0.9, ...ov }
  })
}

export function makeFrame(t: number, overrides: Record<string, Partial<RawLandmark>> = {}): PoseFrame {
  return { t, landmarks: makeLandmarks(overrides) }
}

// Build a realistic single-leg squatting sequence:
// right_hip → right_knee → right_ankle forms an angle
// Angle varies from 180° (straight) to ~90° (bent)
export function makeKneeFrames(nFrames = 5, fps = 30): PoseFrame[] {
  return Array.from({ length: nFrames }, (_, i) => {
    const t = i / fps
    // right_hip above right_knee, right_ankle below right_knee
    // y-down convention: hip has smaller y (higher up in image)
    return makeFrame(t, {
      right_hip: { x: 0.5, y: 0.3, confidence: 0.95 },
      right_knee: { x: 0.5, y: 0.5, confidence: 0.95 },
      right_ankle: { x: 0.5, y: 0.7, confidence: 0.95 },
      right_shoulder: { x: 0.5, y: 0.1, confidence: 0.95 },
      left_shoulder: { x: 0.5, y: 0.1, confidence: 0.95 },
      left_hip: { x: 0.5, y: 0.3, confidence: 0.95 },
    })
  })
}

export function makeStraightKneeFrames(nFrames = 5, fps = 30): PoseFrame[] {
  return Array.from({ length: nFrames }, (_, i) => {
    const t = i / fps
    return makeFrame(t, {
      right_hip: { x: 0.5, y: 0.2, confidence: 0.95 },
      right_knee: { x: 0.5, y: 0.5, confidence: 0.95 },
      right_ankle: { x: 0.5, y: 0.8, confidence: 0.95 },
      right_shoulder: { x: 0.5, y: 0.0, confidence: 0.95 },
      left_shoulder: { x: 0.5, y: 0.0, confidence: 0.95 },
      left_hip: { x: 0.5, y: 0.2, confidence: 0.95 },
    })
  })
}
