import { useState } from 'react'

// ── Bilingual content ──────────────────────────────────────────────────────

interface Step {
  label:   { fr: string; en: string }
  title:   { fr: string; en: string }
  tagline: { fr: string; en: string }
  points:  { fr: string; en: string }[]
  image?:  string
}

const STEPS: Step[] = [
  {
    label:   { fr: '01 — Intention', en: '01 — Intention' },
    title:   { fr: 'Choisissez avec intention', en: 'Choose with intention' },
    tagline: {
      fr: 'Chaque séance est une conversation avec le corps. Vous décidez de quelle question partir — ou simplement d\'écouter.',
      en: 'Every session is a conversation with the body. You choose which question to ask — or simply to listen.',
    },
    points: [
      {
        fr: 'Sélectionnez le geste que vous souhaitez décoder — que vous l\'exploriez pour la première fois, que vous affiniez un geste déjà maîtrisé, ou que vous cherchiez à comprendre l\'impact d\'une consigne d\'entraînement sur la mécanique. Chaque cas a sa valeur propre.',
        en: 'Select the movement you want to decode — whether exploring it for the first time, refining an already-mastered gesture, or watching how a coaching cue transforms the mechanics. Each scenario has its own value.',
      },
      {
        fr: 'L\'entraîneur peut arriver sans question préconçue et simplement observer, de façon factuelle, comment ses retours se traduisent dans les mesures — tout en intégrant le ressenti du joueur. Le joueur en autonomie peut utiliser la capture pour mieux comprendre son propre corps et affiner sa conscience du mouvement.',
        en: 'The coach can arrive without a preset question and simply observe, factually, how feedback translates into the numbers — while integrating the player\'s own sensations. The player working solo can use the capture to better understand their own body and deepen their movement awareness.',
      },
    ],
  },
  {
    label:   { fr: '02 — Contexte', en: '02 — Context' },
    title:   { fr: 'Verrouillez vos variables', en: 'Lock your variables' },
    tagline: {
      fr: 'Les données sans contexte, c\'est comme des étoiles sans constellation — brillantes, mais muettes.',
      en: 'Data without context is like stars without a constellation — brilliant, but silent.',
    },
    points: [
      {
        fr: 'Chaque champ de contexte est une variable que vous contrôlez : côté dominant, charge, type de séance. Les remplir tous n\'est pas une formalité — c\'est votre protocole expérimental. Deux séances identiques avec des contextes différents ne sont pas comparables.',
        en: 'Every context field is a variable you control: dominant side, load, session type. Filling them all isn\'t a formality — it\'s your experimental protocol. Two identical sessions with different contexts are not comparable.',
      },
      {
        fr: 'La note est votre journal de bord : fatigue, nouveau matériel, reprise post-blessure. Mais aussi une consigne particulière — «service à plat», «revers slicé», «poussée de jambes renforcée» — ou une variation de protocole. Ce que vous n\'écrivez pas aujourd\'hui, vous ne pourrez pas l\'expliquer demain.',
        en: 'The note is your lab journal: fatigue, new equipment, post-injury return. But also a specific cue — \'flat serve\', \'slice backhand\', \'reinforce leg push\' — or a protocol variation. What you don\'t write today, you can\'t explain tomorrow.',
      },
    ],
  },
  {
    label:   { fr: '03 — Cadrage', en: '03 — Camera' },
    title:   { fr: 'La géométrie, ça compte', en: 'Geometry is everything' },
    tagline: {
      fr: 'La même sculpture, vue de face ou de profil, raconte des histoires radicalement différentes.',
      en: 'The same sculpture, seen head-on or in profile, tells radically different stories.',
    },
    points: [
      {
        fr: 'Vues de profil (profil droit / profil gauche) : idéales pour la flexion/extension, les swings, les cycles de course et tout mouvement balistique dans le plan sagittal. Choisissez le côté qui expose le mieux le membre ou le segment à analyser.',
        en: 'Profile views (right profile / left profile): ideal for flexion/extension, swings, running cycles, and any ballistic movement in the sagittal plane. Choose the side that best exposes the limb or segment you want to analyse.',
      },
      {
        fr: 'Vue de face / Vue de dos : complémentaires pour la symétrie latérale, les désalignements droite/gauche, l\'inclinaison du bassin et l\'alignement vertical des membres inférieurs. La vue de dos révèle ce que la face dissimule.',
        en: 'Front view / Back view: complementary for lateral symmetry, left/right asymmetries, pelvic tilt, and vertical lower-limb alignment. The back view reveals what the front hides.',
      },
      {
        fr: 'Vues obliques (oblique G / oblique D) : indispensables pour les rotations de tronc, les spirales et les gestuelles de frappe — elles capturent la diagonale que le profil pur ne voit pas. Vue plongeante (overhead) : éclaire les trajectoires de raquette, de bras et de tête, particulièrement dans les sports avec mouvement au-dessus des épaules.',
        en: 'Oblique views (oblique L / oblique R): essential for trunk rotations, spirals, and striking gestures — they capture the diagonal that a pure profile misses. Overhead view: illuminates racquet, arm, and head trajectories, especially in sports with above-shoulder movement.',
      },
      {
        fr: 'Distance : 2–4 m. Hauteur : niveau de la taille ou légèrement en dessous. Corps entier dans le cadre à chaque répétition. Appareil sur support stable — jamais à la main. Une inclinaison de 2° peut injecter 15° d\'erreur dans un angle articulaire.',
        en: 'Distance: 2–4 m. Height: waist level or slightly below. Full body in frame on every rep. Stable mount — never handheld. A 2° camera tilt can inject 15° of error into a joint angle.',
      },
    ],
    image: '/guide/img_quality.png',
  },
  {
    label:   { fr: '04 — Répétitions', en: '04 — Reps' },
    title:   { fr: 'Qualité avant quantité', en: 'Quality over quantity' },
    tagline: {
      fr: 'La même note jouée cinq fois par le même musicien révèle sa voix. Une seule note est un accident — cinq sont une signature.',
      en: 'The same note played five times by the same musician reveals their voice. One note is an accident — five is a signature.',
    },
    points: [
      {
        fr: 'Visez 5 à 8 répétitions identiques : même position de départ, même amplitude de mouvement, même tempo. Repartez toujours du même point entre chaque répétition. L\'enveloppe de variabilité se construit à partir de ces répétitions — plus elles sont homogènes, plus votre courbe de référence est fiable.',
        en: 'Aim for 5–8 identical reps: same starting position, same range of motion, same tempo. Reset fully to the same position between each rep. The variability envelope is built from these reps — the more consistent they are, the more reliable your reference curve.',
      },
      {
        fr: 'La loi des grands nombres ne s\'applique que si vos répétitions sont tirées de la même distribution. Si vous ne compteriez pas cette répétition en compétition ou en évaluation, ne la comptez pas ici — retirez-la avant d\'exporter.',
        en: 'The law of large numbers only applies when reps are drawn from the same distribution. If you wouldn\'t count this rep in competition or an assessment, don\'t count it here — remove it before exporting.',
      },
    ],
  },
  {
    label:   { fr: '05 — Référence', en: '05 — Reference' },
    title:   { fr: 'Votre étoile polaire', en: 'Your North Star' },
    tagline: {
      fr: 'La référence est votre boussole intérieure — un point fixe autour duquel tout le reste gravite et prend sens.',
      en: 'The reference is your inner compass — a fixed point around which everything else orbits and finds meaning.',
    },
    points: [
      {
        fr: 'Une référence est un instantané du mouvement optimal à un moment donné. Capturez-la quand l\'athlète est reposé, en pleine forme et au meilleur de sa technique — jamais en fin de séance. Exportez cette séance comme modèle de référence : toutes les captures futures lui seront automatiquement comparées.',
        en: 'A reference is a snapshot of optimal movement at a specific point in time. Capture it when the athlete is rested, healthy, and at their technical best — never at the end of a session. Export this session as a reference model: all future captures will be automatically compared against it.',
      },
      {
        fr: 'Allez plus loin : invitez l\'athlète à associer à ce geste des sensations proprioceptives, une image mentale, un protocole interne — «je sens mes pieds ancrés, mon épaule relâchée, l\'impulsion qui part des hanches». Cette conscience incorporée est la vraie boussole pour retrouver la référence de séance en séance, avec fidélité.',
        en: 'Go further: invite the athlete to associate proprioceptive sensations, a mental image, an internal cue sequence with this gesture — \'I feel my feet grounded, my shoulder released, the impulse starting from the hips\'. This embodied awareness is the true compass for faithfully reproducing the reference session after session.',
      },
    ],
    image: '/guide/img_geometry.png',
  },
  {
    label:   { fr: '06 — Impact', en: '06 — Impact' },
    title:   { fr: 'Pourquoi ça marche', en: 'Why it works' },
    tagline: {
      fr: 'Six mécanismes. Un seul objectif : transformer ce que l\'œil ne voit pas en signal que le corps comprend.',
      en: 'Six mechanisms. One goal: turn what the eye cannot see into a signal the body understands.',
    },
    points: [
      {
        fr: 'Mémoire procédurale — Le feedback quantifié ancre le pattern moteur plus vite que le retour verbal seul. Chaque répétition mesurée est un ancrage supplémentaire dans la mémoire du mouvement.',
        en: 'Procedural memory — Quantified feedback anchors motor patterns faster than verbal cues alone. Each measured rep adds one more anchor in movement memory.',
      },
      {
        fr: 'Diagnostic proximal — Un effondrement biomécanique a toujours une cause unique dans la chaîne cinétique. Identifier l\'origine plutôt que lister les symptômes donne une correction exploitable dès le prochain essai.',
        en: 'Proximal diagnosis — A biomechanical breakdown always has one root cause in the kinetic chain. Find the origin rather than listing symptoms — give one actionable fix for the very next rep.',
      },
      {
        fr: 'Influence factuelle du coach — La consigne a-t-elle changé quelque chose ? Maintenant tu le sais. Le coaching devient falsifiable : ce qui fonctionne laisse une trace mesurable dans les données.',
        en: 'Factual coaching impact — Did the cue actually change anything? Now you know. Coaching becomes falsifiable: what works leaves a measurable trace in the data.',
      },
      {
        fr: 'Robustesse vs fragilité — Ce qui tient sous charge, en fatigue, sous pression : c\'est ce qu\'on peut compter en compétition. Ce qui s\'effondre : c\'est là que la préparation commence.',
        en: 'Robustness vs fragility — What holds under load, fatigue, pressure: that\'s what you can rely on in competition. What breaks: that\'s where preparation starts.',
      },
      {
        fr: 'Poids d\'un segment dans la chaîne — Un retard du bassin se traduit par une perte d\'amplitude à l\'épaule. Comprendre comment un écart se propage change l\'ordre et la priorité des corrections.',
        en: 'Segment weight in the chain — A hip lag translates directly to shoulder range loss. Understanding how a gap propagates changes the order and priority of corrections.',
      },
      {
        fr: 'Pont ressenti → signal internalisé — L\'athlète sent une chose. La donnée révèle ce qui se passe vraiment. Relier les deux permet de formaliser un signal interne que l\'athlète peut reproduire de séance en séance, sans l\'app.',
        en: 'Feeling → internal signal — The athlete feels one thing. The data reveals what actually happens. Bridging the two lets you formalise an internal cue the athlete can reproduce session after session, without the app.',
      },
    ],
  },
]

