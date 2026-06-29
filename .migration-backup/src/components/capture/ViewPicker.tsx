import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getScript, getAvailableViews, getViewLabel } from '../../lib/scripts'
import { getGestureLabel } from '../../lib/script-translations'
import type { AvailableView, ViewType } from '../../lib/scripts'
import { CameraSchema } from './CameraSchema'

/**
 * ViewPicker — between Catalogue and Capture.
 *
 * Lists the script's `available_views` and lets the user pick 1–3 of them.
 * The primary view is preselected and required (cannot be deselected).
 * On confirm, navigates to `/capture/:scriptId?views=v1,v2,...`.
 *
 * v1.0 scripts (no `available_views`) are redirected straight to capture by
 * `ScriptCard`, so this screen always assumes v1.1.
 */
export function ViewPicker() {
  const { scriptId } = useParams<{ scriptId: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'

  const script = scriptId ? getScript(scriptId) : undefined
  const availableViews = useMemo(() => (script ? getAvailableViews(script) : []), [script])

  const primaryView = availableViews.find(v => v.primary)
  // Single-select: exactly one view picked. Defaults to the primary (recommended).
  const [selected, setSelected] = useState<ViewType | null>(() => primaryView?.view ?? null)
  const [hoveredView, setHoveredView] = useState<ViewType | null>(null)

  if (!script) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--ink-1)' }}>
        {lang === 'fr' ? 'Script introuvable.' : 'Script not found.'}
      </div>
    )
  }

  if (availableViews.length <= 1) {
    // Single-view motion (legacy v1.0 hydrated to one view, or mono-view v1.1).
    // Skip the picker — there's nothing to choose.
    return <Navigate to={`/capture/${script.id}`} replace />
  }

  function pick(view: AvailableView): void {
    setSelected(view.view)
  }

  function handleConfirm(): void {
    if (!selected) return
    const qs = new URLSearchParams({ views: selected }).toString()
    navigate(`/capture/${script.id}?${qs}`)
  }

  const labels = lang === 'fr'
    ? {
        title: 'Choisir une vue',
        subtitle: `${availableViews.length} vues recommandées · une seule sélection`,
        hint: '☝ La vue principale est recommandée, mais vous pouvez en choisir une autre selon votre setup.',
        gesture: 'Mouvement',
        primary: 'Principale',
        recommended: 'Recommandée',
        alternative: 'Alternative',
        limited: 'Projection 2D',
        measures: 'mesures',
        confirm: 'Démarrer la capture',
        back: 'Retour au catalogue',
        noSelection: 'Aucune vue sélectionnée',
      }
    : {
        title: 'Choose a view',
        subtitle: `${availableViews.length} recommended views · single selection`,
        hint: '☝ The primary view is recommended, but you can pick another that fits your setup.',
        gesture: 'Movement',
        primary: 'Primary',
        recommended: 'Recommended',
        alternative: 'Alternative',
        limited: '2D projection',
        measures: 'measures',
        confirm: 'Start capture',
        back: 'Back to catalogue',
        noSelection: 'No view selected',
      }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
      background: 'var(--void)',
      color: 'var(--ink-1)',
    }}>
      {/* Header */}
      <header style={{
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--glass-edge)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/')}
          aria-label={labels.back}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            border: '1px solid var(--glass-edge)',
            background: 'var(--glass-1)',
            color: 'var(--ink-2)',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            margin: 0,
          }}>
            {labels.gesture}
          </p>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            color: 'var(--ink-1)',
            letterSpacing: '-0.01em',
          }}>
            {getGestureLabel(script.id, script.gesture, lang)}
          </h1>
        </div>
      </header>

      {/* Title */}
      <div style={{ padding: 'var(--space-5) var(--space-4) var(--space-2)' }}>
        <h2 style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          color: 'var(--ink-1)',
        }}>
          {labels.title}
        </h2>
        <p style={{
          margin: 'var(--space-1) 0 0',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-3)',
        }}>
          {labels.subtitle}
        </p>
        <p style={{
          margin: 'var(--space-2) 0 0',
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          color: 'var(--accent-purple)',
        }}>
          {labels.hint}
        </p>
      </div>

      {/* Grid of view options */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-3) var(--space-4) var(--space-6)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 'var(--space-4)',
        alignContent: 'start',
      }}>
        {availableViews.map(view => {
          const isSelected = selected === view.view
          const isPrimary = view.primary === true
          const isLimited = view.feasibility_2d === 'limited'
          const isHovered = hoveredView === view.view
          const rationale = lang === 'fr' ? view.rationale_fr : view.rationale_en

          // All views are equally clickable in single-select mode.
          // The primary is just labelled "Recommandée" — not locked.
          const bg = isSelected
            ? 'rgba(124,241,249,0.10)'
            : isHovered
              ? 'var(--glass-3)'
              : 'var(--glass-2)'
          const border = isSelected
            ? '1px solid rgba(124,241,249,0.55)'
            : isHovered
              ? '1px solid rgba(124,241,249,0.35)'
              : '1px solid var(--glass-edge)'
          const shadow = isSelected
            ? '0 0 24px rgba(124,241,249,0.20)'
            : isHovered
              ? '0 6px 18px -8px rgba(124,241,249,0.35)'
              : 'var(--shadow-glass)'
          const lift = isHovered ? 'translateY(-2px)' : 'translateY(0)'

          return (
            <button
              key={view.view}
              data-testid={`view-option-${view.view}`}
              onClick={() => pick(view)}
              onMouseEnter={() => setHoveredView(view.view)}
              onMouseLeave={() => setHoveredView(prev => (prev === view.view ? null : prev))}
              aria-pressed={isSelected}
              role="radio"
              aria-checked={isSelected}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                background: bg,
                border,
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: shadow,
                transform: lift,
                transition: 'all var(--dur-base) var(--ease-fluid)',
                opacity: 1,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-1)',
                    fontWeight: 700,
                  }}>
                    {getViewLabel(view.view, lang)}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: isPrimary ? 'var(--accent-2)' : 'var(--ink-3)',
                    padding: '2px 8px',
                    background: 'var(--glass-1)',
                    border: '1px solid var(--glass-edge)',
                    borderRadius: 'var(--radius-pill)',
                  }}>
                    {isPrimary ? labels.recommended : labels.alternative}
                  </span>
                  {isLimited && (
                    <span title={labels.limited} style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--accent-pink)',
                      padding: '2px 8px',
                      background: 'rgba(255,90,200,0.08)',
                      border: '1px solid rgba(255,90,200,0.30)',
                      borderRadius: 'var(--radius-pill)',
                    }}>
                      {labels.limited}
                    </span>
                  )}
                </div>
                {/* Radio indicator — filled when selected, outlined otherwise */}
                <span style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--accent-purple)'
                      : isHovered
                        ? 'rgba(124,241,249,0.55)'
                        : 'var(--glass-edge)'
                  }`,
                  flexShrink: 0,
                  transition: 'all var(--dur-fast) var(--ease-out)',
                }}>
                  {isSelected && (
                    <span style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--accent-purple)',
                      boxShadow: '0 0 8px var(--accent-purple)',
                    }} />
                  )}
                </span>
              </div>

              {/* Camera schema */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: 'var(--space-2) 0',
                background: 'linear-gradient(180deg, transparent 0%, rgba(124,241,249,0.04) 100%)',
                borderRadius: 'var(--radius-md)',
              }}>
                <CameraSchema view={view.view} lang={lang} />
              </div>

              {/* Rationale */}
              {rationale && (
                <p style={{
                  margin: 0,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  lineHeight: 1.5,
                }}>
                  {rationale}
                </p>
              )}

              {/* Footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'auto',
                paddingTop: 'var(--space-2)',
                borderTop: '1px solid var(--glass-edge)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--ink-3)',
                }}>
                  {view.measures.length} {labels.measures}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Sticky CTA */}
      <footer style={{
        padding: 'var(--space-3) var(--space-4) var(--space-4)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(2,13,14,0.85) 60%)',
        borderTop: '1px solid var(--glass-edge)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-2)',
        }}>
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}>
            {selected
              ? (lang === 'fr' ? 'Vue : ' : 'View: ') + getViewLabel(selected, lang)
              : labels.noSelection}
          </span>
        </div>
        <button
          onClick={handleConfirm}
          disabled={!selected}
          className="btn btn-primary"
          style={{ width: '100%', minHeight: 52, fontSize: 15, opacity: !selected ? 0.4 : 1 }}
        >
          {labels.confirm}
          <span style={{ fontSize: 18 }}>→</span>
        </button>
      </footer>
    </div>
  )
}
