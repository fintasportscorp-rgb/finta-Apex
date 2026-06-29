import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSessionSequences, getSessionContext } from '../../lib/export'
import type { Sequence, GestureInstance, InputValue } from '../../lib/export'
import type { MeasureResult, MeasureSample } from '../../engine/types'
import { getScript } from '../../lib/scripts'
import { getGestureLabel, getDisciplineLabel, getMeasureLabel } from '../../lib/script-translations'
import { MeasureChart } from '../analysis/MeasureChart'
import { SymmetryChart } from '../analysis/SymmetryChart'
import { computeChain } from '../../lib/kineticChain'
import { computeSymmetry, inferSymmetryPairs } from '../../lib/symmetry'
import './ReportView.css'

// ── Aggregation (100-point resampled mean + intra-sequence envelope) ──────────

const N = 100

function resample(series: MeasureSample[], n: number): number[] {
  if (series.length === 0) return Array(n).fill(0)
  if (series.length === 1) return Array(n).fill(series[0]!.value)
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (series.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, series.length - 1)
    return series[lo]!.value * (1 - (t - lo)) + series[hi]!.value * (t - lo)
  })
}

interface Aggregated {
  measure: MeasureResult
  envelopeMin: number[]
  envelopeMax: number[]
}

function aggregateInstances(instances: GestureInstance[]): Aggregated[] {
  if (instances.length === 0) return []
  return instances[0].measures.map(ref => {
    const cols = instances
      .map(inst => inst.measures.find(m => m.id === ref.id))
      .filter((m): m is MeasureResult => !!m)
      .map(m => resample(m.series, N))

    const meanSeries: MeasureSample[] = Array.from({ length: N }, (_, i) => {
      const vals = cols.map(s => s[i]!)
      return { t: i / (N - 1), value: vals.reduce((a, b) => a + b, 0) / vals.length, reliable: true }
    })
    const eMin = Array.from({ length: N }, (_, i) => Math.min(...cols.map(s => s[i]!)))
    const eMax = Array.from({ length: N }, (_, i) => Math.max(...cols.map(s => s[i]!)))
    const vals = meanSeries.map(s => s.value)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)

    return {
      measure: {
        ...ref,
        series: meanSeries,
        summary: {
          min: Math.min(...vals),
          max: Math.max(...vals),
          mean,
          sd,
          range: Math.max(...vals) - Math.min(...vals),
          peak: Math.max(...vals),
          t_peak: null,
        },
        reliability: { fraction_reliable: 1, out_of_plane: ref.reliability.out_of_plane, reasons: [] },
      },
      envelopeMin: eMin,
      envelopeMax: eMax,
    }
  })
}

// Cross-sequence envelope: min/max of each non-ref sequence's mean series
interface CrossEnvelope {
  min: number[]
  max: number[]
}

function computeCrossEnvelope(
  nonRefSeqs: Sequence[],
  measureIds: string[],
): Map<string, CrossEnvelope> {
  const result = new Map<string, CrossEnvelope>()
  if (nonRefSeqs.length === 0) return result

  const allAggs = nonRefSeqs
    .filter(s => (s.instances ?? []).length > 0)
    .map(s => aggregateInstances(s.instances ?? []))

  if (allAggs.length === 0) return result

  for (const id of measureIds) {
    const series = allAggs
      .map(agg => agg.find(a => a.measure.id === id)?.measure.series ?? [])
      .filter(s => s.length === N)

    if (series.length === 0) continue

    result.set(id, {
      min: Array.from({ length: N }, (_, i) => Math.min(...series.map(s => s[i]!.value))),
      max: Array.from({ length: N }, (_, i) => Math.max(...series.map(s => s[i]!.value))),
    })
  }

  return result
}

// ── Per-measure coaching comment (summary-based) ─────────────────────────────

type SumLike = { min: number; max: number; mean: number; sd: number }

