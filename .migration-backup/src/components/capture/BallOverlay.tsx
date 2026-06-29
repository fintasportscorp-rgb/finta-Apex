// Renders the latest ball detection over the camera viewport.
// Position + radius are in normalised [0,1] image coords (y-down).
import type { BallSample } from '../../engine/ball/BallTracker'

interface BallOverlayProps {
  sample: BallSample | null
  width: number
  height: number
}

export function BallOverlay({ sample, width, height }: BallOverlayProps) {
  if (!sample || sample.confidence < 0.3) return null

  // Mirror X to match the .scaleX(-1) video transform in CaptureScreen
  const cx = (1 - sample.x) * width
  const cy = sample.y * height
  const r  = Math.max(8, sample.radius * height)

  const accent = sample.confidence > 0.6 ? '#7cf1f9' : 'rgba(124,241,249,0.6)'

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ball-halo">
          <stop offset="0%"   stopColor="#7cf1f9" stopOpacity="0.7" />
          <stop offset="60%"  stopColor="#7cf1f9" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7cf1f9" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo */}
      <circle cx={cx} cy={cy} r={r * 1.6} fill="url(#ball-halo)" />

      {/* Reticle */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={accent} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={accent}
        strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />

      {/* Cross-hair */}
      <line x1={cx - r - 8} y1={cy} x2={cx - r - 2} y2={cy} stroke={accent} strokeWidth={1.5} />
      <line x1={cx + r + 2} y1={cy} x2={cx + r + 8} y2={cy} stroke={accent} strokeWidth={1.5} />
      <line x1={cx} y1={cy - r - 8} x2={cx} y2={cy - r - 2} stroke={accent} strokeWidth={1.5} />
      <line x1={cx} y1={cy + r + 2} x2={cx} y2={cy + r + 8} stroke={accent} strokeWidth={1.5} />

      {/* Confidence tag */}
      <text
        x={cx + r + 12}
        y={cy + 4}
        fontFamily="var(--font-data)"
        fontSize={10}
        fill={accent}
        letterSpacing="0.10em"
      >
        BALL · {(sample.confidence * 100).toFixed(0)}%
      </text>
    </svg>
  )
}
