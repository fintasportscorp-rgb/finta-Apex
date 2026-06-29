// Generates synthetic landmark fixtures for cycling and tennis service
// Run: node generate.mjs
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

function deg2rad(d) { return d * Math.PI / 180 }

// All 33 landmark indices
// Build a full landmark array with most joints at neutral position
// x in [0,1] right, y in [0,1] down (MediaPipe convention)
function neutralPose() {
  // Base skeleton in y-down image coords (sagittal right view)
  return [
    { x: 0.50, y: 0.15 }, // 0 nose
    { x: 0.52, y: 0.14 }, // 1 left_eye_inner
    { x: 0.53, y: 0.13 }, // 2 left_eye
    { x: 0.54, y: 0.13 }, // 3 left_eye_outer
    { x: 0.48, y: 0.14 }, // 4 right_eye_inner
    { x: 0.47, y: 0.13 }, // 5 right_eye
    { x: 0.46, y: 0.13 }, // 6 right_eye_outer
    { x: 0.55, y: 0.16 }, // 7 left_ear
    { x: 0.45, y: 0.16 }, // 8 right_ear
    { x: 0.52, y: 0.18 }, // 9 mouth_left
    { x: 0.48, y: 0.18 }, // 10 mouth_right
    { x: 0.56, y: 0.30 }, // 11 left_shoulder
    { x: 0.44, y: 0.30 }, // 12 right_shoulder
    { x: 0.60, y: 0.42 }, // 13 left_elbow
    { x: 0.40, y: 0.42 }, // 14 right_elbow
    { x: 0.62, y: 0.54 }, // 15 left_wrist
    { x: 0.38, y: 0.54 }, // 16 right_wrist
    { x: 0.63, y: 0.55 }, // 17 left_pinky
    { x: 0.37, y: 0.55 }, // 18 right_pinky
    { x: 0.63, y: 0.55 }, // 19 left_index
    { x: 0.37, y: 0.55 }, // 20 right_index
    { x: 0.62, y: 0.55 }, // 21 left_thumb
    { x: 0.38, y: 0.55 }, // 22 right_thumb
    { x: 0.54, y: 0.55 }, // 23 left_hip
    { x: 0.46, y: 0.55 }, // 24 right_hip
    { x: 0.54, y: 0.72 }, // 25 left_knee
    { x: 0.46, y: 0.72 }, // 26 right_knee
    { x: 0.54, y: 0.88 }, // 27 left_ankle
    { x: 0.46, y: 0.88 }, // 28 right_ankle
    { x: 0.55, y: 0.91 }, // 29 left_heel
    { x: 0.45, y: 0.91 }, // 30 right_heel
    { x: 0.55, y: 0.93 }, // 31 left_foot_index
    { x: 0.45, y: 0.93 }, // 32 right_foot_index
  ]
}

function landmark(x, y, conf = 1.0) {
  return { x: +x.toFixed(4), y: +y.toFixed(4), confidence: conf }
}

// ────────────────────────────────────────────────────────────
// CYCLING — 300 frames, 30 fps, knee oscillates 70°→160°
// ────────────────────────────────────────────────────────────
function generateCycling() {
  const frames = []
  const N = 300
  const FPS = 30
  const cyclesPerSecond = 1.0 // 60 rpm

  // Bike geometry: crank radius ~0.12 TL projected
  // hip: fixed at (0.46, 0.55) — right hip
  // knee traces a circle around the crank center
  const hipX = 0.46, hipY = 0.55
  // Knee angle (joint) oscillates between 70° and 160° over a pedal cycle
  // In image coords: ankle position drives from knee

  for (let i = 0; i < N; i++) {
    const t = +(i / FPS).toFixed(4)
    const phase = (i / FPS) * cyclesPerSecond * 2 * Math.PI

    // Crank angle: 0 = TDC, increases clockwise (y-down coords)
    const crankAngle = phase  // pedal rotates at 1 Hz

    // Knee position — traces partial arc
    // In sagittal right, the knee is below and slightly forward of hip
    const kneeRadius = 0.17 // ~TL in image
    const kneeAngleFromVertical = Math.PI * 0.1 + crankAngle * 0.5 // knee lags crank
    const kneeX = hipX + Math.sin(kneeAngleFromVertical) * 0.04
    const kneeY = hipY + Math.cos(Math.abs(Math.sin(crankAngle))) * 0.15 + 0.02

    // Ankle follows crank directly
    const crankCenterY = hipY + 0.15
    const crankCenterX = hipX
    const crankRadius = 0.06
    const ankleX = crankCenterX + Math.sin(crankAngle) * crankRadius
    const ankleY = crankCenterY + Math.cos(crankAngle) * crankRadius + 0.13

    const base = neutralPose()

    // Override right side joints
    base[26] = { x: kneeX, y: kneeY }   // right_knee
    base[28] = { x: ankleX, y: ankleY } // right_ankle
    base[30] = { x: ankleX + 0.01, y: ankleY + 0.03 } // right_heel
    base[32] = { x: ankleX - 0.02, y: ankleY + 0.04 } // right_foot_index

    // Arms on handlebar — slight forward lean
    base[14] = { x: 0.38, y: 0.38 + Math.sin(crankAngle * 0.5) * 0.01 } // right_elbow
    base[16] = { x: 0.35, y: 0.28 } // right_wrist on bar

    const lms = base.map((pt, idx) => {
      // Right side required joints get high confidence
      const required = [12, 14, 16, 24, 26, 28]
      const conf = required.includes(idx) ? 1.0 : 0.6
      return landmark(pt.x, pt.y, conf)
    })

    frames.push({ t, landmarks: lms })
  }
  return frames
}