function measureComment(cur: SumLike, ref: SumLike, lang: 'fr' | 'en'): string | null {
  const tol = (v: number) => Math.max(Math.abs(v) * 0.05, 1)
  const dMax = cur.max - ref.max
  const dMin = cur.min - ref.min
  const dMean = cur.mean - ref.mean
  const dRange = (cur.max - cur.min) - (ref.max - ref.min)
  const dSd = cur.sd - ref.sd

  const maxOk = Math.abs(dMax) < tol(ref.max)
  const minOk = Math.abs(dMin) < tol(ref.min)
  const meanOk = Math.abs(dMean) < tol(ref.mean)
  const rangeOk = Math.abs(dRange) < tol(ref.max - ref.min)
  const sdOk = Math.abs(dSd) < tol(ref.sd)

  if (maxOk && minOk && meanOk && rangeOk && sdOk) return null

  if (lang === 'fr') {
    if (rangeOk && !meanOk) return dMean < 0
      ? 'Plage correcte mais décalée vers le bas — revoir le placement de départ.'
      : 'Plage correcte mais décalée vers le haut — revoir le placement de départ.'
    if (meanOk && !sdOk && dSd > 0) return 'Bonne position en moyenne mais manque de régularité — travailler la constance.'
    if (!maxOk && dMax < 0) return 'Le mouvement ne va pas assez loin — pousser jusqu\'au bout.'
    if (!maxOk && dMax > 0) return 'L\'amplitude finale dépasse la référence — mieux contrôler la fin du geste.'
    if (!minOk && dMin > 0) return 'L\'armé est insuffisant — gagner de la course en amont.'
    if (!meanOk) return dMean < 0
      ? 'Niveau global en dessous de la référence — vérifier le placement.'
      : 'Niveau global au-dessus de la référence — vérifier le placement.'
    if (!rangeOk && dRange < 0) return 'Amplitude réduite par rapport à la référence — exploiter toute la course.'
    if (!sdOk && dSd > 0) return 'Moins régulier que la référence — travailler la reproductibilité.'
  } else {
    if (rangeOk && !meanOk) return dMean < 0
      ? 'Correct range but shifted down — review starting position.'
      : 'Correct range but shifted up — review starting position.'
    if (meanOk && !sdOk && dSd > 0) return 'Good average position but lacks consistency — work on repeatability.'
    if (!maxOk && dMax < 0) return 'Movement doesn\'t go far enough — push through to the end.'
    if (!maxOk && dMax > 0) return 'Final amplitude exceeds reference — better control at end.'
    if (!minOk && dMin > 0) return 'Insufficient backswing — increase pre-movement range.'
    if (!meanOk) return dMean < 0
      ? 'Overall level below reference — check placement.'
      : 'Overall level above reference — check placement.'
    if (!rangeOk && dRange < 0) return 'Reduced amplitude compared to reference — use full range.'
    if (!sdOk && dSd > 0) return 'Less consistent than reference — work on repeatability.'
  }

  return null
}

// Generate one synthesis paragraph across all non-reference sequences
function buildSynthesis(
  refAgg: Aggregated[],
  nonRefSeqs: Sequence[],
  lang: 'fr' | 'en',
): string {
  if (nonRefSeqs.length === 0 || refAgg.length === 0) return ''

  const issues: string[] = []

  for (const { measure: refM } of refAgg) {
    const comments: string[] = []

    for (const seq of nonRefSeqs) {
      const seqAgg = aggregateInstances(seq.instances ?? [])
      const seqM = seqAgg.find(a => a.measure.id === refM.id)
      if (!seqM) continue
      const c = measureComment(seqM.measure.summary, refM.summary, lang)
      if (c) comments.push(c)
    }

    // Surface an issue only if it shows up in at least half the comparison sequences
    if (comments.length > 0 && comments.length >= Math.ceil(nonRefSeqs.length / 2)) {
      const freq: Record<string, number> = {}
      for (const c of comments) freq[c] = (freq[c] ?? 0) + 1
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]
      if (top && issues.length < 3) issues.push(top[0])
    }
  }

  if (issues.length === 0) {
    return lang === 'fr'
      ? 'Les paramètres restent globalement conformes à la référence — les gestes sont bien reproductibles.'
      : 'Parameters remain broadly consistent with the reference — movements are well reproducible.'
  }

  const intro = lang === 'fr'
    ? `Sur ${nonRefSeqs.length} séquence${nonRefSeqs.length > 1 ? 's' : ''} analysée${nonRefSeqs.length > 1 ? 's' : ''} : `
    : `Across ${nonRefSeqs.length} sequence${nonRefSeqs.length > 1 ? 's' : ''} analysed: `

  return intro + issues.join(' ')
}

