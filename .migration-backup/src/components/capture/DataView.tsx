import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { zipSync } from 'fflate'
import { exportCapture, exportContext, downloadJson, vacuum } from '../../lib/export'
import type { Sequence, GestureInstance, InputValue, SequenceNotes, BallSpeedSample } from '../../lib/export'
import type { MeasureResult, MeasureSample } from '../../engine/types'
import { MeasureChart } from '../analysis/MeasureChart'
import { HittingPlaneChart } from '../analysis/HittingPlaneChart'
import { GanttChainChart, CHAIN_COLORS } from '../analysis/GanttChainChart'
import { SymmetryChart } from '../analysis/SymmetryChart'
import { computeChain, computeRepOnsets } from '../../lib/kineticChain'
import type { MeasureChain } from '../../lib/kineticChain'
import { computeSymmetry, inferSymmetryPairs } from '../../lib/symmetry'
import type { PatternArea } from '../analysis/MeasureChart'
import type { Script, ViewType } from '../../lib/scripts'
import { getViewLabel, getMeasuresForViews } from '../../lib/scripts'
import { getGestureLabel, getDisciplineLabel, getMeasureLabel, getMeasureTooltip, getInputLabel } from '../../lib/script-translations'
import { SequenceBar } from './SequenceBar'
import type { SequencePill } from './SequenceBar'

// ── Aggregation (100-point resampled mean + envelope) ──────────────────────

const N = 100

function resample(series: MeasureSample[], n: number): number[] {
  if (series.length === 0) return Array(n).fill(0)
  if (series.length === 1) return Array(n).fill(series[0].value)
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (series.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, series.length - 1)
    return series[lo].value * (1 - (t - lo)) + series[hi].value * (t - lo)
  })
}

interface Aggregated {
  measure: MeasureResult
  envelopeMin: number[]
  envelopeMax: number[]
}

function aggregate(instances: GestureInstance[]): Aggregated[] {
  if (instances.length === 0) return []
  return instances[0].measures.map(ref => {
    const cols = instances
      .map(inst => inst.measures.find(m => m.id === ref.id))
      .filter((m): m is MeasureResult => !!m)
      .map(m => resample(m.series, N))

    const meanSeries: MeasureSample[] = Array.from({ length: N }, (_, i) => {
      const vals = cols.map(s => s[i])
      return { t: i / (N - 1), value: vals.reduce((a, b) => a + b, 0) / vals.length, reliable: true }
    })
    const eMin = Array.from({ length: N }, (_, i) => Math.min(...cols.map(s => s[i])))
    const eMax = Array.from({ length: N }, (_, i) => Math.max(...cols.map(s => s[i])))
    const vals = meanSeries.map(s => s.value)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)

    return {
      measure: {
        ...ref,
        series: meanSeries,
        summary: { min: Math.min(...vals), max: Math.max(...vals), mean, sd, range: Math.max(...vals) - Math.min(...vals), peak: Math.max(...vals), t_peak: null },
        reliability: { fraction_reliable: 1, out_of_plane: ref.reliability.out_of_plane, reasons: [] },
      },
      envelopeMin: eMin,
      envelopeMax: eMax,
    }
  })
}

// ── Symmetry helpers ────────────────────────────────────────────────────────

function buildSymmetryMaps(script: Script | undefined) {
  const leftIds = new Set<string>((script?.symmetry_pairs ?? []).map(p => p.left))
  const rightToLeft = new Map<string, string>((script?.symmetry_pairs ?? []).map(p => [p.right, p.left]))
  return { leftIds, rightToLeft }
}

// ── Per-measure coaching text (current vs reference) ──────────────────────

function buildMeasureCoachText(
  curSeries: MeasureSample[],
  refSeries: MeasureSample[],
  lang: 'fr' | 'en',
): string | null {
  if (curSeries.length < 3 || refSeries.length < 3) return null
  const n = 30
  const cur = resample(curSeries, n)
  const ref = resample(refSeries, n)
  const diff = cur.map((v, i) => v - ref[i]!)

  const meanDiff = diff.reduce((a, b) => a + b, 0) / n
  const refMean = Math.abs(ref.reduce((a, b) => a + b, 0) / n)
  const tol = Math.max(refMean * 0.04, 0.8)

  if (Math.abs(meanDiff) < tol) {
    const s = diff.slice(0, 10).reduce((a, b) => a + b, 0) / 10
    const e = diff.slice(20).reduce((a, b) => a + b, 0) / 10
    if (Math.abs(s) < tol && Math.abs(e) < tol) return null
    return lang === 'fr'
      ? Math.abs(s) > Math.abs(e)
        ? 'Proche de la référence dans l\'ensemble, mais le début du geste se décale légèrement — soigne ta position de départ.'
        : 'Tu démarres bien par rapport à la référence, mais l\'écart se creuse en fin de geste — pousse jusqu\'au bout.'
      : Math.abs(s) > Math.abs(e)
        ? 'Close to reference overall, slight drift at the start — check your setup.'
        : 'Good start vs reference, but drifting at the end — push through to the finish.'
  }

  const isAbove = meanDiff > 0
  const s = diff.slice(0, 10).reduce((a, b) => a + b, 0) / 10
  const e = diff.slice(20).reduce((a, b) => a + b, 0) / 10
  const bigEnd   = Math.abs(e) > Math.abs(meanDiff) * 1.4
  const bigStart = Math.abs(s) > Math.abs(meanDiff) * 1.4
  const shrinking = isAbove ? e < s - tol : e > s + tol
  const growing   = isAbove ? e > s + tol : e < s - tol
  const flips = diff.filter((v, i) => i > 0 && (v > 0) !== (diff[i - 1]! > 0)).length
  const isMixed = flips > 7

  if (lang === 'fr') {
    if (isAbove) {
      if (isMixed)   return 'Tu oscilles au-dessus et en dessous de la référence de façon irrégulière — travaille ta constance sur ce segment.'
      if (bigEnd)    return 'Tu dépasses la référence, surtout en fin de geste — maîtrise mieux ta fin de mouvement.'
      if (bigStart)  return 'Tu surpasses la référence au départ, puis tu te recentres — surveille ton placement initial.'
      if (shrinking) return 'Tu dépasses la référence mais tu te rapproches d\'elle progressivement — bonne tendance, continue à ajuster.'
      if (growing)   return 'L\'écart avec la référence se creuse au fil du geste — travaille à rester dans le canal de la référence.'
      return 'Tu es régulièrement au-dessus de la référence — contrôle ton amplitude pour coller à l\'épure.'
    } else {
      if (isMixed)   return 'Ton amplitude est instable par rapport à la référence — travaille la régularité de ce segment.'
      if (bigEnd)    return 'Tu perds de l\'amplitude en fin de geste par rapport à la référence — ne relâche pas l\'effort jusqu\'au bout.'
      if (bigStart)  return 'Tu démarres en dessous de la référence puis tu te corriges — porte ton attention sur ton armé initial.'
      if (growing)   return 'L\'écart avec la référence se creuse progressivement — tu décroches en cours de geste, travaille ta tenue.'
      if (shrinking) return 'Tu rattrapes progressivement la référence en cours de geste — tu es sur la bonne voie, travaille maintenant le début.'
      return 'Tu es régulièrement en dessous de la référence sur ce segment — cherche à gagner plus d\'amplitude.'
    }
  } else {
    if (isAbove) {
      if (isMixed)   return 'You alternate above and below the reference inconsistently — work on repeatability in this segment.'
      if (bigEnd)    return 'You exceed the reference most at the end — control your follow-through.'
      if (bigStart)  return 'You start above the reference then converge — watch your initial position.'
      if (shrinking) return 'You exceed the reference but are progressively closing the gap — good trend, keep adjusting.'
      if (growing)   return 'The gap vs reference grows through the movement — work on staying within range.'
      return 'You consistently exceed the reference — control your amplitude to stay on target.'
    } else {
      if (isMixed)   return 'Your amplitude is unstable relative to the reference — work on consistency.'
      if (bigEnd)    return 'You lose amplitude toward the end vs the reference — push through to the finish.'
      if (bigStart)  return 'You start below the reference but self-correct — focus on your setup position.'
      if (growing)   return 'The gap vs reference grows through the movement — work on maintaining effort.'
      if (shrinking) return 'You\'re progressively closing the gap — you\'re on the right track, now work on the start.'
      return 'You\'re consistently below the reference on this segment — try to add more range.'
    }
  }
}

