import { useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSessionSequences, exportCapture, downloadJson, exportModel } from '../../lib/export'
import { getScript } from '../../lib/scripts'
import { getGestureLabel, getDisciplineLabel } from '../../lib/script-translations'
import { MeasureChart } from './MeasureChart'
import type { GestureInstance, Sequence } from '../../lib/export'
import type { MeasureResult, MeasureSample } from '../../engine/types'

type Tab = 'instance' | 'sequence'

const N_POINTS = 100

function resampleSeries(series: MeasureSample[], n: number): number[] {
  if (series.length === 0) return Array(n).fill(0)
  if (series.length === 1) return Array(n).fill(series[0].value)
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (series.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, series.length - 1)
    return series[lo].value * (1 - (t - lo)) + series[hi].value * (t - lo)
  })
}

interface AggregatedMeasure {
  measure: MeasureResult
  envelopeMin: number[]
  envelopeMax: number[]
}

function aggregateInstances(instances: GestureInstance[]): AggregatedMeasure[] {
  if (instances.length === 0) return []
  return instances[0].measures.map(ref => {
    const resampled = instances
      .map(inst => inst.measures.find(m => m.id === ref.id))
      .filter((m): m is MeasureResult => !!m)
      .map(m => resampleSeries(m.series, N_POINTS))

    const meanSeries: MeasureSample[] = Array.from({ length: N_POINTS }, (_, i) => {
      const vals = resampled.map(s => s[i])
      return { t: i / (N_POINTS - 1), value: vals.reduce((a, b) => a + b, 0) / vals.length, reliable: true }
    })
    const envelopeMin = Array.from({ length: N_POINTS }, (_, i) => Math.min(...resampled.map(s => s[i])))
    const envelopeMax = Array.from({ length: N_POINTS }, (_, i) => Math.max(...resampled.map(s => s[i])))

    const vals = meanSeries.map(s => s.value)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    const minV = Math.min(...vals)
    const maxV = Math.max(...vals)

    const measure: MeasureResult = {
      ...ref,
      series: meanSeries,
      summary: { min: minV, max: maxV, mean, sd, range: maxV - minV, peak: maxV, t_peak: null },
      reliability: { fraction_reliable: 1, out_of_plane: ref.reliability.out_of_plane, reasons: [] },
    }
    return { measure, envelopeMin, envelopeMax }
  })
}

