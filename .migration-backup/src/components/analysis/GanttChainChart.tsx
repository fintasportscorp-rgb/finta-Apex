// Kinetic chain — Gantt view with two separate panels.
// Top panel  : Reference sequence  — hatched bars, same colour palette.
// Bottom panel: Trial sequence      — solid bars, same colour palette.
// Each bar spans riseOnsetT → peakT for its respective panel.
import type { MeasureChain } from '../../lib/kineticChain'
import { getMeasureLabel } from '../../lib/script-translations'

export const CHAIN_COLORS = ['#7cf1f9', '#f97c3a', '#b87cf9', '#f9e87c', '#7cf97c', '#f97cb8', '#f97c7c', '#7cf9d4']
const COLORS = CHAIN_COLORS
const LATE_COLOR = '#7cf1f9'

const TOP_PAD   = 22
const BOT_PAD   = 16
const PANEL_GAP = 24

function consistencyColor(r: number): string {
  if (r >= 0.90) return '#7cf97c'
  if (r >= 0.70) return '#f9e87c'
  return '#f97c3a'
}

function fmtPct(t: number) { return `${Math.round(t * 100)}%` }
function fmtDelta(d: number) {
  const sign = d >= 0 ? '+' : '−'
  return `${sign}${Math.abs(d * 100).toFixed(1)}%`
}

function coachComment(chain: MeasureChain[], lang: 'fr' | 'en'): string | null {
  const compared = chain.filter(m => m.delayT != null)
  if (compared.length === 0) return null

  const late  = compared.filter(m => (m.delayT ?? 0) >  0.05)
  const early = compared.filter(m => (m.delayT ?? 0) < -0.05)
  const ampUp = compared.filter(m => (m.amplitudeGap ?? 0) >  5)
  const ampDn = compared.filter(m => (m.amplitudeGap ?? 0) < -5)

  const parts: string[] = []
  if (late.length > 0) {
    const w = late.reduce((a, b) => (b.delayT ?? 0) > (a.delayT ?? 0) ? b : a)
    const label = getMeasureLabel(w.measureId, lang)
    parts.push(lang === 'fr'
      ? `Le ${label} culmine trop tard (${fmtDelta(w.delayT ?? 0)}) — déclenche ce segment plus tôt.`
      : `${label} peaks too late (${fmtDelta(w.delayT ?? 0)}) — trigger this segment earlier.`)
  }
  if (early.length > 0) {
    const w = early.reduce((a, b) => (b.delayT ?? 0) < (a.delayT ?? 0) ? b : a)
    const label = getMeasureLabel(w.measureId, lang)
    parts.push(lang === 'fr'
      ? `Le ${label} part trop tôt (${fmtDelta(w.delayT ?? 0)}) — laisse le segment précédent terminer.`
      : `${label} fires too early (${fmtDelta(w.delayT ?? 0)}) — let the previous segment finish.`)
  }
  if (ampUp.length > 0) {
    const m = ampUp[0]!
    const label = getMeasureLabel(m.measureId, lang)
    parts.push(lang === 'fr'
      ? `Amplitude de ${label} supérieure à la référence (+${m.amplitudeGap?.toFixed(1)} ${m.unit}).`
      : `${label} amplitude above reference (+${m.amplitudeGap?.toFixed(1)} ${m.unit}).`)
  }
  if (ampDn.length > 0) {
    const m = ampDn[0]!
    const label = getMeasureLabel(m.measureId, lang)
    parts.push(lang === 'fr'
      ? `Amplitude de ${label} en dessous de la référence (${m.amplitudeGap?.toFixed(1)} ${m.unit}).`
      : `${label} amplitude below reference (${m.amplitudeGap?.toFixed(1)} ${m.unit}).`)
  }
  if (parts.length === 0) {
    return lang === 'fr'
      ? 'Timing et amplitude proches de la référence sur toute la chaîne. Bonne cohérence.'
      : 'Timing and amplitude close to reference across the full chain. Good consistency.'
  }
  return parts.join(' ')
}

interface GanttChainChartProps {
  chain: MeasureChain[]
  hasRef: boolean
  width?: number
  insightText?: string
  lang?: 'fr' | 'en'
}

