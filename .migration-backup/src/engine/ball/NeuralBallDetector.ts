// Neural ball detector — YOLOv8-nano ONNX via ONNX Runtime Web.
// Loaded lazily from /models/ball_detector.onnx (~11.6 MB).
// Custom-trained single-class model covering all sport ball categories.
// Degrades gracefully to no-op when the model file is absent.
//
// Output contract: same BallSample shape as BallTracker so callers
// can swap between the two without type changes.

import * as ort from 'onnxruntime-web'
import type { BallSample } from './BallTracker'

export const INPUT_SIZE = 416        // px — must match training imgsz
const CONF_THRESHOLD  = 0.25  // lowered: custom model is more precise, improves recall
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'

type DetectorState = 'idle' | 'loading' | 'ready' | 'unavailable'

// ── Pure coordinate helpers (exported for unit tests) ─────────────────────

/**
 * Map a YOLOv8 detection from letterbox-pixel space back to normalised [0,1]
 * original-image coordinates.
 *
 * Returns null when the centre falls outside the active image area
 * (i.e. it was detected in the grey padding strip).
 */
export function letterboxCoords(
  cx: number, cy: number,
  bw: number, bh: number,
  srcW: number, srcH: number,
  inputSize: number,
): { normCx: number; normCy: number; normR: number } | null {
  const scale   = Math.min(inputSize / srcW, inputSize / srcH)
  const padW    = Math.round(srcW * scale)
  const padH    = Math.round(srcH * scale)
  const offsetX = Math.floor((inputSize - padW) / 2)
  const offsetY = Math.floor((inputSize - padH) / 2)

  const normCx = (cx - offsetX) / padW
  const normCy = (cy - offsetY) / padH

  // Reject detections that land in the padding border
  if (normCx < -0.05 || normCx > 1.05 || normCy < -0.05 || normCy > 1.05) return null

  return {
    normCx: Math.max(0, Math.min(1, normCx)),
    normCy: Math.max(0, Math.min(1, normCy)),
    normR:  Math.max(0.005, Math.max(bw, bh) * 0.5 / Math.max(padW, padH)),
  }
}

// ── Detector class ────────────────────────────────────────────────────────

export class NeuralBallDetector {
  private session: ort.InferenceSession | null = null
  private state: DetectorState = 'idle'
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null

  constructor() {
    this.canvas     = document.createElement('canvas')
    this.canvas.width  = INPUT_SIZE
    this.canvas.height = INPUT_SIZE
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  }

  get isReady(): boolean { return this.state === 'ready' }

  /**
   * Load the ONNX model. Safe to call multiple times — subsequent calls are
   * no-ops. Errors are swallowed; `isReady` will remain false.
   */
  async init(): Promise<void> {
    if (this.state !== 'idle') return
    this.state = 'loading'
    try {
      ort.env.wasm.wasmPaths  = ORT_CDN
      ort.env.wasm.numThreads = 1          // keep deterministic, avoid SharedArrayBuffer dependency
      this.session = await ort.InferenceSession.create('/models/ball_detector.onnx', {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      })
      this.state = 'ready'
    } catch {
      this.state = 'unavailable'
    }
  }

  /**
   * Run inference on one frame. Returns null when:
   * - model not loaded
   * - no detection above confidence threshold
   * - canvas cross-origin tainted
   */
  async detect(
    source: HTMLVideoElement | HTMLCanvasElement,
    t: number,
  ): Promise<BallSample | null> {
    if (!this.session || !this.ctx) return null

    const srcW = (source as HTMLVideoElement).videoWidth  ?? (source as HTMLCanvasElement).width
    const srcH = (source as HTMLVideoElement).videoHeight ?? (source as HTMLCanvasElement).height
    if (!srcW || !srcH) return null

    // Letterbox-resize into INPUT_SIZE × INPUT_SIZE (grey padding)
    const scale   = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH)
    const padW    = Math.round(srcW * scale)
    const padH    = Math.round(srcH * scale)
    const offsetX = Math.floor((INPUT_SIZE - padW) / 2)
    const offsetY = Math.floor((INPUT_SIZE - padH) / 2)

    this.ctx.fillStyle = '#808080'
    this.ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
    this.ctx.drawImage(source, offsetX, offsetY, padW, padH)

    let pixels: Uint8ClampedArray
    try {
      pixels = this.ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data
    } catch {
      return null  // cross-origin video
    }

    // RGBA Uint8 → float32 CHW [1, 3, H, W], normalised [0, 1]
    const n     = INPUT_SIZE * INPUT_SIZE
    const input = new Float32Array(3 * n)
    for (let i = 0; i < n; i++) {
      input[i]         = pixels[i * 4]     / 255  // R
      input[n + i]     = pixels[i * 4 + 1] / 255  // G
      input[2 * n + i] = pixels[i * 4 + 2] / 255  // B
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE])
    let out: ort.Tensor
    try {
      const results = await this.session.run({ images: tensor })
      out = results['output0']
    } catch {
      return null
    }

    // YOLOv8 raw output (no built-in NMS), shape [1, rows, num_anchors]:
    //  • Single-class fine-tuned model: rows=5  → conf at row 4
    //  • COCO 80-class model:           rows=84 → sports-ball conf at row 4+32=36
    const data = out.data as Float32Array
    const numA = out.dims[2] as number
    const rows = out.dims[1] as number

    // COCO class index 32 = "sports ball"; single-class model uses index 0
    const SPORTS_BALL_COCO = 32
    const classIdx = rows === 84 ? SPORTS_BALL_COCO : 0
    const confRow  = 4 + classIdx   // row offset for the target class confidence

    let bestConf = CONF_THRESHOLD
    let bestCx = 0, bestCy = 0, bestBW = 0, bestBH = 0

    for (let i = 0; i < numA; i++) {
      const conf = data[confRow * numA + i]
      if (conf <= bestConf) continue
      bestConf = conf
      bestCx   = data[i]
      bestCy   = data[numA     + i]
      bestBW   = data[2 * numA + i]
      bestBH   = data[3 * numA + i]
    }

    if (bestConf <= CONF_THRESHOLD) return null

    const coords = letterboxCoords(bestCx, bestCy, bestBW, bestBH, srcW, srcH, INPUT_SIZE)
    if (!coords) return null

    return {
      x:          coords.normCx,
      y:          coords.normCy,
      radius:     coords.normR,
      confidence: Math.min(1, bestConf),
      t,
    }
  }
}
