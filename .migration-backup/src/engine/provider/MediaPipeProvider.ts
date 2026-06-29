// MediaPipe Pose Landmarker provider — spec-00 Phase 9
// Loaded via CDN ESM import — no npm package required at build time
// Requires COOP/COEP headers for SharedArrayBuffer (WASM)
// Model: /models/pose_landmarker_full.task (place in public/models/)
import type { PoseFrame, RawLandmark } from '../types'
import type { CameraProvider } from '../stub/FixtureCameraProvider'
import { LandmarkOneEuroFilter } from '../filters/oneEuro'

const MODEL_PATH = '/models/pose_landmarker_full.task'
const CONFIDENCE_THRESHOLD = 0.5
const PRESENCE_THRESHOLD = 0.5
// LITE_FALLBACK_FPS = 20 — kept for reference; auto-downgrade removed

export interface MediaPipeConfig {
  modelPath?: string
  numPoses?: number
  mirrorX?: boolean
  videoEl?: HTMLVideoElement   // caller-owned element for display + detection
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = any

export class MediaPipeProvider implements CameraProvider {
  private cfg: Required<Omit<MediaPipeConfig, 'videoEl'>> & { videoEl?: HTMLVideoElement }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private landmarker: AnyModule = null
  private stream: MediaStream | null = null
  private ownedVideoEl: HTMLVideoElement | null = null   // created internally if no videoEl provided
  private animFrameId: number | null = null
  private callback: ((frame: PoseFrame) => void) | null = null
  private filter = new LandmarkOneEuroFilter(33)
  private lastFrameTime = 0
  private fpsWindow: number[] = []
  private stopped = false

  constructor(config: MediaPipeConfig = {}) {
    this.cfg = {
      modelPath: config.modelPath ?? MODEL_PATH,
      numPoses: config.numPoses ?? 2,
      mirrorX: config.mirrorX ?? true,
      videoEl: config.videoEl,
    }
  }

  onFrame(cb: (frame: PoseFrame) => void): void {
    this.callback = cb
  }

  async start(): Promise<void> {
    await this.initLandmarker(this.cfg.modelPath)
    if (this.stopped) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
    })
    if (this.stopped) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
      return
    }

    const video = this.cfg.videoEl ?? this.createVideoElement()
    video.srcObject = this.stream
    await video.play()
    if (this.stopped) return

    this.processLoop(video)
  }

  stop(): void {
    this.stopped = true
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    if (this.cfg.videoEl) {
      this.cfg.videoEl.srcObject = null
    }
    if (this.ownedVideoEl) {
      this.ownedVideoEl.srcObject = null
      this.ownedVideoEl.remove()
      this.ownedVideoEl = null
    }
    this.filter.reset()
  }

  private async initLandmarker(modelPath: string): Promise<void> {
    // `url` typed as `any` so TS skips module resolution; @vite-ignore prevents bundling
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url: any = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs'
    const mpVision: AnyModule = await import(/* @vite-ignore */ url)
    const { FilesetResolver, PoseLandmarker } = mpVision
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
    )
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: this.cfg.numPoses,
      minPoseDetectionConfidence: CONFIDENCE_THRESHOLD,
      minPosePresenceConfidence: PRESENCE_THRESHOLD,
      minTrackingConfidence: CONFIDENCE_THRESHOLD,
    })
  }

  private processLoop(video: HTMLVideoElement): void {
    if (!this.landmarker) return
    const step = (nowMs: number) => {
      this.animFrameId = requestAnimationFrame(step)
      if (video.readyState < 2) return
      const result = this.landmarker.detectForVideo(video, nowMs)
      if (!result.landmarks || result.landmarks.length === 0) return

      const landmarksGroup = this.selectLargestPose(result.landmarks)
      const rawLms: RawLandmark[] = landmarksGroup.map(lm => ({
        x: this.cfg.mirrorX ? 1 - lm.x : lm.x,
        y: lm.y,
        z: lm.z ?? 0,
        confidence: lm.visibility ?? 0,
      }))

      const rawFrame: PoseFrame = { t: nowMs / 1000, landmarks: rawLms }
      const filtered = this.filter.filterFrame(rawFrame)
      this.callback?.(filtered)

      this.trackFps(nowMs)
    }
    this.animFrameId = requestAnimationFrame(step)
  }

  private selectLargestPose(
    groups: Array<Array<{ x: number; y: number; z?: number; visibility?: number }>>,
  ): Array<{ x: number; y: number; visibility?: number }> {
    if (groups.length === 1) return groups[0]!
    let best = groups[0]!
    let bestSize = 0
    for (const lms of groups) {
      const ls = lms[11], rs = lms[12], lh = lms[23], rh = lms[24]
      if (!ls || !rs || !lh || !rh) continue
      const torso = Math.abs((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2)
      if (torso > bestSize) { bestSize = torso; best = lms }
    }
    return best
  }

  private trackFps(nowMs: number): void {
    if (this.lastFrameTime > 0) {
      const dt = nowMs - this.lastFrameTime
      this.fpsWindow.push(1000 / dt)
      if (this.fpsWindow.length > 30) this.fpsWindow.shift()
    }
    this.lastFrameTime = nowMs
  }

  private createVideoElement(): HTMLVideoElement {
    const v = document.createElement('video')
    v.playsInline = true
    v.muted = true
    v.style.display = 'none'
    document.body.appendChild(v)
    this.ownedVideoEl = v
    return v
  }
}
