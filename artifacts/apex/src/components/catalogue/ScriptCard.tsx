import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Script, ViewType } from '../../lib/scripts'
import { getAvailableViews, getViewLabel } from '../../lib/scripts'
import { useNavigate, useParams } from 'react-router-dom'
import { SportIcon } from './SportIcon'
import { ACCENT_COLORS } from './sportMeta'
import type { SportMeta } from './sportMeta'
import { getGestureLabel } from '../../lib/script-translations'

interface ScriptCardProps {
  script: Script
  sportMeta: SportMeta
  validated?: boolean
  index?: number
  isUserScript?: boolean
  onDelete?: () => void
}

function cleanLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

export function ScriptCard({ script, sportMeta, validated = false, index = 0, isUserScript = false, onDelete }: ScriptCardProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { lang: urlLang } = useParams<{ lang?: string }>()
  const [hovered, setHovered] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const accent = ACCENT_COLORS[sportMeta.accent]
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'

  const availableViews = getAvailableViews(script)
  const viewEntries: Array<{ view: ViewType; primary: boolean }> = availableViews.length > 0
    ? availableViews.map(v => ({ view: v.view, primary: v.primary === true }))
    : [{ view: script.view, primary: true }]

  const activeLang = urlLang ?? lang
  const gesture = script.id.slice(script.discipline.length + 1)
  const targetRoute = `/${activeLang}/app/${script.discipline}/${gesture}/capture`

  const delayClass =
    index % 4 === 0 ? 'rise-in' :
    index % 4 === 1 ? 'rise-in-delay-1' :
    index % 4 === 2 ? 'rise-in-delay-2' : 'rise-in-delay-3'

  const handleDownload = () => {
    const json = JSON.stringify(script, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${script.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const actionBtnBase: React.CSSProperties = {
    width: 28, height: 28,
    borderRadius: '50%',
    border: '1px solid var(--glass-edge)',
    background: 'var(--glass-1)',
    color: 'var(--ink-3)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    flexShrink: 0,
    transition: 'all var(--dur-fast) var(--ease-out)',
  }

  return (
    <div
      className={delayClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false) }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: hovered ? 'var(--glass-3)' : 'var(--glass-2)',
        border: `1px solid ${hovered ? accent.glow : 'var(--glass-edge)'}`,
        borderRadius: 'var(--radius-lg)',
        textAlign: 'left',
        width: '100%',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: hovered
          ? `0 18px 40px -16px rgba(0,0,0,0.5), 0 0 32px ${accent.glow}`
          : 'var(--shadow-glass)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all var(--dur-base) var(--ease-fluid)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 168,
        boxSizing: 'border-box',
      }}
    >
      {/* Accent halo */}
      <span style={{
        position: 'absolute',
        top: -50, right: -50,
        width: 160, height: 160,
        background: 'radial-gradient(circle, rgba(124,241,249,0.18) 0%, transparent 70%)',
        opacity: hovered ? 1 : 0.4,
        transition: 'opacity var(--dur-base) var(--ease-out)',
        pointerEvents: 'none',
      }} />

      {/* Main clickable area */}
      <div
        role="button"
        tabIndex={0}
        aria-label={cleanLabel(getGestureLabel(script.id, script.gesture, lang))}
        onClick={() => navigate(targetRoute)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(targetRoute) }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1, cursor: 'pointer' }}
      >
        {/* Top row — sport icon + view badges + validated mark */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1,
        }}>
          <span style={{
            color: 'var(--accent-1)',
            filter: 'drop-shadow(0 0 6px rgba(124,241,249,0.45))',
            display: 'inline-flex',
          }}>
            <SportIcon name={sportMeta.icon} size={28} strokeWidth={1.5} />
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
            {viewEntries.map(({ view, primary }) => (
              <span
                key={view}
                title={primary ? (lang === 'fr' ? 'Vue principale' : 'Primary view') : (lang === 'fr' ? 'Vue secondaire' : 'Secondary view')}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 9,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: primary ? 'var(--accent-1)' : 'var(--ink-3)',
                  padding: '3px 9px',
                  background: primary ? 'rgba(124,241,249,0.10)' : 'var(--glass-1)',
                  border: `1px solid ${primary ? 'rgba(124,241,249,0.35)' : 'var(--glass-edge)'}`,
                  borderRadius: 'var(--radius-pill)',
                  fontWeight: primary ? 600 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {getViewLabel(view, lang)}
              </span>
            ))}
          </div>
        </div>

        {/* Title */}
        <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--ink-1)',
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
          }}>
            {cleanLabel(getGestureLabel(script.id, script.gesture, lang))}
          </p>
        </div>

        {/* Bottom row — chevron */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          width: '100%',
          position: 'relative',
          zIndex: 1,
        }}>
          <span style={{
            width: 28, height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: hovered ? 'var(--accent-1)' : 'var(--glass-2)',
            color: hovered ? 'var(--void)' : 'var(--ink-2)',
            fontSize: 14,
            fontWeight: 600,
            transform: hovered ? 'translateX(2px)' : 'translateX(0)',
            transition: 'all var(--dur-base) var(--ease-back)',
            boxShadow: hovered ? '0 0 18px rgba(124,241,249,0.45)' : 'none',
          }}>
            →
          </span>
        </div>
      </div>

      {/* Action strip — user-created scripts only */}
      {isUserScript && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            borderTop: '1px solid var(--glass-edge)',
            paddingTop: 'var(--space-2)',
            display: 'flex',
            gap: 6,
            justifyContent: 'flex-end',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* Edit */}
          <button
            onClick={() => navigate(`/${activeLang}/builder/${script.id}`)}
            title={lang === 'fr' ? 'Modifier' : 'Edit'}
            style={actionBtnBase}
          >✏</button>

          {/* Download */}
          <button
            onClick={handleDownload}
            title={lang === 'fr' ? 'Télécharger' : 'Download'}
            style={actionBtnBase}
          >↓</button>

          {/* Delete with 2-step confirm */}
          <button
            onClick={() => confirmDelete ? onDelete?.() : setConfirmDelete(true)}
            title={lang === 'fr'
              ? (confirmDelete ? 'Confirmer la suppression' : 'Supprimer')
              : (confirmDelete ? 'Confirm delete' : 'Delete')}
            style={{
              ...actionBtnBase,
              width: confirmDelete ? 'auto' : 28,
              padding: confirmDelete ? '0 10px' : '0',
              borderRadius: confirmDelete ? 'var(--radius-pill)' : '50%',
              border: `1px solid ${confirmDelete ? 'rgba(255,90,90,0.5)' : 'var(--glass-edge)'}`,
              background: confirmDelete ? 'rgba(255,90,90,0.15)' : 'var(--glass-1)',
              color: confirmDelete ? '#ff6b6b' : 'var(--ink-3)',
              fontSize: confirmDelete ? 10 : 13,
              letterSpacing: confirmDelete ? '0.04em' : '0',
            }}
          >
            {confirmDelete
              ? (lang === 'fr' ? '✓ Confirmer' : '✓ Confirm')
              : '✕'}
          </button>
        </div>
      )}
    </div>
  )
}
