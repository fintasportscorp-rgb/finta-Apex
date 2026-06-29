// Label + value in IBM Plex Mono — used in HUD and analysis tables.
// Aurora theme: dim label, luminous value.
interface ReadoutProps {
  label: string
  value: string
  unit?: string
  dim?: boolean
}

export function Readout({ label, value, unit, dim = false }: ReadoutProps) {
  return (
    <div style={{ opacity: dim ? 0.5 : 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 'var(--text-sm)',
        color: 'var(--ink-1)',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
      }}>
        {value}
        {unit && (
          <span style={{ color: 'var(--ink-3)', marginLeft: 3, fontSize: 10 }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}
