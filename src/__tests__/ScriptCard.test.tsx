import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ScriptCard } from '../components/catalogue/ScriptCard'
import { getSportMeta } from '../components/catalogue/sportMeta'
import type { Script } from '../lib/scripts'

// Minimal i18n mock
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'fr' },
  }),
}))

const finiteScript: Script = {
  id: 'test_finite',
  version: '1.0.0',
  dsl_version: '1.0',
  discipline: 'tennis',
  gesture: 'Service test',
  movement_type: 'finite',
  cv_model: 'blazepose-full@1.x',
  view: 'sagittal_right',
  side: 'right',
  measures: [],
  segmentation: { mode: 'discrete' },
  outputs: [],
}


function renderCard(script: Script, validated = false) {
  const sportMeta = getSportMeta(script.discipline)
  return render(
    <MemoryRouter>
      <ScriptCard script={script} sportMeta={sportMeta} validated={validated} />
    </MemoryRouter>
  )
}

describe('ScriptCard', () => {
  it('renders gesture name', () => {
    renderCard(finiteScript)
    expect(screen.getByText('Service test')).toBeDefined()
  })

  it('shows the view label', () => {
    renderCard(finiteScript)
    expect(screen.getByText('Profil droit')).toBeDefined()
  })
})
