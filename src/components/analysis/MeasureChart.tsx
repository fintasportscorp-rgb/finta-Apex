// SVG chart for a measure's time series — spec-08 §C
// Line (accent) + optional envelope (grey) + unreliable zones (hatched)
import type { MeasureResult, MeasureSample } from '../../engine/types'
import { getMeasureLabel } from '../../lib/script-translations'
import { ReliabilityBadge } from './ReliabilityBadge'
import { Tooltip } from '../shared/Tooltip'
function stripSideFromId(id: string): string {
  return id.replace(/_left$/, '').replace(/_right$/, '').replace(/^left_/, '').replace(/^right_/, '')
}

export interface PatternArea {
  onsetT: number
  peakT:  number
  color:  string
  label:  string
}

interface MeasureChartProps {
  measure: MeasureResult
  width?: number
  height?: number
  envelopeMin?: number[]
  envelopeMax?: number[]
  patternAreas?: PatternArea[]
  /** Labels currently hidden. Empty Set = all shown (default). */
  hiddenLabels?: Set<string>
  /** Natural language coaching analysis comparing this sequence to reference. */
  diffCoachText?: string
  /** Optional symmetry-paired reference series (existing usage in report). */
  referenceMean?: MeasureSample[]
  /** Use a solid color instead of SVG gradient (needed for PDF/print). */
  solidStroke?: string
  lang?: 'fr' | 'en'
  /** Short biomechanical description displayed as a tooltip on the measure label. */
  tooltipText?: string | null
  /** Side indicator badge shown after the measure name, e.g. 'D', 'G', 'R', 'L'. */
  sideTag?: string
}

function polyline(samples: MeasureSample[], xScale: number, yMin: number, yRange: number, h: number): string {
  if (samples.length === 0) return ''
  return samples
    .map((s, i) => `${i * xScale},${h - ((s.value - yMin) / (yRange || 1)) * h}`)
    .join(' ')
}

