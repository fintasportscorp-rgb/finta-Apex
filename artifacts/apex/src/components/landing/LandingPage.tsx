import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlagIcon } from '../shared/FlagIcon'
import './LandingPage.css'

// ── Bilingual story prose ─────────────────────────────────────────────────────

interface PillarCopy { n: string; tag: string; title: string; body: string }
interface StepCopy   { n: string; title: string; body: string }
interface StatCopy   { v: string; l: string }

interface StoryActs {
  nav: { app: string }
  hook: { line1: string; line2: string; scroll: string }
  number: {
    eyebrow: string
    pre: string
    isAt: string
    post: string
    whisper1: string
    whisper2: string
  }
  witness: {
    eyebrow: string
    line1: string
    line2: string
    stat1: { v: string; l: string }
    stat2: { v: string; l: string }
    stat3: { v: string; l: string }
  }
  mirror: {
    eyebrow: string
    line1: string
    line2: string
    intro: string
    chartTitle: string
    chartAxis: string
    chartLabelRef: string
    chartLabelSeq: string
    chartLabelEnv: string
    annotateAlign: string
    annotateGap: string
    outro1: string
    outro2: string
    closer: string
    stats: StatCopy[]
  }
  manifeste: {
    eyebrow: string
    title: string
    pillars: PillarCopy[]
  }
  method: {
    eyebrow: string
    title: string
    steps: StepCopy[]
  }
  atlas: {
    eyebrow: string
    title: string
    sub: string
  }
  threshold: {
    eyebrow: string
    title: string
    cta: string
    footnote: string
  }
}

const story: Record<'fr' | 'en', StoryActs> = {
  fr: {
    nav: { app: 'Apex' },
    hook: { line1: 'Ton œil voit.', line2: 'Il ne mesure pas.', scroll: 'descends' },
    number: {
      eyebrow: 'L\'instant T',
      pre: 'Le genou de ton sprinteur',
      isAt: 'est à',
      post: 'au moment de l\'impact.',
      whisper1: 'Pas 140°. Pas 145°.',
      whisper2: 'Aucun œil humain ne peut compter aussi vite.',
    },
    witness: {
      eyebrow: 'Le témoin',
      line1: 'Pendant que tu cherches le défaut,',
      line2: 'la caméra l\'a déjà nommé.',
      stat1: { v: '33', l: 'landmarks' },
      stat2: { v: '60', l: 'images par seconde' },
      stat3: { v: '0', l: 'biais. 0 fatigue. 0 doute.' },
    },
    mirror: {
      eyebrow: 'Le miroir',
      line1: 'Tu n\'as pas besoin d\'un juge.',
      line2: 'Tu as besoin d\'un miroir.',
      intro: 'Une séquence : ton mouvement, mesuré. Une référence : ton mouvement à son meilleur. Ou celui de ton mentor. Ou celui d\'avant la blessure. Apex superpose les deux — frame par frame, degré par degré.',
      chartTitle: 'Angle du genou — un cycle',
      chartAxis: 'Cycle du mouvement',
      chartLabelRef: 'Référence',
      chartLabelSeq: 'Ta séquence',
      chartLabelEnv: 'Enveloppe (5 reps)',
      annotateAlign: 'Tu suis la ligne.',
      annotateGap: 'Tu décroches.',
      outro1: 'Là où les courbes se touchent — tu es fidèle à toi-même.',
      outro2: 'Là où elles s\'écartent — voilà ton territoire de travail.',
      closer: 'Pas de « bien ». Pas de « mal ». Juste un écart, à mesurer.',
      stats: [
        { v: '+8.3°', l: 'pic d\'écart' },
        { v: '74%', l: 'alignement' },
        { v: '0.08s', l: 'décalage temporel' },
      ],
    },
    manifeste: {
      eyebrow: 'Trois promesses',
      title: 'Ce que Apex jure de ne jamais faire — et ce qu\'elle fait à la place.',
      pillars: [
        {
          n: '01',
          tag: 'Mesurer',
          title: 'L\'instrument. Pas l\'arbitre.',
          body: 'Apex ne te dit pas si c\'est bien. Apex te dit ce qui est. Le jugement t\'appartient — toujours.',
        },
        {
          n: '02',
          tag: 'Local',
          title: 'Ta caméra. Ton corps. Personne d\'autre.',
          body: 'Aucun serveur. Aucun compte. Aucun upload. Tout vit dans cet onglet. Tout meurt avec lui.',
        },
        {
          n: '03',
          tag: 'Descriptif',
          title: 'Le mouvement, dénombré.',
          body: 'Angles, vitesses, cadences, symétries. Ce que la vidéo ralentie suggère — Apex le chiffre.',
        },
      ],
    },
    method: {
      eyebrow: 'La méthode',
      title: 'Trois mouvements, et la donnée arrive.',
      steps: [
        { n: '01', title: 'Choisis le mouvement.', body: 'Service. Foulée. Squat. Lancer. Ou crée le tien dans le builder.' },
        { n: '02', title: 'Place la caméra.', body: 'Un seul angle. Un seul plan. Apex s\'adapte au reste.' },
        { n: '03', title: 'Refais le mouvement.', body: 'Et la donnée arrive. Brute. Honnête. Sans habillage.' },
      ],
    },
    atlas: {
      eyebrow: 'L\'atlas',
      title: 'Chaque sport. Chaque mouvement.',
      sub: '17 disciplines · 143 mouvements',
    },
    threshold: {
      eyebrow: 'Le seuil',
      title: 'Tu es prêt à voir.',
      cta: 'Mesurer mon mouvement maintenant',
      footnote: 'Tout reste sur ta machine. Toujours.',
    },
  },
  en: {
    nav: { app: 'Apex' },
    hook: { line1: 'Your eye sees.', line2: 'It does not measure.', scroll: 'scroll' },
    number: {
      eyebrow: 'At time T',
      pre: 'Your sprinter\'s knee',
      isAt: 'is at',
      post: 'at the moment of impact.',
      whisper1: 'Not 140°. Not 145°.',
      whisper2: 'No human eye can count that fast.',
    },
    witness: {
      eyebrow: 'The witness',
      line1: 'While you hunt for the flaw,',
      line2: 'the camera has already named it.',
      stat1: { v: '33', l: 'landmarks' },
      stat2: { v: '60', l: 'frames per second' },
      stat3: { v: '0', l: 'bias. 0 fatigue. 0 doubt.' },
    },
    mirror: {
      eyebrow: 'The mirror',
      line1: 'You don\'t need a judge.',
      line2: 'You need a mirror.',
      intro: 'A sequence: your movement, measured. A reference: your movement at its best. Or your mentor\'s. Or yours before the injury. Apex lays them on top of each other — frame by frame, degree by degree.',
      chartTitle: 'Knee angle — one cycle',
      chartAxis: 'Movement cycle',
      chartLabelRef: 'Reference',
      chartLabelSeq: 'Your sequence',
      chartLabelEnv: 'Envelope (5 reps)',
      annotateAlign: 'You hold the line.',
      annotateGap: 'You drift.',
      outro1: 'Where the curves touch — you are true to yourself.',
      outro2: 'Where they part — that\'s your training ground.',
      closer: 'No “good.” No “bad.” Just a gap, to be measured.',
      stats: [
        { v: '+8.3°', l: 'peak gap' },
        { v: '74%', l: 'alignment' },
        { v: '0.08s', l: 'time offset' },
      ],
    },
    manifeste: {
      eyebrow: 'Three promises',
      title: 'What Apex vows never to do — and what it does instead.',
      pillars: [
        {
          n: '01',
          tag: 'Measure',
          title: 'The instrument. Not the judge.',
          body: 'Apex does not tell you if it\'s good. Apex tells you what is. The verdict is yours — always.',
        },
        {
          n: '02',
          tag: 'Local',
          title: 'Your camera. Your body. No one else.',
          body: 'No server. No account. No upload. It lives in this tab. It dies with it.',
        },
        {
          n: '03',
          tag: 'Descriptive',
          title: 'The movement, numbered.',
          body: 'Angles, speeds, cadences, symmetries. What slow-motion video hints at — Apex measures.',
        },
      ],
    },
    method: {
      eyebrow: 'The method',
      title: 'Three steps. Then the data arrives.',
      steps: [
        { n: '01', title: 'Pick the movement.', body: 'Serve. Stride. Squat. Throw. Or build your own in the builder.' },
        { n: '02', title: 'Place the camera.', body: 'One angle. One plane. Apex handles the rest.' },
        { n: '03', title: 'Repeat the move.', body: 'And the data arrives. Raw. Honest. Unvarnished.' },
      ],
    },
    atlas: {
      eyebrow: 'The atlas',
      title: 'Every sport. Every movement.',
      sub: '17 disciplines · 143 movements',
    },
    threshold: {
      eyebrow: 'The threshold',
      title: 'You are ready to see.',
      cta: 'Measure my movement now',
      footnote: 'Everything stays on your machine. Always.',
    },
  },
}

