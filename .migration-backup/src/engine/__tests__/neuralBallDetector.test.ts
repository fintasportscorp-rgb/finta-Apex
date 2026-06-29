import { describe, it, expect } from 'vitest'
import { letterboxCoords, INPUT_SIZE } from '../ball/NeuralBallDetector'

// Tests cover the pure coordinate-transform math only.
// ONNX inference itself requires a real model file and browser APIs
// (InferenceSession is not available in jsdom).

describe('letterboxCoords', () => {
  it('square image — no padding, centred ball maps to (0.5, 0.5)', () => {
    // srcW=416, srcH=416 → scale=1, padW=416, padH=416, offsetX=0, offsetY=0
    const r = letterboxCoords(208, 208, 20, 20, 416, 416, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normCx).toBeCloseTo(0.5, 3)
    expect(r!.normCy).toBeCloseTo(0.5, 3)
  })

  it('wide image — vertical letterbox, centred ball still maps to (0.5, 0.5)', () => {
    // srcW=832, srcH=416 → scale=0.5, padW=416, padH=208, offsetX=0, offsetY=104
    // ball at cx=208 in letterbox space: (208-0)/416=0.5
    // ball at cy=208 in letterbox space: (208-104)/208=0.5
    const r = letterboxCoords(208, 208, 20, 20, 832, 416, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normCx).toBeCloseTo(0.5, 3)
    expect(r!.normCy).toBeCloseTo(0.5, 3)
  })

  it('tall image — horizontal letterbox, centred ball still maps to (0.5, 0.5)', () => {
    // srcW=416, srcH=832 → scale=0.5, padW=208, padH=416, offsetX=104, offsetY=0
    // cx=208 → (208-104)/208=0.5, cy=208 → (208-0)/416=0.5
    const r = letterboxCoords(208, 208, 20, 20, 416, 832, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normCx).toBeCloseTo(0.5, 3)
    expect(r!.normCy).toBeCloseTo(0.5, 3)
  })

  it('top-left ball on square image maps to approximately (0, 0)', () => {
    const r = letterboxCoords(0, 0, 10, 10, 416, 416, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normCx).toBeCloseTo(0, 2)
    expect(r!.normCy).toBeCloseTo(0, 2)
  })

  it('bottom-right ball on square image maps to approximately (1, 1)', () => {
    const r = letterboxCoords(416, 416, 10, 10, 416, 416, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normCx).toBeCloseTo(1, 2)
    expect(r!.normCy).toBeCloseTo(1, 2)
  })

  it('returns null when detection centre is in the grey padding border', () => {
    // Wide image: offsetY=104, so cy=0 → normCy=(0-104)/208 ≈ -0.5 → rejected
    const r = letterboxCoords(208, 0, 20, 20, 832, 416, INPUT_SIZE)
    expect(r).toBeNull()
  })

  it('radius is proportional to ball size relative to padded image', () => {
    // Ball 41.6px wide on 416-wide input → 10% of padW → normR ≈ 0.05
    const r = letterboxCoords(208, 208, 41.6, 41.6, 416, 416, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normR).toBeCloseTo(0.05, 2)
  })

  it('radius is never below the minimum floor (0.005)', () => {
    const r = letterboxCoords(208, 208, 0, 0, 416, 416, INPUT_SIZE)
    expect(r).not.toBeNull()
    expect(r!.normR).toBeGreaterThanOrEqual(0.005)
  })
})
