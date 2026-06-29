// One-Euro Filter — spec-02 §perf
// β=0.007 · f_c_min=1 Hz · d_f_c=1 Hz
// Applied per landmark per axis (x, y) independently
// Must run in < 0.5 ms for 33 landmarks
import type { PoseFrame, RawLandmark } from '../types'

export interface OneEuroConfig {
  beta?: number
  f_c_min?: number
  d_f_c?: number
}

const DEFAULTS: Required<OneEuroConfig> = {
  beta: 0.007,
  f_c_min: 1.0,
  d_f_c: 1.0,
}

class OneEuroFilter1D {
  private readonly beta: number
  private readonly f_c_min: number
  private readonly d_f_c: number
  private x_prev: number | null = null
  private dx_prev = 0
  private t_prev: number | null = null

  constructor(cfg: Required<OneEuroConfig>) {
    this.beta = cfg.beta
    this.f_c_min = cfg.f_c_min
    this.d_f_c = cfg.d_f_c
  }

  filter(x: number, t: number): number {
    if (this.t_prev === null || this.x_prev === null) {
      this.t_prev = t
      this.x_prev = x
      return x
    }
    const dt = Math.max(t - this.t_prev, 1e-6)
    const rate = 1 / dt

    const alpha_d = OneEuroFilter1D.computeAlpha(rate, this.d_f_c)
    const dx_raw = (x - this.x_prev) * rate
    const dx = this.dx_prev + alpha_d * (dx_raw - this.dx_prev)

    const f_c = this.f_c_min + this.beta * Math.abs(dx)
    const alpha = OneEuroFilter1D.computeAlpha(rate, f_c)

    const filtered = this.x_prev + alpha * (x - this.x_prev)
    this.x_prev = filtered
    this.dx_prev = dx
    this.t_prev = t
    return filtered
  }

  reset(): void {
    this.x_prev = null
    this.dx_prev = 0
    this.t_prev = null
  }

  private static computeAlpha(rate: number, f_c: number): number {
    const tau = 1 / (2 * Math.PI * f_c)
    const dt = 1 / rate
    return dt / (dt + tau)
  }
}

export class LandmarkOneEuroFilter {
  private readonly xFilters: OneEuroFilter1D[]
  private readonly yFilters: OneEuroFilter1D[]
  private readonly zFilters: OneEuroFilter1D[]

  constructor(numLandmarks = 33, config: OneEuroConfig = {}) {
    const cfg = { ...DEFAULTS, ...config }
    this.xFilters = Array.from({ length: numLandmarks }, () => new OneEuroFilter1D(cfg))
    this.yFilters = Array.from({ length: numLandmarks }, () => new OneEuroFilter1D(cfg))
    this.zFilters = Array.from({ length: numLandmarks }, () => new OneEuroFilter1D(cfg))
  }

  filterFrame(frame: PoseFrame): PoseFrame {
    const landmarks = frame.landmarks.map((lm, i): RawLandmark => {
      const xf = this.xFilters[i]
      const yf = this.yFilters[i]
      const zf = this.zFilters[i]
      if (!xf || !yf || !zf) return lm as RawLandmark
      return {
        x: xf.filter(lm.x, frame.t),
        y: yf.filter(lm.y, frame.t),
        z: zf.filter(lm.z, frame.t),
        confidence: lm.confidence,
      }
    })
    return { t: frame.t, landmarks }
  }

  reset(): void {
    for (const f of this.xFilters) f.reset()
    for (const f of this.yFilters) f.reset()
    for (const f of this.zFilters) f.reset()
  }
}

export function filterFrames(frames: PoseFrame[], config: OneEuroConfig = {}): PoseFrame[] {
  const filter = new LandmarkOneEuroFilter(33, config)
  return frames.map(frame => filter.filterFrame(frame))
}