export function GanttChainChart({ chain, hasRef, width = 320, insightText, lang = 'fr' }: GanttChainChartProps) {
  if (chain.length === 0) return null

  const LABEL_W   = Math.min(140, Math.max(80, Math.floor(width * 0.22)))
  const RIGHT_PAD = Math.min(90,  Math.max(54, Math.floor(width * 0.14)))
  const BAR_H     = width >= 480 ? 20 : 15
  const ROW_H     = BAR_H + (width >= 480 ? 12 : 10)

  const plotX0 = LABEL_W
  const plotX1 = width - RIGHT_PAD
  const plotW  = plotX1 - plotX0

  const panelH = TOP_PAD + chain.length * ROW_H + BOT_PAD
  const svgH   = hasRef ? panelH * 2 + PANEL_GAP : panelH

  // Normalize each panel independently so the first onset starts at x=0.
  // This ensures both panels begin at the same landmark, making visual comparison clean.
  const validRefOnsets = chain.filter(m => m.refRiseOnsetT != null).map(m => m.refRiseOnsetT!)
  const refMinOnset = hasRef && validRefOnsets.length > 0 ? Math.min(...validRefOnsets) : 0
  const seqMinOnset = chain.length > 0 ? Math.min(...chain.map(m => m.riseOnsetT)) : 0

  const xAtRef = (t: number) => plotX0 + Math.min(1, Math.max(0, t - refMinOnset)) * plotW
  const xAtSeq = (t: number) => plotX0 + Math.min(1, Math.max(0, t - seqMinOnset)) * plotW
  const xAt    = xAtSeq  // fallback for grid / axis helpers (sequence panel owns the axis)
  const barY = (rowIdx: number) => TOP_PAD + rowIdx * ROW_H + (ROW_H - BAR_H) / 2

  const refPanelTop   = 0
  const trialPanelTop = hasRef ? panelH + PANEL_GAP : 0

  const coachText = hasRef ? coachComment(chain, lang) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <svg width={width} height={svgH} style={{ display: 'block', overflow: 'visible' }}>

        {/* ── Reference panel ───────────────────────────────────────── */}
        {hasRef && (
          <g transform={`translate(0,${refPanelTop})`}>
            <PanelLabel x={(plotX0 + plotX1) / 2} label={lang === 'fr' ? 'RÉFÉRENCE' : 'REFERENCE'} />
            <GridLines xAt={xAtRef} plotX0={plotX0} panelH={panelH} />
            {chain.map((m, i) => {
              if (m.refRiseOnsetT == null || m.refPeakT == null) return null
              const color = COLORS[m.colorIndex % COLORS.length]!
              const x0    = xAtRef(m.refRiseOnsetT)
              const x1    = xAtRef(m.refPeakT)
              const y     = barY(i)
              return (
                <g key={m.measureId}>
                  <MeasureLabel x={plotX0 - 8} y={y + BAR_H / 2 + 3.5} label={m.measureId} lang={lang} />
                  {/* Same color as trial panel, lower opacity — easy to match across panels */}
                  <rect x={x0} y={y} width={Math.max(2, x1 - x0)} height={BAR_H}
                    fill={color} opacity={0.12} rx={2} />
                  <rect x={x0} y={y} width={Math.max(2, x1 - x0)} height={BAR_H}
                    fill="none" stroke={color} strokeWidth={1.5} rx={2} opacity={0.50} strokeDasharray="4 2" />
                  <line x1={x1} y1={y - 3} x2={x1} y2={y + BAR_H + 3}
                    stroke={color} strokeWidth={1.5} opacity={0.55} />
                  <text x={x1 + 4} y={y + BAR_H / 2 + 3.5}
                    fontFamily="var(--font-data)" fontSize={8}
                    fill="rgba(181,216,219,0.5)">
                    {fmtPct(m.refPeakT)}
                  </text>
                </g>
              )
            })}
            <XAxis xAt={xAtRef} y={panelH - BOT_PAD + 10} />
          </g>
        )}

        {/* ── Trial panel ───────────────────────────────────────────── */}
        <g transform={`translate(0,${trialPanelTop})`}>
          {hasRef && <PanelLabel x={(plotX0 + plotX1) / 2} label={lang === 'fr' ? 'SÉQUENCE' : 'SEQUENCE'} />}
          <GridLines xAt={xAtSeq} plotX0={plotX0} panelH={panelH} />
          {chain.map((m, i) => {
            const color    = COLORS[m.colorIndex % COLORS.length]!
            const x0       = xAtSeq(m.riseOnsetT)
            const x1       = xAtSeq(m.peakT)
            const y        = barY(i)
            const delayPct = m.delayT != null ? m.delayT * 100 : null
            const isOff    = delayPct != null && Math.abs(delayPct) > 5
            const cc = consistencyColor(m.rankConsistency)
            const showConsistency = m.repPatterns.length >= 2
            return (
              <g key={m.measureId}>
                <MeasureLabel x={plotX0 - 8} y={y + BAR_H / 2 + 3.5} label={m.measureId} lang={lang} />
                {showConsistency && (
                  <g>
                    <circle cx={6} cy={y + BAR_H / 2} r={3} fill={cc} opacity={0.85} />
                    {m.rankConsistency < 0.90 && (
                      <text x={11} y={y + BAR_H / 2 + 3}
                        fontFamily="var(--font-data)" fontSize={7} fill={cc} opacity={0.85}>
                        {Math.round(m.rankConsistency * 100)}%
                      </text>
                    )}
                  </g>
                )}
                <rect x={x0} y={y} width={Math.max(2, x1 - x0)} height={BAR_H}
                  fill={color} opacity={0.28} rx={2} />
                <rect x={x0} y={y} width={Math.max(2, x1 - x0)} height={BAR_H}
                  fill="none" stroke={color} strokeWidth={1} rx={2} opacity={0.85} />
                {/* Per-rep peak ticks — visible when ≥2 reps detected */}
                {m.repPatterns.length > 1 && m.repPatterns.map((rp, ri) => (
                  <line key={ri}
                    x1={xAtSeq(rp.peakT)} y1={y + 3}
                    x2={xAtSeq(rp.peakT)} y2={y + BAR_H - 3}
                    stroke={color} strokeWidth={1} opacity={0.45} />
                ))}
                <circle cx={x1} cy={y + BAR_H / 2} r={3.5} fill={color} opacity={0.9} />
                <circle cx={x1} cy={y + BAR_H / 2} r={1.5} fill="#020d0e" />
                {m.amplitudeGap != null && Math.abs(m.amplitudeGap) > 0.5 && (
                  <text x={x1 + 6} y={y - 1}
                    fontFamily="var(--font-data)" fontSize={8}
                    fill={Math.abs(m.amplitudeGap) > 5 ? color : 'rgba(181,216,219,0.5)'}>
                    {(m.amplitudeGap >= 0 ? '+' : '') + m.amplitudeGap.toFixed(1) + m.unit}
                  </text>
                )}
                {delayPct != null && (
                  <text x={plotX1 + 6} y={y + BAR_H / 2 + 3.5}
                    fontFamily="var(--font-data)" fontSize={9.5}
                    fill={isOff ? LATE_COLOR : 'rgba(181,216,219,0.55)'}>
                    {fmtDelta(m.delayT!)}
                  </text>
                )}
              </g>
            )
          })}
          <XAxis xAt={xAtSeq} y={panelH - BOT_PAD + 10} />
        </g>
      </svg>

      {insightText && (
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          color: 'var(--ink-1)',
          margin: 0,
          lineHeight: 1.6,
          padding: '10px 14px',
          background: 'linear-gradient(135deg, rgba(124,241,249,0.10) 0%, rgba(124,241,249,0.03) 100%)',
          borderLeft: '2px solid var(--accent-1)',
          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        }}>
          {insightText}
        </p>
      )}
    </div>
  )
}

