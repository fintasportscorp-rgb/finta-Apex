import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ViewPicker } from '../components/capture/ViewPicker'
import { addScript } from '../lib/scripts'
import type { Script } from '../lib/scripts'

// Minimal i18n mock
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'fr' },
  }),
}))

const TWO_VIEW_SCRIPT: Script = {
  id: 'pick_two_views',
  version: '1.1.0',
  dsl_version: '1.1',
  discipline: 'archery',
  gesture: 'Armé test',
  movement_type: 'finite',
  cv_model: 'blazepose-full@1.x',
  view: 'sagittal_right',
  measures: [],
  available_views: [
    {
      view: 'sagittal_right',
      priority: 1,
      primary: true,
      rationale_fr: 'Vue de référence pour le draw.',
      feasibility_2d: 'ok',
      side: 'right',
      measures: [
        { id: 'draw_elbow', primitive: 'angle', mode: 'joint', points: ['right_shoulder', 'right_elbow', 'right_wrist'], expose: true },
      ],
    },
    {
      view: 'frontal',
      priority: 2,
      primary: false,
      rationale_fr: 'Symétrie épaules en complément.',
      feasibility_2d: 'ok',
      side: 'both',
      measures: [
        { id: 'shoulder_level', primitive: 'angle', mode: 'segment_axis', points: ['right_shoulder', 'left_shoulder'], axis: 'horizontal', expose: true },
      ],
    },
  ],
  segmentation: { mode: 'discrete' },
  outputs: ['draw_elbow', 'shoulder_level'],
}

const THREE_VIEW_SCRIPT: Script = {
  ...TWO_VIEW_SCRIPT,
  id: 'pick_three_views',
  available_views: [
    ...TWO_VIEW_SCRIPT.available_views!,
    {
      view: 'posterior',
      priority: 3,
      primary: false,
      rationale_fr: 'Vue dorsale pour contrôle alignement.',
      feasibility_2d: 'ok',
      measures: [
        { id: 'spine_alignment', primitive: 'angle', mode: 'segment_axis', points: ['hip_center', 'shoulder_center'], axis: 'vertical', expose: true },
      ],
    },
  ],
}

const FOUR_VIEW_SCRIPT: Script = {
  ...TWO_VIEW_SCRIPT,
  id: 'pick_four_views',
  available_views: [
    ...THREE_VIEW_SCRIPT.available_views!,
    {
      view: 'overhead',
      priority: 4,
      primary: false,
      rationale_fr: '4ème vue pour test cap.',
      feasibility_2d: 'ok',
      measures: [
        { id: 'cog_x', primitive: 'position', mode: 'amplitude', point: 'hip_center', axis: 'x', expose: true },
      ],
    },
  ],
}

// Helper that captures the current location so we can assert URL navigation.
let lastLocation = { pathname: '', search: '' }
function LocationProbe() {
  const loc = useLocation()
  lastLocation = { pathname: loc.pathname, search: loc.search }
  return null
}

function renderPicker(scriptId: string) {
  return render(
    <MemoryRouter initialEntries={[`/picker/${scriptId}`]}>
      <Routes>
        <Route path="/picker/:scriptId" element={<><ViewPicker /><LocationProbe /></>} />
        <Route path="/capture/:scriptId" element={<LocationProbe />} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ViewPicker', () => {
  beforeEach(() => {
    addScript(TWO_VIEW_SCRIPT)
    addScript(THREE_VIEW_SCRIPT)
    addScript(FOUR_VIEW_SCRIPT)
    lastLocation = { pathname: '', search: '' }
  })

  it('renders one option per available view', () => {
    renderPicker('pick_two_views')
    expect(screen.getByTestId('view-option-sagittal_right')).toBeDefined()
    expect(screen.getByTestId('view-option-frontal')).toBeDefined()
  })

  it('preselects the primary view by default', () => {
    renderPicker('pick_two_views')
    const primary = screen.getByTestId('view-option-sagittal_right')
    expect(primary.getAttribute('aria-pressed')).toBe('true')
    const secondary = screen.getByTestId('view-option-frontal')
    expect(secondary.getAttribute('aria-pressed')).toBe('false')
  })

  it('selecting a secondary view replaces the primary selection (single-select)', () => {
    renderPicker('pick_two_views')
    const primary = screen.getByTestId('view-option-sagittal_right')
    const secondary = screen.getByTestId('view-option-frontal')
    fireEvent.click(secondary)
    expect(secondary.getAttribute('aria-pressed')).toBe('true')
    expect(primary.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking the primary again brings it back as the selected view', () => {
    renderPicker('pick_two_views')
    const primary = screen.getByTestId('view-option-sagittal_right')
    const secondary = screen.getByTestId('view-option-frontal')
    fireEvent.click(secondary)
    fireEvent.click(primary)
    expect(primary.getAttribute('aria-pressed')).toBe('true')
    expect(secondary.getAttribute('aria-pressed')).toBe('false')
  })

  it('exposes radio semantics (role + aria-checked) on each option', () => {
    renderPicker('pick_two_views')
    const primary = screen.getByTestId('view-option-sagittal_right')
    expect(primary.getAttribute('role')).toBe('radio')
    expect(primary.getAttribute('aria-checked')).toBe('true')
    const secondary = screen.getByTestId('view-option-frontal')
    expect(secondary.getAttribute('aria-checked')).toBe('false')
  })

  it('navigates to /capture with the chosen view in the querystring on confirm', () => {
    renderPicker('pick_two_views')
    fireEvent.click(screen.getByTestId('view-option-frontal'))
    fireEvent.click(screen.getByText('Démarrer la capture'))
    expect(lastLocation.pathname).toBe('/capture/pick_two_views')
    const search = decodeURIComponent(lastLocation.search)
    expect(search).toBe('?views=frontal')
  })

  it('uses the primary view in the URL when the user confirms without changing the selection', () => {
    renderPicker('pick_three_views')
    fireEvent.click(screen.getByText('Démarrer la capture'))
    const search = decodeURIComponent(lastLocation.search)
    expect(search).toBe('?views=sagittal_right')
  })

  it('redirects to /capture for scripts with no available_views (v1.0)', () => {
    const legacy: Script = {
      ...TWO_VIEW_SCRIPT,
      id: 'pick_legacy',
      dsl_version: '1.0',
      available_views: undefined,
    }
    addScript(legacy)
    renderPicker('pick_legacy')
    expect(lastLocation.pathname).toBe('/capture/pick_legacy')
  })
})