// ── Icons ──────────────────────────────────────────────────────────────────

function CompassIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={12} cy={12} r={10} />
      <polygon points="12,2 14.5,9.5 12,12 9.5,9.5" fill="currentColor" opacity={0.95} stroke="none" />
      <polygon points="12,22 9.5,14.5 12,12 14.5,14.5" fill="currentColor" opacity={0.3} stroke="none" />
    </svg>
  )
}

// ── Guide button (animated ring FAB) ──────────────────────────────────────

function GuideButton({ lang, onClick }: { lang: 'fr' | 'en'; onClick: () => void }) {
  return (
    <div style={{
      position: 'fixed',
      left: 'var(--space-4)',
      bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px))',
      zIndex: 30,
    }}>
      <div style={{ position: 'relative', width: 52, height: 52 }}>
        {/* Outer glow pulse */}
        <span aria-hidden style={{
          position: 'absolute',
          inset: -12,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,241,249,0.22) 0%, transparent 70%)',
          animation: 'breathe 3.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Spinning conic-gradient ring */}
        <span aria-hidden style={{
          position: 'absolute',
          inset: -2,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, #7cf1f9, #61ced6, #46acb3, #2a8b92, #7cf1f9)',
          animation: 'shimmer-spin 2.5s linear infinite',
          WebkitMask: 'radial-gradient(circle, transparent 91%, #000 91%)',
          mask:        'radial-gradient(circle, transparent 91%, #000 91%)',
          pointerEvents: 'none',
        }} />

        {/* Button face */}
        <button
          onClick={onClick}
          aria-label={lang === 'fr' ? 'Ouvrir le guide de capture' : 'Open capture guide'}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(7,107,114,0.45) 0%, rgba(2,13,14,0.96) 100%)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-1)',
            gap: 2,
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            transition: 'color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-1)' }}
        >
          <CompassIcon />
          <span style={{
            fontSize: 7,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-data)',
            lineHeight: 1,
          }}>
            {lang === 'fr' ? 'Guide' : 'Guide'}
          </span>
        </button>
      </div>
    </div>
  )
}