// ── Kinetic chain holistic coaching text ─────────────────────────────────────

function buildChainCoachText(chain: MeasureChain[], lang: 'fr' | 'en'): string | null {
  const withRef = chain.filter(m => m.refPeakT != null && m.refPeakValue != null)
  if (withRef.length < 1) return null

  const curSpan = chain.length > 1
    ? Math.max(...chain.map(m => m.peakT)) - Math.min(...chain.map(m => m.riseOnsetT))
    : 0
  const refSpan = withRef.length > 1
    ? Math.max(...withRef.map(m => m.refPeakT!)) - Math.min(...withRef.map(m => m.refRiseOnsetT ?? m.riseOnsetT))
    : 0

  const compact   = refSpan > 0.05 && curSpan < refSpan * 0.88
  const stretched = refSpan > 0.05 && curSpan > refSpan * 1.12

  const name = (m: MeasureChain) => getMeasureLabel(m.measureId, lang)

  const moreAmp = withRef.filter(m => {
    const ref = Math.abs(m.refPeakValue ?? 0)
    return ref > 1 && (m.amplitudeGap ?? 0) / ref > 0.08
  })
  const lessAmp = withRef.filter(m => {
    const ref = Math.abs(m.refPeakValue ?? 0)
    return ref > 1 && (m.amplitudeGap ?? 0) / ref < -0.08
  })
  const late  = withRef.filter(m => (m.delayT ?? 0) > 0.07)
  const early = withRef.filter(m => (m.delayT ?? 0) < -0.07)

  const parts: string[] = []

  if (lang === 'fr') {
    if (compact)   parts.push('Ton mouvement est globalement plus compact que la référence — tu enchaînes plus rapidement, ce qui peut être le signe d\'une bonne automatisation ou, à l\'inverse, d\'une légère précipitation.')
    else if (stretched) parts.push('Tu développes ton mouvement plus lentement que la référence — chaque phase prend plus de temps, ce qui peut traduire une recherche de contrôle ou une hésitation dans la chaîne.')

    if (moreAmp.length > 0) parts.push(`Tu as plus d'amplitude que la référence sur : ${moreAmp.map(name).join(', ')}.`)
    if (lessAmp.length > 0) parts.push(`Tu manques d'amplitude par rapport à la référence sur : ${lessAmp.map(name).join(', ')}.`)
    if (late.length > 0) parts.push(`Tu arrives en retard dans la chaîne sur : ${late.map(name).join(', ')} — engage ces segments un peu plus tôt.`)
    if (early.length > 0) parts.push(`Tu anticipes sur : ${early.map(name).join(', ')} — laisse les segments précédents se terminer avant d\'enclencher.`)

    if (parts.length === 0) return 'La chaîne cinétique est globalement bien calée sur la référence — timing et amplitudes sont cohérents. Continue dans cette direction.'
  } else {
    if (compact)   parts.push('Your movement is more compact than the reference — you chain everything faster, which may reflect good automaticity or slight rushing.')
    else if (stretched) parts.push('Your movement unfolds more slowly than the reference — each phase takes longer, possibly indicating deliberate control or hesitation.')

    if (moreAmp.length > 0) parts.push(`You exceed the reference amplitude on: ${moreAmp.map(name).join(', ')}.`)
    if (lessAmp.length > 0) parts.push(`You fall short of the reference amplitude on: ${lessAmp.map(name).join(', ')}.`)
    if (late.length > 0) parts.push(`You're late in the chain on: ${late.map(name).join(', ')} — engage these segments a bit earlier.`)
    if (early.length > 0) parts.push(`You're anticipating on: ${early.map(name).join(', ')} — let the preceding segments complete before engaging.`)

    if (parts.length === 0) return 'Your kinetic chain is well aligned with the reference — timing and amplitudes are consistent. Keep it up.'
  }

  return parts.join(' ')
}

// ── DataView ────────────────────────────────────────────────────────────────

interface DataViewProps {
  sequences: Sequence[]
  selectedSeqIdx: number
  onSelectSeq: (idx: number) => void
  onDeleteSeq?: (id: string) => void
  intraRefSeqId: string | null
  onSetIntraRef: (id: string | null) => void
  script: Script | undefined
  onResume: () => void
  onUpdateNotes?: (id: string, notes: SequenceNotes) => void
  contextInputs?: InputValue[]
  /** Views currently selected for this capture session (1..3). */
  selectedViews?: ViewType[]
  /** The view being recorded right now. */
  activeView?: ViewType
  /** Move to the next view in the multi-pass sequence. Hidden if isLastPass. */
  onAdvanceView?: () => void
  /** True when activeView is the last in selectedViews. */
  isLastPass?: boolean
  /** Navigate back to the context/setup view. */
  onShowContext?: () => void
  /** Measure IDs the user has opted in (undefined = show all). */
  selectedMeasureIds?: string[]
}

