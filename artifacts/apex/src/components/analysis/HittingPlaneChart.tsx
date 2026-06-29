// Specialized chart for the hitting_plane measure.
//
// Adds three features on top of the base MeasureChart:
//   1. Horizontal zone bands — OPEN (>+10°, green), NEUTRAL (±10°, grey), CLOSED (<-10°, red)
//   2. Contact window — vertical shaded band around the detected contact time
//   3. Contact average card — mean HP angle within the contact window, with zone label
//
// The zone bands are always rendered. The contact window and average card only
// appear when a ContactResult with tier 'high' or 'medium' is available.
import type { MeasureResult } from '../../engine/types'
import type { ContactResult } from '../../engine/ball/contactDetect'
import { hpWindowAvg } from '../../engine/primitives/hittingPlane'
import { getMeasureLabel } from '../../lib/script-translations'
import { ReliabilityBadge } from './ReliabilityBadge'

// Angle thresholds matching the Python reference (BH_hitting_plane2.py)
const OPEN_THRESHOLD   =  10  // degrees — above this = OPEN stance
const CLOSED_THRESHOLD = -10  // degrees — below this = CLOSED stance

// Half-width of the contact window (fraction of normalized stroke [0,1])
const CONTACT_HALF_WIN = 0.10

interface HittingPlaneChartProps {
  measure: MeasureResult
  contact?: ContactResult
  width?: number
  height?: number
  lang?: 'fr' | 'en'
}

function zoneColor(zone: 'OPEN' | 'NEUTRAL' | 'CLOSED'): string {
  if (zone === 'OPEN')   return '#4ade80'
  if (zone === 'CLOSED') return '#f87171'
  return '#94a3b8'
}

function classifyAngle(angle: number): 'OPEN' | 'NEUTRAL' | 'CLOSED' {
  if (angle > OPEN_THRESHOLD)   return 'OPEN'
  if (angle < CLOSED_THRESHOLD) return 'CLOSED'
  return 'NEUTRAL'
}