// ── Technical analysis (text-only, coach-to-player language) ─────────────────

function buildChainAnalysis(
  refInstances: GestureInstance[],
  nonRefSeqs: Sequence[],
  lang: 'fr' | 'en',
): string {
  if (nonRefSeqs.length === 0) return ''
  // Use averaged instances from first non-ref seq for chain comparison
  const avgInstances = nonRefSeqs[0]!.instances ?? []
  if (avgInstances.length === 0) return ''
  const chain = computeChain(avgInstances, refInstances)
  if (chain.length === 0) return ''

  const compared = chain.filter(m => m.delayT != null)
  if (compared.length === 0) return ''

  const late  = compared.filter(m => (m.delayT ?? 0) >  0.06)
  const early = compared.filter(m => (m.delayT ?? 0) < -0.06)
  const ampUp = compared.filter(m => (m.amplitudeGap ?? 0) >  5)
  const ampDn = compared.filter(m => (m.amplitudeGap ?? 0) < -5)

  const name = (m: { measureId: string }) => getMeasureLabel(m.measureId, lang)
  const parts: string[] = []

  if (lang === 'fr') {
    if (late.length === 0 && early.length === 0 && ampUp.length === 0 && ampDn.length === 0) {
      parts.push('La séquence de la chaîne cinétique est bien calée sur la référence — les segments s\'enchaînent dans le bon ordre et avec une amplitude similaire.')
    } else {
      if (late.length > 0) {
        const worst = late.reduce((a, b) => (b.delayT ?? 0) > (a.delayT ?? 0) ? b : a)
        parts.push(`Le segment "${name(worst)}" culmine trop tard par rapport à la référence. Essaie de déclencher ce mouvement un peu plus tôt dans la séquence globale.`)
      }
      if (early.length > 0) {
        const worst = early.reduce((a, b) => (b.delayT ?? 0) < (a.delayT ?? 0) ? b : a)
        parts.push(`Le segment "${name(worst)}" s'active trop tôt. Laisse le segment précédent finir son action avant de lancer celui-ci.`)
      }
      if (ampUp.length > 0) {
        parts.push(`L'amplitude de "${name(ampUp[0]!)}" dépasse la référence — surveille que cette sur-amplitude ne perturbe pas la suite du geste.`)
      }
      if (ampDn.length > 0) {
        parts.push(`L'amplitude de "${name(ampDn[0]!)}" est en dessous de la référence — cherche à aller plus loin dans ce segment pour retrouver la puissance de la référence.`)
      }
    }
  } else {
    if (late.length === 0 && early.length === 0 && ampUp.length === 0 && ampDn.length === 0) {
      parts.push('The kinetic chain sequence is well aligned with the reference — segments activate in the right order with similar amplitude.')
    } else {
      if (late.length > 0) {
        const worst = late.reduce((a, b) => (b.delayT ?? 0) > (a.delayT ?? 0) ? b : a)
        parts.push(`The "${name(worst)}" segment peaks too late compared to the reference. Try initiating this movement a bit earlier in the overall sequence.`)
      }
      if (early.length > 0) {
        const worst = early.reduce((a, b) => (b.delayT ?? 0) < (a.delayT ?? 0) ? b : a)
        parts.push(`The "${name(worst)}" segment activates too early. Let the previous segment complete its action before launching this one.`)
      }
      if (ampUp.length > 0) {
        parts.push(`The amplitude of "${name(ampUp[0]!)}" exceeds the reference — make sure this over-amplitude doesn't disrupt the rest of the movement.`)
      }
      if (ampDn.length > 0) {
        parts.push(`The amplitude of "${name(ampDn[0]!)}" is below the reference — try to extend further in this segment to recover the reference power.`)
      }
    }
  }

  return parts.join(' ')
}