// ────────────────────────────────────────────────────────────
// TENNIS SERVICE — 90 frames, 30 fps
// Phase 0-29: preparation (shoulder elevation rises)
// Phase 30-59: acceleration (wrist speed rises to peak)
// Phase 60-89: follow_through (deceleration)
// ────────────────────────────────────────────────────────────
function generateTennis() {
  const frames = []
  const N = 90
  const FPS = 30

  for (let i = 0; i < N; i++) {
    const t = +(i / FPS).toFixed(4)
    const base = neutralPose()

    let rightWristX, rightWristY
    let rightElbowX, rightElbowY
    const rightShoulderX = 0.44, rightShoulderY = 0.30
    const rightHipX = 0.46, rightHipY = 0.55

    if (i < 30) {
      // Preparation: arm raises from side to trophy position
      const prog = i / 30
      const shoulderElevation = prog * 150 // rises from 0° to 150°
      const elevRad = deg2rad(shoulderElevation)
      // Shoulder → elbow segment rising
      rightElbowX = rightShoulderX - Math.sin(elevRad) * 0.10
      rightElbowY = rightShoulderY - Math.cos(elevRad) * 0.10
      // Elbow → wrist
      rightWristX = rightElbowX - Math.sin(elevRad + 0.5) * 0.09
      rightWristY = rightElbowY - Math.cos(elevRad + 0.5) * 0.09

      // Knee bends slightly
      base[26] = { x: 0.46 + prog * 0.02, y: 0.72 + prog * 0.04 } // right_knee
    } else if (i < 60) {
      // Acceleration: arm sweeps forward + down toward ball impact
      const prog = (i - 30) / 30
      const armAngle = deg2rad(150 - prog * 120) // 150° down to 30°
      rightElbowX = rightShoulderX - Math.sin(armAngle) * 0.10
      rightElbowY = rightShoulderY - Math.cos(armAngle) * 0.10
      rightWristX = rightElbowX + prog * 0.05
      rightWristY = rightElbowY + Math.sin(prog * Math.PI) * 0.08

      // Knee straightens on drive
      base[26] = { x: 0.48 - prog * 0.02, y: 0.76 - prog * 0.04 }
    } else {
      // Follow-through: arm continues down and across body
      const prog = (i - 60) / 30
      const armAngle = deg2rad(30 - prog * 60)
      rightElbowX = rightShoulderX + prog * 0.05
      rightElbowY = rightShoulderY + 0.08 + prog * 0.05
      rightWristX = rightElbowX + prog * 0.06
      rightWristY = rightElbowY + 0.04 + prog * 0.03
    }

    base[14] = { x: rightElbowX, y: rightElbowY }  // right_elbow
    base[16] = { x: rightWristX, y: rightWristY }   // right_wrist
    base[18] = { x: rightWristX - 0.01, y: rightWristY - 0.01 } // right_pinky
    base[20] = { x: rightWristX + 0.01, y: rightWristY - 0.01 } // right_index
    base[22] = { x: rightWristX, y: rightWristY - 0.02 }        // right_thumb

    const lms = base.map((pt, idx) => {
      const required = [12, 14, 16, 24, 26, 28]
      const conf = required.includes(idx) ? 1.0 : 0.6
      return landmark(pt.x, pt.y, conf)
    })

    frames.push({ t, landmarks: lms })
  }
  return frames
}

const cyclingFrames = generateCycling()
const tennisFrames = generateTennis()

writeFileSync(
  join(__dir, 'cycling_pedaling.landmarks.json'),
  JSON.stringify(cyclingFrames, null, 2)
)
writeFileSync(
  join(__dir, 'tennis_service.landmarks.json'),
  JSON.stringify(tennisFrames, null, 2)
)

console.log(`Generated cycling_pedaling.landmarks.json (${cyclingFrames.length} frames)`)
console.log(`Generated tennis_service.landmarks.json (${tennisFrames.length} frames)`)