export function HittingPlaneChart({
  measure,
  contact,
  width = 320,
  height = 80,
  lang = 'fr',
}: HittingPlaneChartProps) {
  const series = measure.series
  if (series.length === 0) {
    return (
      <div style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px dashed var(--glass-edge)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--glass-1)',
        fontFamily: 'var(--font-data)', fontSize: 10,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}>
        {lang === 'fr' ? 'Aucune donnée' : 'No data'}
      </div>
    )
  }

  const allValues = series.map(s => s.value)
  // Widen the Y range to always include ±10° zone lines when they fit near the data
  const dataMin = Math.min(...allValues)
  const dataMax = Math.max(...allValues)
  const yMin = Math.min(dataMin, CLOSED_THRESHOLD - 2)
  const yMax = Math.max(dataMax, OPEN_THRESHOLD + 2)
  const yRange = yMax - yMin || 1
  const pad = yRange * 0.10
  const yMinPad = yMin - pad
  const yMaxPad = yMax + pad
  const yRangePad = yMaxPad - yMinPad

  const h = height
  const xScale = width / Math.max(series.length - 1, 1)

  const scaleY = (v: number) => h - ((v - yMinPad) / yRangePad) * h
  const clamp  = (v: number) => Math.max(0, Math.min(h, v))

  // Zone boundary y-positions (clamped to chart area)
  const yOpenLine   = clamp(scaleY(OPEN_THRESHOLD))
  const yClosedLine = clamp(scaleY(CLOSED_THRESHOLD))

  // Zone rectangle dimensions (y-down SVG coordinates)
  const openH     = yOpenLine                       // top of chart → +10° line
  const neutralH  = yClosedLine - yOpenLine          // +10° → -10°
  const closedTop = yClosedLine
  const closedH   = h - yClosedLine                  // -10° → bottom of chart

  // Contact visibility and position
  const showContact = contact != null && (contact.tier === 'high' || contact.tier === 'medium')
  const contactX    = showContact ? contact!.contactT * width : null

  const winStart = showContact ? Math.max(0, (contact!.contactT - CONTACT_HALF_WIN) * width) : null
  const winEnd   = showContact ? Math.min(width, (contact!.contactT + CONTACT_HALF_WIN) * width) : null

  // Windowed average at contact
  const windowAvg = showContact
    ? hpWindowAvg(
        series,
        contact!.contactT - CONTACT_HALF_WIN,
        contact!.contactT + CONTACT_HALF_WIN,
      )
    : null

  const contactZone  = windowAvg != null ? classifyAngle(windowAvg) : null
  const contactColor = contactZone ? zoneColor(contactZone) : '#7cf1f9'

  // Polyline for the HP series
  const linePoints = series
    .map((s, i) => `${i * xScale},${scaleY(s.value)}`)
    .join(' ')

  const gradId = `hp-grad-${measure.id}`

  // Tier badge
  const tierLabel = (() => {
    if (!contact || contact.tier === 'none') return null
    if (contact.tier === 'high')      return lang === 'fr' ? 'Contact ✓' : 'Contact ✓'
    if (contact.tier === 'medium')    return lang === 'fr' ? 'Contact ~' : 'Contact ~'
    return lang === 'fr' ? 'Estimé' : 'Estimated'
  })()

  const tierHigh = contact?.tier === 'high'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--font-data)', fontSize: 10,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)',
        }}>
          {getMeasureLabel(measure.id, lang)}
          <span style={{ color: 'rgba(181,216,219,0.35)', textTransform: 'none', letterSpacing: 0, fontSize: 10, marginLeft: 4 }}>
            {measure.unit}
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tierLabel && (
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 9,
              padding: '2px 8px', borderRadius: 4,
              background: tierHigh ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.10)',
              border: `1px solid ${tierHigh ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.30)'}`,
              color: tierHigh ? '#4ade80' : '#fbbf24',
              letterSpacing: '0.06em',
            }}>
              {tierLabel}
            </span>
          )}
          <ReliabilityBadge
            fractionReliable={measure.reliability.fraction_reliable}
            outOfPlane={measure.reliability.out_of_plane}
          />
        </div>
      </div>

      {/* SVG chart */}
      <svg width={width} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#7cf1f9" />
            <stop offset="100%" stopColor="#61ced6" />
          </linearGradient>
        </defs>

        {/* ── Zone bands ── */}
        {openH > 0 && (
          <rect x={0} y={0} width={width} height={openH}
            fill="rgba(74,222,128,0.07)" />
        )}
        {neutralH > 0 && (
          <rect x={0} y={yOpenLine} width={width} height={neutralH}
            fill="rgba(148,163,184,0.04)" />
        )}
        {closedH > 0 && (
          <rect x={0} y={closedTop} width={width} height={closedH}
            fill="rgba(248,113,113,0.07)" />
        )}

        {/* Zone boundary dashes */}
        {yOpenLine > 0 && yOpenLine < h && (
          <line x1={0} y1={yOpenLine} x2={width} y2={yOpenLine}
            stroke="rgba(74,222,128,0.30)" strokeWidth={1} strokeDasharray="3 4" />
        )}
        {yClosedLine > 0 && yClosedLine < h && (
          <line x1={0} y1={yClosedLine} x2={width} y2={yClosedLine}
            stroke="rgba(248,113,113,0.30)" strokeWidth={1} strokeDasharray="3 4" />
        )}

        {/* Zero reference line */}
        {(() => { const y0 = scaleY(0); return y0 > 0 && y0 < h
          ? <line x1={0} y1={y0} x2={width} y2={y0} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
          : null })()}

        {/* Zone labels (right edge, inside chart) */}
        {openH > 10 && (
          <text x={width - 3} y={Math.min(yOpenLine - 3, h - 3)}
            textAnchor="end" fontFamily="var(--font-data)" fontSize={8}
            fill="rgba(74,222,128,0.45)" letterSpacing="0.08em">
            OPEN
          </text>
        )}
        {closedH > 10 && (
          <text x={width - 3} y={Math.max(closedTop + 11, 11)}
            textAnchor="end" fontFamily="var(--font-data)" fontSize={8}
            fill="rgba(248,113,113,0.45)" letterSpacing="0.08em">
            CLOSED
          </text>
        )}

        {/* ── Contact window shading ── */}
        {winStart != null && winEnd != null && (
          <rect
            x={winStart} y={0}
            width={winEnd - winStart} height={h}
            fill="rgba(124,241,249,0.06)"
          />
        )}

        {/* ── HP line (glow + sharp) ── */}
        {series.length > 1 && (
          <>
            <polyline points={linePoints} fill="none"
              stroke={`url(#${gradId})`} strokeWidth={4}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.18} />
            <polyline points={linePoints} fill="none"
              stroke={`url(#${gradId})`} strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* ── Contact marker ── */}
        {contactX != null && (
          <>
            <line x1={contactX} y1={0} x2={contactX} y2={h}
              stroke="rgba(124,241,249,0.60)" strokeWidth={1.5} />
            <circle cx={contactX} cy={4} r={3}
              fill="rgba(124,241,249,0.90)" />
          </>
        )}

        {/* Y-axis extent labels */}
        <text x={3} y={10} fontFamily="var(--font-data)" fontSize={9} fill="rgba(181,216,219,0.55)">
          {yMaxPad.toFixed(0)}°
        </text>
        <text x={3} y={h - 2} fontFamily="var(--font-data)" fontSize={9} fill="rgba(181,216,219,0.55)">
          {yMinPad.toFixed(0)}°
        </text>
      </svg>

      {/* ── Stats row ── */}
      <div style={{
        display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'center',
        padding: '6px 0 0', borderTop: '1px solid var(--glass-edge-faint)', marginTop: 2,
      }}>
        {([
          ['MIN', measure.summary.min.toFixed(1)],
          ['MAX', measure.summary.max.toFixed(1)],
          [lang === 'fr' ? 'MOY' : 'AVG', measure.summary.mean.toFixed(1)],
          ['σ',   measure.summary.sd.toFixed(1)],
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 9,
              letterSpacing: '0.12em', color: 'var(--ink-4)',
            }}>{label}</span>
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 500,
              color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums',
            }}>{val}</span>
          </div>
        ))}

        {/* Contact average card */}
        {windowAvg != null && contactZone && (
          <div style={{
            display: 'flex', gap: 6, alignItems: 'baseline',
            padding: '3px 10px 3px 8px',
            marginLeft: 'auto',
            background: `${contactColor}14`,
            border: `1px solid ${contactColor}38`,
            borderRadius: 6,
          }}>
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 9,
              letterSpacing: '0.12em', color: 'var(--ink-4)',
            }}>
              {lang === 'fr' ? 'CONTACT' : 'CONTACT'}
            </span>
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 600,
              color: contactColor, fontVariantNumeric: 'tabular-nums',
            }}>
              {windowAvg > 0 ? '+' : ''}{windowAvg.toFixed(1)}°
            </span>
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 9,
              color: contactColor, opacity: 0.75, letterSpacing: '0.08em',
            }}>
              {contactZone}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