function PanelLabel({ x, label }: { x: number; label: string }) {
  return (
    <text x={x} y={12} textAnchor="middle"
      fontFamily="var(--font-data)" fontSize={8.5}
      fill="rgba(181,216,219,0.45)" letterSpacing="0.18em">
      {label}
    </text>
  )
}

function MeasureLabel({ x, y, label, lang }: { x: number; y: number; label: string; lang: 'fr' | 'en' }) {
  return (
    <text x={x} y={y} textAnchor="end"
      fontFamily="var(--font-data)" fontSize={9}
      letterSpacing="0.04em" fill="rgba(232,254,255,0.78)">
      {getMeasureLabel(label, lang)}
    </text>
  )
}

function GridLines({ xAt, plotX0, panelH }: { xAt: (t: number) => number; plotX0: number; panelH: number }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t}
          x1={xAt(t)} y1={TOP_PAD - 4} x2={xAt(t)} y2={panelH - BOT_PAD + 4}
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray={t === 0 || t === 1 ? undefined : '2 4'} />
      ))}
      <line x1={plotX0} y1={TOP_PAD - 4} x2={plotX0} y2={panelH - BOT_PAD + 4}
        stroke="rgba(255,255,255,0.08)" />
    </>
  )
}

function XAxis({ xAt, y }: { xAt: (t: number) => number; y: number }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <text key={t} x={xAt(t)} y={y} textAnchor="middle"
          fontFamily="var(--font-data)" fontSize={8}
          fill="rgba(181,216,219,0.38)" letterSpacing="0.06em">
          {fmtPct(t)}
        </text>
      ))}
    </>
  )
}
