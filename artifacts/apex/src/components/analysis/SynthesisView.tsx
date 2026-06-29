import type { CSSProperties } from 'react'
import type { Sequence, GestureInstance } from '../../lib/export'
import type { Script } from '../../lib/scripts'

// ─── Stats aggregation ───────────────────────────────────────────────────────
// Uses per-instance summaries directly — no resampling needed for scalars.

interface Stat {
  id: string
  unit: string
  min: number
  max: number
  mean: number
  sd: number
  range: number
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function computeStats(instances: GestureInstance[]): Stat[] {
  if (!instances.length) return []
  return instances[0].measures.map(ref => {
    const ms = instances
      .map(inst => inst.measures.find(m => m.id === ref.id))
      .filter((m): m is typeof ref => !!m)
    return {
      id: ref.id,
      unit: ref.unit,
      min: avg(ms.map(m => m.summary.min)),
      max: avg(ms.map(m => m.summary.max)),
      mean: avg(ms.map(m => m.summary.mean)),
      sd: avg(ms.map(m => m.summary.sd)),
      range: avg(ms.map(m => m.summary.range)),
    }
  })
}

// ─── Verdict ─────────────────────────────────────────────────────────────────

type Verdict =
  | 'ok'
  | 'max_low' | 'max_high'
  | 'min_high' | 'min_low'
  | 'mean_low' | 'mean_high'
  | 'range_low' | 'range_high'
  | 'sd_high'
  | 'cross_range_mean_low' | 'cross_range_mean_high'
  | 'cross_mean_sd'
  | 'cross_max_min'

const PRIORITY: Record<Verdict, number> = {
  cross_max_min: 5, max_low: 5, max_high: 5,
  min_high: 4, min_low: 4,
  cross_range_mean_low: 3, cross_range_mean_high: 3, mean_low: 3, mean_high: 3,
  cross_mean_sd: 2, range_low: 2, range_high: 2,
  sd_high: 1,
  ok: 0,
}

function getVerdict(cur: Stat, ref: Stat): Verdict {
  const tol = (v: number) => Math.max(Math.abs(v) * 0.05, 1)
  const dMax = cur.max - ref.max
  const dMin = cur.min - ref.min
  const dMean = cur.mean - ref.mean
  const dRange = cur.range - ref.range
  const dSd = cur.sd - ref.sd
  const maxOk = Math.abs(dMax) < tol(ref.max)
  const minOk = Math.abs(dMin) < tol(ref.min)
  const meanOk = Math.abs(dMean) < tol(ref.mean)
  const rangeOk = Math.abs(dRange) < tol(ref.range)
  const sdOk = Math.abs(dSd) < tol(ref.sd)

  if (rangeOk && !meanOk) return dMean < 0 ? 'cross_range_mean_low' : 'cross_range_mean_high'
  if (meanOk && !sdOk && dSd > 0) return 'cross_mean_sd'
  if (maxOk && !minOk && dMin > 0) return 'cross_max_min'
  if (!maxOk) return dMax < 0 ? 'max_low' : 'max_high'
  if (!minOk) return dMin > 0 ? 'min_high' : 'min_low'
  if (!meanOk) return dMean < 0 ? 'mean_low' : 'mean_high'
  if (!rangeOk) return dRange < 0 ? 'range_low' : 'range_high'
  if (!sdOk && dSd > 0) return 'sd_high'
  return 'ok'
}

// Each verdict maps to a short coaching instruction — no numbers, no labels embedded.
const VERDICT_TEXT: Record<Verdict, string> = {
  ok: '',
  max_low: 'Tu ne termines pas ton mouvement assez loin — pousse jusqu\'au bout.',
  max_high: 'Tu dépasses l\'amplitude finale — maîtrise la fin du mouvement.',
  min_high: 'Tu ne t\'armes pas assez profondément — gagne de la course en amont.',
  min_low: 'Tu t\'armes trop profondément — contrôle le début du mouvement.',
  mean_low: 'Ton niveau global est en dessous de la cible — contrôle ton placement.',
  mean_high: 'Ton niveau global est au-dessus de la cible — contrôle ton placement.',
  range_low: 'Tu n\'exploites pas toute l\'amplitude — utilise toute ta course.',
  range_high: 'Ton amplitude dépasse la cible — garde un mouvement plus compact.',
  sd_high: 'Le mouvement manque de régularité — travaille la reproductibilité.',
  cross_range_mean_low: 'Tu travailles sur la bonne plage, mais tout le mouvement est décalé vers le bas — vérifie ton placement de départ.',
  cross_range_mean_high: 'Tu travailles sur la bonne plage, mais tout le mouvement est décalé vers le haut — vérifie ton placement de départ.',
  cross_mean_sd: 'Bonne position en moyenne, mais le mouvement manque de régularité — travaille la constance.',
  cross_max_min: 'Bon finish, mais tu pars trop haut — prends plus de course en amont.',
}

function freqLabel(rate: number, total: number): string | null {
  if (total <= 1) return null
  if (rate >= 1) return 'toujours'
  if (rate >= 0.75) return 'souvent'
  return 'parfois'
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SynthesisViewProps {
  sequences: Sequence[]
  intraRefSeqId: string | null
  script: Script | undefined
}

export function SynthesisView({ sequences, intraRefSeqId, script }: SynthesisViewProps) {
  const refSeq = intraRefSeqId ? sequences.find(s => s.sequence_id === intraRefSeqId) : null
  const nonRefSeqs = sequences.filter(s => s.sequence_id !== intraRefSeqId)

  if (!refSeq) {
    return (
      <div style={emptyWrap}>
        <p style={emptyText}>Définissez une séquence de référence (★) dans l'onglet Données pour obtenir votre synthèse.</p>
      </div>
    )
  }

  if (nonRefSeqs.length === 0) {
    return (
      <div style={emptyWrap}>
        <p style={emptyText}>Enregistrez au moins une séquence supplémentaire à comparer à la référence.</p>
      </div>
    )
  }

  const refStats = computeStats(refSeq.instances ?? [])
  const leftIds = new Set((script?.symmetry_pairs ?? []).map(p => p.left))

  // For each measure: collect verdicts across all non-ref sequences, find dominant
  interface Finding {
    id: string
    label: string
    verdict: Verdict
    rate: number
  }

  const allFindings: Finding[] = refStats
    .filter(r => !leftIds.has(r.id))
    .map(refStat => {
      const verdicts = nonRefSeqs.map(seq => {
        const stats = computeStats(seq.instances ?? [])
        const cur = stats.find(s => s.id === refStat.id)
        return cur ? getVerdict(cur, refStat) : ('ok' as Verdict)
      })

      const counts = new Map<Verdict, number>()
      for (const v of verdicts) counts.set(v, (counts.get(v) ?? 0) + 1)

      let dominant: Verdict = 'ok'
      let best = 0
      for (const [v, c] of counts) {
        if (c > best) { best = c; dominant = v }
      }

      return { id: refStat.id, label: refStat.id.replace(/_/g, ' '), verdict: dominant, rate: best / nonRefSeqs.length }
    })

  const issues = allFindings
    .filter(f => f.verdict !== 'ok' && f.rate >= 0.5)
    .sort((a, b) => {
      const pd = PRIORITY[b.verdict] - PRIORITY[a.verdict]
      return pd !== 0 ? pd : b.rate - a.rate
    })
    .slice(0, 3)

  const okMeasures = allFindings.filter(f => f.verdict === 'ok' || f.rate < 0.5)
  const seqCount = nonRefSeqs.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

      {/* Context line */}
      <div className="rise-in" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-data)',
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}>
        <span style={{ color: 'var(--accent-3)' }}>★</span>
        Comparaison vs réf.
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span>{seqCount === 1 ? '1 séquence' : `${seqCount} séquences`}</span>
      </div>

