import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

type Phase = 'READY' | 'RECORDING'

interface CaptureDockProps {
  phase: Phase
  onRecord: () => void
  onStop: () => void
  onStopActivity: () => void
}

export function CaptureDock({ phase, onRecord, onStop, onStopActivity }: CaptureDockProps) {
  const { t } = useTranslation()
  const recording = phase === 'RECORDING'

  return (
    <div style={{
      position: 'relative',
      padding: 'var(--space-3) var(--space-4) var(--space-4)',
      background: 'linear-gradient(180deg, transparent 0%, rgba(2,13,14,0.6) 60%, rgba(2,13,14,0.9) 100%)',
      flexShrink: 0,
    }}>
      <div style={{
        margin: '0 auto',
        maxWidth: 540,
        padding: 8,
        background: 'rgba(2,13,14,0.55)',
        border: `1px solid ${recording ? 'rgba(42,139,146,0.5)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 'var(--radius-pill)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        boxShadow: recording
          ? '0 12px 32px -10px rgba(0,0,0,0.55), 0 0 36px rgba(42,139,146,0.35)'
          : 'var(--shadow-float)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        transition: 'border-color var(--dur-base), box-shadow var(--dur-base)',
      }}>
        {recording ? (
          <>
            <span style={pulseDot} />
            <button onClick={onStop} style={btn('secondary')}>
              {t('capture.stop')}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={onStopActivity} style={btn('ghost')}>
              {t('capture.stop_activity')}
            </button>
          </>
        ) : (
          <>
            <button onClick={onRecord} style={btn('accent')}>
              <span style={recordDot} />
              {t('capture.record')}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={onStopActivity} style={btn('ghost')}>
              {t('capture.stop_activity')}
            </button>
          </>
        )}
      </div>

      {recording && (
        <style>{`@keyframes dockpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(0.7)}}`}</style>
      )}
    </div>
  )
}

const recordDot: CSSProperties = {
  display: 'inline-block', width: 8, height: 8,
  borderRadius: '50%', background: 'white',
  boxShadow: '0 0 12px white',
}

const pulseDot: CSSProperties = {
  display: 'inline-block', width: 10, height: 10,
  borderRadius: '50%', background: 'var(--accent-pink)',
  boxShadow: '0 0 18px var(--accent-pink)',
  animation: 'dockpulse 1.4s ease-in-out infinite',
  flexShrink: 0,
}

function btn(v: 'accent' | 'secondary' | 'ghost'): CSSProperties {
  const base: CSSProperties = {
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 18px',
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    minHeight: 40,
    border: '1px solid transparent',
    transition: 'all var(--dur-fast) var(--ease-out)',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  }
  if (v === 'accent') return {
    ...base,
    background: 'linear-gradient(135deg, #7cf1f9 0%, #076b72 100%)',
    color: 'white',
    boxShadow: '0 6px 18px -6px rgba(7,107,114,0.7), 0 0 24px rgba(124,241,249,0.45)',
  }
  if (v === 'secondary') return {
    ...base,
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--ink-1)',
    borderColor: 'rgba(255,255,255,0.12)',
  }
  return { ...base, background: 'transparent', color: 'var(--ink-3)', padding: '10px 14px' }
}