export function MeasureChart({
  measure,
  width = 320,
  height = 80,
  envelopeMin,
  envelopeMax,
  patternAreas,
  hiddenLabels,
  diffCoachText,
  referenceMean,
  solidStroke,
  lang = 'fr',
  tooltipText,
  sideTag,
}: MeasureChartProps) {
  const series = measure.series
  if (series.length === 0) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed var(--glass-edge)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--glass-1)',
        fontFamily: 'var(--font-data)',
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}>
        {lang === 'fr' ? 'Aucune donnée' : 'No data'}
      </div>
    )
  }

  const reliableValues = series.filter(s => s.reliable).map(s => s.value)
  const allValues = series.map(s => s.value)
  const refValues = referenceMean?.map(s => s.value) ?? []
  const yMin = Math.min(...allValues, ...(envelopeMin ?? []), ...refValues)
  const yMax = Math.max(...allValues, ...(envelopeMax ?? []), ...refValues)
  const yRange = yMax - yMin || 1
  const yMinPad = yMin - yRange * 0.1
  const yMaxPad = yMax + yRange * 0.1
  const yRangePad = yMaxPad - yMinPad

  const xScale = width / Math.max(series.length - 1, 1)
  const xScaleRef = referenceMean ? width / Math.max(referenceMean.length - 1, 1) : 1
  const h = height

  const scaleY = (v: number) => h - ((v - yMinPad) / yRangePad) * h

  // Unreliable segments as hatch rect regions
  const unreliableRegions: Array<{ x1: number; x2: number }> = []
  let regionStart: number | null = null
  series.forEach((s, i) => {
    if (!s.reliable && regionStart === null) regionStart = i
    if (s.reliable && regionStart !== null) {
      unreliableRegions.push({ x1: regionStart * xScale, x2: i * xScale })
      regionStart = null
    }
  })
  if (regionStart !== null) {
    unreliableRegions.push({ x1: regionStart * xScale, x2: (series.length - 1) * xScale })
  }

  const seriesGradId   = `series-${measure.id}`
  const envelopeGradId = `env-${measure.id}`
  const clipAboveId    = `clip-above-ref-${measure.id}`
  const clipBelowId    = `clip-below-ref-${measure.id}`

  // Pre-compute diff-fill geometry (only when reference is present)
  const refPts = referenceMean && referenceMean.length > 1
    ? referenceMean.map((s, i) => `${i * xScaleRef},${scaleY(s.value)}`).join(' ')
    : null

  const betweenPoly = refPts && series.length > 1
    ? series.map((s, i) => `${i * xScale},${scaleY(s.value)}`).join(' ')
      + ' '
      + [...referenceMean!].reverse()
          .map((s, i) => `${(referenceMean!.length - 1 - i) * xScaleRef},${scaleY(s.value)}`)
          .join(' ')
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {getMeasureLabel(sideTag ? stripSideFromId(measure.id) : measure.id, lang)}
            <span style={{ color: 'rgba(181,216,219,0.35)', textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>{measure.unit}</span>
            {sideTag && (
              <span style={{
                fontFamily: 'var(--font-data)', fontSize: 8, letterSpacing: '0.12em',
                color: 'rgba(124,241,249,0.9)',
                background: 'rgba(124,241,249,0.12)',
                border: '1px solid rgba(124,241,249,0.30)',
                borderRadius: 3,
                padding: '1px 5px',
                textTransform: 'none',
              }}>{sideTag}</span>
            )}
          </span>
          {tooltipText && (
            <Tooltip text={tooltipText} lang={lang}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 17, height: 17, borderRadius: '50%',
                border: '1.5px solid rgba(124,241,249,0.55)',
                background: 'rgba(124,241,249,0.10)',
                color: 'rgba(124,241,249,0.95)',
                fontSize: 10, fontFamily: 'var(--font-ui)',
                fontStyle: 'italic', fontWeight: 700,
                letterSpacing: 0, textTransform: 'none',
                flexShrink: 0,
                userSelect: 'none',
                lineHeight: 1,
              }}>i</span>
            </Tooltip>
          )}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {referenceMean && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--ink-3)' }}>
              <svg width={14} height={6}><line x1={0} y1={3} x2={14} y2={3} stroke="#46acb3" strokeWidth={1.5} strokeDasharray="3 2" strokeLinecap="round" /></svg>
              {lang === 'fr' ? 'Réf' : 'Ref'}
            </span>
          )}
          <ReliabilityBadge
            fractionReliable={measure.reliability.fraction_reliable}
            outOfPlane={measure.reliability.out_of_plane}
          />
        </div>
      </div>

      <svg width={width} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <pattern id={`hatch-${measure.id}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(232,254,255,0.18)" strokeWidth={1.5} />
          </pattern>
          <linearGradient id={seriesGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#7cf1f9" />
            <stop offset="100%" stopColor="#61ced6" />
          </linearGradient>
          <linearGradient id={envelopeGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="rgba(124,241,249,0.32)" />
            <stop offset="100%" stopColor="rgba(124,241,249,0.06)" />
          </linearGradient>
          {refPts && (
            <clipPath id={clipAboveId}>
              <polygon points={`0,0 ${refPts} ${width},0`} />
            </clipPath>
          )}
          {refPts && (
            <clipPath id={clipBelowId}>
              <polygon points={`0,${h} ${refPts} ${width},${h}`} />
            </clipPath>
          )}
        </defs>

        {/* Soft horizontal gridline at mid */}
        <line x1={0} y1={h / 2} x2={width} y2={h / 2}
          stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />

        {/* Envelope band */}
        {envelopeMin && envelopeMax && envelopeMin.length === series.length && (
          <polyline
            points={[
              ...envelopeMin.map((v, i) => `${i * xScale},${scaleY(v)}`),
              ...envelopeMax.slice().reverse().map((v, i) => `${(envelopeMax.length - 1 - i) * xScale},${scaleY(v)}`),
            ].join(' ')}
            fill={`url(#${envelopeGradId})`}
            stroke="none"
          />
        )}

        {/* Pattern areas — onset→peak per measure, filtered by visibleLabels */}
        {patternAreas && patternAreas
          .filter(pa => !hiddenLabels?.has(pa.label))
          .map((pa, idx) => {
            const x0 = Math.max(0, pa.onsetT) * width
            const x1 = Math.min(1, pa.peakT)  * width
            return (
              <g key={idx}>
                <rect x={x0} y={0} width={Math.max(1, x1 - x0)} height={h}
                  fill={pa.color} opacity={0.08} />
                <line x1={x1} y1={0} x2={x1} y2={h}
                  stroke={pa.color} strokeWidth={1} opacity={0.50} />
                <circle cx={x1} cy={4} r={2} fill={pa.color} opacity={0.85} />
              </g>
            )
          })
        }

        {/* Unreliable zones — hatched */}
        {unreliableRegions.map((r, i) => (
          <rect key={i} x={r.x1} y={0} width={r.x2 - r.x1} height={h}
            fill={`url(#hatch-${measure.id})`} opacity={0.5} />
        ))}

        {/* Colored fill between reference and sequence lines */}
        {betweenPoly && (
          <polygon points={betweenPoly}
            fill="rgba(124,241,249,0.18)"
            clipPath={`url(#${clipAboveId})`} />
        )}
        {betweenPoly && (
          <polygon points={betweenPoly}
            fill="rgba(249,188,94,0.16)"
            clipPath={`url(#${clipBelowId})`} />
        )}

        {/* Reference mean series — teal dashed */}
        {referenceMean && referenceMean.length > 1 && (
          <polyline
            points={polyline(referenceMean, xScaleRef, yMinPad, yRangePad, h)}
            fill="none"
            stroke="#46acb3"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
          />
        )}

        {/* Capture line — gradient stroke with glow (solid fallback for print) */}
        {series.length > 1 && (
          solidStroke ? (
            <polyline
              points={polyline(series, xScale, yMinPad, yRangePad, h)}
              fill="none"
              stroke={solidStroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <polyline
                points={polyline(series, xScale, yMinPad, yRangePad, h)}
                fill="none"
                stroke={`url(#${seriesGradId})`}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.18}
              />
              <polyline
                points={polyline(series, xScale, yMinPad, yRangePad, h)}
                fill="none"
                stroke={`url(#${seriesGradId})`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )
        )}

        {/* Min/max labels */}
        <text x={4} y={10} fontFamily="var(--font-data)" fontSize={9} fill="rgba(181,216,219,0.7)">
          {yMaxPad.toFixed(1)}
        </text>
        <text x={4} y={h - 2} fontFamily="var(--font-data)" fontSize={9} fill="rgba(181,216,219,0.7)">
          {yMinPad.toFixed(1)}
        </text>
      </svg>

      {/* Summary stats */}
      {reliableValues.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 'var(--space-5)',
          flexWrap: 'wrap',
          padding: '6px 0 0',
          borderTop: '1px solid var(--glass-edge-faint)',
          marginTop: 2,
        }}>
          {[
            ['MIN', measure.summary.min.toFixed(1)],
            ['MAX', measure.summary.max.toFixed(1)],
            [lang === 'fr' ? 'MOY' : 'AVG', measure.summary.mean.toFixed(1)],
            ['σ',   measure.summary.sd.toFixed(1)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{
                fontFamily: 'var(--font-data)',
                fontSize: 9,
                letterSpacing: '0.12em',
                color: 'var(--ink-4)',
              }}>{label}</span>
              <span style={{
                fontFamily: 'var(--font-data)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--ink-1)',
                fontVariantNumeric: 'tabular-nums',
              }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Reference comparison coaching comment */}
      {diffCoachText && (
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          color: 'var(--ink-2)',
          margin: 0,
          lineHeight: 1.55,
          padding: '8px 12px',
          background: 'linear-gradient(135deg, rgba(97,206,214,0.06) 0%, rgba(97,206,214,0.02) 100%)',
          borderLeft: '2px solid var(--accent-2)',
          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        }}>
          {diffCoachText}
        </p>
      )}
    </div>
  )
}
