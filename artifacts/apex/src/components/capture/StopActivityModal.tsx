import { useTranslation } from 'react-i18next'

interface StopActivityModalProps {
  onResume: () => void
  onViewData: () => void
}

export function StopActivityModal({ onResume, onViewData }: StopActivityModalProps) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(2,13,14,0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end',
        zIndex: 200,
        animation: 'fade-in 220ms var(--ease-out) both',
      }}
      onClick={onResume}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--glass-3)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: 'var(--space-6) var(--space-4) calc(var(--space-8) + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          border: '1px solid var(--glass-edge-strong)',
          borderBottom: 'none',
          backdropFilter: 'var(--glass-blur-strong)',
          WebkitBackdropFilter: 'var(--glass-blur-strong)',
          boxShadow: '0 -20px 60px -20px rgba(0,0,0,0.6), 0 -2px 0 rgba(255,255,255,0.06) inset',
          animation: 'slide-up 320ms var(--ease-fluid) both',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{
          width: 44, height: 4,
          background: 'var(--glass-edge-strong)',
          borderRadius: 'var(--radius-pill)',
          margin: '0 auto var(--space-3)',
        }} />

        <p style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--text-xl)',
          color: 'var(--ink-1)',
          marginBottom: 'var(--space-1)',
          letterSpacing: '-0.02em',
        }}>
          {t('activity.stop_modal_title')}
        </p>
        <button onClick={onViewData} className="btn btn-primary" style={{ width: '100%', minHeight: 52, fontSize: 15 }}>
          {t('activity.view_data')}
          <span style={{ fontSize: 18 }}>→</span>
        </button>
        <button onClick={onResume} className="btn btn-secondary" style={{ width: '100%', minHeight: 52, fontSize: 15 }}>
          {t('activity.resume')}
        </button>
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slide-up { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  )
}