// ── Skeleton animation — serve pose (Ben Shelton, extracted via BlazePose) ────

const SKELETON_CONNECTIONS: [number, number][] = [
  [0, 11], [0, 12],                         // neck
  [11, 12], [11, 23], [12, 24], [23, 24],   // torso
  [12, 14], [14, 16],                        // right arm (racket)
  [11, 13], [13, 15],                        // left arm (toss)
  [24, 26], [26, 28],                        // right leg
  [23, 25], [25, 27],                        // left leg
]

// 4 serve keyframes — landmark indices: 0 nose, 11 L-shoulder, 12 R-shoulder,
// 13 L-elbow, 14 R-elbow, 15 L-wrist, 16 R-wrist,
// 23 L-hip, 24 R-hip, 25 L-knee, 26 R-knee, 27 L-ankle, 28 R-ankle
const SERVE_POSES: Record<number, [number, number]>[] = [
  // 0 — preparation (neutral stance)
  {
    0: [0.50, 0.12], 11: [0.54, 0.30], 12: [0.44, 0.28],
    13: [0.55, 0.43], 14: [0.38, 0.41], 15: [0.54, 0.57], 16: [0.34, 0.55],
    23: [0.52, 0.58], 24: [0.42, 0.57], 25: [0.50, 0.72], 26: [0.39, 0.71],
    27: [0.48, 0.86], 28: [0.37, 0.86],
  },
  // 1 — trophy position (toss arm up, racket arm cocked back)
  {
    0: [0.49, 0.12], 11: [0.57, 0.28], 12: [0.42, 0.26],
    13: [0.62, 0.24], 14: [0.30, 0.34], 15: [0.60, 0.18], 16: [0.24, 0.38],
    23: [0.52, 0.56], 24: [0.40, 0.55], 25: [0.49, 0.70], 26: [0.37, 0.72],
    27: [0.47, 0.84], 28: [0.36, 0.85],
  },
  // 2 — impact apex (real coordinates from ben_shelton_serve.mp4, frame 245)
  {
    0: [0.510, 0.352], 11: [0.541, 0.460], 12: [0.489, 0.370],
    13: [0.599, 0.509], 14: [0.496, 0.242], 15: [0.574, 0.551], 16: [0.517, 0.126],
    23: [0.485, 0.577], 24: [0.457, 0.571], 25: [0.463, 0.659], 26: [0.422, 0.733],
    27: [0.476, 0.694], 28: [0.488, 0.832],
  },
  // 3 — follow-through (racket sweeping down across body)
  {
    0: [0.47, 0.14], 11: [0.52, 0.31], 12: [0.43, 0.29],
    13: [0.57, 0.45], 14: [0.40, 0.38], 15: [0.58, 0.57], 16: [0.38, 0.48],
    23: [0.51, 0.57], 24: [0.41, 0.56], 25: [0.49, 0.71], 26: [0.38, 0.72],
    27: [0.47, 0.85], 28: [0.36, 0.86],
  },
]

function makeServeFrames(count = 90): [number, number][][] {
  const DEFAULT: [number, number] = [0.5, 0.5]
  const KEY_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

  function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
  function eio(t: number) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t) }

  const frames: [number, number][][] = []
  for (let i = 0; i < count; i++) {
    const t = i / count
    let pA: Record<number, [number, number]>
    let pB: Record<number, [number, number]>
    let blend: number

    if (t < 0.30)       { pA = SERVE_POSES[0]; pB = SERVE_POSES[1]; blend = eio(t / 0.30) }
    else if (t < 0.50)  { pA = SERVE_POSES[1]; pB = SERVE_POSES[2]; blend = eio((t - 0.30) / 0.20) }
    else if (t < 0.65)  { pA = SERVE_POSES[2]; pB = SERVE_POSES[3]; blend = eio((t - 0.50) / 0.15) }
    else                { pA = SERVE_POSES[3]; pB = SERVE_POSES[0]; blend = eio((t - 0.65) / 0.35) }

    const pts: [number, number][] = Array.from({ length: 33 }, () => [...DEFAULT] as [number, number])
    for (const k of KEY_INDICES) {
      const a = pA[k] ?? DEFAULT
      const b = pB[k] ?? DEFAULT
      pts[k] = [lerp(a[0], b[0], blend), lerp(a[1], b[1], blend)]
    }
    frames.push(pts)
  }
  return frames
}

const FRAMES = makeServeFrames(90)

function project(pt: [number, number], w: number, h: number): [number, number] {
  return [pt[0] * w, pt[1] * h]
}