export function AnalysisScreen() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const navigate = useNavigate()
  const { sport, gesture } = useParams<{ sport: string; gesture: string }>()
  const scriptId = sport && gesture ? `${sport}_${gesture}` : ''
  const sequences = getSessionSequences(scriptId)
  const [tab, setTab] = useState<Tab>('instance')
  const [selectedSeqIdx] = useState(0)
  const [selectedInstIdx, setSelectedInstIdx] = useState(0)
  const [refLabel, setRefLabel] = useState('')
  const [showRefInput, setShowRefInput] = useState(false)

  if (sequences.length === 0) {
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
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--glass-2)',
          border: '1px solid var(--glass-edge)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: 'var(--ink-3)',
          boxShadow: 'var(--shadow-glass)',
        }}>○</span>
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-3)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
          {t('analysis.no_sequence')}
        </p>
        <button onClick={() => navigate('/')} className="btn btn-primary">
          {t('analysis.back_catalogue')}
        </button>
      </div>
    )
  }

  const seq: Sequence = sequences[selectedSeqIdx]
  const script = getScript(seq.script_id)
  const instances: GestureInstance[] = seq.instances ?? []
  const currentInst = instances[selectedInstIdx]
  const aggregatedMeasures = aggregateInstances(instances)

  const handleExport = () => {
    if (!seq) return
    const json = exportCapture(seq.script_id, seq)
    downloadJson(`capture_${seq.script_id}_${Date.now()}.json`, json)
  }

  const handleSetReference = () => {
    if (!showRefInput) { setShowRefInput(true); return }
    if (!refLabel.trim() || instances.length === 0) return
    const json = exportModel(seq.script_id, [seq], refLabel.trim())
    downloadJson(`model_${seq.script_id}_${Date.now()}.json`, json)
    setShowRefInput(false)
    setRefLabel('')
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Floating glass header */}
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
        <button onClick={() => navigate('/')} className="btn btn-ghost" style={{ minHeight: 36, padding: '4px 12px' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-4)',
          }}>
            Aurora · Analyse
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.01em' }}>
            {t('analysis.title')}
          </div>
        </div>
        <button onClick={handleExport} className="btn btn-secondary" style={{ minHeight: 36, padding: '8px 16px', fontSize: 12 }}>
          {t('analysis.export')}
        </button>
        <button onClick={() => navigate('/report')} className="btn btn-primary" style={{ minHeight: 36, padding: '8px 16px', fontSize: 12 }}>
          {t('report.title')}
        </button>
      </header>

      {/* Script info */}
      {script && (
        <div
          className="rise-in-delay-1"
          style={{
            padding: 'var(--space-4) var(--space-4) 0',
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
          }}
        >
          <span>{getGestureLabel(script.id, script.gesture, lang)}</span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span>{getDisciplineLabel(script.discipline, lang)}</span>
        </div>
      )}

      {/* Tabs */}
      <div
        className="rise-in-delay-1"
        style={{
          padding: 'var(--space-3) var(--space-4) 0',
        }}
      >
        <div style={{
          display: 'flex',
          padding: 4,
          background: 'var(--glass-1)',
          border: '1px solid var(--glass-edge)',
          borderRadius: 'var(--radius-pill)',
          backdropFilter: 'var(--glass-blur-soft)',
          WebkitBackdropFilter: 'var(--glass-blur-soft)',
          gap: 2,
          maxWidth: 400,
        }}>
          {(['instance', 'sequence'] as Tab[]).map(tabId => {
            const active = tab === tabId
            return (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  padding: '8px 16px',
                  background: active
                    ? 'linear-gradient(135deg, rgba(97,206,214,0.25) 0%, rgba(97,206,214,0.08) 100%)'
                    : 'transparent',
                  border: `1px solid ${active ? 'rgba(97,206,214,0.45)' : 'transparent'}`,
                  borderRadius: 'var(--radius-pill)',
                  color: active ? 'var(--ink-1)' : 'var(--ink-3)',
                  cursor: 'pointer',
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? '0 0 18px rgba(97,206,214,0.3)' : 'none',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                }}
              >
                {tabId === 'instance' ? t('analysis.tab_instance') : t('analysis.tab_sequence')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Instance selector */}
      {tab === 'instance' && instances.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4) 0',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {instances.map((_, i) => {
            const active = i === selectedInstIdx
            return (
              <button
                key={i}
                onClick={() => setSelectedInstIdx(i)}
                style={{
                  padding: '6px 14px',
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  borderRadius: 'var(--radius-pill)',
                  border: `1px solid ${active ? 'rgba(124,241,249,0.5)' : 'var(--glass-edge)'}`,
                  background: active
                    ? 'linear-gradient(135deg, rgba(124,241,249,0.25) 0%, rgba(7,107,114,0.15) 100%)'
                    : 'var(--glass-1)',
                  color: active ? 'var(--ink-1)' : 'var(--ink-3)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? '0 0 16px rgba(124,241,249,0.3)' : 'none',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                }}
              >
                {t('analysis.gesture_n', { n: i + 1 })}
              </button>
            )
          })}
        </div>
      )}

      {/* Charts */}
      <main className="rise-in-delay-2" style={{ flex: 1, padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {tab === 'instance' ? (
          !currentInst ? (
            <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)' }}>
              {t('analysis.no_measures')}
            </p>
          ) : (
            currentInst.measures.map(m => (
              <div key={m.id} style={chartCard}>
                <MeasureChart measure={m} width={320} height={80} lang={lang} />
              </div>
            ))
          )
        ) : (
          aggregatedMeasures.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)' }}>
              {t('analysis.no_measures')}
            </p>
          ) : (
            <>
              {instances.length > 1 && (
                <p style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}>
                  {t('analysis.n_repetitions', { n: instances.length })}
                </p>
              )}
              {aggregatedMeasures.map(({ measure, envelopeMin, envelopeMax }) => (
                <div key={measure.id} style={chartCard}>
                  <MeasureChart
                    measure={measure}
                    width={320}
                    height={80}
                    envelopeMin={instances.length > 1 ? envelopeMin : undefined}
                    envelopeMax={instances.length > 1 ? envelopeMax : undefined}
                    lang={lang}
                  />
                </div>
              ))}
            </>
          )
        )}
      </main>

      {/* Reference actions — floating bar */}
      <div style={{
        padding: 'var(--space-3) var(--space-4) var(--space-4)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(2,13,14,0.7) 60%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}>
        {showRefInput && (
          <input
            type="text"
            placeholder={t('analysis.ref_label_placeholder')}
            value={refLabel}
            onChange={e => setRefLabel(e.target.value)}
            className="input-aurora"
          />
        )}
        <button onClick={handleSetReference} disabled={instances.length === 0} className="btn btn-secondary">
          {t('analysis.set_reference')}
        </button>
      </div>
    </div>
  )
}

const chartCard: CSSProperties = {
  background: 'var(--glass-2)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--shadow-glass)',
}