function buildMeasureAnalysis(
  refAgg: Aggregated[],
  nonRefSeqs: Sequence[],
  lang: 'fr' | 'en',
): Array<{ id: string; unit: string; text: string }> {
  if (nonRefSeqs.length === 0) return []
  const results: Array<{ id: string; unit: string; text: string }> = []

  for (const { measure: refM } of refAgg) {
    // Average stats across all non-ref sequences
    const nonRefStats = nonRefSeqs
      .map(s => {
        const agg = aggregateInstances(s.instances ?? [])
        return agg.find(a => a.measure.id === refM.id)?.measure.summary
      })
      .filter((s): s is NonNullable<typeof s> => s != null)

    if (nonRefStats.length === 0) continue

    const avgMean = nonRefStats.reduce((s, v) => s + v.mean, 0) / nonRefStats.length
    const avgMax  = nonRefStats.reduce((s, v) => s + v.max, 0) / nonRefStats.length
    const avgSd   = nonRefStats.reduce((s, v) => s + v.sd, 0) / nonRefStats.length
    const cur: SumLike = {
      mean: avgMean,
      max:  avgMax,
      min:  nonRefStats.reduce((s, v) => s + v.min, 0) / nonRefStats.length,
      sd:   avgSd,
    }

    const text = measureComment(cur, refM.summary, lang)
    if (text) results.push({ id: refM.id, unit: refM.unit, text })
  }

  return results
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportView() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { sport, gesture } = useParams<{ sport: string; gesture: string }>()
  const scriptId = sport && gesture ? `${sport}_${gesture}` : ''
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const sequences = getSessionSequences(scriptId)
  const contextInputs: InputValue[] = getSessionContext(scriptId)

  if (sequences.length === 0) {
    return (
      <div style={{
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
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
        <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-ui)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
          {t('report.no_sequence')}
        </p>
        <button onClick={() => navigate(-1)} className="btn btn-primary">
          {t('report.back_catalogue')}
        </button>
      </div>
    )
  }

  // Reference = sequence flagged is_reference, else first recorded
  const refSeq: Sequence = sequences.find(s => s.is_reference) ?? sequences[0]
  const nonRefSeqs = sequences.filter(s => s !== refSeq)
  const script = getScript(refSeq.script_id)

  const refAgg = aggregateInstances(refSeq.instances ?? [])
  const measureIds = refAgg.map(a => a.measure.id)
  // Envelope is only meaningful with 2+ comparison sequences (otherwise min===max → zero-area polygon)
  const useEnvelope = nonRefSeqs.length >= 2
  const singleCompAgg = !useEnvelope && nonRefSeqs.length === 1
    ? aggregateInstances(nonRefSeqs[0].instances ?? [])
    : null
  const crossEnv = useEnvelope ? computeCrossEnvelope(nonRefSeqs, measureIds) : new Map<string, CrossEnvelope>()

  const isContinuous = script?.movement_type === 'continuous'

  const symmetryPairs = script?.symmetry_pairs?.length
    ? script.symmetry_pairs
    : inferSymmetryPairs((refSeq.instances ?? [])[0]?.measures.map(m => m.id) ?? [])
  const symmetryRows = isContinuous ? computeSymmetry(symmetryPairs, refSeq.instances ?? []) : []

  const synthesis = buildSynthesis(refAgg, nonRefSeqs, lang)
  const chainAnalysis = (!isContinuous && nonRefSeqs.length > 0) ? buildChainAnalysis(refSeq.instances ?? [], nonRefSeqs, lang) : ''
  const measureAnalyses = buildMeasureAnalysis(refAgg, nonRefSeqs, lang)

  // Non-ref average stats per measure
  const nonRefAvgStats = refAgg.map(({ measure: refM }) => {
    const vals = nonRefSeqs.map(s => {
      const agg = aggregateInstances(s.instances ?? [])
      return agg.find(a => a.measure.id === refM.id)?.measure.summary
    }).filter((s): s is NonNullable<typeof s> => s != null)
    if (vals.length === 0) return { id: refM.id, unit: refM.unit, mean: null as number | null }
    return {
      id: refM.id,
      unit: refM.unit,
      mean: vals.reduce((s, v) => s + v.mean, 0) / vals.length,
    }
  })

  // Per-sequence mean stats for table (mean of all instance sample means per measure)
  const seqStats = [refSeq, ...nonRefSeqs].map((seq, rawIdx) => {
    const agg = rawIdx === 0 ? refAgg : aggregateInstances(seq.instances ?? [])
    return {
      seq,
      isRef: seq === refSeq,
      label: seq === refSeq
        ? (lang === 'fr' ? '★ Référence' : '★ Reference')
        : (lang === 'fr' ? `Séquence ${rawIdx + 1}` : `Sequence ${rawIdx + 1}`),
      agg,
    }
  })

  const seqCount = sequences.length
  const gestureCount = (refSeq.instances ?? []).length

  return (
    <div className="report-root">
      {/* Header (hidden in print) */}
      <header className="report-header no-print">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-ghost"
          style={{ minHeight: 36, padding: '4px 12px' }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-4)',
          }}>
            Apex · {lang === 'fr' ? 'Rapport' : 'Report'}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--ink-1)',
            letterSpacing: '-0.01em',
          }}>
            {t('report.title')}
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="btn btn-primary"
          style={{ minHeight: 36, padding: '8px 16px', fontSize: 12 }}
        >
          {t('report.print')}
        </button>
      </header>

      <main className="report-content">
        {/* Title block */}
        <div className="report-title-block">
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 6,
          }}>
            {new Date(refSeq.started_at * 1000).toLocaleDateString()} · {lang === 'fr' ? 'Rapport de séance' : 'Session report'}
          </span>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            lineHeight: 1.1,
          }}>
            {script ? getGestureLabel(script.id, script.gesture, lang) : refSeq.script_id}
          </h2>
          <p style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-3)',
            marginTop: 4,
          }}>
            {script ? getDisciplineLabel(script.discipline, lang) : ''}
            {script ? ' · ' : ''}
            {lang === 'fr'
              ? `${seqCount} séquence${seqCount > 1 ? 's' : ''} · ${gestureCount} geste${gestureCount > 1 ? 's' : ''} de référence`
              : `${seqCount} sequence${seqCount > 1 ? 's' : ''} · ${gestureCount} reference rep${gestureCount > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* ── 1. Synthesis comment (natural language, no math) ─────────────────── */}
        {synthesis && (
          <section className="report-section">
            <div style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, rgba(97,206,214,0.08) 0%, rgba(97,206,214,0.03) 100%)',
              border: '1px solid rgba(97,206,214,0.25)',
              borderLeft: '3px solid var(--accent-2)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-ui)',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--ink-1)',
            }}>
              {synthesis}
            </div>
          </section>
        )}

        {/* ── 1b. Bilateral symmetry (continuous movements only) ───────────────── */}
        {isContinuous && symmetryRows.length > 0 && (
          <section className="report-section">
            <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-4)' }}>
              {lang === 'fr' ? 'Symétrie bilatérale' : 'Bilateral symmetry'}
            </h3>
            <SymmetryChart rows={symmetryRows} width={560} lang={lang} />
          </section>
        )}

        {/* ── 2. Analyse technique en langage naturel ──────────────────────────── */}
        {nonRefSeqs.length > 0 && (chainAnalysis || measureAnalyses.length > 0) && (
          <section className="report-section">
            <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-4)' }}>
              {lang === 'fr' ? 'Analyse technique' : 'Technical analysis'}
            </h3>
            {chainAnalysis && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7cf1f9', display: 'block', marginBottom: 6 }}>
                  {lang === 'fr' ? 'Chaîne cinétique' : 'Kinetic chain'}
                </span>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.65, color: 'var(--ink-1)', margin: 0 }}>
                  {chainAnalysis}
                </p>
              </div>
            )}
            {measureAnalyses.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {measureAnalyses.map(({ id, text }) => (
                  <div key={id} style={{ borderLeft: '2px solid var(--glass-edge-strong)', paddingLeft: 14 }}>
                    <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-2)', display: 'block', marginBottom: 4 }}>
                      {getMeasureLabel(id, lang)}
                    </span>
                    <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── 2b. Ball speed per sequence ──────────────────────────────────────── */}
        {sequences.some(s => s.ball_speed && s.ball_speed.length > 1) && (
          <section className="report-section">
            <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
              {lang === 'fr' ? 'Vitesse balle (approx.)' : 'Ball speed (approx.)'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--space-3)' }}>
              {[refSeq, ...nonRefSeqs].map((seq, rawIdx) => {
                const spd = seq.ball_speed
                if (!spd || spd.length < 2) return null
                const isRef = seq === refSeq
                const label = isRef
                  ? (lang === 'fr' ? '★ Référence' : '★ Reference')
                  : (lang === 'fr' ? `Séquence ${rawIdx + 1}` : `Sequence ${rawIdx + 1}`)
                const maxKmh = Math.max(...spd.map(s => s.kmh))
                const minKmh = Math.min(...spd.map(s => s.kmh))
                const rng = maxKmh - minKmh || 1
                const cH = 54
                const cW = 220
                const xSc = cW / Math.max(spd.length - 1, 1)
                const pts = spd.map((s, i) => `${i * xSc},${cH - ((s.kmh - minKmh) / rng) * cH}`).join(' ')
                const color = isRef ? '#46acb3' : '#7cf1f9'
                return (
                  <div key={seq.sequence_id} style={{
                    background: 'var(--glass-2)',
                    border: `1px solid ${isRef ? 'rgba(70,172,179,0.25)' : 'var(--glass-edge)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: isRef ? '#46acb3' : 'var(--ink-3)' }}>
                        {label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 16, fontWeight: 700, color: '#7cf1f9', fontVariantNumeric: 'tabular-nums' }}>
                        {maxKmh.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400, marginLeft: 3, color: 'rgba(124,241,249,0.7)' }}>km/h</span>
                      </span>
                    </div>
                    <svg width={cW} height={cH} style={{ display: 'block', width: '100%' }}>
                      <line x1={0} y1={cH / 2} x2={cW} y2={cH / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
                      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
                      <text x={4} y={10} fontFamily="var(--font-data)" fontSize={8} fill="rgba(181,216,219,0.6)">{maxKmh.toFixed(0)}</text>
                      <text x={4} y={cH - 2} fontFamily="var(--font-data)" fontSize={8} fill="rgba(181,216,219,0.6)">{minKmh.toFixed(0)}</text>
                    </svg>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 3a. RPE card ─────────────────────────────────────────────────────── */}
        {(() => {
          const getNum = (id: string) => {
            const v = contextInputs.find(c => c.id === id)?.value
            return typeof v === 'number' ? v : null
          }
          const rPhys = getNum('readiness_physical')
          const rCog  = getNum('readiness_cognitive')
          const ePhys = getNum('rpe_physical')
          const eCog  = getNum('rpe_cognitive')
          const hasAny = rPhys != null || rCog != null || ePhys != null || eCog != null
          if (!hasAny) return null

          const rpeHue = (v: number) => 150 - (v - 1) * 13
          const readHue = (v: number) => (v - 1) * 13
          const bar = (v: number | null, hue: number, max = 10) => {
            if (v == null) return null
            const pct = Math.round((v / max) * 100)
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 18, fontWeight: 700, color: `hsl(${hue},70%,55%)`, minWidth: 20, tabularNums: true } as React.CSSProperties}>{v}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(181,216,219,0.10)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: `hsl(${hue},70%,50%)`, transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          }

          const means = (a: number | null, b: number | null) => {
            const vals = [a, b].filter((v): v is number => v != null)
            return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null
          }
          const mRead = means(rPhys, rCog)
          const mRpe  = means(ePhys, eCog)
          const delta = mRead != null && mRpe != null ? Math.round((mRead - mRpe) * 10) / 10 : null
          const load  = mRpe != null ? Math.round(mRpe * gestureCount) : null

          const ROW_LABEL: React.CSSProperties = { fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 4 }
          const COL_HEAD: React.CSSProperties = { fontFamily: 'var(--font-data)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', textAlign: 'center', marginBottom: 8 }

          return (
            <section className="report-section">
              <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
                RPE · {lang === 'fr' ? 'Bilan de séance' : 'Session load'}
              </h3>
              <div style={{
                background: 'var(--glass-2)',
                border: '1px solid var(--glass-edge)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                {/* 2-column grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '8px 16px', alignItems: 'center' }}>
                  <div />
                  <div style={COL_HEAD}>{lang === 'fr' ? 'Avant séance' : 'Pre-session'}</div>
                  <div style={COL_HEAD}>{lang === 'fr' ? 'Après séance' : 'Post-session'}</div>

                  <div style={ROW_LABEL}>{lang === 'fr' ? 'Physique' : 'Physical'}</div>
                  <div>{bar(rPhys, readHue(rPhys ?? 5))}</div>
                  <div>{bar(ePhys, rpeHue(ePhys ?? 5))}</div>

                  <div style={ROW_LABEL}>{lang === 'fr' ? 'Cognitif' : 'Cognitive'}</div>
                  <div>{bar(rCog, readHue(rCog ?? 5))}</div>
                  <div>{bar(eCog, rpeHue(eCog ?? 5))}</div>
                </div>

                {/* Delta + load row */}
                <div style={{ display: 'flex', gap: 24, borderTop: '1px solid var(--glass-edge)', paddingTop: 12 }}>
                  {delta != null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                        {lang === 'fr' ? 'Indice de récupération' : 'Recovery index'}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-data)', fontSize: 16, fontWeight: 700,
                        color: delta >= 0 ? 'hsl(140,70%,55%)' : 'hsl(10,70%,55%)',
                      }}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                        <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--ink-3)' }}>
                          {delta >= 0
                            ? (lang === 'fr' ? 'dans la réserve' : 'within capacity')
                            : (lang === 'fr' ? 'surcharge' : 'overreach')}
                        </span>
                      </span>
                    </div>
                  )}
                  {load != null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                        {lang === 'fr' ? 'Charge estimée' : 'Session load'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 16, fontWeight: 700, color: 'var(--ink-1)' }}>
                        {load} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-3)' }}>AU · {gestureCount} {lang === 'fr' ? 'gestes' : 'reps'}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )
        })()}

        {/* ── 3b. Context / Conditions de séance ──────────────────────────────── */}
        {(() => {
          const RPE_IDS = new Set(['readiness_physical', 'readiness_cognitive', 'rpe_physical', 'rpe_cognitive'])
          const other = contextInputs.filter(v => v.value && !RPE_IDS.has(v.id))
          if (other.length === 0) return null
          return (
            <section className="report-section">
              <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
                {lang === 'fr' ? 'Conditions de séance' : 'Session context'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-2) var(--space-4)' }}>
                {other.map(v => (
                  <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                      {v.id.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-1)', fontWeight: 500 }}>
                      {String(v.value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )
        })()}

        {/* ── 3. Notes coach / joueur ──────────────────────────────────────────── */}
        {sequences.some(s => s.notes?.coach || s.notes?.player) && (
          <section className="report-section">
            <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
              {lang === 'fr' ? 'Notes' : 'Notes'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {sequences.map((seq, idx) => {
                if (!seq.notes?.coach && !seq.notes?.player) return null
                const isRef = seq === refSeq
                const label = isRef
                  ? (lang === 'fr' ? '★ Référence' : '★ Reference')
                  : (lang === 'fr' ? `Séquence ${idx + 1}` : `Sequence ${idx + 1}`)
                return (
                  <div key={seq.sequence_id} style={{
                    background: 'var(--glass-2)',
                    border: '1px solid var(--glass-edge)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}>
                    <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.10em', color: isRef ? '#46acb3' : 'var(--ink-3)', textTransform: 'uppercase' }}>
                      {label}
                    </span>
                    {seq.notes?.coach && (
                      <div>
                        <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-2)', display: 'block', marginBottom: 4 }}>
                          {lang === 'fr' ? 'Entraîneur' : 'Coach'}
                        </span>
                        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55, margin: 0 }}>
                          {seq.notes.coach}
                        </p>
                      </div>
                    )}
                    {seq.notes?.player && (
                      <div>
                        <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-3)', display: 'block', marginBottom: 4 }}>
                          {lang === 'fr' ? 'Joueur / Athlète' : 'Player / Athlete'}
                        </span>
                        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55, margin: 0 }}>
                          {seq.notes.player}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 6a. Grouped table: Référence vs Moyenne séquences ───────────────── */}
        {nonRefSeqs.length > 0 && (
          <section className="report-section">
            <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
              {lang === 'fr' ? 'Comparaison groupée' : 'Grouped comparison'}
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', minWidth: 100 }}>
                      {lang === 'fr' ? 'Séquence' : 'Sequence'}
                    </th>
                    {measureIds.map(id => (
                      <th key={id}>{getMeasureLabel(id, lang)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Reference row */}
                  <tr style={{ background: 'rgba(70,172,179,0.08)', outline: '1px solid rgba(70,172,179,0.25)' }}>
                    <td style={{ fontFamily: 'var(--font-data)', fontWeight: 700, color: '#46acb3', whiteSpace: 'nowrap' }}>
                      ★ {lang === 'fr' ? 'Référence' : 'Reference'}
                    </td>
                    {refAgg.map(({ measure: m }) => (
                      <td key={m.id} style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {m.summary.mean.toFixed(1)}
                        <span style={{ color: 'var(--ink-4)', fontSize: 10 }}> {m.unit}</span>
                      </td>
                    ))}
                  </tr>
                  {/* Non-ref average row */}
                  <tr>
                    <td style={{ fontFamily: 'var(--font-data)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                      {lang === 'fr' ? `Moy. séquences (${nonRefSeqs.length})` : `Avg sequences (${nonRefSeqs.length})`}
                    </td>
                    {nonRefAvgStats.map(({ id, unit, mean }) => {
                      const refEntry = refAgg.find(a => a.measure.id === id)
                      const diff = (mean != null && refEntry) ? mean - refEntry.measure.summary.mean : null
                      return (
                        <td key={id} style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          {mean != null ? (
                            <span>
                              {mean.toFixed(1)}
                              <span style={{ color: 'var(--ink-4)', fontSize: 10 }}> {unit}</span>
                              {diff !== null && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: Math.abs(diff) < 2 ? 'var(--ink-4)' : diff > 0 ? '#61ced6' : '#7cf1f9' }}>
                                  {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                                </span>
                              )}
                            </span>
                          ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 6b. Synthesis table: Mesure × Séquence ───────────────────────────── */}
        <section className="report-section">
          <h3 style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
            {lang === 'fr' ? 'Table de synthèse' : 'Synthesis table'}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: 130 }}>
                    {lang === 'fr' ? 'Mesure' : 'Measure'}
                  </th>
                  <th style={{ color: '#46acb3' }}>
                    {lang === 'fr' ? 'Référence' : 'Reference'}
                  </th>
                  {seqStats.filter(s => !s.isRef).map((s, i) => (
                    <th key={s.seq.sequence_id}>
                      {lang === 'fr' ? `Séq. ${i + 2}` : `Seq. ${i + 2}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {measureIds.map(id => {
                  const refEntry = refAgg.find(a => a.measure.id === id)
                  if (!refEntry) return null
                  return (
                    <tr key={id}>
                      <td style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {getMeasureLabel(id, lang)}
                        <span style={{ color: 'var(--ink-4)', fontSize: 10, marginLeft: 4 }}>{refEntry.measure.unit}</span>
                      </td>
                      {/* Reference value — highlighted */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: '#46acb3', fontWeight: 600, background: 'rgba(70,172,179,0.06)' }}>
                        {refEntry.measure.summary.mean.toFixed(1)}
                      </td>
                      {/* Non-ref sequences */}
                      {seqStats.filter(s => !s.isRef).map(s => {
                        const entry = s.agg.find(a => a.measure.id === id)
                        const diff = entry ? entry.measure.summary.mean - refEntry.measure.summary.mean : null
                        return (
                          <td key={s.seq.sequence_id} style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                            {entry ? (
                              <span>
                                {entry.measure.summary.mean.toFixed(1)}
                                {diff !== null && (
                                  <span style={{ marginLeft: 6, fontSize: 10, color: Math.abs(diff) < 2 ? 'var(--ink-4)' : diff > 0 ? '#61ced6' : '#7cf1f9' }}>
                                    {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                                  </span>
                                )}
                              </span>
                            ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="report-disclaimer">
          {t('report.disclaimer')}
        </footer>
      </main>
    </div>
  )
}
