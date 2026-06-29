// Segmentation: discrete — spec-03
// State machine IDLE → ACTIVE → DONE
// start: condition satisfied (signal + op + threshold)
// end: condition satisfied OR timeout max_duration_s
// pre-roll: 0.1 s
// debounce: k=3 frames
// Instance rejected if duration < min_duration_s
import type { MeasureResult } from '../types'

export interface SegmentCondition {
  signal: string          // "primitive:measure_id" | "rest"
  op?: 'rises_above' | 'falls_below' | 'equals'
  threshold?: number
  duration_s?: number     // for "rest" or duration-based end
}

export interface DiscreteConfig {
  start: SegmentCondition
  end: SegmentCondition
  min_duration_s?: number
  max_duration_s?: number
}

export interface Segment {
  start_t: number
  end_t: number
  frame_start: number
  frame_end: number
}

const PRE_ROLL_S = 0.1
const DEBOUNCE_K = 3

export function segmentDiscrete(
  measures: MeasureResult[],
  config: DiscreteConfig,
  timestamps: number[],
): Segment[] {
  const segments: Segment[] = []
  const measureMap = new Map(measures.map(m => [m.id, m]))

  const n = timestamps.length
  if (n === 0) return segments

  const getSignalValue = (condition: SegmentCondition, frameIdx: number): number | null => {
    if (condition.signal === 'rest') return 0
    const parts = condition.signal.split(':')
    if (parts.length !== 2) return null
    const [, measureId] = parts
    const m = measureMap.get(measureId!)
    if (!m || frameIdx >= m.series.length) return null
    return m.series[frameIdx]?.value ?? null
  }

  const testCondition = (condition: SegmentCondition, frameIdx: number): boolean => {
    if (condition.signal === 'rest' && condition.duration_s) return false  // duration-based, handled elsewhere
    const val = getSignalValue(condition, frameIdx)
    if (val === null) return false
    const threshold = condition.threshold ?? 0
    if (condition.op === 'rises_above') return val > threshold
    if (condition.op === 'falls_below') return val < threshold
    if (condition.op === 'equals') return Math.abs(val - threshold) < 1e-6
    return false
  }

  type State = 'IDLE' | 'ACTIVE'
  let state: State = 'IDLE'
  let debounceCount = 0
  let activeStart = 0
  let activeStartFrame = 0
  let endDebounce = 0

  for (let i = 0; i < n; i++) {
    const t = timestamps[i]!

    if (state === 'IDLE') {
      if (testCondition(config.start, i)) {
        debounceCount++
        if (debounceCount >= DEBOUNCE_K) {
          state = 'ACTIVE'
          const preRollIdx = Math.max(0, i - DEBOUNCE_K + 1)
          activeStart = Math.max(timestamps[preRollIdx]! - PRE_ROLL_S, timestamps[0]!)
          activeStartFrame = preRollIdx
          debounceCount = 0
        }
      } else {
        debounceCount = 0
      }
    } else {
      // check max duration
      const duration = t - activeStart
      const maxDur = config.max_duration_s ?? Infinity
      const minDur = config.min_duration_s ?? 0

      const endConditionMet = testCondition(config.end, i)
      if (endConditionMet || duration >= maxDur) {
        endDebounce++
        if (endDebounce >= DEBOUNCE_K || duration >= maxDur) {
          // End the segment
          const endT = t
          if (endT - activeStart >= minDur) {
            segments.push({ start_t: activeStart, end_t: endT, frame_start: activeStartFrame, frame_end: i })
          }
          state = 'IDLE'
          endDebounce = 0
        }
      } else {
        endDebounce = 0
      }
    }
  }

  return segments
}
