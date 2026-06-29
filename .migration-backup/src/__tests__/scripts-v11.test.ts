import { describe, it, expect } from 'vitest'
import {
  adaptV1ToV11,
  getRecommendedView,
  getAvailableViews,
  getMeasuresForViews,
  getViewLabel,
  lintScript,
} from '../lib/scripts'
import type { Script } from '../lib/scripts'

// ── Fixture: v1.0 script (legacy, top-level view/measures) ────────────────
function makeV1Script(overrides: Partial<Script> = {}): Script {
  return {
    id: 'test_v1',
    version: '1.0.0',
    dsl_version: '1.0',
    discipline: 'tennis',
    gesture: 'Service',
    movement_type: 'finite',
    cv_model: 'blazepose-full@1.x',
    view: 'sagittal_right',
    side: 'right',
    measures: [
      { id: 'elbow', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
      { id: 'wrist_speed', primitive: 'speed', mode: 'linear', point: 'right_wrist', expose: false },
    ],
    segmentation: { mode: 'discrete' },
    outputs: ['elbow'],
    ...overrides,
  } as Script
}

// ── Fixture: v1.1 script with two views ───────────────────────────────────
function makeV11Script(overrides: Partial<Script> = {}): Script {
  return {
    id: 'test_v11',
    version: '1.1.0',
    dsl_version: '1.1',
    discipline: 'archery',
    gesture: 'Armé',
    movement_type: 'finite',
    cv_model: 'blazepose-full@1.x',
    view: 'sagittal_right',
    measures: [],
    available_views: [
      {
        view: 'sagittal_right',
        priority: 1,
        primary: true,
        feasibility_2d: 'ok',
        side: 'right',
        measures: [
          { id: 'draw_elbow', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
          { id: 'trunk_lean', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'right_shoulder'], axis: 'vertical', expose: true },
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
    segmentation: { mode: 'discrete' },
    outputs: ['draw_elbow', 'trunk_lean', 'shoulder_level'],
    ...overrides,
  } as Script
}

// ── getViewLabel ───────────────────────────────────────────────────────────
describe('getViewLabel', () => {
  it('returns the French label by default', () => {
    expect(getViewLabel('sagittal_right')).toBe('Profil droit')
    expect(getViewLabel('frontal')).toBe('Face')
    expect(getViewLabel('overhead')).toBe('Plongée')
  })

  it('returns the English label when requested', () => {
    expect(getViewLabel('sagittal_right', 'en')).toBe('Right profile')
    expect(getViewLabel('overhead', 'en')).toBe('Overhead')
  })
})

// ── adaptV1ToV11 ───────────────────────────────────────────────────────────
describe('adaptV1ToV11', () => {
  it('wraps a v1.0 script into a single AvailableView', () => {
    const v1 = makeV1Script()
    const v11 = adaptV1ToV11(v1)

    expect(v11.dsl_version).toBe('1.1')
    expect(v11.available_views).toHaveLength(1)
    const view = v11.available_views![0]
    expect(view.view).toBe('sagittal_right')
    expect(view.priority).toBe(1)
    expect(view.primary).toBe(true)
    expect(view.feasibility_2d).toBe('ok')
    expect(view.measures).toHaveLength(2)
  })

  it('drops out_of_plane:true measures from the wrapped view (L-MV-7)', () => {
    const v1 = makeV1Script({
      measures: [
        { id: 'in_plane', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
        { id: 'out_plane', primitive: 'rotation', mode: 'orientation', points: ['right_shoulder', 'left_shoulder'], out_of_plane: true, expose: true },
      ],
    })
    const v11 = adaptV1ToV11(v1)
    const view = v11.available_views![0]
    expect(view.measures.map(m => m.id)).toEqual(['in_plane'])
    expect(view.feasibility_2d).toBe('limited')
  })

  it('is idempotent on a v1.1 script', () => {
    const v11 = makeV11Script()
    const round = adaptV1ToV11(v11)
    expect(round.available_views).toHaveLength(2)
    expect(round.dsl_version).toBe('1.1')
  })

  it('hydrates legacy top-level fields from the primary view', () => {
    const v11 = makeV11Script()
    const hydrated = adaptV1ToV11(v11)
    expect(hydrated.view).toBe('sagittal_right')
    expect(hydrated.measures.map(m => m.id)).toEqual(['draw_elbow', 'trunk_lean'])
    expect(hydrated.side).toBe('right')
  })
})

// ── getRecommendedView ─────────────────────────────────────────────────────
describe('getRecommendedView', () => {
  it('returns the primary view of a v1.1 script', () => {
    const v11 = makeV11Script()
    const view = getRecommendedView(v11)
    expect(view?.view).toBe('sagittal_right')
    expect(view?.primary).toBe(true)
  })

  it('falls back to the first entry if none is marked primary', () => {
    const v11 = makeV11Script()
    v11.available_views = v11.available_views!.map(v => ({ ...v, primary: false }))
    const view = getRecommendedView(v11)
    expect(view?.view).toBe('sagittal_right')
  })

  it('returns undefined when there are no available_views', () => {
    const v1 = makeV1Script()
    expect(getRecommendedView(v1)).toBeUndefined()
  })
})

// ── getAvailableViews ──────────────────────────────────────────────────────
describe('getAvailableViews', () => {
  it('returns views sorted by priority', () => {
    const v11 = makeV11Script()
    // Reverse the order in storage to test sorting
    v11.available_views = [...v11.available_views!].reverse()
    const views = getAvailableViews(v11)
    expect(views.map(v => v.priority)).toEqual([1, 2])
    expect(views[0].view).toBe('sagittal_right')
    expect(views[1].view).toBe('frontal')
  })

  it('returns an empty array for a v1.0 script', () => {
    const v1 = makeV1Script()
    expect(getAvailableViews(v1)).toEqual([])
  })
})

// ── getMeasuresForViews ────────────────────────────────────────────────────
describe('getMeasuresForViews', () => {
  it('returns measures only from the selected views', () => {
    const v11 = makeV11Script()
    const sagittalOnly = getMeasuresForViews(v11, ['sagittal_right'])
    expect(sagittalOnly.map(m => m.id)).toEqual(['draw_elbow', 'trunk_lean'])

    const frontalOnly = getMeasuresForViews(v11, ['frontal'])
    expect(frontalOnly.map(m => m.id)).toEqual(['shoulder_level'])
  })

  it('returns the union of measures across all selected views, deduplicated', () => {
    const v11 = makeV11Script()
    const both = getMeasuresForViews(v11, ['sagittal_right', 'frontal'])
    expect(both.map(m => m.id)).toEqual(['draw_elbow', 'trunk_lean', 'shoulder_level'])
  })

  it('returns an empty array when no view is selected', () => {
    const v11 = makeV11Script()
    expect(getMeasuresForViews(v11, [])).toEqual([])
  })

  it('falls back to legacy script.measures for v1.0 scripts', () => {
    const v1 = makeV1Script()
    expect(getMeasuresForViews(v1, ['sagittal_right']).map(m => m.id)).toEqual(['elbow', 'wrist_speed'])
  })
})

// ── lintScript (v1.1 path) ─────────────────────────────────────────────────
describe('lintScript — v1.1 rules', () => {
  it('accepts a well-formed v1.1 script', () => {
    const v11 = makeV11Script()
    expect(lintScript(v11)).toEqual([])
  })

  it('L-MV-1: rejects empty available_views', () => {
    const v11 = makeV11Script({ available_views: [] })
    const errors = lintScript(v11)
    expect(errors.some(e => e.message.includes('L-MV-1'))).toBe(true)
  })

  it('L-MV-2: rejects more than 3 views', () => {
    const base = makeV11Script()
    const v11 = {
      ...base,
      available_views: [
        ...base.available_views!,
        { view: 'oblique_right', priority: 3, primary: false, feasibility_2d: 'ok' as const, measures: [{ id: 'x', primitive: 'angle', mode: 'joint', points: ['right_hip', 'right_knee', 'right_ankle'], expose: true }] },
        { view: 'overhead', priority: 4, primary: false, feasibility_2d: 'ok' as const, measures: [{ id: 'y', primitive: 'position', mode: 'amplitude', point: 'hip_center', axis: 'x', expose: true }] },
      ],
    }
    const errors = lintScript(v11)
    expect(errors.some(e => e.message.includes('L-MV-2'))).toBe(true)
  })

  it('L-MV-5: rejects scripts with zero or multiple primaries', () => {
    const v11 = makeV11Script()
    v11.available_views = v11.available_views!.map(v => ({ ...v, primary: true }))
    const errors = lintScript(v11)
    expect(errors.some(e => e.message.includes('L-MV-5'))).toBe(true)
  })

  it('L-MV-6: rejects when primary is not priority 1', () => {
    const v11 = makeV11Script()
    v11.available_views = [
      { ...v11.available_views![0], primary: false },
      { ...v11.available_views![1], primary: true },
    ]
    const errors = lintScript(v11)
    expect(errors.some(e => e.message.includes('L-MV-6'))).toBe(true)
  })

  it('L-MV-7: rejects out_of_plane:true inside a view', () => {
    const v11 = makeV11Script()
    v11.available_views![0].measures[0].out_of_plane = true
    const errors = lintScript(v11)
    expect(errors.some(e => e.message.includes('L-MV-7'))).toBe(true)
  })

  it('L-MV-11: rejects sagittal_left + sagittal_right combo', () => {
    const v11 = makeV11Script()
    v11.available_views = [
      { ...v11.available_views![0], view: 'sagittal_right' },
      { ...v11.available_views![1], view: 'sagittal_left' },
    ]
    const errors = lintScript(v11)
    expect(errors.some(e => e.message.includes('L-MV-11'))).toBe(true)
  })
})
