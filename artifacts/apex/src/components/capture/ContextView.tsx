import type { CSSProperties } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './ContextView.css'
import type { Script, ScriptInput, AvailableView, ViewType } from '../../lib/scripts'
import { getAvailableViews, getViewLabel } from '../../lib/scripts'
import { getGestureLabel, getDisciplineLabel, getInputLabel, getInputOption, getScriptDescription, getMeasureLabel } from '../../lib/script-translations'
import type { InputValue } from '../../lib/export'
import { CameraSchema } from './CameraSchema'
import { CVRequirements } from './CVRequirements'

interface ContextViewProps {
  script: Script
  inputs: InputValue[]
  onChange: (inputs: InputValue[]) => void
  onStartCapture: () => void
  /** Views the user picked on the ViewPicker. Defaults to [primary] when omitted. */
  selectedViews?: ViewType[]
  /** The view currently being recorded (one of selectedViews). Defaults to selectedViews[0]. */
  activeView?: ViewType
  /** Called when the user toggles a view in the multi-view selector. */
  onChangeViews?: (views: ViewType[]) => void
  /** IDs of measures the user has opted in (undefined = all selected). */
  selectedMeasureIds?: string[]
  /** Called when the user toggles a measure checkbox. */
  onChangeSelectedMeasures?: (ids: string[]) => void
}

function getVal(inputs: InputValue[], id: string): string | number | boolean | null {
  return inputs.find(v => v.id === id)?.value ?? null
}

function setField(inputs: InputValue[], id: string, value: string | number | boolean | null): InputValue[] {
  const filtered = inputs.filter(v => v.id !== id)
  return value != null ? [...filtered, { id, value }] : filtered
}

