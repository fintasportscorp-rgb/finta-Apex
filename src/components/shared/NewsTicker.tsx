const TICKER_FR = [
  'Ne corrige pas ce que tu vois — corrige ce qui le provoque.',
  'Ta consigne a peut-être empiré les choses. Vérifie avant de la répéter.',
  'Le meilleur geste en état frais ne compte pas. Celui sous fatigue, si.',
  'La proprioception ment — pas par manque d\'effort, mais par manque de référence.',
  'Le problème à l\'épaule vient souvent des hanches. Cherche en amont dans la chaîne.',
  'Si tu corriges deux choses à la fois, tu n\'en corriges aucune.',
  '5 reps propres ancrent plus vite que 20 approximatives.',
  'Ce qui tient à 80% s\'effondre souvent à 85%. Teste la limite avant la compétition.',
  'L\'objectif n\'est pas de corriger le geste — c\'est de donner un signal que le corps peut retrouver seul.',
  'Un coach qui ne mesure pas son impact est en train de deviner. Même les meilleurs.',
]

const TICKER_EN = [
  'Don\'t fix what you see — fix what\'s causing it.',
  'Your cue might have made things worse. Check before repeating it.',
  'Best movement when fresh doesn\'t count. Under fatigue, it does.',
  'Proprioception lies — not from lack of effort, but lack of reference.',
  'The shoulder problem usually starts at the hips. Look upstream in the chain.',
  'Two corrections at once means zero corrections.',
  '5 clean reps anchor faster than 20 sloppy ones.',
  'What holds at 80% often breaks at 85%. Test the limit before competition.',
  'The goal isn\'t to fix the movement — it\'s to give a signal the body can find on its own.',
  'A coach who can\'t measure impact is guessing. Even experienced ones.',
]

interface NewsTickerProps {
  lang: 'fr' | 'en'
}

export function NewsTicker({ lang }: NewsTickerProps) {
  const items = lang === 'fr' ? TICKER_FR : TICKER_EN

  const renderItems = (keySuffix: string) =>
    items.map((item, i) => (
      <span key={`${keySuffix}-${i}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span>{item}</span>
        <span style={{ margin: '0 18px', color: 'var(--accent-1)', opacity: 0.4, fontSize: 8 }}>◆</span>
      </span>
    ))

  return (
    <div style={{
      overflow: 'hidden',
      background: '#010b0c',
      borderTop: '1px solid rgba(124,241,249,0.12)',
      display: 'flex',
      alignItems: 'center',
      height: 34,
      flexShrink: 0,
    }}>
      {/* Badge */}
      <div style={{
        flexShrink: 0,
        padding: '0 14px',
        borderRight: '1px solid rgba(124,241,249,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: '100%',
        background: '#021315',
      }}>
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#7cf1f9',
          boxShadow: '0 0 7px rgba(124,241,249,0.9)',
          animation: 'breathe 1.6s ease-in-out infinite',
          flexShrink: 0,
          display: 'inline-block',
        }} />
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 8,
          letterSpacing: '0.20em',
          color: 'var(--accent-1)',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>TIPS</span>
      </div>

      {/* Scrolling track */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          animation: 'ticker-scroll 130s linear infinite',
          willChange: 'transform',
          paddingLeft: 20,
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'var(--font-data)',
            fontSize: 10.5,
            letterSpacing: '0.05em',
            color: 'rgba(232,254,255,0.75)',
          }}>
            {renderItems('a')}
            {renderItems('b')}
          </span>
        </div>
      </div>
    </div>
  )
}