      {issues.length === 0 ? (
        <div className="rise-in-delay-1" style={okCard}>
          <span style={checkIcon}>✓</span>
          <p style={bodyText}>
            Toutes les mesures sont conformes à la référence. Belle exécution — continue comme ça.
          </p>
        </div>
      ) : (
        <>
          {/* Issues section */}
          <div className="rise-in-delay-1" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span style={sectionLabel}>Points à travailler</span>
            {issues.map((f, i) => {
              const badge = freqLabel(f.rate, seqCount)
              return (
                <div
                  key={f.id}
                  className={i === 0 ? 'rise-in-delay-2' : i === 1 ? 'rise-in-delay-3' : 'rise-in-delay-4'}
                  style={issueCard}
                >
                  {/* Accent stripe */}
                  <span style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: 3,
                    background: `linear-gradient(180deg, ${i === 0 ? '#2a8b92' : i === 1 ? '#7cf1f9' : '#7cf1f9'}, transparent)`,
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 'var(--space-3)' }}>
                    <span style={measureLabel}>{f.label}</span>
                    {badge && <span style={badgeStyle(badge)}>{badge}</span>}
                  </div>
                  <p style={bodyText}>{VERDICT_TEXT[f.verdict]}</p>
                </div>
              )
            })}
          </div>

