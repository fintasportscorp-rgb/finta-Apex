// In-browser ball tracker — HSV blob detection.
//
// HONEST SCOPE
// ────────────
// This is a pragmatic, dependency-free tracker built for the common case:
// a single ball of a distinct colour, decent lighting, against a contrasting
// background. It runs ~60 fps on a 160-wide downsampled canvas.
//
// It is NOT a neural-net detector and it does NOT cope well with:
//   • multiple identically-coloured objects in view
//   • severe partial occlusion (hand fully covering the ball)
//   • low light or strong specular reflections
//   • backgrounds that match the ball's hue
//
// In those cases the tracker returns confidence ≈ 0 and the caller should
// either fall back to last-known position or drop the frame.
//
// Strategy:
//   1. Downsample the video frame to a small canvas (default 160 px wide).
//   2. Convert each pixel from RGB to HSV.
//   3. Threshold against the configured HSV range to produce a binary mask.
//   4. Find connected components via flood-fill, score by area + circularity,
//      pick the best.
//   5. Centre of mass → normalised image coords (x, y in [0,1]).
//
// The tracker is stateful only across calls — it remembers the last known
// position to bias the choice when several candidates score similarly.

import type { BallTrackingConfig } from '../../lib/scripts'

export interface BallSample {
  /** Normalised image coords, x ∈ [0,1], y ∈ [0,1] (y-down to match landmarks). */
  x: number
  y: number
  /** Detected radius in normalised image units (fraction of image height). */
  radius: number
  /** [0, 1] — area + circularity heuristic. ≥0.4 is usually trustworthy. */
  confidence: number
  /** Wall-clock seconds when the frame was processed. */
  t: number
}

export interface HsvRange {
  hMin: number; hMax: number // degrees, 0–360 (allows wrap-around if hMin > hMax)
  sMin: number; sMax: number // 0–1
  vMin: number; vMax: number // 0–1
}

// ── Built-in presets ──────────────────────────────────────────────────────

