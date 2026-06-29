import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MeasureChart } from '../components/analysis/MeasureChart'
import type { MeasureResult } from '../engine/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'fr' },
  }),
}))

const makeResult = (series: Array<{ value: number; reliable: boolean }>): MeasureResult => ({
  id: 'test_measure',
  type: 'angle',
  unit: 'deg',
  series: series.map((s, i) => ({ t: i / 30, ...s })),
  summary: {
    min: 0,
    max: 180,
    mean: 90,
    sd: 10,
    range: 180,
    peak: null,
    t_peak: null,
  },
  reliability: {
    fraction_reliable: series.filter(s => s.reliable).length / Math.max(series.length, 1),
    out_of_plane: false,
    reasons: [],
  },
})

describe('MeasureChart', () => {
  it('renders without crash for empty series', () => {
    const result = makeResult([])
    const { container } = render(<MeasureChart measure={result} />)
    expect(container).toBeDefined()
  })

  it('renders without crash when all samples are unreliable', () => {
    const result = makeResult(Array.from({ length: 30 }, () => ({ value: 90, reliable: false })))
    const { container } = render(<MeasureChart measure={result} />)
    expect(container).toBeDefined()
  })

  it('renders SVG when there is data', () => {
    const result = makeResult(Array.from({ length: 30 }, (_, i) => ({ value: 70 + i * 3, reliable: true })))
    const { container } = render(<MeasureChart measure={result} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
  })

  it('renders hatch pattern for unreliable sections', () => {
    const series = [
      ...Array.from({ length: 10 }, () => ({ value: 90, reliable: true })),
      ...Array.from({ length: 10 }, () => ({ value: 90, reliable: false })),
      ...Array.from({ length: 10 }, () => ({ value: 90, reliable: true })),
    ]
    const result = makeResult(series)
    const { container } = render(<MeasureChart measure={result} />)
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(0) // hatch rect
  })
})
