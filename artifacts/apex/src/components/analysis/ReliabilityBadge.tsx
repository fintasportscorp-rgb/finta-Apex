import { useTranslation } from 'react-i18next'

interface ReliabilityBadgeProps {
  fractionReliable: number
  outOfPlane?: boolean
}

// Spec-08 §C: hatch pattern + label — never a colour-coded semantic meaning.
// Aurora theme uses amber (attention, never red/green).
export function ReliabilityBadge({ fractionReliable, outOfPlane = false }: ReliabilityBadgeProps) {
  const { t } = useTranslation()
  if (fractionReliable >= 0.7 && !outOfPlane) return null

  return (
    <span
      title={t('analysis.reliability_fraction', { pct: (fractionReliable * 100).toFixed(0) })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid rgba(124,241,249,0.35)',
        fontFamily: 'var(--font-data)',
        fontSize: 9,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--accent-warn)',
        backgroundImage: outOfPlane
          ? 'none'
          : 'repeating-linear-gradient(45deg, rgba(124,241,249,0.18) 0px, rgba(124,241,249,0.18) 1px, transparent 1px, transparent 4px)',
        background: outOfPlane ? 'rgba(124,241,249,0.08)' : undefined,
      }}
    >
      {outOfPlane ? t('analysis.out_of_plane') : t('analysis.reliability_low')}
    </span>
  )
}
