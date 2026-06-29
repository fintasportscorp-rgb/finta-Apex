import type { CSSProperties } from 'react'

export type PillState = 'ready' | 'recording' | 'kept' | 'ref'

export interface SequencePill {
  id: string
  index: number
  state: PillState
}

interface SequenceBarProps {
  pills: SequencePill[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onDelete?: (id: string) => void
  theme: 'dark' | 'light'
  label: (n: number) => string
}

export function SequenceBar({ pills, selectedId, onSelect, onAdd, onDelete, theme, label }: SequenceBarProps) {
  const dark = theme === 'dark'
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-4)',
      height: 48,
      alignItems: 'center',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      background: dark
        ? 'rgba(2,13,14,0.6)'
        : 'var(--glass-1)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
    }}>
      {pills.map(pill => {
        const isSelected = pill.id === selectedId
        const canDelete = onDelete && pill.state !== 'recording'
        return (
          <div key={pill.id} style={{ position: 'relative', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
            <button
              onClick={() => onSelect(pill.id)}
              style={pillStyle(pill.state, isSelected)}
            >
              {pill.state === 'ref' && <span style={{ marginRight: 4, color: 'var(--accent-3)' }}>★</span>}
              {label(pill.index + 1)}
              {pill.state === 'recording' && (
                <span style={{
                  marginLeft: 6,
                  display: 'inline-block',
                  width: 7, height: 7,
                  borderRadius: '50%',
                  background: 'var(--accent-pink)',
                  boxShadow: '0 0 10px var(--accent-pink)',
                  animation: 'seqpulse 1.4s ease-in-out infinite',
                  verticalAlign: 'middle',
                }} />
              )}
            </button>
            {canDelete && isSelected && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(pill.id) }}
                title="Supprimer"
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 16, height: 16,
                  borderRadius: '50%',
                  background: 'rgba(255,94,94,0.85)',
                  border: 'none',
                  color: 'white',
                  fontSize: 10,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  padding: 0,
                }}
              >×</button>
            )}
          </div>
        )
      })}

      {/* ＋ button */}
      <button onClick={onAdd} style={{
        fontFamily: 'var(--font-data)',
        fontSize: 16,
        fontWeight: 300,
        width: 32, height: 32,
        borderRadius: '50%',
        cursor: 'pointer',
        background: 'transparent',
        border: '1px dashed rgba(124,241,249,0.4)',
        color: 'var(--accent-1)',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-1)'
        ;(e.currentTarget as HTMLElement).style.background = 'rgba(124,241,249,0.12)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(124,241,249,0.4)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,241,249,0.4)'
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}>
        ＋
      </button>

      <style>{`@keyframes seqpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(0.7)}}`}</style>
    </div>
  )
}

function pillStyle(state: PillState, isSelected: boolean): CSSProperties {
  const base: CSSProperties = {
    fontFamily: 'var(--font-data)',
    fontSize: 11,
    letterSpacing: '0.06em',
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all var(--dur-fast) var(--ease-out)',
    minHeight: 32,
    border: '1px solid transparent',
    display: 'inline-flex',
    alignItems: 'center',
  }

  switch (state) {
    case 'ready':
      return {
        ...base,
        background: 'transparent',
        borderColor: 'rgba(255,255,255,0.12)',
        color: 'var(--ink-3)',
      }
    case 'recording':
      return {
        ...base,
        background: 'rgba(42,139,146,0.15)',
        borderColor: 'rgba(42,139,146,0.55)',
        color: 'var(--ink-1)',
        boxShadow: '0 0 18px rgba(42,139,146,0.4)',
      }
    case 'ref':
      return {
        ...base,
        background: isSelected ? 'rgba(70,172,179,0.16)' : 'rgba(70,172,179,0.08)',
        borderColor: 'rgba(70,172,179,0.5)',
        color: 'var(--ink-1)',
        ...(isSelected ? { boxShadow: '0 0 22px rgba(70,172,179,0.45)' } : {}),
      }
    default: // kept
      return {
        ...base,
        background: isSelected ? 'rgba(124,241,249,0.18)' : 'rgba(255,255,255,0.05)',
        borderColor: isSelected ? 'rgba(124,241,249,0.5)' : 'rgba(255,255,255,0.10)',
        color: 'var(--ink-1)',
        ...(isSelected ? { boxShadow: '0 0 20px rgba(124,241,249,0.4)' } : {}),
      }
  }
}
