import type { MeasureResult } from '../../engine/types'
import { getMeasureLabel } from '../../lib/script-translations'

interface HUDReadoutProps {
  measures: MeasureResult[]
  lang?: 'fr' | 'en'
}

export function HUDReadout({ measures, lang = 'fr' }: HUDReadoutProps) {
  if (measures.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      bottom: 72,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(480px, calc(100% - 16px))',
      padding: '8px 12px',
      background: 'rgba(2, 13, 14, 0.45)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 'var(--radius-lg)',
      backdropFilter: 'blur(16px) saturate(120%)',
      WebkitBackdropFilter: 'blur(16px) saturate(120%)',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
      gap: '6px 10px',
      color: 'var(--ink-1)',
      pointerEvents: 'none',
    }}>
      {measures.map((m, i) => {
        const latest = m.series[m.series.length - 1]
        if (!latest) return null
        const val = latest.value.toFixed(m.unit === 'TL/s' ? 2 : 1)
        const accentColor = i % 3 === 0 ? '#7cf1f9' : i % 3 === 1 ? '#61ced6' : '#46acb3'
        return (
          <div key={m.id} style={{
            opacity: latest.reliable ? 0.9 : 0.35,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minWidth: 0,
          }}>
            <span style={{
              fontFamily: 'var(--font-data)',
              fontSize: 8,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(181,216,219,0.45)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {getMeasureLabel(m.id, lang)}
            </span>
            <span style={{
              fontFamily: 'var(--font-data)',
              fontSize: 15,
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              color: accentColor,
              lineHeight: 1.15,
              opacity: 0.85,
            }}>
              {val}
              {m.unit && (
                <span style={{ color: 'rgba(181,216,219,0.4)', marginLeft: 3, fontSize: 9 }}>
                  {m.unit}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
