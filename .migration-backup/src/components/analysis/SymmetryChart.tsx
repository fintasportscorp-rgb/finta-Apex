// Bilateral symmetry butterfly chart.
// Each row: left bar grows leftward from center, right bar grows rightward.
// Bar widths are proportional to |leftMean| and |rightMean| within each row.
// SI% is colour-coded: teal <10%, amber 10-20%, red ≥20%.
import type { SymmetryRow } from '../../lib/symmetry'
import { getMeasureLabel } from '../../lib/script-translations'

const TOP_PAD = 22
const BOT_PAD = 20

function siColor(si: number): string {
  if (si < 10) return '#46acb3'
  if (si < 20) return '#c8a03a'
  return '#c85a3a'
}

function siSymbol(si: number): string {
  if (si < 10) return '✓'
  if (si < 20) return '⚠'
  return '✗'
}

function buildCoachText(rows: SymmetryRow[], lang: 'fr' | 'en'): string | null {
  if (rows.length === 0) return null
  const red   = rows.filter(r => r.si >= 20).sort((a, b) => b.si - a.si)
  const amber = rows.filter(r => r.si >= 10 && r.si < 20).sort((a, b) => b.si - a.si)
  if (red.length === 0 && amber.length === 0) {
    return lang === 'fr'
      ? 'Bonne symétrie bilatérale sur toutes les mesures.'
      : 'Good bilateral symmetry across all measures.'
  }
  const parts: string[] = []
  if (red.length > 0) {
    const w = red[0]!
    const side = Math.abs(w.rightMean) > Math.abs(w.leftMean)
      ? (lang === 'fr' ? 'D dominant' : 'R dominant')
      : (lang === 'fr' ? 'G dominant' : 'L dominant')
    const lbl = getMeasureLabel(w.rightId, lang)
    parts.push(lang === 'fr'
      ? `Asymétrie marquée sur ${lbl} (IS=${w.si.toFixed(0)}%, ${side}) — à investiguer.`
      : `Significant asymmetry on ${lbl} (SI=${w.si.toFixed(0)}%, ${side}) — investigate loading pattern.`)
  }
  if (amber.length > 0 && parts.length < 2) {
    const w = amber[0]!
    const lbl = getMeasureLabel(w.rightId, lang)
    parts.push(lang === 'fr'
      ? `Légère asymétrie sur ${lbl} (IS=${w.si.toFixed(0)}%) — à surveiller à la fatigue.`
      : `Minor imbalance on ${lbl} (SI=${w.si.toFixed(0)}%) — monitor under fatigue.`)
  }
  return parts.join(' ')
}

interface SymmetryChartProps {
  rows:    SymmetryRow[]
  width?:  number
  lang?:   'fr' | 'en'
}

export function SymmetryChart({ rows, width = 320, lang = 'fr' }: SymmetryChartProps) {
  if (rows.length === 0) return null

  const LABEL_W   = Math.min(130, Math.max(80, Math.floor(width * 0.22)))
  const RIGHT_PAD = Math.min(90,  Math.max(54, Math.floor(width * 0.17)))
  const BAR_H     = width >= 480 ? 13 : 10
  const ROW_H     = BAR_H + (width >= 480 ? 14 : 10)

  const plotW   = width - LABEL_W - RIGHT_PAD
  const halfW   = plotW / 2
  const centerX = LABEL_W + halfW
  const panelH  = TOP_PAD + rows.length * ROW_H + BOT_PAD
  const barY    = (i: number) => TOP_PAD + i * ROW_H + (ROW_H - BAR_H) / 2

  const insight = buildCoachText(rows, lang)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <svg width={width} height={panelH} style={{ display: 'block', overflow: 'visible' }}>

        {/* Title */}
        <text x={centerX} y={12} textAnchor="middle"
          fontFamily="var(--font-data)" fontSize={8.5}
          fill="rgba(181,216,219,0.45)" letterSpacing="0.18em">
          {lang === 'fr' ? 'SYMÉTRIE BILATÉRALE' : 'BILATERAL SYMMETRY'}
        </text>

        {/* Center divider */}
        <line x1={centerX} y1={TOP_PAD - 4} x2={centerX} y2={panelH - BOT_PAD + 4}
          stroke="rgba(255,255,255,0.14)" />

        {/* Quarter-point grid lines */}
        {[0.25, 0.75].map(t => (
          <line key={t}
            x1={LABEL_W + t * plotW} y1={TOP_PAD - 4}
            x2={LABEL_W + t * plotW} y2={panelH - BOT_PAD + 4}
            stroke="rgba(255,255,255,0.04)" />
        ))}

        {rows.map((row, i) => {
          const y      = barY(i)
          const color  = siColor(row.si)
          const absR   = Math.abs(row.rightMean)
          const absL   = Math.abs(row.leftMean)
          const total  = absR + absL
          const lFrac  = total > 1e-9 ? absL / total : 0.5
          const rFrac  = total > 1e-9 ? absR / total : 0.5
          const lBarW  = Math.max(2, lFrac * plotW)
          const rBarW  = Math.max(2, rFrac * plotW)

          return (
            <g key={row.rightId}>
              {/* Row label */}
              <text x={LABEL_W - 8} y={y + BAR_H / 2 + 3.5}
                textAnchor="end"
                fontFamily="var(--font-data)" fontSize={9}
                letterSpacing="0.04em"
                fill="rgba(232,254,255,0.78)">
                {getMeasureLabel(row.rightId, lang)}
              </text>

              {/* Left bar — grows leftward from center */}
              <rect x={centerX - lBarW} y={y} width={lBarW} height={BAR_H}
                fill={color} opacity={0.22} rx={2} />
              <rect x={centerX - lBarW} y={y} width={lBarW} height={BAR_H}
                fill="none" stroke={color} strokeWidth={1} rx={2} opacity={0.65} />

              {/* Right bar — grows rightward from center */}
              <rect x={centerX} y={y} width={rBarW} height={BAR_H}
                fill={color} opacity={0.28} rx={2} />
              <rect x={centerX} y={y} width={rBarW} height={BAR_H}
                fill="none" stroke={color} strokeWidth={1} rx={2} opacity={0.85} />

              {/* SI% + symbol */}
              <text x={width - RIGHT_PAD + 6} y={y + BAR_H / 2 + 3.5}
                fontFamily="var(--font-data)" fontSize={9.5}
                fill={color}>
                {row.si.toFixed(0)}%{'  '}{siSymbol(row.si)}
              </text>
            </g>
          )
        })}

        {/* Axis labels */}
        <text x={LABEL_W + 4} y={panelH - 6}
          fontFamily="var(--font-data)" fontSize={7.5}
          fill="rgba(181,216,219,0.35)" letterSpacing="0.06em">
          ← {lang === 'fr' ? 'Gauche' : 'Left'}
        </text>
        <text x={width - RIGHT_PAD - 4} y={panelH - 6}
          textAnchor="end"
          fontFamily="var(--font-data)" fontSize={7.5}
          fill="rgba(181,216,219,0.35)" letterSpacing="0.06em">
          {lang === 'fr' ? 'Droite' : 'Right'} →
        </text>
      </svg>

      {insight && (
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
          {insight}
        </p>
      )}
    </div>
  )
}
