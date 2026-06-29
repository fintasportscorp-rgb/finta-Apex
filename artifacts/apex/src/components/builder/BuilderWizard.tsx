import { useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { lintScript, addScript, getScript, getViewLabel } from '../../lib/scripts'
import type { Script, ScriptMeasure, LintError, AvailableView } from '../../lib/scripts'
import { LANDMARK_NAMES } from '../../engine/types'
import { CameraSchema } from '../capture/CameraSchema'
import type { ViewType } from '../../lib/scripts'

type Step = 'metadata' | 'view' | 'side' | 'measures' | 'validate'

type MeasureDraft = Partial<ScriptMeasure> & { assignedViews?: ViewType[] }

const STEPS: Step[] = ['metadata', 'view', 'side', 'measures', 'validate']

const VIEW_OPTIONS: ViewType[] = [
  'sagittal_right', 'sagittal_left', 'frontal', 'posterior', 'oblique_left', 'oblique_right', 'overhead',
]

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function BuilderWizard() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const navigate = useNavigate()
  const { lang: urlLang, scriptId } = useParams<{ lang?: string; scriptId?: string }>()
  const existingScript = scriptId ? getScript(scriptId) : undefined

  const [step, setStep] = useState<Step>('metadata')

  const [discipline, setDiscipline] = useState(existingScript?.discipline ?? '')
  const [gesture, setGesture] = useState(existingScript?.gesture ?? '')
  const [movementType, setMovementType] = useState<'finite' | 'continuous'>(existingScript?.movement_type ?? 'finite')

  // Multi-view selection
  const existingViews: ViewType[] = existingScript?.available_views?.map(av => av.view)
    ?? (existingScript ? [existingScript.view] : [])
  const [views, setViews] = useState<ViewType[]>(existingViews)

  const [side, setSide] = useState<'left' | 'right' | 'both' | 'auto'>(existingScript?.side ?? 'right')

  // Measures with per-measure view assignments
  const initMeasures = (): MeasureDraft[] => {
    if (!existingScript) return []
    if (existingScript.available_views && existingScript.available_views.length > 0) {
      const measureMap = new Map<string, MeasureDraft>()
      for (const av of existingScript.available_views) {
        for (const m of av.measures) {
          const prev = measureMap.get(m.id)
          if (prev) {
            measureMap.set(m.id, { ...prev, assignedViews: [...(prev.assignedViews ?? []), av.view] })
          } else {
            measureMap.set(m.id, { ...m, assignedViews: [av.view] })
          }
        }
      }
      return Array.from(measureMap.values())
    }
    return (existingScript.measures ?? []).map(m => ({ ...m, assignedViews: [...existingViews] }))
  }
  const [measures, setMeasures] = useState<MeasureDraft[]>(initMeasures)

  const [lintErrors, setLintErrors] = useState<LintError[]>([])
  const [saved, setSaved] = useState(false)

  const stepIdx = STEPS.indexOf(step)

  const sagittalOpposite = (v: ViewType): ViewType | null =>
    v === 'sagittal_left' ? 'sagittal_right' : v === 'sagittal_right' ? 'sagittal_left' : null

  const toggleView = (v: ViewType) => {
    if (views.includes(v)) {
      // Deselect: remove from views and strip from all measure assignments
      setViews(prev => prev.filter(x => x !== v))
      setMeasures(prev => prev.map(m => ({
        ...m,
        assignedViews: (m.assignedViews ?? []).filter(av => av !== v),
      })))
    } else if (views.length < 3) {
      // L-MV-11: selecting one sagittal auto-removes the opposite
      const opp = sagittalOpposite(v)
      if (opp && views.includes(opp)) {
        setViews(prev => [...prev.filter(x => x !== opp), v])
        setMeasures(prev => prev.map(m => ({
          ...m,
          assignedViews: [...(m.assignedViews ?? []).filter(av => av !== opp), v],
        })))
      } else {
        setViews(prev => [...prev, v])
      }
    }
  }

  const toggleMeasureView = (measureIdx: number, v: ViewType) => {
    setMeasures(prev => prev.map((m, j) => {
      if (j !== measureIdx) return m
      const cur = m.assignedViews ?? []
      const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]
      return { ...m, assignedViews: next }
    }))
  }

  const canProceed = (): boolean => {
    if (step === 'metadata') return !!(discipline.trim() && gesture.trim())
    if (step === 'view') return views.length >= 1
      && !(views.includes('sagittal_left') && views.includes('sagittal_right'))
    if (step === 'side') return !!side
    if (step === 'measures') {
      if (measures.length === 0) return false
      // Every selected view must have ≥1 measure assigned (L-MV-9)
      const coveredViews = new Set(measures.flatMap(m => m.assignedViews ?? []))
      if (!views.every(v => coveredViews.has(v))) return false
      return measures.every(m => {
        if (!m.assignedViews || m.assignedViews.length === 0) return false
        if (m.primitive === 'angle' || !m.primitive) {
          if (m.mode === 'segment_axis') return !!(m.points?.[0] && m.points?.[1] && m.axis)
          return !!(m.points?.[0] && m.points?.[1] && m.points?.[2])
        }
        if (m.primitive === 'rotation') {
          return !!(m.points?.[0] && m.points?.[1])
        }
        return true
      })
    }
    return true
  }

  const buildScript = (): Script => {
    const available_views: AvailableView[] = views
      .map(v => {
        const viewMeasures = measures
          .filter(m => (m.assignedViews ?? views).includes(v))
          .map((m, mi) => ({
            id: m.id ?? `measure_${mi}`,
            primitive: m.primitive ?? 'angle',
            mode: m.mode ?? 'joint',
            points: m.points,
            axis: m.axis,
            expose: m.expose ?? true,
            out_of_plane: false,
          })) as ScriptMeasure[]
        const required_visible: string[] = [...new Set(
          viewMeasures.flatMap(m => m.points ?? []).filter(Boolean)
        )]
        return { view: v, feasibility_2d: 'ok' as const, side, required_visible, measures: viewMeasures }
      })
      // Drop views with no measures (L-MV-9), then assign priorities
      .filter(av => av.measures.length > 0)
      .map((av, i) => ({ ...av, priority: i + 1, primary: i === 0 }))

    const primary = available_views[0]

    return {
      id: existingScript ? existingScript.id : slugify(`${discipline}_${gesture}_v1`),
      version: '1.0.0',
      dsl_version: '1.1',
      discipline: discipline.trim(),
      gesture: gesture.trim(),
      movement_type: movementType,
      cv_model: 'blazepose-full@1.x',
      view: primary?.view ?? views[0],
      side,
      required_visible: primary?.required_visible ?? [],
      measures: primary?.measures ?? [],
      available_views,
      segmentation: { mode: movementType === 'finite' ? 'discrete' : 'cyclic' },
      outputs: (primary?.measures ?? []).map(m => m.id),
      inputs: [],
    }
  }

  const handleValidate = () => {
    const draft = buildScript()
    const errors = lintScript(draft)
    setLintErrors(errors)
    if (errors.length === 0) {
      addScript(draft)
      setSaved(true)
    }
  }

  const setMeasureField = (i: number, field: keyof ScriptMeasure, value: unknown) => {
    setMeasures(prev => prev.map((m, j) => j !== i ? m : { ...m, [field]: value }))
  }

  const setMeasurePoint = (measureIdx: number, pointIdx: number, value: string) => {
    setMeasures(prev => prev.map((m, j) => {
      if (j !== measureIdx) return m
      const pts = [...(m.points ?? [])]
      pts[pointIdx] = value
      return { ...m, points: pts }
    }))
  }

  const sideLabels: Record<string, { fr: string; en: string }> = {
    right: { fr: 'Droite (main forte / pied fort)', en: 'Right (dominant hand/foot)' },
    left:  { fr: 'Gauche (main forte / pied fort)', en: 'Left (dominant hand/foot)' },
    both:  { fr: 'Bilatéral', en: 'Bilateral' },
    auto:  { fr: 'Auto (détection)', en: 'Auto (detection)' },
  }

  if (saved) {
    return (
      <div style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-6)',
      }}>
        <span style={{
          width: 88, height: 88,
          borderRadius: '50%',
          background: 'rgba(70,172,179,0.15)',
          border: '1px solid rgba(70,172,179,0.5)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, color: 'var(--accent-3)',
          boxShadow: '0 0 32px rgba(70,172,179,0.45)',
          animation: 'breathe 3s var(--ease-in-out) infinite',
        }}>✓</span>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--ink-1)',
          textAlign: 'center',
        }}>
          {t('builder.saved')}
        </p>
        <button onClick={() => navigate(`/${urlLang ?? lang}/app`)} className="btn btn-primary">
          {t('builder.view_catalogue')}
          <span style={{ fontSize: 16 }}>→</span>
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header pill */}
      <header
        className="rise-in"
        style={{
          margin: 'var(--space-4) var(--space-4) 0',
          padding: '10px 16px',
          background: 'var(--glass-2)',
          border: '1px solid var(--glass-edge)',
          borderRadius: 'var(--radius-pill)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          boxShadow: 'var(--shadow-glass)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <button onClick={() => navigate(`/${urlLang ?? lang}/app`)} className="btn btn-ghost" style={{ minHeight: 36, padding: '4px 12px' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-4)',
          }}>
            Apex · {lang === 'fr' ? 'Builder' : 'Builder'}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.01em' }}>
            {existingScript
              ? (lang === 'fr' ? 'Modifier le mouvement' : 'Edit movement')
              : t('builder.title')}
          </div>
        </div>
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          letterSpacing: '0.10em',
          color: 'var(--ink-2)',
          padding: '4px 12px',
          background: 'var(--glass-2)',
          border: '1px solid var(--glass-edge)',
          borderRadius: 'var(--radius-pill)',
        }}>
          {stepIdx + 1} <span style={{ color: 'var(--ink-4)' }}>/ {STEPS.length}</span>
        </span>
      </header>

      {/* Step indicator */}
      <div
        className="rise-in-delay-1"
        style={{ display: 'flex', padding: 'var(--space-3) var(--space-4) 0', gap: 4 }}
      >
        {STEPS.map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              background: i <= stepIdx
                ? 'linear-gradient(90deg, var(--accent-1) 0%, var(--accent-2) 100%)'
                : 'var(--glass-2)',
              borderRadius: 'var(--radius-pill)',
              minWidth: 12,
              transition: 'background var(--dur-base) var(--ease-out)',
              boxShadow: i === stepIdx ? '0 0 14px rgba(124,241,249,0.5)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Step content */}
      <main className="rise-in-delay-2" style={{ flex: 1, padding: 'var(--space-5) var(--space-4) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--ink-1)',
          letterSpacing: '-0.015em',
        }}>
          {t((`builder.step_${step}`) as Parameters<typeof t>[0])}
        </h2>

        {step === 'metadata' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <label style={labelStyle}>
                {t('builder.field_discipline')}
                <input
                  value={discipline}
                  onChange={e => setDiscipline(e.target.value)}
                  placeholder={lang === 'fr' ? 'ex : tennis, golf, athlétisme…' : 'e.g. tennis, golf, athletics…'}
                  className="input-aurora"
                />
              </label>
              <label style={labelStyle}>
                {t('builder.field_gesture')}
                <input
                  value={gesture}
                  onChange={e => setGesture(e.target.value)}
                  placeholder={lang === 'fr' ? "ex : service — préparation à l'impact" : 'e.g. serve — wind-up to impact'}
                  className="input-aurora"
                />
              </label>
              <label style={labelStyle}>
                {t('builder.field_movement_type')}
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 4 }}>
                  {(['finite', 'continuous'] as const).map(mv => (
                    <button key={mv} onClick={() => setMovementType(mv)} style={pillStyle(movementType === mv)}>
                      {mv === 'finite' ? t('builder.movement_finite') : t('builder.movement_continuous')}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          </div>
        )}

        {step === 'view' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Hint */}
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--ink-3)', margin: 0 }}>
              {lang === 'fr'
                ? 'Sélectionne 1 à 3 vues. La première vue sélectionnée devient la vue principale.'
                : 'Select 1 to 3 views. The first selected view becomes the primary view.'}
            </p>

            {/* View grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-2)' }}>
              {VIEW_OPTIONS.map(v => {
                const idx = views.indexOf(v)
                const active = idx !== -1
                const isPrimary = idx === 0
                const isDisabled = !active && views.length >= 3
                return (
                  <button
                    key={v}
                    onClick={() => !isDisabled && toggleView(v)}
                    style={{
                      padding: '14px 16px',
                      textAlign: 'left',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${isPrimary ? 'rgba(124,241,249,0.6)' : active ? 'rgba(97,206,214,0.4)' : 'var(--glass-edge)'}`,
                      background: isPrimary
                        ? 'linear-gradient(135deg, rgba(124,241,249,0.25) 0%, rgba(7,107,114,0.10) 100%)'
                        : active
                        ? 'rgba(97,206,214,0.08)'
                        : 'var(--glass-2)',
                      color: active ? 'var(--ink-1)' : isDisabled ? 'var(--ink-4)' : 'var(--ink-2)',
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      letterSpacing: '0.06em',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      backdropFilter: 'var(--glass-blur)',
                      WebkitBackdropFilter: 'var(--glass-blur)',
                      boxShadow: isPrimary ? '0 0 20px rgba(124,241,249,0.3)' : active ? '0 0 14px rgba(97,206,214,0.15)' : 'none',
                      transition: 'all var(--dur-fast) var(--ease-out)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      opacity: isDisabled ? 0.4 : 1,
                    }}
                  >
                    <span>{getViewLabel(v, lang)}</span>
                    {active && (
                      <span style={{
                        width: 18, height: 18,
                        borderRadius: '50%',
                        background: isPrimary ? 'rgba(124,241,249,0.5)' : 'rgba(97,206,214,0.25)',
                        border: `1px solid ${isPrimary ? 'rgba(124,241,249,0.8)' : 'rgba(97,206,214,0.6)'}`,
                        color: isPrimary ? 'var(--ink-1)' : 'var(--accent-2)',
                        fontSize: 9,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {idx + 1}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected summary */}
            {views.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {views.map((v, i) => (
                  <span key={v} style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-pill)',
                    background: i === 0 ? 'rgba(124,241,249,0.18)' : 'rgba(97,206,214,0.10)',
                    border: `1px solid ${i === 0 ? 'rgba(124,241,249,0.4)' : 'rgba(97,206,214,0.3)'}`,
                    color: i === 0 ? 'var(--accent-1)' : 'var(--accent-2)',
                  }}>
                    {i === 0 ? '★ ' : ''}{getViewLabel(v, lang)}
                  </span>
                ))}
              </div>
            )}

            {/* L-MV-11 conflict warning */}
            {views.includes('sagittal_left') && views.includes('sagittal_right') && (
              <div style={{
                padding: '7px 12px',
                background: 'rgba(124,241,249,0.06)',
                border: '1px solid rgba(124,241,249,0.28)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'rgba(124,241,249,0.9)',
                letterSpacing: '0.06em',
              }}>
                {lang === 'fr'
                  ? '⚠ Profil gauche et profil droit sont exclusifs — utilise le champ Côté à la place.'
                  : '⚠ Left and right profiles are mutually exclusive — use the Side field instead.'}
              </div>
            )}

            {/* Camera schema for primary view */}
            {views.length > 0 && (
              <div style={{
                ...cardStyle,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                <p style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  margin: 0,
                  alignSelf: 'flex-start',
                }}>
                  {lang === 'fr' ? 'Schéma — vue principale' : 'Diagram — primary view'}
                </p>
                <CameraSchema view={views[0]} lang={lang} />
              </div>
            )}
          </div>
        )}

        {step === 'side' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--ink-3)', margin: 0 }}>
              {lang === 'fr'
                ? 'Précise si le mouvement est latéralisé (main forte, pied fort).'
                : 'Specify if the movement is lateralised (dominant hand/foot).'}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {(['right', 'left', 'both', 'auto'] as const).map(s => (
                <button key={s} onClick={() => setSide(s)} style={{ ...pillStyle(side === s), minHeight: 48, padding: '10px 20px', textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{s}</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.7, fontWeight: 400 }}>
                    {sideLabels[s][lang]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'measures' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {measures.map((m, i) => (
              <MeasureCard
                key={i}
                index={i}
                measure={m}
                lang={lang}
                availableViews={views}
                onRemove={() => setMeasures(prev => prev.filter((_, j) => j !== i))}
                onChangeField={(field, value) => setMeasureField(i, field, value)}
                onChangePoint={(ptIdx, value) => setMeasurePoint(i, ptIdx, value)}
                onToggleView={v => toggleMeasureView(i, v)}
              />
            ))}

            <button
              onClick={() => setMeasures(prev => [
                ...prev,
                { primitive: 'angle', mode: 'joint', expose: true, points: [], assignedViews: [] },
              ])}
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
            >
              {t('builder.add_measure')}
            </button>

            {/* Per-view coverage status */}
            {views.length > 1 && (() => {
              const coveredViews = new Set(measures.flatMap(m => m.assignedViews ?? []))
              const uncovered = views.filter(v => !coveredViews.has(v))
              if (uncovered.length === 0) return null
              return (
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(124,241,249,0.06)',
                  border: '1px solid rgba(124,241,249,0.28)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'rgba(124,241,249,0.9)',
                  letterSpacing: '0.06em',
                  lineHeight: 1.6,
                }}>
                  {lang === 'fr' ? '⚠ Vues sans mesure : ' : '⚠ Views with no measure: '}
                  {uncovered.map(v => getViewLabel(v, lang)).join(', ')}
                </div>
              )
            })()}
          </div>
        )}

        {step === 'validate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={cardStyle}>
              <p style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--accent-2)',
                marginBottom: 'var(--space-3)',
              }}>
                {lang === 'fr' ? 'Mouvement JSON' : 'Movement JSON'}
              </p>
              <pre style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                overflowX: 'auto',
                color: 'var(--ink-2)',
                lineHeight: 1.6,
                padding: 'var(--space-3)',
                background: 'rgba(2,13,14,0.5)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-edge-faint)',
              }}>
                {JSON.stringify(buildScript(), null, 2)}
              </pre>
            </div>
            {lintErrors.length > 0 ? (
              <div style={{
                ...cardStyle,
                background: 'rgba(124,241,249,0.06)',
                borderColor: 'rgba(124,241,249,0.30)',
                boxShadow: '0 0 28px rgba(124,241,249,0.15)',
              }}>
                <p style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-warn)',
                  marginBottom: 'var(--space-3)',
                }}>
                  ⚠ {t('builder.linter_errors', { count: lintErrors.length })}
                </p>
                {lintErrors.map((e, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--ink-2)', marginBottom: 6, lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--accent-warn)' }}>{e.field}</strong>: {e.message}
                  </div>
                ))}
              </div>
            ) : measures.length > 0 ? (
              <div style={{
                ...cardStyle,
                background: 'linear-gradient(135deg, rgba(70,172,179,0.12) 0%, rgba(70,172,179,0.03) 100%)',
                borderColor: 'rgba(70,172,179,0.35)',
                boxShadow: '0 0 32px rgba(70,172,179,0.18)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
              }}>
                <span style={{
                  width: 28, height: 28,
                  borderRadius: '50%',
                  background: 'rgba(70,172,179,0.2)',
                  border: '1px solid rgba(70,172,179,0.5)',
                  color: 'var(--accent-3)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 0 14px rgba(70,172,179,0.4)',
                }}>✓</span>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--ink-1)' }}>
                  {t('builder.linter_pass')}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Navigation — floating bar */}
      <div style={{
        padding: 'var(--space-3) var(--space-4) var(--space-4)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(2,13,14,0.8) 60%)',
      }}>
        <div style={{
          margin: '0 auto',
          maxWidth: 540,
          padding: 8,
          background: 'var(--glass-3)',
          border: '1px solid var(--glass-edge-strong)',
          borderRadius: 'var(--radius-pill)',
          backdropFilter: 'var(--glass-blur-strong)',
          WebkitBackdropFilter: 'var(--glass-blur-strong)',
          boxShadow: 'var(--shadow-float)',
          display: 'flex',
          gap: 'var(--space-2)',
        }}>
          {stepIdx > 0 && (
            <button onClick={() => setStep(STEPS[stepIdx - 1])} className="btn btn-ghost">
              ← {t('builder.back')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 'validate' ? (
            <button onClick={handleValidate} className="btn btn-primary">
              {t('builder.validate')}
              <span style={{ fontSize: 16 }}>→</span>
            </button>
          ) : (
            <button onClick={() => canProceed() && setStep(STEPS[stepIdx + 1])} disabled={!canProceed()} className="btn btn-primary">
              {t('builder.next')}
              <span style={{ fontSize: 16 }}>→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MeasureCard ───────────────────────────────────────────────────────────────

interface MeasureCardProps {
  index: number
  measure: MeasureDraft
  lang: 'fr' | 'en'
  availableViews: ViewType[]
  onRemove: () => void
  onChangeField: (field: keyof ScriptMeasure, value: unknown) => void
  onChangePoint: (ptIdx: number, value: string) => void
  onToggleView: (view: ViewType) => void
}

function MeasureCard({ index, measure: m, lang, availableViews, onRemove, onChangeField, onChangePoint, onToggleView }: MeasureCardProps) {
  const { t } = useTranslation()
  const isAngle = m.primitive === 'angle' || !m.primitive
  const isRotation = m.primitive === 'rotation'
  const isJoint = m.mode === 'joint' || !m.mode
  const isSegmentAxis = m.mode === 'segment_axis'

  const rotationBodyPart: 'hip' | 'shoulder' | null = isRotation
    ? (m.points?.[0]?.includes('hip') ? 'hip' : m.points?.[0]?.includes('shoulder') ? 'shoulder' : null)
    : null

  const handleRotationBodyPart = (part: 'hip' | 'shoulder') => {
    onChangeField('points', part === 'hip' ? ['left_hip', 'right_hip'] : ['left_shoulder', 'right_shoulder'])
    onChangeField('mode', 'orientation_folded')
  }

  const slotLabels = isJoint
    ? (lang === 'fr'
        ? ['Début', 'Sommet (vertex)', 'Fin']
        : ['Start', 'Vertex (apex)', 'End'])
    : (lang === 'fr'
        ? ['Début segment', 'Fin segment']
        : ['Segment start', 'Segment end'])

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--accent-2)',
        }}>
          {t('builder.measure_n', { n: index + 1 })}
        </span>
        <button onClick={onRemove} style={{
          width: 28, height: 28,
          border: '1px solid var(--glass-edge)',
          background: 'var(--glass-1)',
          borderRadius: '50%',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          fontSize: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all var(--dur-fast) var(--ease-out)',
        }} aria-label="Remove">×</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {/* ID */}
        <input
          placeholder={lang === 'fr' ? 'identifiant (ex : knee_angle)' : 'id (e.g. knee_angle)'}
          value={m.id ?? ''}
          onChange={e => onChangeField('id', e.target.value)}
          className="input-aurora"
          style={{ fontFamily: 'var(--font-data)' }}
        />

        {/* Primitive */}
        <select
          value={m.primitive ?? 'angle'}
          onChange={e => onChangeField('primitive', e.target.value)}
          className="input-aurora"
          style={{ cursor: 'pointer', colorScheme: 'dark', color: 'var(--ink-1)' }}
        >
          {['angle', 'rotation', 'speed', 'position'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Rotation body part selector (mandatory) */}
        {isRotation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0 }}>
              {lang === 'fr' ? 'Segment corporel' : 'Body segment'}<span style={{ color: 'var(--accent-pink)', marginLeft: 3 }}>*</span>
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['hip', 'shoulder'] as const).map(part => (
                <button
                  key={part}
                  onClick={() => handleRotationBodyPart(part)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 'var(--radius-pill)',
                    border: `1px solid ${rotationBodyPart === part ? 'rgba(124,241,249,0.5)' : 'var(--glass-edge)'}`,
                    background: rotationBodyPart === part ? 'rgba(124,241,249,0.15)' : 'var(--glass-1)',
                    color: rotationBodyPart === part ? 'var(--ink-1)' : 'var(--ink-3)',
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all var(--dur-fast) var(--ease-out)',
                    boxShadow: rotationBodyPart === part ? '0 0 14px rgba(124,241,249,0.3)' : 'none',
                  }}
                >
                  {part === 'hip' ? (lang === 'fr' ? 'Hanches' : 'Hips') : (lang === 'fr' ? 'Épaules' : 'Shoulders')}
                </button>
              ))}
            </div>
            {rotationBodyPart && (
              <div style={{ padding: '6px 10px', background: 'rgba(124,241,249,0.06)', border: '1px solid rgba(124,241,249,0.18)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-3)' }}>
                {rotationBodyPart === 'hip'
                  ? (lang === 'fr' ? 'Points : left_hip + right_hip · mode : orientation_folded' : 'Points: left_hip + right_hip · mode: orientation_folded')
                  : (lang === 'fr' ? 'Points : left_shoulder + right_shoulder · mode : orientation_folded' : 'Points: left_shoulder + right_shoulder · mode: orientation_folded')}
              </div>
            )}
          </div>
        )}

        {/* Angle mode selector */}
        {isAngle && (
          <select
            value={m.mode ?? 'joint'}
            onChange={e => onChangeField('mode', e.target.value)}
            className="input-aurora"
            style={{ cursor: 'pointer', colorScheme: 'dark', color: 'var(--ink-1)' }}
          >
            <option value="joint">{t('builder.mode_joint')}</option>
            <option value="segment_axis">{t('builder.mode_segment_axis')}</option>
          </select>
        )}

        {/* Landmark slots — joint: 3, segment_axis: 2 */}
        {isAngle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 2 }}>
            <p style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              margin: 0,
            }}>
              Landmarks
            </p>

            {slotLabels.map((label, ptIdx) => (
              <div key={ptIdx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: isJoint && ptIdx === 1 ? 'var(--accent-1)' : 'var(--ink-3)',
                  minWidth: 110,
                  flexShrink: 0,
                  letterSpacing: '0.04em',
                }}>
                  {ptIdx + 1}. {label}
                  {isJoint && ptIdx === 1 && <span style={{ color: 'var(--accent-1)', marginLeft: 4 }}>●</span>}
                </span>
                <select
                  value={m.points?.[ptIdx] ?? ''}
                  onChange={e => onChangePoint(ptIdx, e.target.value)}
                  className="input-aurora"
                  style={{ flex: 1, cursor: 'pointer', colorScheme: 'dark', color: m.points?.[ptIdx] ? 'var(--ink-1)' : 'var(--ink-3)' }}
                >
                  <option value="">— {lang === 'fr' ? 'choisir' : 'select'} —</option>
                  {LANDMARK_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            ))}

            {/* Axis picker for segment_axis */}
            {isSegmentAxis && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 2 }}>
                <span style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--ink-3)',
                  minWidth: 110,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {lang === 'fr' ? 'Axe de référence' : 'Reference axis'}
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {(['vertical', 'horizontal'] as const).map(ax => (
                    <button
                      key={ax}
                      onClick={() => onChangeField('axis', ax)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-pill)',
                        border: `1px solid ${m.axis === ax ? 'rgba(97,206,214,0.5)' : 'var(--glass-edge)'}`,
                        background: m.axis === ax ? 'rgba(97,206,214,0.12)' : 'var(--glass-1)',
                        color: m.axis === ax ? 'var(--ink-1)' : 'var(--ink-3)',
                        fontFamily: 'var(--font-data)',
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all var(--dur-fast) var(--ease-out)',
                        boxShadow: m.axis === ax ? '0 0 12px rgba(97,206,214,0.25)' : 'none',
                      }}
                    >
                      {ax === 'vertical' ? '↕ Vertical' : '↔ Horizontal'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Hint */}
            {isJoint && (
              <div style={{
                padding: '7px 11px',
                background: 'rgba(124,241,249,0.06)',
                border: '1px solid rgba(124,241,249,0.18)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--ink-3)',
                lineHeight: 1.6,
              }}>
                {lang === 'fr'
                  ? "Le point ● (sommet) est le centre de l'angle. Ex : genou = hanche → genou → cheville."
                  : 'The ● point (vertex) is the angle apex. E.g. knee = hip → knee → ankle.'}
              </div>
            )}
          </div>
        )}

        {/* View assignment — always shown when multiple views exist */}
        {availableViews.length > 0 && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <p style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              margin: '0 0 6px',
            }}>
              {lang === 'fr' ? 'Vues assignées' : 'Assigned views'}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableViews.map((v, i) => {
                const assigned = (m.assignedViews ?? []).includes(v)
                return (
                  <button
                    key={v}
                    onClick={() => onToggleView(v)}
                    title={assigned
                      ? (lang === 'fr' ? 'Retirer de cette vue' : 'Remove from this view')
                      : (lang === 'fr' ? 'Assigner à cette vue' : 'Assign to this view')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 'var(--radius-pill)',
                      border: `1px solid ${assigned
                        ? (i === 0 ? 'rgba(124,241,249,0.55)' : 'rgba(97,206,214,0.45)')
                        : 'var(--glass-edge)'}`,
                      background: assigned
                        ? (i === 0 ? 'rgba(124,241,249,0.20)' : 'rgba(97,206,214,0.12)')
                        : 'transparent',
                      color: assigned
                        ? (i === 0 ? 'var(--accent-1)' : 'var(--accent-2)')
                        : 'var(--ink-4)',
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                      transition: 'all var(--dur-fast) var(--ease-out)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      boxShadow: assigned
                        ? (i === 0 ? '0 0 10px rgba(124,241,249,0.2)' : '0 0 10px rgba(97,206,214,0.15)')
                        : 'none',
                    }}
                  >
                    <span style={{
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: assigned
                        ? (i === 0 ? 'var(--accent-1)' : 'var(--accent-2)')
                        : 'var(--ink-4)',
                      flexShrink: 0,
                      transition: 'background var(--dur-fast) var(--ease-out)',
                    }} />
                    {getViewLabel(v, lang)}
                    {i === 0 && <span style={{ fontSize: 7, opacity: 0.55 }}>★</span>}
                  </button>
                )
              })}
            </div>
            {(!m.assignedViews || m.assignedViews.length === 0) && (
              <p style={{
                fontFamily: 'var(--font-data)',
                fontSize: 9,
                color: 'rgba(124,241,249,0.8)',
                margin: '5px 0 0',
                letterSpacing: '0.06em',
              }}>
                {lang === 'fr' ? '⚠ Sélectionne au moins une vue' : '⚠ Select at least one view'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontFamily: 'var(--font-data)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 500,
}

const cardStyle: CSSProperties = {
  background: 'var(--glass-2)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--shadow-glass)',
}

function pillStyle(selected: boolean): CSSProperties {
  return {
    padding: '10px 18px',
    borderRadius: 'var(--radius-pill)',
    border: `1px solid ${selected ? 'rgba(124,241,249,0.5)' : 'var(--glass-edge)'}`,
    background: selected
      ? 'linear-gradient(135deg, rgba(124,241,249,0.30) 0%, rgba(7,107,114,0.18) 100%)'
      : 'var(--glass-1)',
    color: selected ? 'var(--ink-1)' : 'var(--ink-3)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    fontWeight: selected ? 600 : 500,
    cursor: 'pointer',
    transition: 'all var(--dur-fast) var(--ease-out)',
    boxShadow: selected ? '0 0 18px rgba(124,241,249,0.3)' : 'none',
    backdropFilter: 'var(--glass-blur-soft)',
    WebkitBackdropFilter: 'var(--glass-blur-soft)',
  }
}
