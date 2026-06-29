import type { PoseFrame, RawLandmark } from '../types'

export interface CameraProvider {
  onFrame: (cb: (frame: PoseFrame) => void) => void
  start: () => void
  stop: () => void
}

// Reads landmark frames and emits at ~30 fps (simulated)
// Interface is identical to the future MediaPipeCameraProvider (Plan 02)
export class FixtureCameraProvider implements CameraProvider {
  private frames: PoseFrame[]
  private frameIndex = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private callback: ((frame: PoseFrame) => void) | null = null

  constructor(frames: PoseFrame[]) {
    this.frames = frames
  }

  onFrame(cb: (frame: PoseFrame) => void): void {
    this.callback = cb
  }

  start(): void {
    if (this.intervalId !== null) return
    this.frameIndex = 0
    // 30 fps = ~33ms per frame
    this.intervalId = setInterval(() => {
      if (!this.callback || this.frames.length === 0) return
      const frame = this.frames[this.frameIndex % this.frames.length]
      const wallFrame: PoseFrame = {
        t: Date.now() / 1000,
        landmarks: frame.landmarks as RawLandmark[],
      }
      this.callback(wallFrame)
      this.frameIndex++
    }, 1000 / 30)
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.frameIndex = 0
  }
}

// Factory: dynamically imports the correct fixture JSON for a given script id
export async function createFixtureProvider(scriptId: string): Promise<FixtureCameraProvider> {
  let frames: PoseFrame[]

  if (scriptId === 'tennis_service_sagittal_v1') {
    const mod = await import('./fixtures/tennis_service.landmarks.json')
    frames = mod.default as PoseFrame[]
  } else {
    // Default: cycling fixture
    const mod = await import('./fixtures/cycling_pedaling.landmarks.json')
    frames = mod.default as PoseFrame[]
  }

  return new FixtureCameraProvider(frames)
}
