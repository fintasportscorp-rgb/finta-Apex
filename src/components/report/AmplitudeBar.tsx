// Aurora amplitude bar — gradient fill with subtle glow proportional to deviation
// Monochrome intensity scale (no red/green semantics)
import { useTranslation } from 'react-i18next'

interface AmplitudeBarProps {
  value: number
  maxValue: number
  label: string
  unit?: string
  withinEnvelope?: boolean
}

export function AmplitudeBar({ value, maxValue, label, unit, withinEnvelope }: AmplitudeBarProps) {
  const { t } = useTranslation()
  const fraction = Math.min(Math.abs(value) / (maxValue || 1), 1)
  const sign = value >= 0 ? '+' : ''

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: '8px 0',
    }}>
      {/* Label */}
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 11,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        width: 110,
        flexShrink: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>

      {/* Bar track */}
      <div style={{
        flex: 1,
        height: 10,
        background: 'var(--glass-1)',
        border: '1px solid var(--glass-edge-faint)',
        borderRadius: 'var(--radius-pill)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${fraction * 100}%`,
          height: '100%',
          background: `linear-gradient(90deg,
            rgba(124,241,249,${0.35 + fraction * 0.35}) 0%,
            rgba(97,206,214,${0.35 + fraction * 0.45}) 100%)`,
          borderRadius: 'var(--radius-pill)',
          transition: 'width 0.6s var(--ease-fluid)',
          boxShadow: `0 0 ${8 + fraction * 16}px rgba(124,241,249,${0.25 + fraction * 0.35})`,
        }} />
      </div>

      {/* Value */}
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 12,
        color: 'var(--ink-1)',
        width: 64,
        textAlign: 'right',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
      }}>
        {sign}{value.toFixed(1)}{unit ? <span style={{ color: 'var(--ink-3)', marginLeft: 3, fontSize: 10 }}> {unit}</span> : ''}
      </span>

      {/* Envelope chip */}
      {withinEnvelope !== undefined && (
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: withinEnvelope ? 'var(--accent-3)' : 'var(--accent-warn)',
          border: `1px solid ${withinEnvelope ? 'rgba(70,172,179,0.4)' : 'rgba(124,241,249,0.4)'}`,
          background: withinEnvelope ? 'rgba(70,172,179,0.08)' : 'rgba(124,241,249,0.08)',
          borderRadius: 'var(--radius-pill)',
          padding: '2px 8px',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          {withinEnvelope ? t('analysis.within_envelope') : t('analysis.outside_envelope')}
        </span>
      )}
    </div>
  )
}