export function ContextView({ script, inputs, onChange, onStartCapture, selectedViews, activeView, onChangeViews, selectedMeasureIds, onChangeSelectedMeasures }: ContextViewProps) {
  const { i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const scrollRef = useRef<HTMLDivElement>(null)
  const needsBall = !!script.ball_tracking?.enabled
  const displayView = activeView ?? script.view

  const toggleView = (v: ViewType) => {
    if (!onChangeViews) return
    onChangeViews([v])
  }

  const scriptInputs = script.inputs ?? []

  const PRE_IDS = new Set(['readiness_physical', 'readiness_cognitive'])
  const POST_IDS = new Set(['rpe_physical', 'rpe_cognitive'])
  const preInputs  = scriptInputs.filter(i => PRE_IDS.has(i.id))
  const postInputs = scriptInputs.filter(i => POST_IDS.has(i.id))
  const mainInputs = scriptInputs.filter(i => !PRE_IDS.has(i.id) && !POST_IDS.has(i.id))

  const [preOpen, setPreOpen]   = useState(true)
  const [postOpen, setPostOpen] = useState(false)

  // Block start only when the script explicitly defines a left/right side input
  const LEFT_RIGHT = new Set(['gaucher', 'droitier', 'left', 'right', 'gauche', 'droit'])
  const sideInput = scriptInputs.find(i =>
    i.type === 'single_select' && i.options?.some(o => LEFT_RIGHT.has(o))
  )
  const lateralitySelected = !sideInput || inputs.some(v => v.id === sideInput.id && v.value != null)
  const availableViews = getAvailableViews(script)
  const labels = lang === 'fr'
    ? { gesture: 'Mouvement', discipline: 'Discipline', view: 'Vue', type: 'Type', description: 'Description', finite: 'Fini', continuous: 'Continu' }
    : { gesture: 'Movement', discipline: 'Discipline', view: 'View', type: 'Type', description: 'Description', finite: 'Finite', continuous: 'Continuous' }
  // For the summary row: list all available views (primary first), or fall back to the legacy single view
  const viewSummary = availableViews.length > 0
    ? availableViews.map(v => getViewLabel(v.view, lang)).join(' · ')
    : getViewLabel(displayView, lang)
  const infoRows: [string, string][] = [
    [labels.gesture, getGestureLabel(script.id, script.gesture, lang)],
    [labels.discipline, getDisciplineLabel(script.discipline, lang)],
    [labels.view, viewSummary],
    [labels.type, script.movement_type === 'finite' ? labels.finite : labels.continuous],
    ...(script.description ? [[labels.description, getScriptDescription(script.id, script.description, lang)] as [string, string]] : []),
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Responsive columns: 1 col mobile, 2 col tablet, 3 col desktop */}
      <div ref={scrollRef} className="context-columns">

        {/* Colonne 1 — Exercice + Conditions */}
        <div className="context-col" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="rise-in" style={card}>
            <p style={sectionLabel}>{lang === 'fr' ? 'Exercice' : 'Exercise'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {infoRows.map(([lbl, value]) => (
                <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(181,216,219,0.35)' }}>
                    {lbl}
                  </span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-1)', lineHeight: 1.4 }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rise-in" style={card}>
            <p style={sectionLabel}>{lang === 'fr' ? 'Conditions' : 'Conditions'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* ── Pre-session readiness accordion ── */}
              {preInputs.length > 0 && (
                <div style={{ border: '1px solid rgba(52,211,153,0.18)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setPreOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(52,211,153,0.06)', border: 'none', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--font-data)', color: 'rgba(52,211,153,0.85)', fontWeight: 600 }}>
                      {lang === 'fr' ? 'Avant séance · Readiness' : 'Pre-session · Readiness'}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(52,211,153,0.6)', display: 'inline-block', transform: preOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                  </button>
                  {preOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: '12px 12px 10px' }}>
                      {preInputs.map(input => (
                        <InputField key={input.id} input={input} lang={lang}
                          value={getVal(inputs, input.id)}
                          onChange={val => onChange(setField(inputs, input.id, val))} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Post-session sRPE accordion ── */}
              {postInputs.length > 0 && (
                <div style={{ border: '1px solid rgba(124,241,249,0.18)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setPostOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(124,241,249,0.06)', border: 'none', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--font-data)', color: 'rgba(124,241,249,0.85)', fontWeight: 600 }}>
                      {lang === 'fr' ? 'Après séance · sRPE' : 'Post-session · sRPE'}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(124,241,249,0.6)', display: 'inline-block', transform: postOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                  </button>
                  {postOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: '12px 12px 10px' }}>
                      {postInputs.map(input => (
                        <InputField key={input.id} input={input} lang={lang}
                          value={getVal(inputs, input.id)}
                          onChange={val => onChange(setField(inputs, input.id, val))} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Laterality (injected if not in script) ── */}
              {!scriptInputs.some(i => i.id === 'laterality') && (
                <InputField
                  lang={lang}
                  input={{ id: 'laterality', label: 'Côté dominant', type: 'single_select', options: ['droitier', 'gaucher'], scope: 'sequence', required: false }}
                  value={getVal(inputs, 'laterality')}
                  onChange={val => {
                    const norm = val === 'left-handed' ? 'gaucher' : val === 'right-handed' ? 'droitier' : val
                    onChange(setField(inputs, 'laterality', norm))
                  }}
                />
              )}

              {/* ── Main conditions ── */}
              {mainInputs.map(input => (
                <InputField key={input.id} input={input} lang={lang}
                  value={getVal(inputs, input.id)}
                  onChange={val => onChange(setField(inputs, input.id, val))} />
              ))}

              {scriptInputs.length === 0 && (
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--ink-3)', margin: 0 }}>
                  {lang === 'fr' ? 'Aucune condition supplémentaire.' : 'No additional conditions.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Colonne 2 — Placement caméra + Vues sélectionnées */}
        <div className="context-col" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="rise-in-delay-1" style={card}>
            <p style={sectionLabel}>{lang === 'fr' ? 'Placement caméra' : 'Camera placement'}</p>
            <div style={{
              display: 'flex', justifyContent: 'center',
              padding: 'var(--space-2) 0',
              background: 'linear-gradient(180deg, transparent 0%, rgba(124,241,249,0.04) 100%)',
              borderRadius: 'var(--radius-md)',
            }}>
              <CameraSchema view={displayView} lang={lang} distanceHint={script.distance_rule} />
            </div>
          </div>

          {availableViews.length > 1 && (
            <div className="rise-in-delay-1" style={card}>
              <p style={sectionLabel}>
                {lang === 'fr' ? 'Vues sélectionnées' : 'Selected views'}
                {selectedViews && ` (${selectedViews.length}/${availableViews.length})`}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {availableViews.map(view => {
                  const isSelected = selectedViews ? selectedViews.includes(view.view) : view.primary === true
                  return (
                    <AvailableViewRow
                      key={view.view}
                      view={view}
                      lang={lang}
                      isSelected={isSelected}
                      onToggle={onChangeViews ? () => toggleView(view.view) : undefined}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Colonne 3 — Mesures + CV requirements */}
        <div className="context-col" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {(() => {
            const sel = selectedViews?.[0]
            const allViewsList = script.available_views ?? []
            const hasBall = !!script.ball_tracking?.enabled

            // Collect every unique measure across ALL views (ordered: first appearance wins)
            const measureViewMap = new Map<string, Set<ViewType>>()
            const measureDefMap = new Map<string, ScriptMeasure>()

            if (allViewsList.length === 0) {
              for (const m of script.measures ?? []) {
                if (!measureDefMap.has(m.id)) measureDefMap.set(m.id, m)
              }
            } else {
              for (const av of allViewsList) {
                for (const m of av.measures ?? []) {
                  if (!measureViewMap.has(m.id)) measureViewMap.set(m.id, new Set())
                  measureViewMap.get(m.id)!.add(av.view)
                  if (!measureDefMap.has(m.id)) measureDefMap.set(m.id, m)
                }
              }
            }

            if (measureDefMap.size === 0 && !hasBall) return null

            // Which measure IDs belong to the currently selected view
            const currentViewDef = sel ? allViewsList.find(av => av.view === sel) : undefined
            const currentViewIds = new Set(
              currentViewDef
                ? (currentViewDef.measures ?? []).map(m => m.id)
                : [...measureDefMap.keys()]
            )

            // Sort: current-view measures first, then other-view-only measures
            const inCurrent   = [...measureDefMap.entries()].filter(([id]) => currentViewIds.has(id))
            const notInCurrent = [...measureDefMap.entries()].filter(([id]) => !currentViewIds.has(id))

            // View order and colors for the compatibility dots
            const VIEW_COLORS: Record<string, string> = {
              frontal:        '#7cf1f9',
              sagittal_right: '#f59e0b',
              sagittal_left:  '#34d399',
              posterior:      '#a78bfa',
            }
            const viewOrder = allViewsList.map(v => v.view)
            const showDots  = viewOrder.length > 1

            const allIds = [
              ...inCurrent.map(([id]) => id),
              ...(hasBall ? ['ball_speed'] : []),
              ...notInCurrent.map(([id]) => id),
            ]
            const checkedCount = allIds.filter(id => !selectedMeasureIds || selectedMeasureIds.includes(id)).length
            const allChecked = checkedCount === allIds.length

            const toggleAll = () => {
              if (!onChangeSelectedMeasures) return
              onChangeSelectedMeasures(allChecked ? [] : allIds)
            }

            const handleToggle = (id: string) => {
              if (!onChangeSelectedMeasures) return
              const existing = selectedMeasureIds ?? allIds
              const checked = !selectedMeasureIds || selectedMeasureIds.includes(id)
              onChangeSelectedMeasures(checked ? existing.filter(x => x !== id) : [...existing, id])
            }

            const viewLabel = sel ? getViewLabel(sel, lang) : ''

            const renderRow = (id: string, m: ScriptMeasure, isBallSpeed?: boolean) => {
              const checked = !selectedMeasureIds || selectedMeasureIds.includes(id)
              const dots = showDots
                ? viewOrder.map(v => ({
                    view: v,
                    color: VIEW_COLORS[v] ?? '#7cf1f9',
                    included: isBallSpeed ? true : (measureViewMap.get(id)?.has(v) ?? false),
                  }))
                : []
              return (
                <MeasureDetailRow
                  key={id}
                  measure={m}
                  lang={lang}
                  isBallSpeed={isBallSpeed}
                  checked={checked}
                  viewDots={dots}
                  onToggle={onChangeSelectedMeasures ? () => handleToggle(id) : undefined}
                />
              )
            }

            return (
              <div className="rise-in-delay-1" style={card}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <p style={{ ...sectionLabel, margin: 0, flex: 1 }}>
                    {lang === 'fr' ? 'Mesures' : 'Measures'}
                    {viewLabel && <span style={{ color: 'rgba(181,216,219,0.35)', marginLeft: 6, fontWeight: 400 }}>· {viewLabel}</span>}
                  </p>
                  {onChangeSelectedMeasures && (
                    <button
                      onClick={toggleAll}
                      style={{
                        fontFamily: 'var(--font-data)', fontSize: 9,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: allChecked ? 'rgba(181,216,219,0.45)' : 'rgba(124,241,249,0.8)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                      }}
                    >
                      {allChecked ? (lang === 'fr' ? 'Aucune' : 'None') : (lang === 'fr' ? 'Toutes' : 'All')}
                    </button>
                  )}
                </div>

                {/* View legend — dots key */}
                {showDots && (
                  <div style={{
                    display: 'flex', gap: 10, padding: '0 10px 8px',
                    borderBottom: '1px solid var(--glass-edge-faint)', marginBottom: 4,
                  }}>
                    {viewOrder.map(v => (
                      <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: VIEW_COLORS[v] ?? '#7cf1f9',
                        }} />
                        <span style={{
                          fontFamily: 'var(--font-data)', fontSize: 8,
                          letterSpacing: '0.10em', color: 'rgba(181,216,219,0.45)',
                        }}>
                          {getViewLabel(v as ViewType, lang)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* Current-view measures (pre-checked) */}
                  {inCurrent.map(([id, m]) => renderRow(id, m))}

                  {/* Ball speed (always attached to current view) */}
                  {hasBall && renderRow('ball_speed', { id: 'ball_speed', primitive: 'speed', mode: 'linear', expose: true }, true)}

                  {/* Divider before other-view measures */}
                  {notInCurrent.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 4px' }}>
                      <div style={{ flex: 1, borderTop: '1px solid var(--glass-edge-faint)' }} />
                      <span style={{
                        fontFamily: 'var(--font-data)', fontSize: 8,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: 'rgba(181,216,219,0.25)',
                      }}>
                        {lang === 'fr' ? 'Autres vues' : 'Other views'}
                      </span>
                      <div style={{ flex: 1, borderTop: '1px solid var(--glass-edge-faint)' }} />
                    </div>
                  )}

                  {/* Other-view measures (unchecked by default) */}
                  {notInCurrent.map(([id, m]) => renderRow(id, m))}
                </div>
              </div>
            )
          })()}

          <div className="rise-in-delay-2" style={{
            ...card,
            borderColor: needsBall ? 'rgba(124,241,249,0.30)' : 'var(--glass-edge)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(97,206,214,0.15)',
                border: '1px solid rgba(97,206,214,0.4)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-2)',
                boxShadow: '0 0 14px rgba(97,206,214,0.3)',
                flexShrink: 0,
              }}>
                <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor"
                  strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx={8} cy={8} r={6.5} />
                  <path d="M8 5 L 8 8.5" />
                  <circle cx={8} cy={11} r={0.7} fill="currentColor" stroke="none" />
                </svg>
              </span>
              <p style={{ ...sectionLabel, margin: 0, color: 'var(--accent-2)' }}>
                {lang === 'fr' ? 'Pour une capture fiable' : 'For a reliable capture'}
              </p>
            </div>
            <CVRequirements needsBall={needsBall} view={displayView} lang={lang} />
          </div>
        </div>

      </div>

      {/* Scroll-to-top — mobile only */}
      <div className="context-scroll-top">
        <button onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑ {lang === 'fr' ? 'Haut de page' : 'Top'}
        </button>
      </div>

      {/* CTA — sticky floating */}
      <div style={{
        padding: 'var(--space-3) var(--space-4) var(--space-4)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(2,13,14,0.7) 60%)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}>
        {!lateralitySelected && (
          <p style={{
            margin: 0,
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            color: 'var(--accent-warn)',
            textAlign: 'center',
            padding: '6px 0',
          }}>
            {lang === 'fr'
              ? '⚠ Sélectionne le côté dominant avant de commencer'
              : '⚠ Select the dominant side before starting'}
          </p>
        )}
        <button
          onClick={lateralitySelected ? onStartCapture : undefined}
          disabled={!lateralitySelected}
          className="btn btn-primary"
          style={{ width: '100%', minHeight: 52, fontSize: 15, opacity: lateralitySelected ? 1 : 0.5 }}
        >
          {lang === 'fr' ? 'Commencer la capture' : 'Start capture'}
          <span style={{ fontSize: 18 }}>→</span>
        </button>
      </div>
    </div>
  )
}

// ── AvailableViewRow ─────────────────────────────────────────────────────────

interface AvailableViewRowProps {
  view: AvailableView
  lang: 'fr' | 'en'
  isSelected?: boolean
  onToggle?: () => void
}

function AvailableViewRow({ view, lang, isSelected = false, onToggle }: AvailableViewRowProps) {
  const rationale = lang === 'fr' ? view.rationale_fr : view.rationale_en
  const isLimited = view.feasibility_2d === 'limited'
  const primaryLabel = lang === 'fr' ? 'Principale' : 'Primary'
  const secondaryLabel = lang === 'fr' ? 'Secondaire' : 'Secondary'
  const limitedLabel = lang === 'fr' ? 'Projection 2D' : '2D projection'

  return (
    <div
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? e => e.key === 'Enter' && onToggle() : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 'var(--space-3)',
        background: isSelected ? 'rgba(124,241,249,0.10)' : 'var(--glass-1)',
        border: `1px solid ${isSelected ? 'rgba(124,241,249,0.50)' : 'var(--glass-edge)'}`,
        borderRadius: 'var(--radius-md)',
        opacity: isSelected ? 1 : 0.6,
        cursor: onToggle ? 'pointer' : 'default',
        transition: 'all var(--dur-fast) var(--ease-out)',
        boxShadow: isSelected ? '0 0 14px rgba(124,241,249,0.18)' : 'none',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* Check indicator */}
        <span style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          background: isSelected ? 'rgba(124,241,249,0.30)' : 'var(--glass-1)',
          border: `1px solid ${isSelected ? 'rgba(124,241,249,0.70)' : 'var(--glass-edge)'}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: 'var(--ink-1)',
          boxShadow: isSelected ? '0 0 8px rgba(124,241,249,0.35)' : 'none',
          transition: 'all var(--dur-fast) var(--ease-out)',
        }}>
          {isSelected ? '✓' : ''}
        </span>
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          letterSpacing: '0.06em',
          color: isSelected ? 'var(--ink-1)' : 'var(--ink-2)',
          fontWeight: isSelected ? 600 : 400,
          flex: 1,
          minWidth: 0,
        }}>
          {getViewLabel(view.view, lang)}
        </span>
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: view.primary ? 'var(--accent-2)' : 'var(--ink-4)',
        }}>
          {view.primary ? primaryLabel : secondaryLabel}
        </span>
        {isLimited && (
          <span title={limitedLabel} style={{
            fontFamily: 'var(--font-data)', fontSize: 9,
            color: 'var(--accent-pink)',
            padding: '1px 6px',
            background: 'rgba(255,90,200,0.08)',
            border: '1px solid rgba(255,90,200,0.30)',
            borderRadius: 'var(--radius-pill)',
          }}>
            2D
          </span>
        )}
      </div>
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
    </div>
  )
}

// ── RpeSlider ────────────────────────────────────────────────────────────────

const RPE_ANCHORS_FR: Record<number, string> = { 1: 'Repos', 3: 'Léger', 5: 'Modéré', 7: 'Intense', 10: 'Maximum' }
const RPE_ANCHORS_EN: Record<number, string> = { 1: 'Rest', 3: 'Light', 5: 'Moderate', 7: 'Intense', 10: 'Maximum' }
const READINESS_ANCHORS_FR: Record<number, string> = { 1: 'Épuisé', 3: 'Fatigué', 5: 'Normal', 7: 'Frais', 10: 'Parfait' }
const READINESS_ANCHORS_EN: Record<number, string> = { 1: 'Exhausted', 3: 'Tired', 5: 'Normal', 7: 'Fresh', 10: 'Perfect' }

interface RpeSliderProps {
  value: number | null
  lang: 'fr' | 'en'
  onChange: (v: number | null) => void
  /** readiness mode: high value = good (green), low = bad (red) */
  readiness?: boolean
}

function RpeSlider({ value, lang, onChange, readiness = false }: RpeSliderProps) {
  const anchors = readiness
    ? (lang === 'fr' ? READINESS_ANCHORS_FR : READINESS_ANCHORS_EN)
    : (lang === 'fr' ? RPE_ANCHORS_FR : RPE_ANCHORS_EN)
  const current = value ?? 0
  const pct = current > 0 ? ((current - 1) / 9) * 100 : 0

  // RPE: green at rest → red at max; readiness: red when exhausted → green when fresh
  const hue = readiness
    ? (current - 1) * 13
    : 150 - (current - 1) * 13
  const trackColor = current === 0 ? 'rgba(181,216,219,0.12)' : `hsl(${hue}, 70%, 50%)`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Value display + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 28,
          fontWeight: 700,
          color: current > 0 ? trackColor : 'rgba(181,216,219,0.25)',
          minWidth: 28,
          lineHeight: 1,
          transition: 'color 0.2s',
        }}>
          {current > 0 ? current : '–'}
        </span>
        {current > 0 && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'rgba(181,216,219,0.55)' }}>
            {anchors[current as keyof typeof anchors] ?? ''}
          </span>
        )}
        {current > 0 && (
          <button onClick={() => onChange(null)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(181,216,219,0.35)', fontSize: 11, fontFamily: 'var(--font-ui)',
          }}>✕</button>
        )}
      </div>

      {/* Slider */}
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={current > 0 ? current : 1}
        onChange={e => onChange(Number(e.target.value))}
        onMouseDown={e => { if (current === 0) onChange(Number((e.target as HTMLInputElement).value)) }}
        style={{
          width: '100%',
          accentColor: trackColor,
          cursor: 'pointer',
          height: 4,
          borderRadius: 2,
        }}
      />

      {/* Anchor labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        {([1, 3, 5, 7, 10] as const).map(n => (
          <span key={n} style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: value === n ? trackColor : 'rgba(181,216,219,0.30)',
            textAlign: 'center',
            lineHeight: 1.3,
            transition: 'color 0.2s',
          }}>
            {n}<br />{anchors[n]}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── InputField ───────────────────────────────────────────────────────────────

interface InputFieldProps {
  input: ScriptInput
  value: string | number | boolean | null
  onChange: (v: string | number | boolean | null) => void
  lang?: 'fr' | 'en'
}

function InputField({ input, value, onChange, lang = 'fr' }: InputFieldProps) {
  const displayLabel = getInputLabel(input.label, lang)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        color: 'var(--ink-1)',
        fontWeight: 600,
        letterSpacing: '-0.005em',
      }}>
        {displayLabel}
        {input.required && <span style={{ color: 'var(--accent-pink)', marginLeft: 4 }}>*</span>}
      </label>

      {input.type === 'single_select' && input.options && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {input.options.map(opt => (
            <button key={opt} onClick={() => onChange(value === opt ? null : opt)} style={pill(value === opt)}>
              {getInputOption(opt, lang)}
            </button>
          ))}
        </div>
      )}

      {input.type === 'bool' && (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {([true, false] as const).map((boolVal) => {
            const btnLabel = boolVal
              ? (lang === 'fr' ? 'Oui' : 'Yes')
              : (lang === 'fr' ? 'Non' : 'No')
            return (
              <button key={String(boolVal)} onClick={() => onChange(value === boolVal ? null : boolVal)} style={pill(value === boolVal)}>
                {btnLabel}
              </button>
            )
          })}
        </div>
      )}

      {input.type === 'scale' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: (input.max ?? 5) - (input.min ?? 1) + 1 }, (_, i) => (input.min ?? 1) + i).map(n => (
            <button key={n} onClick={() => onChange(value === n ? null : n)} style={{
              ...pill(value === n),
              width: 40, height: 40, padding: 0,
              fontFamily: 'var(--font-data)',
              fontSize: 14,
            }}>
              {n}
            </button>
          ))}
        </div>
      )}

      {input.type === 'rpe' && (
        <RpeSlider value={typeof value === 'number' ? value : null} lang={lang} onChange={onChange} />
      )}

      {input.type === 'rpe_readiness' && (
        <RpeSlider value={typeof value === 'number' ? value : null} lang={lang} onChange={onChange} readiness />
      )}

      {input.type === 'text' && (
        <input type="text" value={typeof value === 'string' ? value : ''} placeholder={`${displayLabel}…`}
          onChange={e => onChange(e.target.value || null)} className="input-aurora" />
      )}

      {input.type === 'textarea' && (
        <textarea value={typeof value === 'string' ? value : ''} placeholder={`${displayLabel}…`} rows={4}
          onChange={e => onChange(e.target.value || null)}
          className="input-aurora" style={{ resize: 'vertical', lineHeight: 1.5 }} />
      )}

      {input.type === 'number' && (
        <input type="number" value={typeof value === 'number' ? value : ''} min={input.min} max={input.max}
          onChange={e => onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null)}
          className="input-aurora" style={{ fontFamily: 'var(--font-data)' }} />
      )}

      {input.type === 'date' && (
        <input type="date" value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value || null)}
          className="input-aurora" style={{ colorScheme: 'dark' }} />
      )}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card: CSSProperties = {
  background: 'var(--glass-2)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--shadow-glass)',
}

const sectionLabel: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 10,
  color: 'var(--ink-3)',
  margin: '0 0 var(--space-3) 0',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontWeight: 500,
}

function pill(selected: boolean): CSSProperties {
  return {
    padding: '8px 16px',
    border: `1px solid ${selected ? 'rgba(124,241,249,0.5)' : 'var(--glass-edge)'}`,
    background: selected
      ? 'linear-gradient(135deg, rgba(124,241,249,0.30) 0%, rgba(7,107,114,0.18) 100%)'
      : 'var(--glass-1)',
    color: selected ? 'var(--ink-1)' : 'var(--ink-3)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    fontWeight: selected ? 600 : 500,
    cursor: 'pointer',
    transition: 'all var(--dur-fast) var(--ease-out)',
    boxShadow: selected ? '0 0 20px rgba(124,241,249,0.3)' : 'none',
    backdropFilter: 'var(--glass-blur-soft)',
    WebkitBackdropFilter: 'var(--glass-blur-soft)',
  }
}

// ── MeasureDetailRow ──────────────────────────────────────────────────────────

import type { ScriptMeasure } from '../../lib/scripts'

const LM_FR: Record<string, string> = {
  left_hip: 'hanche g.', right_hip: 'hanche d.',
  left_shoulder: 'épaule g.', right_shoulder: 'épaule d.',
  left_knee: 'genou g.', right_knee: 'genou d.',
  left_ankle: 'cheville g.', right_ankle: 'cheville d.',
  left_wrist: 'poignet g.', right_wrist: 'poignet d.',
  left_elbow: 'coude g.', right_elbow: 'coude d.',
  hip_center: 'centre hanche', shoulder_center: 'centre épaule',
}

function lm(name: string, lang: 'fr' | 'en'): string {
  if (lang === 'fr') return LM_FR[name] ?? name.replace(/_/g, ' ')
  return name.replace(/_/g, ' ')
}

interface ViewDot {
  view: string
  color: string
  included: boolean
}

interface MeasureDetailRowProps {
  measure: ScriptMeasure
  lang: 'fr' | 'en'
  isBallSpeed?: boolean
  checked?: boolean
  onToggle?: () => void
  viewDots?: ViewDot[]
}

function MeasureDetailRow({ measure: m, lang, isBallSpeed, checked = true, onToggle, viewDots = [] }: MeasureDetailRowProps) {
  const pts = m.points ?? []

  const pointsChain = (() => {
    if (isBallSpeed) return lang === 'fr' ? 'détection automatique' : 'automatic detection'
    if (m.primitive === 'angle' && m.mode === 'segment_axis') {
      const axis = m.axis === 'vertical'
        ? (lang === 'fr' ? 'vertical ↕' : 'vertical ↕')
        : (lang === 'fr' ? 'horizontal ↔' : 'horizontal ↔')
      return pts.length >= 2 ? `${lm(pts[0]!, lang)} → ${lm(pts[1]!, lang)}  ${axis}` : ''
    }
    if (m.primitive === 'angle' && m.mode === 'joint') {
      return pts.map((p, i) => i === 1 ? `[${lm(p, lang)}]` : lm(p, lang)).join(' → ')
    }
    if (pts.length > 0) return pts.map(p => lm(p, lang)).join(' → ')
    // speed / position measures use singular `point`
    if (m.point) {
      const chain = lm(m.point, lang)
      return m.reference ? `${chain} ↔ ${lm(m.reference, lang)}` : chain
    }
    // acceleration / derived measures reference a source measure
    if (m.source_measure) return `← ${getMeasureLabel(m.source_measure, lang)}`
    return ''
  })()

  const label = isBallSpeed
    ? (lang === 'fr' ? 'Vitesse balle' : 'Ball speed')
    : getMeasureLabel(m.id, lang)

  return (
    <div
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? e => e.key === 'Enter' && onToggle() : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        borderRadius: 'var(--radius-sm)',
        transition: 'background var(--dur-fast) var(--ease-out)',
        cursor: onToggle ? 'pointer' : 'default',
        opacity: checked ? 1 : 0.38,
      }}>
      {/* Checkbox */}
      {onToggle && (
        <span style={{
          width: 13, height: 13, borderRadius: 3, flexShrink: 0,
          border: `1px solid ${checked ? 'rgba(124,241,249,0.6)' : 'rgba(181,216,219,0.2)'}`,
          background: checked ? 'rgba(124,241,249,0.22)' : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: 'var(--ink-1)',
        }}>
          {checked ? '✓' : ''}
        </span>
      )}
      {/* Label */}
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 11,
        color: 'var(--ink-1)',
        fontWeight: 600,
        flex: '0 0 auto',
        minWidth: 110,
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>
      {/* Landmarks */}
      {pointsChain && (
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 9,
          color: 'rgba(181,216,219,0.40)',
          letterSpacing: '0.01em',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          flex: 1,
          minWidth: 0,
        }}>
          {pointsChain}
        </span>
      )}
      {/* View compatibility dots */}
      {viewDots.length > 0 && (
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 4 }}>
          {viewDots.map(dot => (
            <span key={dot.view} title={dot.view} style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: dot.included ? dot.color : 'transparent',
              border: `1px solid ${dot.included ? dot.color : 'rgba(181,216,219,0.20)'}`,
            }} />
          ))}
        </span>
      )}
    </div>
  )
}

