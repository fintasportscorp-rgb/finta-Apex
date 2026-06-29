// SVG overlay showing 17 skeleton connections over the video frame area
import type { RawLandmark } from '../../engine/types'

const CONNECTIONS: [number, number][] = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Right arm
  [12, 14], [14, 16],
  // Left arm
  [11, 13], [13, 15],
  // Right leg
  [24, 26], [26, 28],
  // Left leg
  [23, 25], [25, 27],
  // Head
  [0, 11], [0, 12],
  // Feet
  [28, 30], [28, 32],
]

interface SkeletonOverlayProps {
  landmarks: RawLandmark[]
  width: number
  height: number
}

export function SkeletonOverlay({ landmarks, width, height }: SkeletonOverlayProps) {
  if (landmarks.length < 33) return null

  const px = (lm: RawLandmark): [number, number] => [lm.x * width, lm.y * height]

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="skel-overlay-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#7cf1f9" />
          <stop offset="50%"  stopColor="#61ced6" />
          <stop offset="100%" stopColor="#46acb3" />
        </linearGradient>
        <filter id="skel-overlay-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Connections */}
      {CONNECTIONS.map(([a, b]) => {
        const lmA = landmarks[a], lmB = landmarks[b]
        if (!lmA || !lmB) return null
        const [ax, ay] = px(lmA)
        const [bx, by] = px(lmB)
        const lowConf = lmA.confidence < 0.5 || lmB.confidence < 0.5
        return (
          <line
            key={`${a}-${b}`}
            x1={ax} y1={ay} x2={bx} y2={by}
            stroke="url(#skel-overlay-stroke)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={lowConf ? 0.25 : 0.9}
            filter="url(#skel-overlay-glow)"
          />
        )
      })}

      {/* Joint dots */}
      {[0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map(idx => {
        const lm = landmarks[idx]
        if (!lm) return null
        const [x, y] = px(lm)
        return (
          <g key={idx}>
            <circle cx={x} cy={y} r={6} fill="rgba(97,206,214,0.25)" opacity={lm.confidence < 0.5 ? 0.2 : 1} />
            <circle cx={x} cy={y} r={3} fill="#e8feff" opacity={lm.confidence < 0.5 ? 0.3 : 1} />
          </g>
        )
      })}
    </svg>
  )
}