export function DataView({
  sequences,
  selectedSeqIdx,
  onSelectSeq,
  onDeleteSeq,
  onUpdateNotes,
  intraRefSeqId,
  onSetIntraRef,
  script,
  onResume,
  contextInputs,
  selectedViews,
  activeView,
  onAdvanceView,
  isLastPass,
  onShowContext,
  selectedMeasureIds,
}: DataViewProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { lang: urlLang } = useParams<{ lang?: string }>()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const [showExportModal, setShowExportModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [visiblePatternLabels, setVisiblePatternLabels] = useState<Set<string>>(new Set())

  const chartsAreaRef = useRef<HTMLDivElement>(null)
  const [areaW, setAreaW] = useState(0)
  useEffect(() => {
    const el = chartsAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setAreaW(Math.floor(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleTogglePatternLabel = (label: string) => {
    setVisiblePatternLabels(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const { leftIds, rightToLeft } = buildSymmetryMaps(script)

  const activeMeasureIds: Set<string> | null = (() => {
    if (!script || !selectedViews || selectedViews.length === 0) return null
    const ids = new Set(getMeasuresForViews(script, selectedViews).map(m => m.id))
    return ids.size > 0 ? ids : null
  })()
  const isActiveMeasure = (id: string): boolean => activeMeasureIds == null || activeMeasureIds.has(id)
  const isUserMeasure = (id: string): boolean => !selectedMeasureIds || selectedMeasureIds.length === 0 || selectedMeasureIds.includes(id)

  // Rotation measures with mode "orientation_folded" are shown in the Gantt chain only — skip line charts.
  const orientationRotationIds: Set<string> = (() => {
    if (!script) return new Set()
    const allMeasures = [
      ...(script.measures ?? []),
      ...(script.available_views ?? []).flatMap(v => v.measures),
    ]
    return new Set(allMeasures.filter(m => m.primitive === 'rotation' && m.mode === 'orientation_folded').map(m => m.id))
  })()

  const pills: SequencePill[] = sequences.map((seq, i) => ({
    id: seq.sequence_id,
    index: i,
    state: seq.sequence_id === intraRefSeqId ? 'ref' : 'kept',
  }))

  const safeIdx = Math.min(selectedSeqIdx, Math.max(0, sequences.length - 1))
  const seq = sequences[safeIdx]
  const instances: GestureInstance[] = seq?.instances ?? []
  const currentAgg = aggregate(instances)

  const refSeq = intraRefSeqId ? sequences.find(s => s.sequence_id === intraRefSeqId) : null
  const refIdx = refSeq ? sequences.indexOf(refSeq) : -1
  const isCurrentRef = seq?.sequence_id === intraRefSeqId
  const showDiff = !!refSeq && !isCurrentRef
  const refAgg = refSeq ? aggregate(refSeq.instances ?? []) : null

  const handleExportSelected = () => {
    if (!seq) return
    const isRef = seq.sequence_id === intraRefSeqId
    const json = exportCapture(seq.script_id, seq, isRef)
    downloadJson(`capture_${seq.script_id}_${Date.now()}.json`, json)
    setShowExportModal(false)
  }

  const handleExportAll = () => {
    const bundle = JSON.stringify({ kind: 'sequences_bundle', sequences }, null, 2)
    const blob = new Blob([bundle], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sequences_${seq?.script_id ?? 'export'}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  const handleExportContext = () => {
    if (!script || !contextInputs) return
    const json = exportContext(script.id, contextInputs)
    downloadJson(`context_${script.id}_${Date.now()}.json`, json)
    setShowExportModal(false)
  }

  const handleExportZip = () => {
    const enc = new TextEncoder()
    const files: Record<string, Uint8Array> = {}
    if (contextInputs && contextInputs.length > 0 && script) {
      files['context.json'] = enc.encode(exportContext(script.id, contextInputs))
    }
    files['sequences.json'] = enc.encode(JSON.stringify({ kind: 'sequences_bundle', sequences }, null, 2))
    const zipped = zipSync(files)
    const blob = new Blob([zipped], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `capture_${seq?.script_id ?? 'export'}_${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  if (sequences.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SequenceBar pills={[]} selectedId={null} onSelect={() => {}} onAdd={onResume} theme="light" label={n => t('activity.seq_n', { n })} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
          <span style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--glass-2)',
            border: '1px solid var(--glass-edge)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: 'var(--ink-3)',
            boxShadow: 'var(--shadow-glass)',
          }}>○</span>
          <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-3)', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
            {t('activity.no_sequences')}
          </p>
          <button onClick={onResume} className="btn btn-primary">
            {t('activity.return_to_capture')}
          </button>
        </div>
      </div>
    )
  }

  const chain      = computeChain(instances, showDiff ? (refSeq?.instances ?? []) : undefined)
  const repOnsets  = computeRepOnsets(chain)

  const isContinuous    = script?.movement_type === 'continuous'
  const symmetryPairs   = script?.symmetry_pairs?.length
    ? script.symmetry_pairs
    : inferSymmetryPairs(instances[0]?.measures.map(m => m.id) ?? [])
  const symmetryRows    = isContinuous ? computeSymmetry(symmetryPairs, instances) : []

  // Responsive chart sizing — 2 columns on wide screens
  const CARD_PAD_H = 32   // card padding: 16px × 2 sides
  const COL_GAP    = 12   // var(--space-3)
  const twoCol     = areaW >= 620
  const cellW      = twoCol ? Math.floor((areaW - COL_GAP) / 2) : areaW
  const chartW     = Math.max(200, cellW - CARD_PAD_H)
  const ganttW     = Math.max(200, areaW - CARD_PAD_H)
  const halfW      = Math.floor((ganttW - 8) / 2)
  const chartH     = chartW > 420 ? 96 : 80

  // One PatternArea per rep per measure — shows per-rep timing on every chart.
  // Color and label match the Gantt chain entry for that measure.
  const allPatternAreas: PatternArea[] = repOnsets.map(ro => ({
    onsetT: ro.onsetT,
    peakT:  ro.peakT,
    color:  CHAIN_COLORS[ro.colorIndex % CHAIN_COLORS.length]!,
    label:  getMeasureLabel(ro.measureId, lang),
  }))
  // hiddenPatternLabels = inverse of visiblePatternLabels (empty visible = all hidden)
  const allAreaLabels = new Set(allPatternAreas.map(pa => pa.label))
  const hiddenPatternLabels = new Set([...allAreaLabels].filter(l => !visiblePatternLabels.has(l)))

  // Per-measure coaching texts and kinetic chain insight (only when comparing vs ref)
  const measureCoachTexts = new Map<string, string>()
  if (showDiff && refAgg) {
    for (const { measure } of currentAgg) {
      const refM = refAgg.find(a => a.measure.id === measure.id)
      if (refM) {
        const text = buildMeasureCoachText(measure.series, refM.measure.series, lang)
        if (text) measureCoachTexts.set(measure.id, text)
      }
    }
  }

  const chainCoachText = showDiff && chain.length > 0 ? buildChainCoachText(chain, lang) : null

  // Pre-aggregate all sequences for the print-only PDF section
  const printSeqsData = sequences.map(s => {
    const insts = s.instances ?? []
    const isRef = s.sequence_id === intraRefSeqId
    const hasSeqRef = !!refSeq && !isRef
    const seqAgg = aggregate(insts)
    const seqRefAgg = hasSeqRef ? refAgg : null
    const seqChain = computeChain(insts, hasSeqRef ? (refSeq?.instances ?? []) : undefined)
    const seqRepOnsets = computeRepOnsets(seqChain)
    const seqPatternAreas: PatternArea[] = seqRepOnsets.map(ro => ({
      onsetT: ro.onsetT,
      peakT:  ro.peakT,
      color:  CHAIN_COLORS[ro.colorIndex % CHAIN_COLORS.length]!,
      label:  getMeasureLabel(ro.measureId, lang),
    }))
    const seqCoachTexts = new Map<string, string>()
    if (hasSeqRef && seqRefAgg) {
      for (const { measure } of seqAgg) {
        const refM = seqRefAgg.find(a => a.measure.id === measure.id)
        if (refM) {
          const text = buildMeasureCoachText(measure.series, refM.measure.series, lang)
          if (text) seqCoachTexts.set(measure.id, text)
        }
      }
    }
    const seqChainCoachText  = hasSeqRef && seqChain.length > 0 ? buildChainCoachText(seqChain, lang) : null
    const seqSymmetryPairs   = script?.symmetry_pairs?.length
      ? script.symmetry_pairs
      : inferSymmetryPairs(insts[0]?.measures.map(m => m.id) ?? [])
    const seqSymmetryRows    = isContinuous ? computeSymmetry(seqSymmetryPairs, insts) : []
    return { seq: s, insts, agg: seqAgg, refAgg: seqRefAgg, chain: seqChain, hasRef: hasSeqRef, isRef, patternAreas: seqPatternAreas, coachTexts: seqCoachTexts, chainCoachText: seqChainCoachText, symmetryRows: seqSymmetryRows }
  })
  const PRINT_W = 480

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <style>{`
        .dv-print-only { visibility: hidden; position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: hidden; pointer-events: none; }
        @media print {
          @page { margin: 18mm 20mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { background: #fff !important; color: #1a1a1a !important; font-family: 'Georgia', serif; }
          .dv-screen-only { display: none !important; }
          .dv-print-only { visibility: visible !important; position: static !important; width: auto !important; height: auto !important; overflow: visible !important; pointer-events: auto !important; }

          /* Page */
          .dv-print-page { break-after: page; page-break-after: always; }
          .dv-print-page:last-child { break-after: avoid; page-break-after: avoid; }

          /* Header */
          .dv-print-only h2 { font-size: 16px; font-weight: 700; margin: 0 0 2px; color: #111; font-family: Arial, sans-serif; letter-spacing: -0.01em; }
          .dv-print-only .dv-print-meta { font-size: 10px; color: #666; margin-bottom: 16px; font-family: Arial, sans-serif; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; }

          /* Section titles */
          .dv-print-only .dv-print-section-title {
            font-size: 8px; letter-spacing: 0.18em; text-transform: uppercase;
            color: #999; margin: 18px 0 6px; font-family: Arial, sans-serif;
            border-bottom: 1px solid #ebebeb; padding-bottom: 4px;
          }

          /* Charts — courbes en couleur, fond blanc */
          .dv-print-chart { margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }

          /* Coaching text */
          .dv-print-coach-text {
            font-size: 11px; line-height: 1.65; color: #444; margin: 5px 0 10px;
            border-left: 2px solid #ccc; padding-left: 10px;
            font-family: Arial, sans-serif;
          }

          /* Notes */
          .dv-print-notes { margin-top: 14px; break-inside: avoid; }
          .dv-print-notes p { font-size: 11px; color: #333; line-height: 1.55; margin: 3px 0 0; font-family: Arial, sans-serif; }

          /* Delta table */
          .dv-print-delta { margin-top: 16px; break-inside: avoid; }
          .dv-print-delta-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 11px; border-bottom: 1px solid #efefef; font-family: Arial, sans-serif; color: #333; }
          .dv-print-delta-row:first-of-type { border-top: 1px solid #ddd; }

          /* Tous les textes en noir, y compris dans les SVG */
          svg text, svg tspan { fill: #111 !important; }
          span, p, div, h1, h2, h3, label { color: #111 !important; }
        }
      `}</style>

      <div className="dv-screen-only" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* Sequence bar — navigator with delete */}
      <SequenceBar
        pills={pills}
        selectedId={seq?.sequence_id ?? null}
        onSelect={id => {
          const i = sequences.findIndex(s => s.sequence_id === id)
          if (i >= 0) onSelectSeq(i)
        }}
        onAdd={onResume}
        onDelete={onDeleteSeq}
        theme="light"
        label={n => t('activity.seq_n', { n })}
      />

      {/* Header — titre + bouton PDF (même style que Rapport) */}
      {/* Banner — discipline + gesture name */}
      <div style={{
        padding: '10px var(--space-4) 8px',
        background: 'var(--glass-3)',
        borderBottom: '1px solid var(--glass-edge)',
        backdropFilter: 'var(--glass-blur-strong)',
        WebkitBackdropFilter: 'var(--glass-blur-strong)',
        flexShrink: 0,
      }}>
        {script ? (
          <>
            <div style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
              {getDisciplineLabel(script.discipline, lang)}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.2 }}>
              {getGestureLabel(script.id, script.gesture, lang)}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-1)' }}>
            {lang === 'fr' ? 'Données' : 'Data'}
          </div>
        )}
      </div>

      {/* ── Zone 1: Nav strip — Resume (left) · Finish (right) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: '6px var(--space-4)',
        background: 'var(--glass-2)',
        borderBottom: '1px solid var(--glass-edge)',
        flexShrink: 0,
      }}>
        <button
          onClick={onResume}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(124,241,249,0.12)', border: '1px solid rgba(124,241,249,0.35)',
            borderRadius: 'var(--radius-pill)', padding: '5px 14px',
            fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.08em',
            color: 'var(--accent-1)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <PlayIcon />
          {lang === 'fr' ? 'Reprendre' : 'Resume'}
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { vacuum(); sessionStorage.removeItem('intraRefSeqId'); navigate(`/${urlLang ?? lang}/app`) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(70,172,179,0.10)', border: '1px solid rgba(70,172,179,0.35)',
            borderRadius: 'var(--radius-pill)', padding: '5px 12px',
            fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.08em',
            color: '#46acb3', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <CheckIcon />
          {lang === 'fr' ? 'Terminer' : 'Finish'}
        </button>
      </div>

      {/* ── Zone 2: Action chips — outer row holds scroll + overflow button ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '5px var(--space-4)',
        background: 'var(--glass-1)',
        borderBottom: '1px solid var(--glass-edge)',
        flexShrink: 0,
        gap: 6,
      }}>
        <style>{`.dv-chips::-webkit-scrollbar{display:none}`}</style>

        {/* Scrollable chips — overflow stays within this inner div only */}
        <div className="dv-chips" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          flex: 1, overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {/* Référence */}
          <button
            onClick={() => onSetIntraRef(isCurrentRef ? null : seq.sequence_id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap',
              background: isCurrentRef ? 'rgba(70,172,179,0.15)' : 'var(--glass-2)',
              border: `1px solid ${isCurrentRef ? 'rgba(70,172,179,0.50)' : 'var(--glass-edge)'}`,
              borderRadius: 'var(--radius-pill)', padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'var(--font-data)', fontSize: 10,
              letterSpacing: '0.08em', color: isCurrentRef ? '#46acb3' : 'var(--ink-3)',
            }}
          >
            <StarIcon />
            {isCurrentRef ? (lang === 'fr' ? 'Réf ✓' : 'Ref ✓') : (lang === 'fr' ? 'Réf' : 'Ref')}
          </button>

          {/* Notes */}
          <button
            onClick={() => setShowNotesModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap',
              background: seq?.notes?.coach || seq?.notes?.player ? 'rgba(124,241,249,0.12)' : 'var(--glass-2)',
              border: `1px solid ${seq?.notes?.coach || seq?.notes?.player ? 'rgba(124,241,249,0.40)' : 'var(--glass-edge)'}`,
              borderRadius: 'var(--radius-pill)', padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.08em',
              color: seq?.notes?.coach || seq?.notes?.player ? 'var(--accent-1)' : 'var(--ink-3)',
            }}
          >
            <NoteIcon />
            Notes
            {(seq?.notes?.coach || seq?.notes?.player) && (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-1)', flexShrink: 0 }} />
            )}
          </button>

          {/* Rapport */}
          <button
            onClick={() => navigate('../report', { relative: 'path' })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap',
              background: 'var(--glass-2)', border: '1px solid var(--glass-edge)',
              borderRadius: 'var(--radius-pill)', padding: '4px 10px',
              fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.08em',
              color: 'var(--ink-3)', cursor: 'pointer',
            }}
          >
            <ReportIcon />
            {lang === 'fr' ? 'Rapport' : 'Report'}
          </button>

          {/* PDF */}
          <button
            onClick={() => window.print()}
            className="btn btn-primary"
            style={{ minHeight: 28, padding: '3px 12px', fontSize: 10, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            PDF
          </button>
        </div>

        {/* ··· overflow — outside the scroll container so dropdown is never clipped */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowOverflow(v => !v)}
            aria-label={lang === 'fr' ? 'Plus d\'options' : 'More options'}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: showOverflow ? 'var(--glass-3)' : 'var(--glass-2)',
              border: `1px solid ${showOverflow ? 'rgba(124,241,249,0.30)' : 'var(--glass-edge)'}`,
              borderRadius: 'var(--radius-pill)', padding: '4px 10px',
              fontFamily: 'var(--font-data)', fontSize: 13, letterSpacing: '0.12em',
              color: 'var(--ink-3)', cursor: 'pointer',
            }}
          >
            ···
          </button>
          {showOverflow && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowOverflow(false)}
              />
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                background: 'var(--glass-3)', border: '1px solid var(--glass-edge)',
                borderRadius: 'var(--radius-md)',
                backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                boxShadow: 'var(--shadow-glass)', overflow: 'hidden', minWidth: 148,
              }}>
                {onShowContext && (
                  <button
                    onClick={() => { setShowOverflow(false); onShowContext() }}
                    style={overflowItemStyle}
                  >
                    <ContextIcon />
                    {lang === 'fr' ? 'Contexte' : 'Context'}
                  </button>
                )}
                <button
                  onClick={() => { setShowOverflow(false); setShowExportModal(true) }}
                  style={overflowItemStyle}
                >
                  <ExportIcon />
                  Export
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Multi-pass banner */}
      {selectedViews && selectedViews.length > 1 && activeView && (
        <MultiPassBanner
          selectedViews={selectedViews}
          activeView={activeView}
          isLastPass={isLastPass ?? false}
          onAdvanceView={onAdvanceView}
          hasInstances={instances.length > 0}
          lang={lang}
        />
      )}

      {/* Intra-ref banner */}
      {showDiff && (
        <div style={{
          margin: 'var(--space-3) var(--space-4) var(--space-2)',
          padding: '7px 14px',
          background: 'rgba(70,172,179,0.08)',
          border: '1px solid rgba(70,172,179,0.30)',
          borderRadius: 'var(--radius-pill)',
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--accent-3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
        }}>
          {lang === 'fr'
            ? `Séq. ${safeIdx + 1} vs Séq. ${refIdx + 1} ★`
            : `Seq. ${safeIdx + 1} vs Seq. ${refIdx + 1} ★`}
        </div>
      )}

      {/* Charts — scrollable */}
      <div ref={chartsAreaRef} data-charts-scroll style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

        {/* ── RPE dashboard card ── */}
        {contextInputs && (() => {
          const getN = (id: string) => { const v = contextInputs.find(c => c.id === id)?.value; return typeof v === 'number' ? v : null }
          const rPhys = getN('readiness_physical'); const rCog = getN('readiness_cognitive')
          const ePhys = getN('rpe_physical');       const eCog = getN('rpe_cognitive')
          const hasAny = rPhys != null || rCog != null || ePhys != null || eCog != null
          if (!hasAny) return null

          const rpeHue  = (v: number) => 150 - (v - 1) * 13
          const readHue = (v: number) => (v - 1) * 13
          const means = (...vs: (number | null)[]) => { const f = vs.filter((v): v is number => v != null); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null }
          const delta = (() => { const r = means(rPhys, rCog); const e = means(ePhys, eCog); return r != null && e != null ? Math.round((r - e) * 10) / 10 : null })()

          const miniBar = (v: number | null, hue: number) => v == null ? null : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 15, fontWeight: 700, color: `hsl(${hue},70%,55%)`, minWidth: 16, lineHeight: 1 }}>{v}</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(181,216,219,0.10)' }}>
                <div style={{ width: `${Math.round(v / 10 * 100)}%`, height: '100%', borderRadius: 2, background: `hsl(${hue},70%,50%)` }} />
              </div>
            </div>
          )

          const LABEL: React.CSSProperties = { fontFamily: 'var(--font-data)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 4 }
          const COL: React.CSSProperties = { fontFamily: 'var(--font-data)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', textAlign: 'center', marginBottom: 6 }

          return (
            <div style={{ ...card, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                  RPE · {lang === 'fr' ? 'Bilan de séance' : 'Session load'}
                </span>
                {delta != null && (
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 700, color: delta >= 0 ? 'hsl(140,70%,55%)' : 'hsl(10,70%,55%)' }}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                    <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--ink-3)', marginLeft: 4 }}>
                      {delta >= 0 ? (lang === 'fr' ? 'réserve' : 'capacity') : (lang === 'fr' ? 'surcharge' : 'overreach')}
                    </span>
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '6px 12px', alignItems: 'center' }}>
                <div /><div style={COL}>{lang === 'fr' ? 'Avant' : 'Before'}</div><div style={COL}>{lang === 'fr' ? 'Après' : 'After'}</div>
                <div style={LABEL}>{lang === 'fr' ? 'Physique' : 'Physical'}</div>
                <div>{miniBar(rPhys, readHue(rPhys ?? 5))}</div>
                <div>{miniBar(ePhys, rpeHue(ePhys ?? 5))}</div>
                <div style={LABEL}>{lang === 'fr' ? 'Cognitif' : 'Cognitive'}</div>
                <div>{miniBar(rCog, readHue(rCog ?? 5))}</div>
                <div>{miniBar(eCog, rpeHue(eCog ?? 5))}</div>
              </div>
            </div>
          )
        })()}

        {currentAgg.length === 0
          ? <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>{t('analysis.no_measures')}</p>
          : <>
            {instances.length > 1 && (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                {t('analysis.n_repetitions', { n: instances.length })}
              </p>
            )}
            {allPatternAreas.length > 0 && (() => {
              const seen = new Set<string>()
              const unique = allPatternAreas.filter(pa => { if (seen.has(pa.label)) return false; seen.add(pa.label); return true })
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', paddingBottom: 4 }}>
                  {unique.map(pa => {
                    const active = !hiddenPatternLabels.has(pa.label)
                    return (
                      <button key={pa.label} onClick={() => handleTogglePatternLabel(pa.label)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.05em',
                        color: active ? 'var(--ink-1)' : 'var(--ink-4)',
                        background: active ? `${pa.color}18` : 'var(--glass-1)',
                        border: `1px solid ${active ? pa.color : 'var(--glass-edge)'}`,
                        borderRadius: 4,
                        padding: '3px 7px 3px 5px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        <span style={{
                          width: 11, height: 11, borderRadius: 2, flexShrink: 0,
                          border: `1.5px solid ${active ? pa.color : 'var(--ink-4)'}`,
                          background: active ? pa.color : 'transparent',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {active && (
                            <svg width={7} height={5} viewBox="0 0 7 5" fill="none">
                              <polyline points="1,2.5 3,4.5 6,1" stroke="#020d0e" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        {pa.label}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
            <div style={{ display: 'grid', gridTemplateColumns: twoCol ? 'repeat(2, 1fr)' : '1fr', gap: 'var(--space-3)' }}>
              {currentAgg.filter(({ measure }) => !leftIds.has(measure.id) && isActiveMeasure(measure.id) && isUserMeasure(measure.id) && !orientationRotationIds.has(measure.id)).map(({ measure, envelopeMin, envelopeMax }) => {
                const leftId = rightToLeft.get(measure.id)
                const leftAgg = leftId ? currentAgg.find(a => a.measure.id === leftId) : undefined
                // Use the latest instance's contact result for the hitting-plane chart
                const latestContact = measure.id === 'hitting_plane'
                  ? instances[instances.length - 1]?.contact
                  : undefined
                return (
                  <div key={measure.id} style={leftAgg && twoCol ? { ...card, gridColumn: 'span 2' } : card}>
                    {measure.id === 'hitting_plane' ? (
                      <HittingPlaneChart
                        measure={measure}
                        contact={latestContact}
                        width={chartW}
                        height={chartH}
                        lang={lang}
                      />
                    ) : leftAgg ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <MeasureChart
                          measure={measure}
                          width={halfW}
                          height={chartH}
                          envelopeMin={instances.length > 1 ? envelopeMin : undefined}
                          envelopeMax={instances.length > 1 ? envelopeMax : undefined}
                          patternAreas={allPatternAreas}
                          hiddenLabels={hiddenPatternLabels}
                          referenceMean={showDiff ? refAgg?.find(a => a.measure.id === measure.id)?.measure.series : undefined}
                          diffCoachText={measureCoachTexts.get(measure.id)}
                          lang={lang}
                          tooltipText={getMeasureTooltip(measure.id, lang)}
                          sideTag={lang === 'fr' ? 'D' : 'R'}
                        />
                        <MeasureChart
                          measure={leftAgg.measure}
                          width={halfW}
                          height={chartH}
                          envelopeMin={instances.length > 1 ? leftAgg.envelopeMin : undefined}
                          envelopeMax={instances.length > 1 ? leftAgg.envelopeMax : undefined}
                          patternAreas={allPatternAreas}
                          hiddenLabels={hiddenPatternLabels}
                          referenceMean={showDiff ? refAgg?.find(a => a.measure.id === leftId)?.measure.series : undefined}
                          diffCoachText={measureCoachTexts.get(leftId!)}
                          lang={lang}
                          tooltipText={getMeasureTooltip(leftId!, lang)}
                          sideTag={lang === 'fr' ? 'G' : 'L'}
                        />
                      </div>
                    ) : (
                      <MeasureChart
                        measure={measure}
                        width={chartW}
                        height={chartH}
                        envelopeMin={instances.length > 1 ? envelopeMin : undefined}
                        envelopeMax={instances.length > 1 ? envelopeMax : undefined}
                        patternAreas={allPatternAreas}
                        hiddenLabels={hiddenPatternLabels}
                        onToggleLabel={handleTogglePatternLabel}
                        referenceMean={showDiff ? refAgg?.find(a => a.measure.id === measure.id)?.measure.series : undefined}
                        diffCoachText={measureCoachTexts.get(measure.id)}
                        lang={lang}
                        tooltipText={getMeasureTooltip(measure.id, lang)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        }

        {/* Ball speed card */}
        {seq?.ball_speed && seq.ball_speed.length > 1 && isUserMeasure('ball_speed') && (
          <BallSpeedCard samples={seq.ball_speed} width={ganttW} lang={lang} />
        )}

        {/* Kinetic chain (finite) / Bilateral symmetry (continuous) */}
        {isContinuous ? (
          symmetryRows.length > 0 && (
            <div style={card}>
              <p style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 'var(--space-3)',
              }}>
                {lang === 'fr' ? 'Symétrie' : 'Symmetry'}
              </p>
              <SymmetryChart rows={symmetryRows} width={ganttW} lang={lang} />
            </div>
          )
        ) : (
          chain.length > 0 && (
            <div style={card}>
              <p style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 'var(--space-3)',
              }}>
                {t('analysis.tab_chain')}
              </p>
              <GanttChainChart chain={chain} hasRef={showDiff} width={ganttW} insightText={chainCoachText ?? undefined} lang={lang} />
            </div>
          )
        )}

        {/* Bottom padding */}
        <div style={{ height: 16 }} />
      </div>

      </div>{/* end dv-screen-only */}

      {/* Print-only: all sequences stacked vertically for PDF — clean text + charts, no cards */}
      <div className="dv-print-only">
        {/* ── First page: title + context ───────────────────────────────────────── */}
        <div className="dv-print-page">
          <div style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#666', fontFamily: 'Arial, sans-serif', marginBottom: 6 }}>
              {sequences.length > 0 && new Date(sequences[0].started_at * 1000).toLocaleDateString()}
              {' · '}{lang === 'fr' ? 'Données de séance' : 'Session data'}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111', fontFamily: 'Arial, sans-serif', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {script ? getGestureLabel(script.id, script.gesture, lang) : (sequences[0]?.script_id ?? '')}
            </h1>
            <div style={{ fontSize: 12, color: '#666', fontFamily: 'Arial, sans-serif' }}>
              {script ? getDisciplineLabel(script.discipline, lang) : ''}
              {script ? ' · ' : ''}
              {sequences.length} {lang === 'fr' ? (sequences.length === 1 ? 'séquence' : 'séquences') : (sequences.length === 1 ? 'sequence' : 'sequences')}
            </div>
          </div>
          {contextInputs && contextInputs.filter(v => v.value).length > 0 && (() => {
            const RPE_IDS = new Set(['readiness_physical', 'readiness_cognitive', 'rpe_physical', 'rpe_cognitive'])
            const getN = (id: string) => { const v = contextInputs.find(c => c.id === id)?.value; return typeof v === 'number' ? v : null }
            const rPhys = getN('readiness_physical'); const rCog = getN('readiness_cognitive')
            const ePhys = getN('rpe_physical'); const eCog = getN('rpe_cognitive')
            const hasRpe = rPhys != null || rCog != null || ePhys != null || eCog != null
            const other = contextInputs.filter(v => v.value && !RPE_IDS.has(v.id))
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* RPE compact row */}
                {hasRpe && (
                  <div>
                    <div style={{ fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#999', fontFamily: 'Arial, sans-serif', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #ebebeb' }}>
                      RPE · {lang === 'fr' ? 'Bilan de séance' : 'Session load'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px 16px' }}>
                      {([['readiness_physical', lang === 'fr' ? 'Fraîcheur phys.' : 'Phys. freshness', rPhys],
                         ['readiness_cognitive', lang === 'fr' ? 'Acuité cog.' : 'Cog. sharpness', rCog],
                         ['rpe_physical', lang === 'fr' ? 'Effort phys.' : 'Phys. RPE', ePhys],
                         ['rpe_cognitive', lang === 'fr' ? 'Effort mental' : 'Mental RPE', eCog]] as [string, string, number | null][])
                        .filter(([,, v]) => v != null)
                        .map(([id, label, v]) => (
                          <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#999', fontFamily: 'Arial, sans-serif' }}>{label}</span>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#111', fontFamily: 'Arial, sans-serif' }}>{v}<span style={{ fontSize: 9, fontWeight: 400, color: '#888' }}>/10</span></span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {/* Other conditions */}
                {other.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#999', fontFamily: 'Arial, sans-serif', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #ebebeb' }}>
                      {lang === 'fr' ? 'Conditions de séance' : 'Session context'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
                      {other.map(v => {
                        const scriptInput = script?.inputs?.find(si => si.id === v.id)
                        const inputLabel = scriptInput
                          ? getInputLabel(scriptInput.label, lang)
                          : v.id.replace(/_/g, ' ')
                        return (
                          <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontFamily: 'Arial, sans-serif' }}>{inputLabel}</span>
                            <span style={{ fontSize: 12, color: '#111', fontWeight: 500, fontFamily: 'Arial, sans-serif' }}>{String(v.value)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {printSeqsData.map(({ seq: ps, insts: pinsts, agg: pagg, refAgg: prefAgg, chain: pchain, hasRef: phasRef, isRef: pisRef, patternAreas: ppat, coachTexts: pcoach, chainCoachText: pChainCoach, symmetryRows: pSymmetryRows }, seqIdx) => (
          <div key={ps.sequence_id} className="dv-print-page">
            {/* Header */}
            <h2>
              {lang === 'fr' ? `Séquence ${seqIdx + 1}` : `Sequence ${seqIdx + 1}`}
              {pisRef && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8, color: '#2a7a2a' }}>— {lang === 'fr' ? 'Référence' : 'Reference'}</span>}
            </h2>
            <div className="dv-print-meta">
              {script && `${getGestureLabel(script.id, script.gesture, lang)} · ${getDisciplineLabel(script.discipline, lang)} · `}
              {pinsts.length} {lang === 'fr' ? (pinsts.length === 1 ? 'répétition' : 'répétitions') : (pinsts.length === 1 ? 'rep' : 'reps')}
            </div>
            {/* Measure charts */}
            {pagg.filter(({ measure }) => !leftIds.has(measure.id) && isActiveMeasure(measure.id) && isUserMeasure(measure.id) && !orientationRotationIds.has(measure.id)).map(({ measure, envelopeMin, envelopeMax }) => {
              const leftId = rightToLeft.get(measure.id)
              const leftAgg2 = leftId ? pagg.find(a => a.measure.id === leftId) : undefined
              const coachT = pcoach.get(measure.id)
              return (
                <div key={measure.id} className="dv-print-chart">
                  {leftAgg2 ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <MeasureChart
                        measure={measure}
                        width={Math.floor((PRINT_W - 8) / 2)}
                        height={72}
                        envelopeMin={pinsts.length > 1 ? envelopeMin : undefined}
                        envelopeMax={pinsts.length > 1 ? envelopeMax : undefined}
                        patternAreas={ppat}
                        hiddenLabels={new Set(ppat.map(p => p.label))}
                        referenceMean={phasRef ? prefAgg?.find(a => a.measure.id === measure.id)?.measure.series : undefined}
                        solidStroke="#7B54FF"
                        lang={lang}
                        sideTag={lang === 'fr' ? 'D' : 'R'}
                      />
                      <MeasureChart
                        measure={leftAgg2.measure}
                        width={Math.floor((PRINT_W - 8) / 2)}
                        height={72}
                        envelopeMin={pinsts.length > 1 ? leftAgg2.envelopeMin : undefined}
                        envelopeMax={pinsts.length > 1 ? leftAgg2.envelopeMax : undefined}
                        patternAreas={ppat}
                        hiddenLabels={new Set(ppat.map(p => p.label))}
                        referenceMean={phasRef ? prefAgg?.find(a => a.measure.id === leftId)?.measure.series : undefined}
                        solidStroke="#7B54FF"
                        lang={lang}
                        sideTag={lang === 'fr' ? 'G' : 'L'}
                      />
                    </div>
                  ) : (
                    <MeasureChart
                      measure={measure}
                      width={PRINT_W}
                      height={72}
                      envelopeMin={pinsts.length > 1 ? envelopeMin : undefined}
                      envelopeMax={pinsts.length > 1 ? envelopeMax : undefined}
                      patternAreas={ppat}
                      hiddenLabels={new Set(ppat.map(p => p.label))}
                      referenceMean={phasRef ? prefAgg?.find(a => a.measure.id === measure.id)?.measure.series : undefined}
                      solidStroke="#7B54FF"
                      lang={lang}
                    />
                  )}
                  {coachT && <p className="dv-print-coach-text">{coachT}</p>}
                </div>
              )
            })}
            {/* Ball speed — print */}
            {ps.ball_speed && ps.ball_speed.length > 1 && isUserMeasure('ball_speed') && (() => {
              const spd = ps.ball_speed!
              const maxKmh = Math.max(...spd.map(s => s.kmh))
              const minKmh = Math.min(...spd.map(s => s.kmh))
              const rng = maxKmh - minKmh || 1
              const pH = 54
              const xSc = PRINT_W / Math.max(spd.length - 1, 1)
              const pts = spd.map((s, i) => `${i * xSc},${pH - ((s.kmh - minKmh) / rng) * pH}`).join(' ')
              return (
                <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginTop: 14 }}>
                  <div className="dv-print-section-title">
                    {lang === 'fr' ? 'Vitesse balle (approx.)' : 'Ball speed (approx.)'}
                    <span style={{ marginLeft: 8, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
                      MAX {maxKmh.toFixed(0)} km/h
                    </span>
                  </div>
                  <svg width={PRINT_W} height={pH} style={{ display: 'block' }}>
                    <line x1={0} y1={pH / 2} x2={PRINT_W} y2={pH / 2} stroke="#ddd" strokeDasharray="2 4" />
                    <polyline points={pts} fill="none" stroke="#E86B00" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    <text x={4} y={10} fontFamily="Arial" fontSize={8} fill="#888">{maxKmh.toFixed(0)}</text>
                    <text x={4} y={pH - 2} fontFamily="Arial" fontSize={8} fill="#888">{minKmh.toFixed(0)}</text>
                  </svg>
                </div>
              )
            })()}
            {/* Kinetic chain (finite) / Bilateral symmetry (continuous) */}
            {isContinuous ? (
              pSymmetryRows.length > 0 && (
                <>
                  <div className="dv-print-section-title">{lang === 'fr' ? 'Symétrie bilatérale' : 'Bilateral symmetry'}</div>
                  <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                    <SymmetryChart rows={pSymmetryRows} width={PRINT_W} lang={lang} />
                  </div>
                </>
              )
            ) : (
              pchain.length > 0 && (
                <>
                  <div className="dv-print-section-title">{lang === 'fr' ? 'Chaîne cinétique' : 'Kinetic chain'}</div>
                  <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                    <GanttChainChart chain={pchain} hasRef={phasRef} width={PRINT_W} insightText={pChainCoach ?? undefined} lang={lang} />
                  </div>
                </>
              )
            )}
            {/* Notes */}
            {(ps.notes?.coach || ps.notes?.player) && (
              <div className="dv-print-notes">
                <div className="dv-print-section-title">Notes</div>
                {ps.notes?.coach && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#555', letterSpacing: '0.1em' }}>{lang === 'fr' ? 'Entraîneur' : 'Coach'}</span>
                    <p>{ps.notes.coach}</p>
                  </div>
                )}
                {ps.notes?.player && (
                  <div>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#555', letterSpacing: '0.1em' }}>{lang === 'fr' ? 'Joueur' : 'Player'}</span>
                    <p>{ps.notes.player}</p>
                  </div>
                )}
              </div>
            )}
            {/* Delta vs reference */}
            {phasRef && prefAgg && pagg.length > 0 && (
              <div className="dv-print-delta">
                <div className="dv-print-section-title">
                  ∆ {lang === 'fr' ? `vs Séq. ${refIdx + 1} (référence)` : `vs Seq. ${refIdx + 1} (reference)`}
                </div>
                {pagg.filter(({ measure }) => !leftIds.has(measure.id) && isActiveMeasure(measure.id) && isUserMeasure(measure.id) && !orientationRotationIds.has(measure.id)).map(({ measure }) => {
                  const ref = prefAgg.find(a => a.measure.id === measure.id)
                  if (!ref) return null
                  const d = measure.summary.mean - ref.measure.summary.mean
                  return (
                    <div key={measure.id} className="dv-print-delta-row">
                      <span>{getMeasureLabel(measure.id, lang)}</span>
                      <span>{measure.summary.mean.toFixed(1)} {measure.unit} <span style={{ color: '#666' }}>({d >= 0 ? '+' : ''}{d.toFixed(1)})</span></span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Notes modal */}
      {showNotesModal && seq && (
        <NotesModal
          lang={lang}
          initialNotes={seq.notes ?? {}}
          onSave={notes => {
            onUpdateNotes?.(seq.sequence_id, notes)
            setShowNotesModal(false)
          }}
          onClose={() => setShowNotesModal(false)}
        />
      )}

      {/* Export modal */}
      {showExportModal && (
        <ExportModal
          lang={lang}
          hasContext={!!contextInputs && contextInputs.length > 0}
          hasSequence={!!seq}
          hasAllSequences={sequences.length > 1}
          onExportContext={handleExportContext}
          onExportSelected={handleExportSelected}
          onExportAll={handleExportAll}
          onExportZip={handleExportZip}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  )
}

// ── ExportModal ──────────────────────────────────────────────────────────────

interface ExportModalProps {
  lang: 'fr' | 'en'
  hasContext: boolean
  hasSequence: boolean
  hasAllSequences: boolean
  onExportContext: () => void
  onExportSelected: () => void
  onExportAll: () => void
  onExportZip: () => void
  onClose: () => void
}

function ExportModal({ lang, hasContext, hasSequence, hasAllSequences, onExportContext, onExportSelected, onExportAll, onExportZip, onClose }: ExportModalProps) {
  const items = [
    {
      label: lang === 'fr' ? 'Archive ZIP complète' : 'Full ZIP archive',
      sub: lang === 'fr' ? 'Contexte + séquences' : 'Context + sequences',
      onClick: onExportZip,
      enabled: hasSequence,
      icon: '⬡',
    },
    {
      label: lang === 'fr' ? 'Exporter le contexte' : 'Export context',
      sub: lang === 'fr' ? 'Conditions de la séance' : 'Session conditions',
      onClick: onExportContext,
      enabled: hasContext,
      icon: '☰',
    },
    {
      label: lang === 'fr' ? 'Séquence sélectionnée' : 'Selected sequence',
      sub: 'JSON',
      onClick: onExportSelected,
      enabled: hasSequence,
      icon: '◈',
    },
    {
      label: lang === 'fr' ? 'Toutes les séquences' : 'All sequences',
      sub: 'JSON bundle',
      onClick: onExportAll,
      enabled: hasAllSequences,
      icon: '◉',
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(2,13,14,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 60,
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'absolute',
        left: 'var(--space-3)',
        right: 'var(--space-3)',
        bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px) + 90px)',
        zIndex: 61,
        background: 'var(--glass-3)',
        border: '1px solid var(--glass-edge-strong)',
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'var(--glass-blur-strong)',
        WebkitBackdropFilter: 'var(--glass-blur-strong)',
        boxShadow: 'var(--shadow-float)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px var(--space-4) 10px',
          borderBottom: '1px solid var(--glass-edge)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
            {lang === 'fr' ? 'Exporter' : 'Export'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.enabled ? item.onClick : undefined}
            disabled={!item.enabled}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: '14px var(--space-4)',
              background: 'none',
              border: 'none',
              borderBottom: i < items.length - 1 ? '1px solid var(--glass-edge)' : 'none',
              cursor: item.enabled ? 'pointer' : 'default',
              opacity: item.enabled ? 1 : 0.4,
              textAlign: 'left',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={e => { if (item.enabled) (e.currentTarget as HTMLElement).style.background = 'var(--glass-1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <span style={{ fontSize: 18, color: 'var(--ink-2)', flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-1)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>{item.sub}</div>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>→</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ── Overflow dropdown item style ─────────────────────────────────────────────

import type { CSSProperties } from 'react'

const overflowItemStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '9px 14px', background: 'transparent', border: 'none',
  fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.08em',
  color: 'var(--ink-2)', cursor: 'pointer', textAlign: 'left',
  borderBottom: '1px solid var(--glass-edge)',
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="6,4 16,10 6,16" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ContextIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={10} cy={10} r={7.5} />
      <path d="M10 6 L10 10.5" />
      <circle cx={10} cy={13.5} r={0.8} fill="currentColor" stroke="none" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="10,2 12.4,7.6 18.5,8.2 14,12.1 15.4,18 10,15 4.6,18 6,12.1 1.5,8.2 7.6,7.6" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 12 L 10 3" />
      <path d="M6 7 L 10 3 L 14 7" />
      <path d="M4 14 L4 16 L16 16 L16 14" />
    </svg>
  )
}

function ReportIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="12" height="14" rx="1.5" />
      <path d="M7 7 L13 7" />
      <path d="M7 10 L13 10" />
      <path d="M7 13 L10 13" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={10} cy={10} r={7.5} />
      <polyline points="6.5,10.5 9,13 13.5,7.5" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4 H16 V13 L12 17 H4 Z" />
      <path d="M12 13 H16" />
      <path d="M12 13 V17" />
      <path d="M7 8 H13" />
      <path d="M7 11 H10" />
    </svg>
  )
}

// ── NotesModal ────────────────────────────────────────────────────────────────

interface NotesModalProps {
  lang: 'fr' | 'en'
  initialNotes: SequenceNotes
  onSave: (notes: SequenceNotes) => void
  onClose: () => void
}

function NotesModal({ lang, initialNotes, onSave, onClose }: NotesModalProps) {
  const [coach, setCoach] = useState(initialNotes.coach ?? '')
  const [player, setPlayer] = useState(initialNotes.player ?? '')

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(2,13,14,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 60,
        }}
      />
      {/* Modal — centré dans la fenêtre */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(480px, calc(100vw - 32px))',
        zIndex: 61,
        background: 'var(--glass-3)',
        border: '1px solid var(--glass-edge-strong)',
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'var(--glass-blur-strong)',
        WebkitBackdropFilter: 'var(--glass-blur-strong)',
        boxShadow: 'var(--shadow-float)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px var(--space-4) 10px',
          borderBottom: '1px solid var(--glass-edge)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
            {lang === 'fr' ? 'Notes de séquence' : 'Sequence notes'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Coach */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--accent-2)',
              marginBottom: 6,
            }}>
              {lang === 'fr' ? 'Entraîneur' : 'Coach'}
            </label>
            <textarea
              value={coach}
              onChange={e => setCoach(e.target.value)}
              placeholder={lang === 'fr' ? 'Correction, observation…' : 'Coaching note, observation…'}
              rows={3}
              style={{
                width: '100%',
                background: 'var(--glass-1)',
                border: '1px solid var(--glass-edge)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                color: 'var(--ink-1)',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Player */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--accent-3)',
              marginBottom: 6,
            }}>
              {lang === 'fr' ? 'Joueur / Athlète' : 'Player / Athlete'}
            </label>
            <textarea
              value={player}
              onChange={e => setPlayer(e.target.value)}
              placeholder={lang === 'fr' ? 'Sensation, ressenti…' : 'Feeling, sensation…'}
              rows={3}
              style={{
                width: '100%',
                background: 'var(--glass-1)',
                border: '1px solid var(--glass-edge)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                color: 'var(--ink-1)',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
          </div>

          <button
            onClick={() => onSave({ coach: coach.trim() || undefined, player: player.trim() || undefined })}
            style={{
              alignSelf: 'flex-end',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 22px',
              borderRadius: 'var(--radius-pill)',
              background: 'linear-gradient(135deg, #7cf1f9 0%, #076b72 100%)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 6px 18px -6px rgba(7,107,114,0.7)',
            }}
          >
            {lang === 'fr' ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

const card: CSSProperties = {
  background: 'var(--glass-2)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--shadow-glass)',
}

// ── BallSpeedCard ─────────────────────────────────────────────────────────────

interface BallSpeedCardProps {
  samples: BallSpeedSample[]
  width: number
  lang: 'fr' | 'en'
}

function BallSpeedCard({ samples, width, lang }: BallSpeedCardProps) {
  const maxKmh = Math.max(...samples.map(s => s.kmh))
  const minKmh = Math.min(...samples.map(s => s.kmh))
  const range = maxKmh - minKmh || 1
  const h = 72
  const xScale = width / Math.max(samples.length - 1, 1)

  const points = samples
    .map((s, i) => `${i * xScale},${h - ((s.kmh - minKmh) / range) * h}`)
    .join(' ')

  const label = lang === 'fr' ? 'Vitesse balle (approx.)' : 'Ball speed (approx.)'
  const maxLabel = lang === 'fr' ? 'MAX' : 'MAX'

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          {label}
          <span style={{ marginLeft: 6, color: 'var(--ink-4)' }}>km/h</span>
        </span>
        {/* Max speed card */}
        <div style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          padding: '4px 12px',
          background: 'rgba(124,241,249,0.12)',
          border: '1px solid rgba(124,241,249,0.35)',
          borderRadius: 'var(--radius-pill)',
        }}>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(124,241,249,0.8)' }}>{maxLabel}</span>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 18, fontWeight: 700, color: '#7cf1f9', fontVariantNumeric: 'tabular-nums' }}>
            {maxKmh.toFixed(0)}
          </span>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'rgba(124,241,249,0.7)' }}>km/h</span>
        </div>
      </div>
      <svg width={width} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="ball-speed-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7cf1f9" />
            <stop offset="100%" stopColor="#FF7A3D" />
          </linearGradient>
        </defs>
        <line x1={0} y1={h / 2} x2={width} y2={h / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        {/* Glow */}
        <polyline points={points} fill="none" stroke="url(#ball-speed-grad)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.18} />
        {/* Line */}
        <polyline points={points} fill="none" stroke="url(#ball-speed-grad)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <text x={4} y={10} fontFamily="var(--font-data)" fontSize={9} fill="rgba(181,216,219,0.7)">{maxKmh.toFixed(0)}</text>
        <text x={4} y={h - 2} fontFamily="var(--font-data)" fontSize={9} fill="rgba(181,216,219,0.7)">{minKmh.toFixed(0)}</text>
      </svg>
    </div>
  )
}

// ── MultiPassBanner ──────────────────────────────────────────────────────────

interface MultiPassBannerProps {
  selectedViews: ViewType[]
  activeView: ViewType
  isLastPass: boolean
  hasInstances: boolean
  onAdvanceView?: () => void
}

function MultiPassBanner({ selectedViews, activeView, isLastPass, hasInstances, onAdvanceView, lang }: MultiPassBannerProps & { lang: 'fr' | 'en' }) {
  const idx = selectedViews.indexOf(activeView)
  const passLabel = lang === 'fr' ? `Passe ${idx + 1}/${selectedViews.length}` : `Pass ${idx + 1}/${selectedViews.length}`
  const viewLabel = getViewLabel(activeView, lang)
  return (
    <div
      data-testid="multipass-banner"
      style={{
        margin: '0 var(--space-4) var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'rgba(124,241,249,0.06)',
        border: '1px solid rgba(124,241,249,0.30)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--accent-purple)',
        }}>
          {passLabel}
        </span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          color: 'var(--ink-1)',
          fontWeight: 600,
        }}>
          {viewLabel}
        </span>
      </div>
      {!isLastPass && hasInstances && onAdvanceView && (
        <button
          onClick={onAdvanceView}
          data-testid="advance-view-button"
          className="btn"
          style={{
            background: 'var(--accent-purple)',
            color: 'var(--void)',
            border: 'none',
            fontWeight: 600,
            padding: 'var(--space-2) var(--space-4)',
          }}
        >
          {lang === 'fr' ? 'Vue suivante →' : 'Next view →'}
        </button>
      )}
      {isLastPass && (
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--accent-3)',
          padding: '4px 10px',
          background: 'rgba(70,172,179,0.10)',
          border: '1px solid rgba(70,172,179,0.30)',
          borderRadius: 'var(--radius-pill)',
        }}>
          {lang === 'fr' ? '✓ Dernière vue' : '✓ Last view'}
        </span>
      )}
    </div>
  )
}
