import { useTranslation } from 'react-i18next'

interface GuidancePillsProps {
  viewOk: boolean
  subjectClose: boolean
}

export function GuidancePills({ viewOk, subjectClose }: GuidancePillsProps) {
  const { t } = useTranslation()
  const pills: Array<{ label: string; attention: boolean }> = []

  if (viewOk) {
    pills.push({ label: t('capture.guidance_ok'), attention: false })
  }
  if (subjectClose) {
    pills.push({ label: t('capture.guidance_close'), attention: true })
  }

  if (pills.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      top: 'var(--space-3)',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 'var(--space-2)',
      pointerEvents: 'none',
    }}>
      {pills.map(pill => (
        <span
          key={pill.label}
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            borderRadius: 'var(--radius-pill)',
            background: pill.attention ? 'rgba(124,241,249,0.18)' : 'rgba(2,13,14,0.65)',
            border: `1px solid ${pill.attention ? 'rgba(124,241,249,0.6)' : 'rgba(255,255,255,0.15)'}`,
            color: pill.attention ? 'var(--accent-warn)' : 'var(--ink-2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: pill.attention ? '0 0 20px rgba(124,241,249,0.4)' : '0 8px 16px -8px rgba(0,0,0,0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: pill.attention ? 'var(--accent-warn)' : 'var(--accent-3)',
            boxShadow: `0 0 8px ${pill.attention ? '#7cf1f9' : '#46acb3'}`,
          }} />
          {pill.label}
        </span>
      ))}
    </div>
  )
}