          {/* What's OK */}
          {okMeasures.length > 0 && (
            <div className="rise-in-delay-4" style={okCard}>
              <span style={checkIcon}>✓</span>
              <p style={bodyText}>
                {okMeasures.length === 1
                  ? `La mesure « ${okMeasures[0].label} » est conforme à la référence.`
                  : `Les ${okMeasures.length} autres mesures sont conformes à la référence.`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const emptyWrap: CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: 'var(--space-6)', gap: 'var(--space-4)',
}
const emptyText: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--ink-3)',
  textAlign: 'center', margin: 0, lineHeight: 1.6, maxWidth: 360,
}
const sectionLabel: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
}
const issueCard: CSSProperties = {
  background: 'var(--glass-2)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4) var(--space-5)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--shadow-glass)',
  position: 'relative',
  overflow: 'hidden',
}
const okCard: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
  background: 'linear-gradient(135deg, rgba(70,172,179,0.12) 0%, rgba(70,172,179,0.03) 100%)',
  border: '1px solid rgba(70,172,179,0.30)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4) var(--space-5)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: '0 0 32px rgba(70,172,179,0.12), var(--shadow-glass)',
}
const checkIcon: CSSProperties = {
  width: 24, height: 24,
  borderRadius: '50%',
  background: 'rgba(70,172,179,0.2)',
  border: '1px solid rgba(70,172,179,0.5)',
  color: 'var(--accent-3)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, flexShrink: 0,
  fontFamily: 'var(--font-data)',
  boxShadow: '0 0 16px rgba(70,172,179,0.4)',
}
const measureLabel: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--ink-1)',
  letterSpacing: '-0.01em',
}
const bodyText: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--ink-2)',
  margin: 0,
  lineHeight: 1.6,
}

function badgeStyle(badge: string): CSSProperties {
  const isAlways = badge === 'toujours'
  return {
    fontFamily: 'var(--font-data)',
    fontSize: 9,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 500,
    padding: '3px 10px',
    borderRadius: 'var(--radius-pill)',
    background: isAlways ? 'rgba(42,139,146,0.15)' : 'rgba(124,241,249,0.15)',
    color: isAlways ? 'var(--accent-pink)' : 'var(--accent-warn)',
    border: `1px solid ${isAlways ? 'rgba(42,139,146,0.4)' : 'rgba(124,241,249,0.4)'}`,
    whiteSpace: 'nowrap',
    boxShadow: isAlways ? '0 0 12px rgba(42,139,146,0.3)' : '0 0 12px rgba(124,241,249,0.3)',
  }
}