export const SPORT_PRESETS: Record<string, HsvRange> = {
  // Tennis yellow-green ball — narrow hue band, high saturation
  tennis:     { hMin:  55, hMax:  85, sMin: 0.30, sMax: 1, vMin: 0.45, vMax: 1 },
  // Padel ball (similar to tennis)
  padel:      { hMin:  55, hMax:  85, sMin: 0.30, sMax: 1, vMin: 0.45, vMax: 1 },
  // Basketball orange
  basketball: { hMin:  10, hMax:  35, sMin: 0.45, sMax: 1, vMin: 0.30, vMax: 1 },
  // Football / soccer (white) — low saturation, high value
  football:   { hMin:   0, hMax: 360, sMin: 0.00, sMax: 0.25, vMin: 0.75, vMax: 1 },
  // Handball (white-ish or yellow)
  handball:   { hMin:  35, hMax:  60, sMin: 0.20, sMax: 1, vMin: 0.50, vMax: 1 },
  // Volleyball (white panels with coloured stripes — treat as white)
  volleyball: { hMin:   0, hMax: 360, sMin: 0.00, sMax: 0.30, vMin: 0.70, vMax: 1 },
  // Golf ball (white) — same as soccer
  golf:       { hMin:   0, hMax: 360, sMin: 0.00, sMax: 0.20, vMin: 0.80, vMax: 1 },
  // Badminton shuttle (white) — treat the cork tip + skirt as white blob
  badminton:  { hMin:   0, hMax: 360, sMin: 0.00, sMax: 0.20, vMin: 0.80, vMax: 1 },
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const mx = Math.max(rn, gn, bn)
  const mn = Math.min(rn, gn, bn)
  const d = mx - mn
  let h = 0
  if (d !== 0) {
    if (mx === rn)      h = ((gn - bn) / d) % 6
    else if (mx === gn) h = (bn - rn) / d + 2
    else                h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = mx === 0 ? 0 : d / mx
  const v = mx
  return [h, s, v]
}

function inRange(h: number, s: number, v: number, r: HsvRange): boolean {
  if (s < r.sMin || s > r.sMax) return false
  if (v < r.vMin || v > r.vMax) return false
  // Wrap-around hue check (e.g. red spans 350°→10°)
  if (r.hMin <= r.hMax) return h >= r.hMin && h <= r.hMax
  return h >= r.hMin || h <= r.hMax
}

// ── Tracker ───────────────────────────────────────────────────────────────

export interface BallTrackerOptions {
  /** Width of the downsampled work canvas. Smaller = faster, less precise. */
  workWidth?: number
  /** Min and max detection radius as fraction of image height. */
  minRadiusNorm?: number
  maxRadiusNorm?: number
  /** When two candidates tie, prefer the one closer to the previous detection. */
  proximityBiasNorm?: number
}

export class BallTracker {
  private workCanvas: HTMLCanvasElement
  private workCtx: CanvasRenderingContext2D | null
  private range: HsvRange
  private workWidth: number
  private minR: number
  private maxR: number
  private proxBias: number
  private lastSample: BallSample | null = null

  constructor(config: BallTrackingConfig, opts: BallTrackerOptions = {}) {
    this.range = resolveRange(config)
    this.workWidth = opts.workWidth ?? 160
    this.minR = opts.minRadiusNorm ?? config.min_radius ?? 0.012
    this.maxR = opts.maxRadiusNorm ?? config.max_radius ?? 0.08
    this.proxBias = opts.proximityBiasNorm ?? 0.20

    this.workCanvas = document.createElement('canvas')
    this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true })
  }

  /** Process one frame. Returns null if no confident detection. */
  track(source: HTMLVideoElement | HTMLCanvasElement, t: number): BallSample | null {
    if (!this.workCtx) return null
    const sw = (source as HTMLVideoElement).videoWidth ?? (source as HTMLCanvasElement).width
    const sh = (source as HTMLVideoElement).videoHeight ?? (source as HTMLCanvasElement).height
    if (!sw || !sh) return null

    const aspect = sh / sw
    const W = this.workWidth
    const H = Math.max(1, Math.round(W * aspect))
    if (this.workCanvas.width !== W || this.workCanvas.height !== H) {
      this.workCanvas.width = W
      this.workCanvas.height = H
    }

    this.workCtx.drawImage(source, 0, 0, W, H)
    let pixels: Uint8ClampedArray
    try {
      pixels = this.workCtx.getImageData(0, 0, W, H).data
    } catch {
      // Tainted canvas (cross-origin video) — cannot read pixels
      return null
    }

    // Build mask
    const mask = new Uint8Array(W * H)
    for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
      const [h, s, v] = rgbToHsv(pixels[i], pixels[i + 1], pixels[i + 2])
      mask[p] = inRange(h, s, v, this.range) ? 1 : 0
    }

    // Connected components via iterative flood fill (4-connectivity)
    const visited = new Uint8Array(W * H)
    const stack: number[] = []
    interface Blob { px: number; sumX: number; sumY: number; minX: number; maxX: number; minY: number; maxY: number }
    const blobs: Blob[] = []

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x
        if (!mask[idx] || visited[idx]) continue
        stack.push(idx)
        visited[idx] = 1
        const b: Blob = { px: 0, sumX: 0, sumY: 0, minX: x, maxX: x, minY: y, maxY: y }
        while (stack.length) {
          const i = stack.pop()!
          const yi = (i / W) | 0
          const xi = i - yi * W
          b.px++
          b.sumX += xi; b.sumY += yi
          if (xi < b.minX) b.minX = xi
          if (xi > b.maxX) b.maxX = xi
          if (yi < b.minY) b.minY = yi
          if (yi > b.maxY) b.maxY = yi
          // 4-neighbours
          if (xi > 0     && mask[i - 1]     && !visited[i - 1])     { visited[i - 1] = 1;     stack.push(i - 1) }
          if (xi < W - 1 && mask[i + 1]     && !visited[i + 1])     { visited[i + 1] = 1;     stack.push(i + 1) }
          if (yi > 0     && mask[i - W]     && !visited[i - W])     { visited[i - W] = 1;     stack.push(i - W) }
          if (yi < H - 1 && mask[i + W]     && !visited[i + W])     { visited[i + W] = 1;     stack.push(i + W) }
        }
        blobs.push(b)
      }
    }

    if (blobs.length === 0) {
      this.lastSample = null
      return null
    }

    // Score blobs: area-in-range + circularity + proximity to last sample
    const minArea = (this.minR * 2 * W) * (this.minR * 2 * H) * 0.5  // ≥ half the area of a min-radius circle
    const maxArea = (this.maxR * 2 * W) * (this.maxR * 2 * H) * 2

    let best: { blob: Blob; score: number } | null = null
    for (const b of blobs) {
      if (b.px < minArea || b.px > maxArea) continue

      const bw = b.maxX - b.minX + 1
      const bh = b.maxY - b.minY + 1
      const bbArea = bw * bh
      const fill = b.px / bbArea                              // 1 = perfect square fill
      const aspectPenalty = Math.min(bw, bh) / Math.max(bw, bh) // 1 = round-ish
      const circularity = Math.PI / 4                          // circle inscribed in square
      const circScore = 1 - Math.min(1, Math.abs(fill - circularity) / circularity)

      const cx = b.sumX / b.px / W
      const cy = b.sumY / b.px / H

      let prox = 0.5
      if (this.lastSample) {
        const dx = cx - this.lastSample.x
        const dy = cy - this.lastSample.y
        const d = Math.hypot(dx, dy)
        prox = Math.max(0, 1 - d / this.proxBias)
      }

      const score =
        0.45 * circScore +
        0.30 * aspectPenalty +
        0.10 * Math.min(1, b.px / (minArea * 4)) +
        0.15 * prox

      if (!best || score > best.score) best = { blob: b, score }
    }

    if (!best || best.score < 0.30) {
      this.lastSample = null
      return null
    }

    const b = best.blob
    const cxN = b.sumX / b.px / W
    const cyN = b.sumY / b.px / H
    const radiusN = Math.sqrt(b.px / Math.PI) / H

    const sample: BallSample = {
      x: cxN,
      y: cyN,
      radius: radiusN,
      confidence: Math.min(1, best.score),
      t,
    }
    this.lastSample = sample
    return sample
  }

  /** Reset state — call when starting a new recording. */
  reset(): void {
    this.lastSample = null
  }
}

function resolveRange(config: BallTrackingConfig): HsvRange {
  if (config.hsv_min && config.hsv_max) {
    return {
      hMin: config.hsv_min[0], hMax: config.hsv_max[0],
      sMin: config.hsv_min[1], sMax: config.hsv_max[1],
      vMin: config.hsv_min[2], vMax: config.hsv_max[2],
    }
  }
  const preset = config.sport_preset && SPORT_PRESETS[config.sport_preset]
  if (preset) return preset
  // Fallback: very permissive — anything not grey
  return { hMin: 0, hMax: 360, sMin: 0.20, sMax: 1, vMin: 0.30, vMax: 1 }
}