// ── Guide modal (slide-up panel) ───────────────────────────────────────────

interface GuideModalProps {
  lang: 'fr' | 'en'
  step: number
  onStep: (s: number) => void
  onClose: () => void
}

function GuideModal({ lang, step, onStep, onClose }: GuideModalProps) {
  const current = STEPS[step]
  const isFirst = step === 0
  const isLast  = step === STEPS.length - 1
  const L = (o: { fr: string; en: string }) => o[lang]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fade-in"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(2,13,14,0.75)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 50,
        }}
      />

      {/* Panel */}
      <div
        className="slide-up"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: 0, right: 0, bottom: 0,
          height: '92dvh',
          background: 'linear-gradient(180deg, rgba(2,20,22,0.98) 0%, rgba(2,13,14,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.11)',
          borderBottom: 'none',
          borderRadius: '28px 28px 0 0',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(40px) saturate(160%)',
          WebkitBackdropFilter: 'blur(40px) saturate(160%)',
          boxShadow: '0 -28px 80px -16px rgba(7,107,114,0.30), 0 -1px 0 rgba(255,255,255,0.05) inset',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.16)' }} />
        </div>

        {/* Header bar */}
        <div style={{ padding: '10px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Step pill track */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => onStep(i)}
                aria-label={`Step ${i + 1}`}
                style={{
                  width: i === step ? 22 : 6,
                  height: 6,
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                  transition: 'all var(--dur-base) var(--ease-fluid)',
                  background: i === step
                    ? 'linear-gradient(90deg, #7cf1f9, #61ced6)'
                    : i < step
                    ? 'rgba(124,241,249,0.38)'
                    : 'rgba(255,255,255,0.10)',
                }}
              />
            ))}
            <span style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: '0.18em',
              color: 'var(--ink-4)',
              marginLeft: 4,
            }}>
              {step + 1} / {STEPS.length}
            </span>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
            style={{
              width: 30, height: 30,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              flexShrink: 0,
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          >✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0', scrollbarWidth: 'thin' }}>
          {/* Step label */}
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--accent-1)',
            marginBottom: 8,
          }}>
            {L(current.label)}
          </div>

          {/* Title */}
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--ink-1)',
            lineHeight: 1.15,
            marginBottom: 14,
          }}>
            {L(current.title)}
          </h2>

          {/* Tagline quote */}
          <blockquote style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            color: 'var(--accent-2)',
            fontStyle: 'italic',
            lineHeight: 1.55,
            marginBottom: 20,
            paddingLeft: 14,
            borderLeft: '2px solid rgba(97,206,214,0.38)',
            margin: '0 0 20px 0',
          }}>
            « {L(current.tagline)} »
          </blockquote>

          {/* Image visual */}
          {current.image && (
            <div style={{
              margin: '0 0 20px',
              borderRadius: 14,
              overflow: 'hidden',
              background: 'rgba(2,13,14,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img
                src={current.image}
                alt=""
                aria-hidden
                style={{
                  width: '100%',
                  maxHeight: 'clamp(200px, 38dvh, 400px)',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
          )}

          {/* Key points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {current.points.map((point, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '13px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{
                  width: 20, height: 20, flexShrink: 0, marginTop: 1,
                  borderRadius: '50%',
                  background: 'rgba(124,241,249,0.14)',
                  border: '1px solid rgba(124,241,249,0.28)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10, fontFamily: 'var(--font-data)',
                  color: 'var(--accent-1)',
                }}>
                  {i + 1}
                </span>
                <p style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 14,
                  color: 'var(--ink-2)',
                  lineHeight: 1.65,
                  margin: 0,
                }}>
                  {L(point)}
                </p>
              </div>
            ))}
          </div>

          <div style={{ height: 110 }} />
        </div>

        {/* Footer navigation */}
        <div style={{
          padding: '14px 20px',
          paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(2,13,14,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          gap: 10,
        }}>
          <button
            onClick={() => !isFirst && onStep(step - 1)}
            disabled={isFirst}
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: 50, opacity: isFirst ? 0.3 : 1 }}
          >
            ← {lang === 'fr' ? 'Précédent' : 'Previous'}
          </button>
          <button
            onClick={() => isLast ? onClose() : onStep(step + 1)}
            className="btn btn-primary"
            style={{ flex: 2, minHeight: 50 }}
          >
            {isLast
              ? (lang === 'fr' ? '✓ J\'ai compris !' : '✓ Got it!')
              : `${lang === 'fr' ? 'Suivant' : 'Next'} →`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export function CaptureGuide({ lang }: { lang: 'fr' | 'en' }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  return (
    <>
      <GuideButton lang={lang} onClick={() => { setStep(0); setOpen(true) }} />
      {open && (
        <GuideModal
          lang={lang}
          step={step}
          onStep={setStep}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
