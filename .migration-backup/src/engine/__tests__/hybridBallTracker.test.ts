import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BallSample } from '../ball/BallTracker'

// ── Mock NeuralBallDetector before importing HybridBallTracker ────────────

const mockNeuralIsReady = { value: false }
const mockNeuralDetect  = vi.fn<[HTMLVideoElement | HTMLCanvasElement, number], Promise<BallSample | null>>()
const mockNeuralInit    = vi.fn().mockResolvedValue(undefined)

vi.mock('../ball/NeuralBallDetector', () => ({
  NeuralBallDetector: vi.fn().mockImplementation(() => ({
    get isReady() { return mockNeuralIsReady.value },
    init:   mockNeuralInit,
    detect: mockNeuralDetect,
  })),
}))

// ── Mock BallTracker to control HSV results ───────────────────────────────

const mockHsvTrack = vi.fn<[HTMLVideoElement | HTMLCanvasElement, number], BallSample | null>()
const mockHsvReset = vi.fn()

vi.mock('../ball/BallTracker', async (importOriginal) => {
  const original = await importOriginal<typeof import('../ball/BallTracker')>()
  return {
    ...original,
    BallTracker: vi.fn().mockImplementation(() => ({
      track: mockHsvTrack,
      reset: mockHsvReset,
    })),
  }
})

// Import AFTER mocks are registered
const { HybridBallTracker } = await import('../ball/HybridBallTracker')

// ── Test helpers ──────────────────────────────────────────────────────────

function makeSample(confidence: number): BallSample {
  return { x: 0.5, y: 0.5, radius: 0.03, confidence, t: 1 }
}

const config  = { enabled: true, sport_preset: 'tennis' }
const dummySrc = { videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement

// ── Tests ─────────────────────────────────────────────────────────────────

describe('HybridBallTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNeuralIsReady.value = false
  })

  it('initialises the neural detector on construction', () => {
    new HybridBallTracker(config)
    expect(mockNeuralInit).toHaveBeenCalledOnce()
  })

  it('returns null when both HSV and neural produce nothing', async () => {
    mockHsvTrack.mockReturnValue(null)
    const tracker = new HybridBallTracker(config)
    expect(await tracker.track(dummySrc, 0)).toBeNull()
  })

  it('returns HSV result directly when neural is not ready', async () => {
    const hsv = makeSample(0.4)
    mockHsvTrack.mockReturnValue(hsv)
    const tracker = new HybridBallTracker(config)
    expect(await tracker.track(dummySrc, 0)).toBe(hsv)
    expect(mockNeuralDetect).not.toHaveBeenCalled()
  })

  it('skips neural when HSV confidence ≥ 0.6', async () => {
    mockNeuralIsReady.value = true
    const hsv = makeSample(0.8)
    mockHsvTrack.mockReturnValue(hsv)
    const tracker = new HybridBallTracker(config)
    expect(await tracker.track(dummySrc, 0)).toBe(hsv)
    expect(mockNeuralDetect).not.toHaveBeenCalled()
  })

  it('calls neural when HSV confidence is below threshold', async () => {
    mockNeuralIsReady.value = true
    const hsv    = makeSample(0.35)
    const neural = makeSample(0.75)
    mockHsvTrack.mockReturnValue(hsv)
    mockNeuralDetect.mockResolvedValue(neural)

    const tracker = new HybridBallTracker(config)
    const result  = await tracker.track(dummySrc, 0)
    expect(mockNeuralDetect).toHaveBeenCalledOnce()
    expect(result).toBe(neural)
  })

  it('returns HSV when neural fires but has lower confidence', async () => {
    mockNeuralIsReady.value = true
    const hsv    = makeSample(0.45)
    const neural = makeSample(0.30)
    mockHsvTrack.mockReturnValue(hsv)
    mockNeuralDetect.mockResolvedValue(neural)

    const tracker = new HybridBallTracker(config)
    expect(await tracker.track(dummySrc, 0)).toBe(hsv)
  })

  it('returns neural result when HSV is null and neural detects', async () => {
    mockNeuralIsReady.value = true
    const neural = makeSample(0.65)
    mockHsvTrack.mockReturnValue(null)
    mockNeuralDetect.mockResolvedValue(neural)

    const tracker = new HybridBallTracker(config)
    expect(await tracker.track(dummySrc, 0)).toBe(neural)
  })

  it('neuralReady reflects detector state', () => {
    const tracker = new HybridBallTracker(config)
    expect(tracker.neuralReady).toBe(false)
    mockNeuralIsReady.value = true
    expect(tracker.neuralReady).toBe(true)
  })

  it('reset() delegates to HSV tracker', () => {
    const tracker = new HybridBallTracker(config)
    tracker.reset()
    expect(mockHsvReset).toHaveBeenCalledOnce()
  })
})
