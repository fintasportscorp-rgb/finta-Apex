// CV capture prerequisites — short, scannable warnings that materially affect
// pose-estimation quality. When the script enables ball tracking, an extra
// section lists ball-specific gotchas.
import type { CSSProperties } from 'react'

interface CVRequirementsProps {
  needsBall: boolean
  view: string
  lang?: 'fr' | 'en'
}

interface Item {
  glyph: 'check' | 'warn' | 'eye' | 'lit' | 'frame'
  body: string
}

const COPY = {
  fr: {
    title: 'Pour une capture fiable',
    subtitle: 'Quelques règles à respecter — la qualité de la mesure en dépend.',
    pose: [
      { glyph: 'lit',   body: 'Éclairage uniforme. Évite contre-jour, néons clignotants et zones d\'ombre fortes sur le corps.' },
      { glyph: 'frame', body: 'Sujet entier dans le cadre. Garde une marge ≈ 20% au-dessus de la tête et sous les pieds.' },
      { glyph: 'check', body: 'Caméra immobile, à hauteur de hanche, perpendiculaire au plan du mouvement.' },
      { glyph: 'eye',   body: 'Vêtements contrastés avec le fond. Évite vêtements amples qui masquent les articulations.' },
      { glyph: 'warn',  body: 'Une seule personne devant la caméra pendant la capture.' },
    ] as Item[],
    ballTitle: 'Suivi de balle activé',
    ball: [
      { glyph: 'eye',   body: 'Balle bien visible — pas tenue à pleine main dans l\'ombre, ni masquée par le corps.' },
      { glyph: 'warn',  body: 'Aucun objet de la même couleur en arrière-plan (sol, mur, vêtement).' },
      { glyph: 'lit',   body: 'Évite les reflets spéculaires forts sur la balle (soleil direct, projecteur).' },
      { glyph: 'check', body: 'Balle gardée dans le cadre — un objet qui sort de l\'image n\'est pas suivi.' },
    ] as Item[],
  },
  en: {
    title: 'For a reliable capture',
    subtitle: 'A few rules to follow — measurement quality depends on it.',
    pose: [
      { glyph: 'lit',   body: 'Even lighting. Avoid backlight, flickering neons, and deep shadows on the body.' },
      { glyph: 'frame', body: 'Whole subject in frame. Keep ≈ 20% margin above the head and below the feet.' },
      { glyph: 'check', body: 'Camera still, at hip height, perpendicular to the plane of motion.' },
      { glyph: 'eye',   body: 'Wear colours that contrast with the background. Avoid loose clothing that hides joints.' },
      { glyph: 'warn',  body: 'Only one person in frame during capture.' },
    ] as Item[],
    ballTitle: 'Ball tracking enabled',
    ball: [
      { glyph: 'eye',   body: 'Keep the ball visible — not buried in a closed hand or shadow, not occluded by the body.' },
      { glyph: 'warn',  body: 'No same-coloured objects in the background (floor, wall, clothing).' },
      { glyph: 'lit',   body: 'Avoid strong specular highlights on the ball (direct sun, spotlights).' },
      { glyph: 'check', body: 'Keep the ball inside the frame — anything leaving the image is not tracked.' },
    ] as Item[],
  },
} as const

export function CVRequirements({ needsBall, view: _view, lang = 'fr' }: CVRequirementsProps) {
  const t = COPY[lang]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
        color: 'var(--ink-2)',
        lineHeight: 1.5,
        margin: 0,
      }}>
        {t.subtitle}
      </p>

      <ul style={listStyle}>
        {t.pose.map((it, i) => <Row key={i} {...it} />)}
      </ul>

      {needsBall && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 4,
            padding: '6px 10px',
            background: 'rgba(124,241,249,0.10)',
            border: '1px solid rgba(124,241,249,0.30)',
            borderRadius: 'var(--radius-pill)',
            alignSelf: 'flex-start',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent-warn)',
              boxShadow: '0 0 10px var(--accent-warn)',
            }} />
            <span style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--accent-warn)',
            }}>
              {t.ballTitle}
            </span>
          </div>
          <ul style={listStyle}>
            {t.ball.map((it, i) => <Row key={i} {...it} accent="amber" />)}
          </ul>
        </>
      )}
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────

function Row({ glyph, body, accent }: Item & { accent?: 'amber' }) {
  const color = accent === 'amber' ? 'var(--accent-warn)' : 'var(--accent-2)'
  return (
    <li style={rowStyle}>
      <span style={{
        width: 22, height: 22, flexShrink: 0,
        borderRadius: '50%',
        background: accent === 'amber' ? 'rgba(124,241,249,0.14)' : 'rgba(97,206,214,0.12)',
        border: `1px solid ${accent === 'amber' ? 'rgba(124,241,249,0.40)' : 'rgba(97,206,214,0.35)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
      }}>
        <Glyph name={glyph} />
      </span>
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
        color: 'var(--ink-2)',
        lineHeight: 1.55,
      }}>
        {body}
      </span>
    </li>
  )
}

function Glyph({ name }: { name: Item['glyph'] }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'check': return (
      <svg {...common}><path d="M3 8.5 L 6.5 12 L 13 4" /></svg>
    )
    case 'warn': return (
      <svg {...common}>
        <path d="M8 2 L 14 13 L 2 13 Z" />
        <path d="M8 6 L 8 9.5" />
        <circle cx={8} cy={11.4} r={0.8} fill="currentColor" stroke="none" />
      </svg>
    )
    case 'eye': return (
      <svg {...common}>
        <path d="M1.5 8 C 3.5 4, 12.5 4, 14.5 8 C 12.5 12, 3.5 12, 1.5 8 Z" />
        <circle cx={8} cy={8} r={2.2} />
      </svg>
    )
    case 'lit': return (
      <svg {...common}>
        <circle cx={8} cy={8} r={2.6} />
        <path d="M8 1.5 L 8 3" />
        <path d="M8 13 L 8 14.5" />
        <path d="M1.5 8 L 3 8" />
        <path d="M13 8 L 14.5 8" />
        <path d="M3.3 3.3 L 4.4 4.4" />
        <path d="M11.6 11.6 L 12.7 12.7" />
        <path d="M3.3 12.7 L 4.4 11.6" />
        <path d="M11.6 4.4 L 12.7 3.3" />
      </svg>
    )
    case 'frame': return (
      <svg {...common}>
        <path d="M3 5 L 3 3 L 5 3" />
        <path d="M11 3 L 13 3 L 13 5" />
        <path d="M13 11 L 13 13 L 11 13" />
        <path d="M5 13 L 3 13 L 3 11" />
        <circle cx={8} cy={8} r={1.6} fill="currentColor" stroke="none" />
      </svg>
    )
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const listStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '4px 0',
}
