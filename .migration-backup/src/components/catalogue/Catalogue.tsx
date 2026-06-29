import { useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ScriptCard } from './ScriptCard'
import { SportIcon } from './SportIcon'
import { getSportMeta, ACCENT_COLORS } from './sportMeta'
import type { SportMeta } from './sportMeta'
import { getAllScripts, addScript, importScriptFile, getBuiltInScripts, deleteScript } from '../../lib/scripts'
import type { Script } from '../../lib/scripts'
import { FlagIcon } from '../shared/FlagIcon'
import { CaptureGuide } from './CaptureGuide'
import { NewsTicker } from '../shared/NewsTicker'

const BUILT_IN_IDS = new Set(getBuiltInScripts().map(s => s.id))

interface SportEntry {
  meta: SportMeta
  count: number
  scripts: Script[]
}

export function Catalogue() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const navigate = useNavigate()
  const { lang: urlLang, sport: selectedSport } = useParams<{ lang: string; sport?: string }>()
  const [scripts, setScripts] = useState<Script[]>(getAllScripts)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Group scripts by discipline
  const sports: SportEntry[] = useMemo(() => {
    const byDiscipline = new Map<string, Script[]>()
    for (const s of scripts) {
      const list = byDiscipline.get(s.discipline) ?? []
      list.push(s)
      byDiscipline.set(s.discipline, list)
    }
    return Array.from(byDiscipline.entries())
      .map(([key, list]) => ({ meta: getSportMeta(key), count: list.length, scripts: list }))
      .sort((a, b) => a.meta.name[lang].localeCompare(b.meta.name[lang]))
  }, [scripts, lang])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const { script, errors } = await importScriptFile(file)
    if (errors.length > 0) {
      setImportError(errors.map(err => `${err.field}: ${err.message}`).join('\n'))
    } else {
      addScript(script)
      setScripts(getAllScripts())
      setImportError(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const toggleLang = () => {
    const next = lang === 'fr' ? 'en' : 'fr'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
    // Navigate to same path but with new language prefix
    const currentPath = window.location.pathname
    const newPath = currentPath.replace(/^\/(fr|en)/, `/${next}`)
    navigate(newPath, { replace: true })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Floating glass header */}
      <Header
        title={selectedSport ? getSportMeta(selectedSport).name[lang] : t('catalogue.sport_picker_prompt')}
        subtitle={
          selectedSport
            ? t(
                sports.find(s => s.meta.key === selectedSport)?.count === 1
                  ? 'catalogue.sport_count_one'
                  : 'catalogue.sport_count_other',
                { count: sports.find(s => s.meta.key === selectedSport)?.count ?? 0 }
              )
            : ''
        }
        showBack={!!selectedSport}
        backLabel={t('catalogue.back_to_sports')}
        onBack={() => navigate(`/${urlLang ?? lang}/app`)}
        lang={lang}
        onToggleLang={toggleLang}
      />

      {/* Step 1 — pick a sport */}
      {!selectedSport && (
        <SportPicker
          sports={sports}
          lang={lang}
          onPick={key => navigate(`/${urlLang ?? lang}/app/${key}`)}
        />
      )}

      {/* Step 2 — list motions for the selected sport */}
      {selectedSport && (
        <MotionsList
          scripts={sports.find(s => s.meta.key === selectedSport)?.scripts ?? []}
          sportMeta={getSportMeta(selectedSport)}
          emptyState={t('catalogue.empty_state')}
          onDeleteScript={id => { deleteScript(id); setScripts(getAllScripts()) }}
        />
      )}

      {/* Import error toast */}
      {importError && (
        <div style={{
          position: 'fixed',
          left: 'var(--space-4)', right: 'var(--space-4)',
          bottom: 100,
          padding: 'var(--space-3)',
          border: '1px solid rgba(124,241,249,0.35)',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(124,241,249,0.08)',
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--text-xs)',
          color: 'var(--accent-warn)',
          whiteSpace: 'pre-wrap',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          maxWidth: 560, margin: '0 auto',
          zIndex: 20,
        }}>
          {importError}
        </div>
      )}

      {/* Guide button (bottom-left) */}
      <CaptureGuide lang={lang} />

      {/* Tips ticker — fixed strip at the very top */}
      <div style={{
        position: 'fixed',
        left: 0, right: 0,
        top: 0,
        zIndex: 19,
      }}>
        <NewsTicker lang={lang} />
      </div>

      {/* Floating icon-only action cluster (bottom-right) */}
      <FloatingActions
        onImport={() => fileInputRef.current?.click()}
        onCreate={() => navigate(`/${urlLang ?? lang}/builder`)}
        importLabel={t('catalogue.import_btn')}
        createLabel={t('catalogue.create_btn')}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────

interface HeaderProps {
  title: string
  subtitle: string
  showBack: boolean
  backLabel: string
  onBack: () => void
  lang: 'fr' | 'en'
  onToggleLang: () => void
}

function Header({ title, subtitle, showBack, backLabel, onBack, lang, onToggleLang }: HeaderProps) {
  return (
    <header
      className="rise-in"
      style={{
        margin: 'calc(34px + var(--space-4)) var(--space-4) 0',
        padding: '12px 18px',
        background: 'var(--glass-2)',
        border: '1px solid var(--glass-edge)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'var(--shadow-glass)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flex: 1 }}>
        {showBack && (
          <button
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
            style={{
              width: 36, height: 36,
              borderRadius: '50%',
              background: 'var(--glass-2)',
              border: '1px solid var(--glass-edge)',
              color: 'var(--ink-1)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              transition: 'all var(--dur-fast) var(--ease-out)',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-4)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-2)' }}
          >←</button>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            color: 'var(--ink-1)',
            letterSpacing: '-0.015em',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginTop: 1,
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onToggleLang}
        className="btn btn-secondary"
        style={{ minHeight: 36, padding: '6px 12px', fontSize: 11, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <FlagIcon country={lang === 'fr' ? 'FR' : 'GB'} size={16} />
        <span>{lang === 'fr' ? 'FR' : 'EN'}</span>
      </button>
    </header>
  )
}

// ── Sport picker ───────────────────────────────────────────────────────────

interface SportPickerProps {
  sports: SportEntry[]
  lang: 'fr' | 'en'
  onPick: (key: string) => void
}

function SportPicker({ sports, lang, onPick }: SportPickerProps) {
  const { t } = useTranslation()
  return (
    <main
      className="rise-in-delay-1"
      style={{
        flex: 1,
        padding: 'var(--space-5) var(--space-4) calc(var(--space-12) + 80px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 'var(--space-3)',
        alignContent: 'start',
        maxWidth: 1100,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {sports.map((s, i) => (
        <SportTile key={s.meta.key} entry={s} lang={lang} onPick={onPick} index={i} t={t} />
      ))}
    </main>
  )
}

interface SportTileProps {
  entry: SportEntry
  lang: 'fr' | 'en'
  onPick: (key: string) => void
  index: number
  t: ReturnType<typeof useTranslation>['t']
}

function SportTile({ entry, lang, onPick, index, t }: SportTileProps) {
  const [hovered, setHovered] = useState(false)
  const accent = ACCENT_COLORS[entry.meta.accent]
  const delayClass =
    index % 4 === 0 ? 'rise-in' :
    index % 4 === 1 ? 'rise-in-delay-1' :
    index % 4 === 2 ? 'rise-in-delay-2' : 'rise-in-delay-3'

  return (
    <button
      className={delayClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPick(entry.meta.key)}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        padding: 'var(--space-4)',
        background: hovered ? 'var(--glass-3)' : 'var(--glass-2)',
        border: `1px solid ${hovered ? accent.glow : 'var(--glass-edge)'}`,
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: hovered
          ? `0 18px 40px -16px rgba(0,0,0,0.55), 0 0 38px ${accent.glow}`
          : 'var(--shadow-glass)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all var(--dur-base) var(--ease-fluid)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        textAlign: 'left',
        overflow: 'hidden',
      }}
    >
      {/* Accent halo */}
      <span style={{
        position: 'absolute',
        top: -30, right: -30,
        width: 120, height: 120,
        background: 'radial-gradient(circle, rgba(124,241,249,0.18) 0%, transparent 70%)',
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity var(--dur-base) var(--ease-out)',
        pointerEvents: 'none',
      }} />

      {/* Top — icon */}
      <span style={{
        color: 'var(--accent-1)',
        filter: 'drop-shadow(0 0 6px rgba(124,241,249,0.45))',
        display: 'inline-flex',
        position: 'relative',
        zIndex: 1,
      }}>
        <SportIcon name={entry.meta.icon} size={36} strokeWidth={1.5} />
      </span>

      {/* Bottom — name + count */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--ink-1)',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}>
          {entry.meta.name[lang]}
        </p>
        <p style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginTop: 4,
        }}>
          {t(entry.count === 1 ? 'catalogue.sport_count_one' : 'catalogue.sport_count_other', { count: entry.count })}
        </p>
      </div>
    </button>
  )
}

// ── Motions list (scripts for the selected sport) ──────────────────────────

interface MotionsListProps {
  scripts: Script[]
  sportMeta: SportMeta
  emptyState: string
  onDeleteScript?: (id: string) => void
}

function MotionsList({ scripts, sportMeta, emptyState, onDeleteScript }: MotionsListProps) {
  return (
    <main
      className="rise-in-delay-1"
      style={{
        flex: 1,
        padding: 'var(--space-5) var(--space-4) calc(var(--space-12) + 80px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 'var(--space-3)',
        alignContent: 'start',
        maxWidth: 1100,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {scripts.length === 0 ? (
        <p style={{
          gridColumn: '1 / -1',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-3)',
          textAlign: 'center',
          padding: 'var(--space-8)',
        }}>
          {emptyState}
        </p>
      ) : (
        scripts.map((s, i) => (
          <ScriptCard
            key={s.id}
            script={s}
            sportMeta={sportMeta}
            validated={BUILT_IN_IDS.has(s.id)}
            index={i}
            isUserScript={!BUILT_IN_IDS.has(s.id)}
            onDelete={() => onDeleteScript?.(s.id)}
          />
        ))
      )}
    </main>
  )
}

// ── Floating icon-only action cluster (bottom-right) ───────────────────────

interface FloatingActionsProps {
  onImport: () => void
  onCreate: () => void
  importLabel: string
  createLabel: string
}

function FloatingActions({ onImport, onCreate, importLabel, createLabel }: FloatingActionsProps) {
  return (
    <div style={{
      position: 'fixed',
      right: 'var(--space-4)',
      bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px))',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      zIndex: 30,
    }}>
      <button
        onClick={onImport}
        aria-label={importLabel}
        title={importLabel}
        style={iconBtnStyle('secondary')}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-4)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-3)' }}
      >
        <UploadGlyph />
      </button>
      <button
        onClick={onCreate}
        aria-label={createLabel}
        title={createLabel}
        style={iconBtnStyle('primary')}
      >
        <PlusGlyph />
      </button>
    </div>
  )
}

function iconBtnStyle(variant: 'primary' | 'secondary'): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 52, height: 52,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all var(--dur-base) var(--ease-fluid)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
  }
  if (variant === 'primary') {
    return {
      ...base,
      background: 'linear-gradient(135deg, #7cf1f9 0%, #076b72 100%)',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: '0 12px 28px -10px rgba(7,107,114,0.7), 0 0 28px rgba(124,241,249,0.45)',
    }
  }
  return {
    ...base,
    background: 'var(--glass-3)',
    color: 'var(--ink-1)',
    border: '1px solid var(--glass-edge-strong)',
    boxShadow: 'var(--shadow-float)',
  }
}

function PlusGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M10 4 L 10 16" />
      <path d="M4 10 L 16 10" />
    </svg>
  )
}

function UploadGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13 L 10 3" />
      <path d="M5.5 7.5 L 10 3 L 14.5 7.5" />
      <path d="M3.5 16.5 L 16.5 16.5" />
    </svg>
  )
}
