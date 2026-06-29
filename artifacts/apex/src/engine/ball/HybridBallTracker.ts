// Hybrid ball tracker — HSV fast-path + neural fallback.
//
// Strategy:
//   1. Always run the HSV tracker (sync, ~1 ms).
//   2. If HSV confidence ≥ 0.6 → return immediately (no neural cost).
//   3. Otherwise, run the neural detector (async, ~20–40 ms on WASM).
//   4. Return whichever result has higher confidence.
//
// The neural model is loaded lazily in the background when this class is
// instantiated. Until it is ready `isReady === false`, the tracker silently
// falls back to HSV-only mode.

import { BallTracker, type BallTrackerOptions, type BallSample } from './BallTracker'
import { NeuralBallDetector } from './NeuralBallDetector'
import type { BallTrackingConfig } from '../../lib/scripts'

const HSV_HANDOFF_THRESHOLD = 0.50  // lowered: custom neural model now reliable enough for earlier handoff

export class HybridBallTracker {
  private hsv: BallTracker
  private neural: NeuralBallDetector

  constructor(config: BallTrackingConfig, opts: BallTrackerOptions = {}) {
    this.hsv    = new BallTracker(config, opts)
    this.neural = new NeuralBallDetector()
    void this.neural.init()  // fire-and-forget; isReady flips when done
  }

  /**
   * Process one frame. Returns a Promise so the neural path can be awaited
   * without blocking the HSV fast-path frame loop.
   *
   * Callers that only need the sync HSV result can fire-and-forget:
   *   void tracker.track(video, t).then(sample => { ... })
   */
  async track(
    source: HTMLVideoElement | HTMLCanvasElement,
    t: number,
  ): Promise<BallSample | null> {
    const hsvResult = this.hsv.track(source, t)

    if (!this.neural.isReady) return hsvResult
    if (hsvResult && hsvResult.confidence >= HSV_HANDOFF_THRESHOLD) return hsvResult

    const neuralResult = await this.neural.detect(source, t)

    if (!neuralResult) return hsvResult
    if (!hsvResult)    return neuralResult
    return neuralResult.confidence >= hsvResult.confidence ? neuralResult : hsvResult
  }

  /** Reset internal state — call at the start of each new recording. */
  reset(): void {
    this.hsv.reset()
  }

  get neuralReady(): boolean {
    return this.neural.isReady
  }
}
