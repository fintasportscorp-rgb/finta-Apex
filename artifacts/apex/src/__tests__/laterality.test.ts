import { describe, it, expect } from 'vitest'
import { flipLandmarkName, mirrorScript, applyLaterality } from '../lib/scripts'
import type { Script } from '../lib/scripts'

// ── Fixture: archery-style script with multi-view + segmentation referencing landmarks ──
function makeFixture(): Script {
  return {
    id: 'archery_draw_test',
    version: '1.1.0',
    dsl_version: '1.1',
    discipline: 'tir_arc',
    gesture: 'Armé',
    movement_type: 'finite',
    cv_model: 'blazepose-full@1.x',
    view: 'sagittal_right',
    side: 'right',
    required_visible: ['right_shoulder', 'right_elbow', 'right_wrist'],
    measures: [
      { id: 'draw_elbow', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
      { id: 'wrist_speed', primitive: 'speed', mode: 'linear', point: 'right_wrist', expose: false },
    ],
    available_views: [
      {
        view: 'sagittal_right',
        priority: 1,
        primary: true,
        feasibility_2d: 'ok',
        side: 'right',
        required_visible: ['right_shoulder', 'right_elbow', 'right_wrist'],
        measures: [
          { id: 'draw_elbow', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
          { id: 'wrist_speed', primitive: 'speed', mode: 'linear', point: 'right_wrist', expose: false },
        ],
      },
      {
        view: 'frontal',
        priority: 2,
        primary: false,
        feasibility_2d: 'ok',
        side: 'both',
        measures: [
          { id: 'shoulder_level', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
        ],
      },
    ],
    segmentation: {
      mode: 'discrete',
      start: { signal: 'speed:right_wrist', op: 'rises_above', threshold: 0.4 },
      end: { signal: 'speed:right_wrist', op: 'falls_below', threshold: 0.1 },
    },
    phases: [
      { id: 'extension', until: { signal: 'angle:draw_elbow', event: 'maximum' } },
    ],
    key_event: { signal: 'speed:right_wrist', event: 'peak' },
    outputs: ['draw_elbow'],
  } as Script
}

// ── flipLandmarkName ────────────────────────────────────────────────────
describe('flipLandmarkName', () => {
  it('swaps left ↔ right for paired landmarks', () => {
    expect(flipLandmarkName('left_shoulder')).toBe('right_shoulder')
    expect(flipLandmarkName('right_shoulder')).toBe('left_shoulder')
    expect(flipLandmarkName('right_foot_index')).toBe('left_foot_index')
  })

  it('passes through neutral landmarks unchanged', () => {
    expect(flipLandmarkName('nose')).toBe('nose')
    expect(flipLandmarkName('hip_center')).toBe('hip_center')
    expect(flipLandmarkName('shoulder_center')).toBe('shoulder_center')
  })

  it('passes through unknown identifiers unchanged', () => {
    expect(flipLandmarkName('draw_elbow')).toBe('draw_elbow')
    expect(flipLandmarkName('')).toBe('')
  })
})

// ── mirrorScript ────────────────────────────────────────────────────────
describe('mirrorScript', () => {
  it('flips landmark references inside measures', () => {
    const mirrored = mirrorScript(makeFixture())
    const m = mirrored.measures.find(x => x.id === 'draw_elbow')!
    expect(m.points).toEqual(['left_shoulder', 'left_elbow', 'left_wrist'])
    const speed = mirrored.measures.find(x => x.id === 'wrist_speed')!
    expect(speed.point).toBe('left_wrist')
  })

  it('flips required_visible and side at both top-level and per-view', () => {
    const mirrored = mirrorScript(makeFixture())
    expect(mirrored.side).toBe('left')
    expect(mirrored.required_visible).toEqual(['left_shoulder', 'left_elbow', 'left_wrist'])
    const primary = mirrored.available_views!.find(v => v.primary)!
    expect(primary.side).toBe('left')
    expect(primary.required_visible).toEqual(['left_shoulder', 'left_elbow', 'left_wrist'])
  })

  it("flips view from sagittal_right to sagittal_left", () => {
    const mirrored = mirrorScript(makeFixture())
    expect(mirrored.view).toBe('sagittal_left')
  })

  it('flips signal landmarks in segmentation / phases / key_event but leaves measure-id signals alone', () => {
    const mirrored = mirrorScript(makeFixture())
    const seg = mirrored.segmentation as Record<string, { signal: string }>
    expect(seg.start.signal).toBe('speed:left_wrist')
    expect(seg.end.signal).toBe('speed:left_wrist')

    const phase0 = mirrored.phases![0]
    expect((phase0.until as { signal: string }).signal).toBe('angle:draw_elbow') // measure id, no flip

    const keyEvent = mirrored.key_event as { signal: string }
    expect(keyEvent.signal).toBe('speed:left_wrist')
  })

  it('is idempotent — mirror(mirror(s)) restores the original landmark references', () => {
    const original = makeFixture()
    const round = mirrorScript(mirrorScript(original))
    expect(round.measures[0].points).toEqual(original.measures[0].points)
    expect(round.side).toBe(original.side)
    expect(round.view).toBe(original.view)
    expect((round.segmentation as Record<string, { signal: string }>).start.signal)
      .toBe((original.segmentation as Record<string, { signal: string }>).start.signal)
  })

  it('does not mutate the input script', () => {
    const original = makeFixture()
    const snapshot = JSON.stringify(original)
    mirrorScript(original)
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('flips the frontal view side from "both" to "both" (idempotent on neutral sides)', () => {
    const mirrored = mirrorScript(makeFixture())
    const frontal = mirrored.available_views!.find(v => v.view === 'frontal')!
    expect(frontal.side).toBe('both')
    // shoulder_level has both right_shoulder and left_shoulder in points — they swap, but the set is the same.
    expect(new Set(frontal.measures[0].points)).toEqual(new Set(['right_shoulder', 'left_shoulder']))
  })
})

// ── applyLaterality ────────────────────────────────────────────────────
describe('applyLaterality', () => {
  it('returns the original reference (no copy) when isLeftHanded=false', () => {
    const s = makeFixture()
    expect(applyLaterality(s, false)).toBe(s)
  })

  it('returns a mirrored copy when isLeftHanded=true', () => {
    const s = makeFixture()
    const result = applyLaterality(s, true)
    expect(result).not.toBe(s)
    expect(result.side).toBe('left')
  })
})
