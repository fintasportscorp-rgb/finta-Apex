import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import { DataView } from '../components/capture/DataView'
import type { ViewType } from '../lib/scripts'
import type { Sequence } from '../lib/export'
import type { Script } from '../lib/scripts'
import { getMeasureLabel } from '../lib/script-translations'

// Minimal i18n mock
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { n?: number; count?: number }) => {
      if (opts?.n != null) return `${key} ${opts.n}`
      if (opts?.count != null) return `${key} ${opts.count}`
      return key
    },
    i18n: { language: 'fr' },
  }),
}))

const MULTI_VIEW_SCRIPT: Script = {
  id: 'test_multi_view',
  version: '1.1.0',
  dsl_version: '1.1',
  discipline: 'archery',
  gesture: 'Armé',
  movement_type: 'finite',
  cv_model: 'blazepose-full@1.x',
  view: 'sagittal_right',
  measures: [
    { id: 'draw_elbow', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
    { id: 'trunk_lean', primitive: 'angle', mode: 'segment_axis', points: ['right_hip', 'right_shoulder'], axis: 'vertical', expose: true },
  ],
  available_views: [
    {
      view: 'sagittal_right',
      priority: 1,
      primary: true,
      feasibility_2d: 'ok',
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
      measures: [
        { id: 'shoulder_level', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
      ],
    },
  ],
  segmentation: { mode: 'discrete' },
  outputs: ['draw_elbow', 'trunk_lean', 'shoulder_level'],
}

// One mock sequence with one instance carrying all three measures (as if recorded across views).
function makeMockSequence(): Sequence {
  return {
    sequence_id: 'seq_1',
    script_id: MULTI_VIEW_SCRIPT.id,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    inputs: [],
    instances: [
      {
        gesture_index: 0,
        measures: [
          {
            id: 'draw_elbow',
            unit: 'deg',
            series: [{ t: 0, value: 90, reliable: true }, { t: 1, value: 100, reliable: true }],
            summary: { min: 90, max: 100, mean: 95, sd: 5, range: 10, peak: 100, t_peak: 1 },
            reliability: { fraction_reliable: 1, out_of_plane: false, reasons: [] },
          },
          {
            id: 'trunk_lean',
            unit: 'deg',
            series: [{ t: 0, value: 5, reliable: true }],
            summary: { min: 5, max: 5, mean: 5, sd: 0, range: 0, peak: 5, t_peak: 0 },
            reliability: { fraction_reliable: 1, out_of_plane: false, reasons: [] },
          },
          {
            id: 'shoulder_level',
            unit: 'deg',
            series: [{ t: 0, value: 1, reliable: true }],
            summary: { min: 1, max: 1, mean: 1, sd: 0, range: 0, peak: 1, t_peak: 0 },
            reliability: { fraction_reliable: 1, out_of_plane: false, reasons: [] },
          },
        ],
      },
    ],
  } as unknown as Sequence
}

// Small harness: simulates the CaptureScreen's parent state for activeViewIdx.
function DataViewHarness(props: { selectedViews: ViewType[]; initialIdx?: number }) {
  const { selectedViews, initialIdx = 0 } = props
  const [idx, setIdx] = useState(initialIdx)
  const activeView = selectedViews[idx]
  const isLastPass = idx >= selectedViews.length - 1
  return (
    <DataView
      sequences={[makeMockSequence()]}
      selectedSeqIdx={0}
      onSelectSeq={() => {}}
      intraRefSeqId={null}
      onSetIntraRef={() => {}}
      script={MULTI_VIEW_SCRIPT}
      onResume={() => {}}
      selectedViews={selectedViews}
      activeView={activeView}
      isLastPass={isLastPass}
      onAdvanceView={() => setIdx(i => Math.min(i + 1, selectedViews.length - 1))}
    />
  )
}

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={ui} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DataView multi-pass banner', () => {
  it('hides the banner when only one view is selected', () => {
    renderWithRouter(<DataViewHarness selectedViews={['sagittal_right']} />)
    expect(screen.queryByTestId('multipass-banner')).toBeNull()
  })

  it('shows the banner for multi-view captures', () => {
    renderWithRouter(<DataViewHarness selectedViews={['sagittal_right', 'frontal']} />)
    const banner = screen.getByTestId('multipass-banner')
    expect(banner).toBeDefined()
    expect(banner.textContent).toContain('Passe 1/2')
    expect(banner.textContent).toContain('Profil droit')
  })

  it('exposes the advance button on non-last passes and advances on click', () => {
    renderWithRouter(<DataViewHarness selectedViews={['sagittal_right', 'frontal']} />)
    const advance = screen.getByTestId('advance-view-button')
    fireEvent.click(advance)
    // After advance, banner should show "Passe 2/2" and the advance button disappears.
    expect(screen.getByTestId('multipass-banner').textContent).toContain('Passe 2/2')
    expect(screen.queryByTestId('advance-view-button')).toBeNull()
    expect(screen.getByText(/Dernière vue/i)).toBeDefined()
  })

  it('hides the advance button when starting on the last pass', () => {
    renderWithRouter(<DataViewHarness selectedViews={['sagittal_right', 'frontal']} initialIdx={1} />)
    expect(screen.queryByTestId('advance-view-button')).toBeNull()
    expect(screen.getByText(/Dernière vue/i)).toBeDefined()
  })
})

describe('DataView measure filtering', () => {
  // MeasureChart renders the French label via getMeasureLabel (default lang='fr').
  const labelOf = (id: string) => new RegExp(getMeasureLabel(id, 'fr'), 'i')

  it('lists only the measures of the selected views (filter sagittal_right alone)', () => {
    renderWithRouter(<DataViewHarness selectedViews={['sagittal_right']} />)
    // sagittal_right view contains draw_elbow and trunk_lean only.
    // shoulder_level lives in the frontal view, so it must not render.
    expect(screen.queryAllByText(labelOf('draw_elbow')).length).toBeGreaterThan(0)
    expect(screen.queryByText(labelOf('shoulder_level'))).toBeNull()
  })

  it('includes frontal measures when both views are selected', () => {
    renderWithRouter(<DataViewHarness selectedViews={['sagittal_right', 'frontal']} />)
    expect(screen.queryAllByText(labelOf('draw_elbow')).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(labelOf('shoulder_level')).length).toBeGreaterThan(0)
  })
})
