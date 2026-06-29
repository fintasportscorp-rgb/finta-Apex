// Circular statistics for the differential engine — spec-04
import { circularDiff, circularMean } from '../types'

export { circularDiff, circularMean }

export function circularSd(anglesDeg: number[], mean: number): number {
  if (anglesDeg.length === 0) return 0
  return Math.sqrt(
    anglesDeg.reduce((acc, v) => acc + circularDiff(v, mean) ** 2, 0) / anglesDeg.length,
  )
}

// Resample a time series to exactly nPoints using linear interpolation
export function resampleLinear(values: number[], nPoints: number): number[] {
  if (values.length === 0) return Array(nPoints).fill(0)
  if (values.length === 1) return Array(nPoints).fill(values[0])
  const result: number[] = []
  for (let i = 0; i < nPoints; i++) {
    const t = (i / (nPoints - 1)) * (values.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, values.length - 1)
    const frac = t - lo
    result.push((values[lo]! * (1 - frac)) + (values[hi]! * frac))
  }
  return result
}

// Resample for circular (angle/rotation) series — interpolate through circular space
export function resampleCircular(anglesDeg: number[], nPoints: number): number[] {
  if (anglesDeg.length === 0) return Array(nPoints).fill(0)
  if (anglesDeg.length === 1) return Array(nPoints).fill(anglesDeg[0])
  const result: number[] = []
  for (let i = 0; i < nPoints; i++) {
    const t = (i / (nPoints - 1)) * (anglesDeg.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, anglesDeg.length - 1)
    const frac = t - lo
    const a = anglesDeg[lo]!
    const b = anglesDeg[hi]!
    // Interpolate through shortest arc
    const delta = circularDiff(b, a)
    result.push(a + delta * frac)
  }
  return result
}