function angleDeg(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  const v1x = ax - bx, v1y = ay - by
  const v2x = cx - bx, v2y = cy - by
  const n1 = Math.sqrt(v1x*v1x + v1y*v1y)
  const n2 = Math.sqrt(v2x*v2x + v2y*v2y)
  if (n1 < 1e-6 || n2 < 1e-6) return 0
  const dot = (v1x*v2x + v1y*v2y) / (n1 * n2)
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useInView<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setInView(true); obs.disconnect() }
      },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

function useCountUp(target: number, durationMs: number, start: boolean, decimals = 1): string {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(eased * target)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [start, target, durationMs])
  return value.toFixed(decimals)
}

// ── Acts catalogue (drives the navigator) ────────────────────────────────────

interface ActEntry {
  id: string
  roman: string
  label: { fr: string; en: string }
}

const ACTS: ActEntry[] = [
  { id: 'act-hook',      roman: 'I',   label: { fr: 'Crochet',    en: 'Hook' } },
  { id: 'act-number',    roman: 'II',  label: { fr: 'Le chiffre', en: 'The number' } },
  { id: 'act-witness',   roman: 'III', label: { fr: 'Le témoin',  en: 'The witness' } },
  { id: 'act-mirror',    roman: 'IV',  label: { fr: 'Le miroir',  en: 'The mirror' } },
  { id: 'act-manifeste', roman: 'V',   label: { fr: 'Manifeste',  en: 'Manifesto' } },
  { id: 'act-method',    roman: 'VI',   label: { fr: 'La méthode',    en: 'The method' } },
  { id: 'act-sports',   roman: 'VII',  label: { fr: 'L\'atlas',      en: 'The atlas' } },
  { id: 'act-threshold', roman: 'VIII', label: { fr: 'Le seuil',      en: 'The threshold' } },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const { i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const t = story[lang]
  const [activeAct, setActiveAct] = useState<string>(ACTS[0].id)

  const toggleLang = () => {
    const next = lang === 'fr' ? 'en' : 'fr'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  // Enable snap on <html> only while the landing is mounted.
  useEffect(() => {
    document.documentElement.classList.add('landing-scroll')
    return () => document.documentElement.classList.remove('landing-scroll') }, [])

  // Track which act is currently in view via IntersectionObserver.
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    let bestId = ACTS[0].id
    let bestRatio = 0
    const ratios = new Map<string, number>()

    ACTS.forEach(a => {
      const el = document.getElementById(a.id)
      if (!el) return
      const obs = new IntersectionObserver(
        entries => {
          for (const e of entries) {
            ratios.set(a.id, e.intersectionRatio)
          }
          bestId = ACTS[0].id
          bestRatio = -1
          for (const a2 of ACTS) {
            const r = ratios.get(a2.id) ?? 0
            if (r > bestRatio) { bestRatio = r; bestId = a2.id }
          }
          setActiveAct(bestId)
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [])

  // Keyboard nav: ↑ ↓ PageUp PageDown Home End move between acts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const idx = ACTS.findIndex(a => a.id === activeAct)
      let nextIdx: number | null = null

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        nextIdx = Math.min(ACTS.length - 1, idx + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        nextIdx = Math.max(0, idx - 1)
      } else if (e.key === 'Home') {
        nextIdx = 0
      } else if (e.key === 'End') {
        nextIdx = ACTS.length - 1
      }

      if (nextIdx !== null && nextIdx !== idx) {
        e.preventDefault()
        document.getElementById(ACTS[nextIdx].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeAct])

  // Wheel nav: one wheel tick = exactly one act. Throttled.
  // Touch input doesn't fire wheel events, so mobile keeps native CSS-snap scroll.
  useEffect(() => {
    // Respect reduced-motion: don't hijack the wheel.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    let lastTickT = 0
    let lastDir = 0
    const THROTTLE_MS = 720           // ≈ scrollIntoView smooth duration on most browsers
    const DELTA_THRESHOLD = 6         // ignore micro-scrolls (e.g. trackpad jitter)
    let smallDeltaAccum = 0

    const onWheel = (e: WheelEvent) => {
      // Don't interfere with focused inputs (unlikely on landing, but safe).
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // If the user is using Ctrl/Cmd+wheel (browser zoom), let the browser handle it.
      if (e.ctrlKey || e.metaKey) return

      e.preventDefault()

      const now = performance.now()
      const dir = e.deltaY > 0 ? 1 : -1

      // Reset accumulator if direction flipped or it's been a while
      if (dir !== lastDir || now - lastTickT > THROTTLE_MS) {
        smallDeltaAccum = 0
      }
      smallDeltaAccum += Math.abs(e.deltaY)

      // Throttle: a single tick is enough; subsequent events ignored until cooldown
      if (now - lastTickT < THROTTLE_MS) return

      // Only fire when the accumulated delta crosses a minimum — kills accidental
      // single-pixel wheel events while still firing on a proper notch.
      if (smallDeltaAccum < DELTA_THRESHOLD) return

      lastTickT = now
      lastDir = dir
      smallDeltaAccum = 0

      const idx = ACTS.findIndex(a => a.id === activeAct)
      const nextIdx = dir > 0
        ? Math.min(ACTS.length - 1, idx + 1)
        : Math.max(0, idx - 1)

      if (nextIdx !== idx) {
        document.getElementById(ACTS[nextIdx].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    // passive:false is REQUIRED to call preventDefault on wheel in modern browsers.
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [activeAct])

  return (
    <div className="landing">
      <NavBar appName={t.nav.app} lang={lang} onToggle={toggleLang} />

      <main className="landing-stage">
        <ActHook copy={t.hook} />
        <ActNumber copy={t.number} />
        <ActWitness copy={t.witness} />
        <ActMirror copy={t.mirror} />
        <ActManifeste copy={t.manifeste} />
        <ActMethod copy={t.method} />
        <ActSports copy={t.atlas} lang={lang} />
        <ActThreshold copy={t.threshold} lang={lang} />
      </main>

      <ActNavigator activeId={activeAct} lang={lang} />
    </div>
  )
}

// ── Right-rail navigator (anchors + active state) ────────────────────────────

interface ActNavigatorProps {
  activeId: string
  lang: 'fr' | 'en'
}

function ActNavigator({ activeId, lang }: ActNavigatorProps) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }
  return (
    <nav className="act-navigator" aria-label={lang === 'fr' ? 'Actes' : 'Acts'}>
      {ACTS.map(a => (
        <a
          key={a.id}
          href={`#${a.id}`}
          onClick={e => onClick(e, a.id)}
          className={`act-dot ${activeId === a.id ? 'act-dot-active' : ''}`}
          aria-label={`${a.roman} — ${a.label[lang]}`}
          aria-current={activeId === a.id ? 'true' : undefined}
        >
          <span className="act-dot-pill">
            <span className="act-dot-roman">{a.roman}</span>
            <span className="act-dot-name">{a.label[lang]}</span>
          </span>
          <span className="act-dot-mark" />
        </a>
      ))}
    </nav>
  )
}

// ── Nav ──────────────────────────────────────────────────────────────────────

interface NavBarProps {
  appName: string
  lang: 'fr' | 'en'
  onToggle: () => void
}

function NavBar({ appName, lang, onToggle }: NavBarProps) {
  return (
    <nav className="landing-nav">
      <div className="landing-logo">
        <img src="/logo/logo.png" alt="Apex" height={24}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <span className="landing-logo-name">{appName}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <a
          href={`/${lang}/app`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: 'linear-gradient(135deg, rgba(124,241,249,0.30) 0%, rgba(7,107,114,0.20) 100%)',
            border: '1px solid rgba(124,241,249,0.5)',
            borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-1)',
            textDecoration: 'none',
            letterSpacing: '-0.005em',
            boxShadow: '0 0 16px rgba(124,241,249,0.25)',
            transition: 'all 0.2s ease',
          }}
        >
          App →
        </a>
        <button className="lang-toggle" onClick={onToggle} aria-label="Switch language" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <FlagIcon country={lang === 'fr' ? 'FR' : 'GB'} size={18} />
          <span style={{ fontSize: 11 }}>{lang === 'fr' ? 'FR' : 'EN'}</span>
        </button>
      </div>
    </nav>
  )
}

// ── Act I — Hook ─────────────────────────────────────────────────────────────

interface ActHookProps {
  copy: StoryActs['hook']
}

function ActHook({ copy }: ActHookProps) {
  return (
    <section id="act-hook" className="scene scene-hook">
      <div className="scene-frame">
        <p className="scene-actno">I</p>
        <h1 className="hook-title">
          <span className="hook-line-1">{copy.line1}</span>
          <span className="hook-line-2">{copy.line2}</span>
        </h1>
        <div className="hook-scroll">
          <span className="hook-scroll-label">{copy.scroll}</span>
          <span className="hook-scroll-bar" aria-hidden />
        </div>
      </div>
    </section>
  )
}

// ── Act II — The Number ──────────────────────────────────────────────────────

interface ActNumberProps {
  copy: StoryActs['number']
}

function ActNumber({ copy }: ActNumberProps) {
  const { ref, inView } = useInView<HTMLElement>(0.45)
  const animated = useCountUp(142.7, 1600, inView, 1)

  return (
    <section id="act-number" ref={ref} className={`scene scene-number ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame">
        <p className="scene-actno">II</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>

        <p className="number-pre">{copy.pre} <span className="number-italic">{copy.isAt}</span></p>

        <div className="number-stage" aria-hidden>
          <span className="number-value mono">{animated}</span>
          <span className="number-unit">°</span>
        </div>

        <p className="number-post">{copy.post}</p>

        <div className="number-whisper">
          <p>{copy.whisper1}</p>
          <p>{copy.whisper2}</p>
        </div>
      </div>
    </section>
  )
}

// ── Act III — The Witness (skeleton) ─────────────────────────────────────────

interface ActWitnessProps {
  copy: StoryActs['witness']
}

function ActWitness({ copy }: ActWitnessProps) {
  const { ref, inView } = useInView<HTMLElement>(0.3)
  const [frameIdx, setFrameIdx] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const [svgSize, setSvgSize] = useState({ w: 560, h: 420 })

  useEffect(() => {
    let fi = 0
    const animate = (time: number) => {
      if (time - lastTimeRef.current > 1000 / 18) {
        fi = (fi + 1) % FRAMES.length
        setFrameIdx(fi)
        lastTimeRef.current = time
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setSvgSize({ w: e.contentRect.width, h: e.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const frame = FRAMES[frameIdx]
  const { w, h } = svgSize
  // Right elbow angle: shoulder → elbow → wrist (racket arm extension)
  const shoulder = project(frame[12], w, h)
  const elbow    = project(frame[14], w, h)
  const wrist    = project(frame[16], w, h)
  const elbowAngle = angleDeg(shoulder[0], shoulder[1], elbow[0], elbow[1], wrist[0], wrist[1])

  return (
    <section id="act-witness" ref={ref} className={`scene scene-witness ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame">
        <p className="scene-actno">III</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>

        <h2 className="witness-title">
          <span>{copy.line1}</span>
          <span className="witness-title-emph">{copy.line2}</span>
        </h2>

        <div className="witness-cathedral">
          {/* Corner brackets */}
          <span className="witness-bracket witness-bracket-tl" />
          <span className="witness-bracket witness-bracket-tr" />
          <span className="witness-bracket witness-bracket-bl" />
          <span className="witness-bracket witness-bracket-br" />

          <div className="witness-badge">
            <span className="witness-badge-dot" />
            <span>LIVE · BLAZE-POSE FULL</span>
          </div>

          <svg ref={svgRef} className="witness-svg" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            <defs>
              <linearGradient id="witness-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#7cf1f9" />
                <stop offset="50%"  stopColor="#61ced6" />
                <stop offset="100%" stopColor="#46acb3" />
              </linearGradient>
              <filter id="witness-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="witness-halo">
                <stop offset="0%"   stopColor="#61ced6" stopOpacity="0.85" />
                <stop offset="60%"  stopColor="#61ced6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#61ced6" stopOpacity="0" />
              </radialGradient>
            </defs>

            <ellipse cx={w / 2} cy={h * 0.55} rx={w * 0.32} ry={h * 0.4}
              fill="url(#witness-halo)" opacity={0.22} />

            {SKELETON_CONNECTIONS.map(([a, b]) => {
              const [ax, ay] = project(frame[a], w, h)
              const [bx, by] = project(frame[b], w, h)
              return (
                <line key={`${a}-${b}`}
                  x1={ax} y1={ay} x2={bx} y2={by}
                  stroke="url(#witness-stroke)"
                  strokeWidth={2.8}
                  strokeLinecap="round"
                  filter="url(#witness-glow)"
                />
              )
            })}

            {/* Head circle at landmark 0 */}
            {(() => {
              const [hx, hy] = project(frame[0], w, h)
              return (
                <g>
                  <circle cx={hx} cy={hy} r={20} fill="url(#witness-halo)" />
                  <circle cx={hx} cy={hy} r={9} fill="#e8feff" opacity={0.9} />
                </g>
              )
            })()}

            {/* Body joints */}
            {[11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map(idx => {
              const [px, py] = project(frame[idx], w, h)
              return (
                <g key={idx}>
                  <circle cx={px} cy={py} r={11} fill="url(#witness-halo)" />
                  <circle cx={px} cy={py} r={3.2} fill="#e8feff" opacity={0.95} />
                </g>
              )
            })}

            {/* Elbow angle annotation (racket arm) */}
            {(() => {
              const [ex, ey] = elbow
              const r = 28
              return (
                <g>
                  <circle cx={ex} cy={ey} r={r} fill="none"
                    stroke="#61ced6" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.75} />
                  <text x={ex + r + 6} y={ey + 4}
                    fontFamily="var(--font-data)" fontSize={12} fill="#61ced6" opacity={0.95}>
                    {elbowAngle.toFixed(1)}°
                  </text>
                </g>
              )
            })()}

            {/* HUD bar */}
            <rect x={14} y={h - 38} width={w - 28} height={28} rx={14}
              fill="rgba(2,13,14,0.6)" stroke="rgba(255,255,255,0.15)" />
            <text x={26} y={h - 20} fontFamily="var(--font-data)" fontSize={11}
              fill="#b5d8db" letterSpacing="0.10em">
              ELBOW {elbowAngle.toFixed(1)}°  ·  ARM SPD ~140 km/h  ·  SERVE APEX
            </text>
          </svg>
        </div>

        <div className="witness-stats">
          <div className="witness-stat">
            <span className="witness-stat-value mono">{copy.stat1.v}</span>
            <span className="witness-stat-label">{copy.stat1.l}</span>
          </div>
          <div className="witness-stat-divider" />
          <div className="witness-stat">
            <span className="witness-stat-value mono">{copy.stat2.v}</span>
            <span className="witness-stat-label">{copy.stat2.l}</span>
          </div>
          <div className="witness-stat-divider" />
          <div className="witness-stat">
            <span className="witness-stat-value mono">{copy.stat3.v}</span>
            <span className="witness-stat-label">{copy.stat3.l}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Act IV — The Mirror (sequence vs reference chart) ───────────────────────

const MIRROR_N = 96

function refValue(t: number): number {
  return 95
    + 32 * Math.sin(t * Math.PI * 2 - Math.PI / 2)
    + 7  * Math.sin(t * Math.PI * 4 + 0.6)
}

function seqValue(t: number): number {
  const lag = 0.04
  const base = refValue(Math.max(0, t - lag))
  // Bell-shaped drift below ref, peaking around t=0.72
  const drift = -16 * Math.exp(-Math.pow((t - 0.72) / 0.18, 2))
  return base + drift
}

function envOffset(t: number): number {
  return 9 + 2.2 * Math.sin(t * Math.PI * 5 + 0.3)
}

// Precompute samples (degrees)
const MIRROR_T:   number[] = []
const MIRROR_REF: number[] = []
const MIRROR_SEQ: number[] = []
const MIRROR_LO:  number[] = []
const MIRROR_HI:  number[] = []
for (let i = 0; i < MIRROR_N; i++) {
  const t = i / (MIRROR_N - 1)
  const r = refValue(t)
  MIRROR_T.push(t)
  MIRROR_REF.push(r)
  MIRROR_SEQ.push(seqValue(t))
  MIRROR_LO.push(r - envOffset(t))
  MIRROR_HI.push(r + envOffset(t))
}

// Compute Y range with padding
const MIRROR_ALL_Y = [...MIRROR_REF, ...MIRROR_SEQ, ...MIRROR_LO, ...MIRROR_HI]
const MIRROR_Y_MIN = Math.floor(Math.min(...MIRROR_ALL_Y) - 4)
const MIRROR_Y_MAX = Math.ceil(Math.max(...MIRROR_ALL_Y) + 4)

const CHART_W = 880
const CHART_H = 240
const CHART_PAD_L = 38
const CHART_PAD_R = 14
const CHART_PAD_T = 20
const CHART_PAD_B = 24
const PLOT_W = CHART_W - CHART_PAD_L - CHART_PAD_R
const PLOT_H = CHART_H - CHART_PAD_T - CHART_PAD_B

function sx(i: number): number {
  return CHART_PAD_L + (i / (MIRROR_N - 1)) * PLOT_W
}
function sy(v: number): number {
  return CHART_PAD_T + (1 - (v - MIRROR_Y_MIN) / (MIRROR_Y_MAX - MIRROR_Y_MIN)) * PLOT_H
}

function buildPathD(values: number[]): string {
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
}

function buildEnvelopePoints(): string {
  const top = MIRROR_HI.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
  const bot = MIRROR_LO.slice().reverse()
    .map((v, i) => `${sx(MIRROR_N - 1 - i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
  return `${top} ${bot}`
}

function buildDeltaPoints(): string {
  // Polygon between ref and seq across the divergent zone (t ∈ [0.45, 0.95])
  const start = Math.round(0.45 * (MIRROR_N - 1))
  const end   = Math.round(0.95 * (MIRROR_N - 1))
  const top: string[] = []
  const bot: string[] = []
  for (let i = start; i <= end; i++) {
    top.push(`${sx(i).toFixed(1)},${sy(MIRROR_REF[i]).toFixed(1)}`)
    bot.push(`${sx(i).toFixed(1)},${sy(MIRROR_SEQ[i]).toFixed(1)}`)
  }
  return `${top.join(' ')} ${bot.reverse().join(' ')}`
}

// Path length used for stroke-dashoffset reveal. Approximate via plot width.
const APPROX_PATH_LEN = PLOT_W * 1.15

interface ActMirrorProps {
  copy: StoryActs['mirror']
}

function ActMirror({ copy }: ActMirrorProps) {
  const { ref, inView } = useInView<HTMLElement>(0.25)

  return (
    <section id="act-mirror" ref={ref} className={`scene scene-mirror ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame">
        <p className="scene-actno">IV</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>

        <h2 className="mirror-title">
          <span className="mirror-title-1">{copy.line1}</span>
          <span className="mirror-title-2">{copy.line2}</span>
        </h2>

        <p className="mirror-intro">{copy.intro}</p>

        <div className="mirror-chart">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="mirror-svg"
            preserveAspectRatio="xMidYMid meet"
            aria-label={copy.chartTitle}
          >
            <defs>
              <linearGradient id="mirror-seq-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#7cf1f9" />
                <stop offset="100%" stopColor="#61ced6" />
              </linearGradient>
            </defs>

            {/* Reference curve — dashed, subtle */}
            <path
              className="mirror-ref-curve"
              d={buildPathD(MIRROR_REF)}
              fill="none"
              stroke="#46acb3"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDashoffset: inView ? 0 : APPROX_PATH_LEN }}
            />

            {/* Trial curve */}
            <path
              className="mirror-seq-curve"
              d={buildPathD(MIRROR_SEQ)}
              fill="none"
              stroke="url(#mirror-seq-stroke)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDashoffset: inView ? 0 : APPROX_PATH_LEN }}
            />
          </svg>
        </div>

        <div className="mirror-outro">
          <p className="mirror-outro-1">{copy.outro1}</p>
          <p className="mirror-outro-2">{copy.outro2}</p>
        </div>

        <p className="mirror-closer">{copy.closer}</p>

        <div className="mirror-stats">
          {copy.stats.map((s, i) => (
            <div key={i} className="mirror-stat">
              <span className="mirror-stat-value mono">{s.v}</span>
              <span className="mirror-stat-label">{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Act VII — Sports Atlas (all 143 motions) ─────────────────────────────────

const MOTIONS_DEF: { id: string; fr: string; en: string; icon: string }[] = [
  // Tennis — 3
  { id:'ten_svc', icon:'🎾', fr:'Service',            en:'Serve' },
  { id:'ten_fh',  icon:'🎾', fr:'Coup droit',         en:'Forehand' },
  { id:'ten_bh',  icon:'🎾', fr:'Revers',             en:'Backhand' },
  // Athletics — 10
  { id:'ath_blk', icon:'🏃', fr:'Départ blocs',       en:'Block start' },
  { id:'ath_spr', icon:'🏃', fr:'Sprint',             en:'Sprint' },
  { id:'ath_air', icon:'🏃', fr:'Phase aérienne',     en:'Aerial phase' },
  { id:'ath_ljt', icon:'🏃', fr:'Appel longueur',     en:'Long jump takeoff' },
  { id:'ath_trj', icon:'🏃', fr:'Triple saut',        en:'Triple jump' },
  { id:'ath_hj',  icon:'🏃', fr:'Saut en hauteur',   en:'High jump' },
  { id:'ath_hur', icon:'🏃', fr:'Haies',              en:'Hurdles' },
  { id:'ath_jav', icon:'🏃', fr:'Javelot',            en:'Javelin' },
  { id:'ath_sp',  icon:'🏃', fr:'Lancer du poids',   en:'Shot put' },
  { id:'ath_wlk', icon:'🏃', fr:'Marche',             en:'Race walk' },
  // Badminton — 8
  { id:'bad_ss',  icon:'🏸', fr:'Split step',         en:'Split step' },
  { id:'bad_sm',  icon:'🏸', fr:'Smash',              en:'Smash' },
  { id:'bad_sl',  icon:'🏸', fr:'Service long',       en:'Long serve' },
  { id:'bad_nk',  icon:'🏸', fr:'Kill filet',         en:'Net kill' },
  { id:'bad_ln',  icon:'🏸', fr:'Fente',              en:'Lunge' },
  { id:'bad_dr',  icon:'🏸', fr:'Amorti',             en:'Drop shot' },
  { id:'bad_dv',  icon:'🏸', fr:'Drive',              en:'Drive' },
  { id:'bad_cl',  icon:'🏸', fr:'Dégagé',             en:'Clear' },
  // Basketball — 10
  { id:'bsk_js',  icon:'🏀', fr:'Tir en suspension',  en:'Jump shot' },
  { id:'bsk_3p',  icon:'🏀', fr:'Tir à 3 pts',        en:'3-point shot' },
  { id:'bsk_dr',  icon:'🏀', fr:'Dribble',            en:'Dribble' },
  { id:'bsk_cx',  icon:'🏀', fr:'Crossover',          en:'Crossover' },
  { id:'bsk_ly',  icon:'🏀', fr:'Lay-up',             en:'Lay-up' },
  { id:'bsk_cp',  icon:'🏀', fr:'Passe poitrine',     en:'Chest pass' },
  { id:'bsk_pv',  icon:'🏀', fr:'Pivot',              en:'Pivot' },
  { id:'bsk_ds',  icon:'🏀', fr:'Glissade déf.',      en:'Defensive slide' },
  { id:'bsk_jst', icon:'🏀', fr:'Jump stop',          en:'Jump stop' },
  { id:'bsk_rb',  icon:'🏀', fr:'Rebond saut',        en:'Rebound jump' },
  // Boxing — 8
  { id:'box_jb',  icon:'🥊', fr:'Jab',                en:'Jab' },
  { id:'box_cr',  icon:'🥊', fr:'Cross',              en:'Cross' },
  { id:'box_hk',  icon:'🥊', fr:'Crochet',            en:'Hook' },
  { id:'box_uc',  icon:'🥊', fr:'Uppercut',           en:'Uppercut' },
  { id:'box_gd',  icon:'🥊', fr:'Garde',              en:'Guard' },
  { id:'box_sl',  icon:'🥊', fr:'Esquive',            en:'Slip' },
  { id:'box_bw',  icon:'🥊', fr:'Bob & weave',        en:'Bob & weave' },
  { id:'box_fw',  icon:'🥊', fr:'Jeu de jambes',      en:'Footwork' },
  // Cycling — 9
  { id:'cyc_pd',  icon:'🚴', fr:'Pédalage',           en:'Pedaling' },
  { id:'cyc_sp',  icon:'🚴', fr:'Sprint',             en:'Sprint' },
  { id:'cyc_as',  icon:'🚴', fr:'Attaque assis',      en:'Seated attack' },
  { id:'cyc_sc',  icon:'🚴', fr:'Grimpée debout',     en:'Standing climb' },
  { id:'cyc_rc',  icon:'🚴', fr:'Grimpée assis',      en:'Seated climb' },
  { id:'cyc_tt',  icon:'🚴', fr:'Position chrono',    en:'TT position' },
  { id:'cyc_ds',  icon:'🚴', fr:'Descente',           en:'Descent' },
  { id:'cyc_cn',  icon:'🚴', fr:'Virage',             en:'Cornering' },
  { id:'cyc_br',  icon:'🚴', fr:'Freinage',           en:'Braking' },
  // Football — 10
  { id:'fot_kk',  icon:'⚽', fr:'Coup de pied',       en:'Kick' },
  { id:'fot_hd',  icon:'⚽', fr:'Tête',               en:'Header' },
  { id:'fot_sb',  icon:'⚽', fr:'Sprint retour',      en:'Sprint back' },
  { id:'fot_ac',  icon:'⚽', fr:'Accélération',       en:'Acceleration' },
  { id:'fot_ct',  icon:'⚽', fr:'Coupure',            en:'Cut' },
  { id:'fot_lp',  icon:'⚽', fr:'Passe longue',       en:'Long pass' },
  { id:'fot_cc',  icon:'⚽', fr:'Contrôle poitrine',  en:'Chest control' },
  { id:'fot_tk',  icon:'⚽', fr:'Tacle',              en:'Tackle' },
  { id:'fot_dk',  icon:'⚽', fr:'Drop',               en:'Drop kick' },
  { id:'fot_vl',  icon:'⚽', fr:'Volée',              en:'Volley' },
  // Golf — 9
  { id:'glf_ad',  icon:'⛳', fr:'Address',            en:'Address' },
  { id:'glf_bs',  icon:'⛳', fr:'Amplitude backswing',en:'Backswing' },
  { id:'glf_tr',  icon:'⛳', fr:'Transition',         en:'Transition' },
  { id:'glf_im',  icon:'⛳', fr:'Impact',             en:'Impact' },
  { id:'glf_ft',  icon:'⛳', fr:'Suivi',              en:'Follow-through' },
  { id:'glf_sw',  icon:'⛳', fr:'Swing',              en:'Swing' },
  { id:'glf_ch',  icon:'⛳', fr:'Chip',               en:'Chip' },
  { id:'glf_bk',  icon:'⛳', fr:'Bunker',             en:'Bunker' },
  { id:'glf_pt',  icon:'⛳', fr:'Putt',               en:'Putt' },
  // Gymnastics — 10
  { id:'gym_ar',  icon:'🤸', fr:'Arabesque',          en:'Arabesque' },
  { id:'gym_br',  icon:'🤸', fr:'Pont',               en:'Bridge' },
  { id:'gym_cw',  icon:'🤸', fr:'Roue',               en:'Cartwheel' },
  { id:'gym_fl',  icon:'🤸', fr:'Sol',                en:'Floor sequence' },
  { id:'gym_fs',  icon:'🤸', fr:'Salto avant',        en:'Front salto' },
  { id:'gym_jp',  icon:'🤸', fr:'Saut',               en:'Jump' },
  { id:'gym_ld',  icon:'🤸', fr:'Réception',          en:'Landing' },
  { id:'gym_pi',  icon:'🤸', fr:'Pirouette',          en:'Pirouette' },
  { id:'gym_ro',  icon:'🤸', fr:'Rondade',            en:'Round-off' },
  { id:'gym_sp',  icon:'🤸', fr:'Grand écart',        en:'Split' },
  // Handball — 7
  { id:'hnd_js',  icon:'🤾', fr:'Tir en suspension',  en:'Jump shot' },
  { id:'hnd_ws',  icon:'🤾', fr:"Tir d'aile",        en:'Wing shot' },
  { id:'hnd_pn',  icon:'🤾', fr:'Penaltys',           en:'Penalty throw' },
  { id:'hnd_op',  icon:'🤾', fr:'Passe haute',        en:'Overhead pass' },
  { id:'hnd_pv',  icon:'🤾', fr:'Pivot',              en:'Pivot' },
  { id:'hnd_gk',  icon:'🤾', fr:'Gardien',            en:'Goalkeeper' },
  { id:'hnd_fb',  icon:'🤾', fr:'Contre-attaque',     en:'Fast break' },
  // Padel — 6
  { id:'pdl_sv',  icon:'🏓', fr:'Service',            en:'Serve' },
  { id:'pdl_sm',  icon:'🏓', fr:'Smash',              en:'Smash' },
  { id:'pdl_vb',  icon:'🏓', fr:'Víbora',             en:'Víbora' },
  { id:'pdl_bd',  icon:'🏓', fr:'Bandeja',            en:'Bandeja' },
  { id:'pdl_lb',  icon:'🏓', fr:'Lob',                en:'Lob' },
  { id:'pdl_vl',  icon:'🏓', fr:'Volée',              en:'Volley' },
  // Rowing — 10
  { id:'row_ct',  icon:'🚣', fr:'Attaque',            en:'Catch' },
  { id:'row_dl',  icon:'🚣', fr:'Poussée jambes',     en:'Leg drive' },
  { id:'row_fn',  icon:'🚣', fr:'Finition',           en:'Finish' },
  { id:'row_rc',  icon:'🚣', fr:'Récupération',       en:'Recovery' },
  { id:'row_rt',  icon:'🚣', fr:'Ratio',              en:'Ratio' },
  { id:'row_st',  icon:'🚣', fr:'Coup de rame',       en:'Stroke' },
  { id:'row_sr',  icon:'🚣', fr:'Départ',             en:'Start' },
  { id:'row_sf',  icon:'🚣', fr:'Sprint final',       en:'Sprint finish' },
  { id:'row_co',  icon:'🚣', fr:'Coordination',       en:'Coordination' },
  { id:'row_er',  icon:'🚣', fr:'Ergomètre',          en:'Ergometer' },
  // Skiing — 6
  { id:'ski_tk',  icon:'⛷️', fr:'Œuf',               en:'Tuck' },
  { id:'ski_sg',  icon:'⛷️', fr:'Départ porte',       en:'Gate start' },
  { id:'ski_cv',  icon:'⛷️', fr:'Carving',            en:'Carving' },
  { id:'ski_pt',  icon:'⛷️', fr:'Virage parallèle',   en:'Parallel turn' },
  { id:'ski_mg',  icon:'⛷️', fr:'Bosses',             en:'Mogul absorption' },
  { id:'ski_jl',  icon:'⛷️', fr:'Réception saut',     en:'Jump landing' },
  // Swimming — 10
  { id:'swm_ds',  icon:'🏊', fr:'Départ plongé',      en:'Dive start' },
  { id:'swm_cp',  icon:'🏊', fr:'Traction crawl',     en:'Crawl pull' },
  { id:'swm_cr',  icon:'🏊', fr:'Retour crawl',       en:'Crawl return' },
  { id:'swm_br',  icon:'🏊', fr:'Rotation dos',       en:'Backstroke' },
  { id:'swm_bk',  icon:'🏊', fr:'Coup brasse',        en:'Breaststroke kick' },
  { id:'swm_bp',  icon:'🏊', fr:'Traction brasse',    en:'Breaststroke pull' },
  { id:'swm_ba',  icon:'🏊', fr:'Bras papillon',      en:'Butterfly arms' },
  { id:'swm_bu',  icon:'🏊', fr:'Ondulation papillon',en:'Butterfly undulation' },
  { id:'swm_fk',  icon:'🏊', fr:'Battements libres',  en:'Flutter kick' },
  { id:'swm_tr',  icon:'🏊', fr:'Virage',             en:'Turn' },
  // Volleyball — 10
  { id:'vll_sm',  icon:'🏐', fr:'Smash',              en:'Smash' },
  { id:'vll_as',  icon:'🏐', fr:'Smash avec course',  en:'Approach smash' },
  { id:'vll_pa',  icon:'🏐', fr:'Attaque pipe',       en:'Pipe attack' },
  { id:'vll_js',  icon:'🏐', fr:'Service sauté',      en:'Jump serve' },
  { id:'vll_fs',  icon:'🏐', fr:'Service flottant',   en:'Floater serve' },
  { id:'vll_dg',  icon:'🏐', fr:'Manchette',          en:'Dig' },
  { id:'vll_st',  icon:'🏐', fr:'Passe haute',        en:'Set' },
  { id:'vll_bl',  icon:'🏐', fr:'Contre',             en:'Block' },
  { id:'vll_sd',  icon:'🏐', fr:'Défense glissade',   en:'Slide defense' },
  { id:'vll_rd',  icon:'🏐', fr:'Défense roulade',    en:'Roll defense' },
  // Weightlifting — 11
  { id:'wlt_sq',  icon:'🏋️', fr:'Squat',              en:'Squat' },
  { id:'wlt_dl',  icon:'🏋️', fr:'Soulevé de terre',   en:'Deadlift' },
  { id:'wlt_sn',  icon:'🏋️', fr:'Arraché',            en:'Snatch' },
  { id:'wlt_cl',  icon:'🏋️', fr:'Épaulé',             en:'Clean' },
  { id:'wlt_rd',  icon:'🏋️', fr:'SDT roumain',        en:'Romanian deadlift' },
  { id:'wlt_op',  icon:'🏋️', fr:'Dév. militaire',     en:'Overhead press' },
  { id:'wlt_bp',  icon:'🏋️', fr:'Dév. couché',        en:'Bench press' },
  { id:'wlt_ht',  icon:'🏋️', fr:'Hip thrust',         en:'Hip thrust' },
  { id:'wlt_gm',  icon:'🏋️', fr:'Good morning',       en:'Good morning' },
  { id:'wlt_kb',  icon:'🏋️', fr:'Swing kettlebell',   en:'Kettlebell swing' },
  { id:'wlt_ln',  icon:'🏋️', fr:'Fente',              en:'Lunge' },
  // Archery — 6
  { id:'arc_st',  icon:'🏹', fr:'Position',           en:'Stance' },
  { id:'arc_dr',  icon:'🏹', fr:'Tirage',             en:'Draw' },
  { id:'arc_an',  icon:'🏹', fr:'Ancrage',            en:'Anchor' },
  { id:'arc_ba',  icon:'🏹', fr:'Bras arc',           en:'Bow arm' },
  { id:'arc_rl',  icon:'🏹', fr:'Lâcher',             en:'Release' },
  { id:'arc_ft',  icon:'🏹', fr:'Suivi',              en:'Follow-through' },
]

// Split 143 motions into 3 balanced rows
const ATLAS_ROW_1 = MOTIONS_DEF.slice(0, 48)   // tennis → cycling (48)
const ATLAS_ROW_2 = MOTIONS_DEF.slice(48, 96)   // football → rowing (48)
const ATLAS_ROW_3 = MOTIONS_DEF.slice(96)        // skiing → archery (47)

interface ActSportsProps {
  copy: StoryActs['atlas']
  lang: 'fr' | 'en'
}

function ActSports({ copy, lang }: ActSportsProps) {
  const { ref, inView } = useInView<HTMLElement>(0.12)

  const makePills = (row: typeof MOTIONS_DEF) =>
    [...row, ...row].map((m, i) => (
      <span key={`${m.id}-${i}`} className="motion-pill">
        <span className="motion-pill-icon" aria-hidden>{m.icon}</span>
        <span className="motion-pill-label">{lang === 'fr' ? m.fr : m.en}</span>
      </span>
    ))

  return (
    <section id="act-sports" ref={ref} className={`scene scene-sports ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame sports-header">
        <p className="scene-actno">VII</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>
        <h2 className="sports-title">{copy.title}</h2>
        <p className="sports-sub">{copy.sub}</p>
      </div>

      <div className="sports-ticker">
        <div className="sports-row sports-row-fwd">{makePills(ATLAS_ROW_1)}</div>
        <div className="sports-row sports-row-rev">{makePills(ATLAS_ROW_2)}</div>
        <div className="sports-row sports-row-fwd" style={{ animationDuration: '260s' }}>{makePills(ATLAS_ROW_3)}</div>
      </div>
    </section>
  )
}

// ── Act V — Manifesto (three pillars) ────────────────────────────────────────

interface ActManifesteProps {
  copy: StoryActs['manifeste']
}

function ActManifeste({ copy }: ActManifesteProps) {
  const { ref, inView } = useInView<HTMLElement>(0.2)

  return (
    <section id="act-manifeste" ref={ref} className={`scene scene-manifeste ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame">
        <p className="scene-actno">V</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>
        <h2 className="manifeste-title">{copy.title}</h2>

        <div className="manifeste-grid">
          {copy.pillars.map((p, i) => (
            <article key={p.n} className="manifeste-card" style={{ ['--i' as string]: i }}>
              <span className="manifeste-card-n mono">{p.n}</span>
              <span className="manifeste-card-tag">{p.tag}</span>
              <h3 className="manifeste-card-title">{p.title}</h3>
              <p className="manifeste-card-body">{p.body}</p>
              <span className="manifeste-card-corner" aria-hidden />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Act V — Method (three steps) ─────────────────────────────────────────────

interface ActMethodProps {
  copy: StoryActs['method']
}

function ActMethod({ copy }: ActMethodProps) {
  const { ref, inView } = useInView<HTMLElement>(0.2)

  return (
    <section id="act-method" ref={ref} className={`scene scene-method ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame">
        <p className="scene-actno">VI</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>
        <h2 className="method-title">{copy.title}</h2>

        <ol className="method-steps">
          {copy.steps.map((s, i) => (
            <li key={s.n} className="method-step" style={{ ['--i' as string]: i }}>
              <div className="method-step-rail">
                <span className="method-step-dot" />
                {i < copy.steps.length - 1 && <span className="method-step-line" />}
              </div>
              <div className="method-step-body">
                <span className="method-step-n mono">{s.n}</span>
                <h3 className="method-step-title">{s.title}</h3>
                <p className="method-step-body-text">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── Act VI — Threshold (CTA) ─────────────────────────────────────────────────

interface ActThresholdProps {
  copy: StoryActs['threshold']
  lang: 'fr' | 'en'
}

function ActThreshold({ copy, lang }: ActThresholdProps) {
  const { ref, inView } = useInView<HTMLElement>(0.4)

  return (
    <section id="act-threshold" ref={ref} className={`scene scene-threshold ${inView ? 'in-view' : ''}`}>
      <div className="scene-frame">
        <p className="scene-actno">VIII</p>
        <p className="scene-eyebrow">{copy.eyebrow}</p>

        <h2 className="threshold-title">{copy.title}</h2>

        <a href={`/${lang}/app`} className="threshold-cta">
          <span className="threshold-cta-label">{copy.cta}</span>
          <span className="threshold-cta-arrow">→</span>
        </a>

        <p className="threshold-footnote">{copy.footnote}</p>
      </div>
    </section>
  )
}
