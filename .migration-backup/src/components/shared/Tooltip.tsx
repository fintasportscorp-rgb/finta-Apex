import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ── constants ────────────────────────────────────────────────────────────────

const ARROW_SIZE = 6          // px, half-base of the CSS triangle
const GAP        = 8          // px between arrow tip and target edge
const MAX_WIDTH  = 280        // px
const VIEWPORT_MARGIN = 8    // px inset from viewport edges

// ── style helpers ────────────────────────────────────────────────────────────

const tooltipBoxStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  pointerEvents: 'none',
  maxWidth: MAX_WIDTH,
  background: '#1A1535',
  border: '1px solid rgba(124,241,249,0.30)',
  borderRadius: 8,
  padding: '8px 12px',
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  color: '#b5d8db',
  lineHeight: 1.5,
  boxShadow: '0 8px 24px -6px rgba(0,0,0,0.55), 0 0 0 0 transparent',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
}

const arrowBaseStyle: React.CSSProperties = {
  position: 'absolute',
  width: 0,
  height: 0,
  pointerEvents: 'none',
}

function arrowDown(left: number): React.CSSProperties {
  return {
    ...arrowBaseStyle,
    bottom: -(ARROW_SIZE + 1),
    left,
    borderLeft: `${ARROW_SIZE}px solid transparent`,
    borderRight: `${ARROW_SIZE}px solid transparent`,
    borderTop: `${ARROW_SIZE}px solid rgba(124,241,249,0.30)`,
  }
}

function arrowDownFill(left: number): React.CSSProperties {
  return {
    ...arrowBaseStyle,
    bottom: -ARROW_SIZE,
    left,
    borderLeft: `${ARROW_SIZE}px solid transparent`,
    borderRight: `${ARROW_SIZE}px solid transparent`,
    borderTop: `${ARROW_SIZE}px solid #1A1535`,
  }
}

function arrowUp(left: number): React.CSSProperties {
  return {
    ...arrowBaseStyle,
    top: -(ARROW_SIZE + 1),
    left,
    borderLeft: `${ARROW_SIZE}px solid transparent`,
    borderRight: `${ARROW_SIZE}px solid transparent`,
    borderBottom: `${ARROW_SIZE}px solid rgba(124,241,249,0.30)`,
  }
}

function arrowUpFill(left: number): React.CSSProperties {
  return {
    ...arrowBaseStyle,
    top: -ARROW_SIZE,
    left,
    borderLeft: `${ARROW_SIZE}px solid transparent`,
    borderRight: `${ARROW_SIZE}px solid transparent`,
    borderBottom: `${ARROW_SIZE}px solid #1A1535`,
  }
}

// ── keyframe injection (once) ────────────────────────────────────────────────

const KEYFRAME_ID = '__tooltip_fade__'

function ensureKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(KEYFRAME_ID)) return
  const style = document.createElement('style')
  style.id = KEYFRAME_ID
  style.textContent = `
    @keyframes tooltip-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0);   }
    }
  `
  document.head.appendChild(style)
}

// ── geometry ─────────────────────────────────────────────────────────────────

interface TooltipPos {
  x: number
  y: number
  placement: 'above' | 'below'
  arrowLeft: number
}

function computePosition(
  anchor: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPos {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x = anchor.left + anchor.width / 2 - tooltipWidth / 2
  x = Math.max(VIEWPORT_MARGIN, Math.min(x, vw - tooltipWidth - VIEWPORT_MARGIN))

  const arrowLeft = anchor.left + anchor.width / 2 - x - ARROW_SIZE

  const yAbove = anchor.top - tooltipHeight - ARROW_SIZE - GAP
  if (yAbove >= VIEWPORT_MARGIN) {
    return { x, y: yAbove, placement: 'above', arrowLeft }
  }

  const yBelow = anchor.bottom + ARROW_SIZE + GAP
  if (yBelow + tooltipHeight <= vh - VIEWPORT_MARGIN) {
    return { x, y: yBelow, placement: 'below', arrowLeft }
  }

  const spaceAbove = anchor.top - VIEWPORT_MARGIN
  const spaceBelow = vh - anchor.bottom - VIEWPORT_MARGIN
  if (spaceAbove >= spaceBelow) {
    return { x, y: Math.max(VIEWPORT_MARGIN, yAbove), placement: 'above', arrowLeft }
  }
  return { x, y: yBelow, placement: 'below', arrowLeft }
}

// ── component ────────────────────────────────────────────────────────────────

interface TooltipProps {
  text: string | null | undefined
  children: React.ReactNode
  lang?: 'fr' | 'en'
}

export function Tooltip({ text, children, lang: _lang }: TooltipProps) {
  if (text == null || text === '') {
    return <>{children}</>
  }

  return <TooltipInner text={text}>{children}</TooltipInner>
}

function TooltipInner({ text, children }: { text: string; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const boxRef     = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [locked, setLocked]   = useState(false)
  const [pos, setPos]         = useState<TooltipPos | null>(null)

  const showAt = useCallback((anchor: DOMRect) => {
    ensureKeyframes()
    setPos({ x: -9999, y: -9999, placement: 'above', arrowLeft: MAX_WIDTH / 2 - ARROW_SIZE })
    setVisible(true)
    requestAnimationFrame(() => {
      if (!boxRef.current) return
      const { offsetWidth, offsetHeight } = boxRef.current
      setPos(computePosition(anchor, offsetWidth, offsetHeight))
    })
  }, [])

  const show = useCallback(() => {
    if (locked) return
    const anchor = triggerRef.current?.getBoundingClientRect()
    if (!anchor) return
    showAt(anchor)
  }, [locked, showAt])

  const hide = useCallback(() => {
    if (locked) return
    setVisible(false)
    setPos(null)
  }, [locked])

  const toggle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    const anchor = triggerRef.current?.getBoundingClientRect()
    if (!anchor) return
    if (locked) {
      setLocked(false)
      setVisible(false)
      setPos(null)
    } else {
      setLocked(true)
      showAt(anchor)
    }
  }, [locked, showAt])

  // Close on outside click/touch when locked
  useEffect(() => {
    if (!locked) return
    const close = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (boxRef.current?.contains(e.target as Node)) return
      setLocked(false)
      setVisible(false)
      setPos(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [locked])

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={toggle}
        onTouchEnd={(e) => { e.preventDefault(); toggle(e) }}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'inline', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
      >
        {children}
      </span>

      {visible && pos && createPortal(
        <div
          ref={boxRef}
          role="tooltip"
          style={{
            ...tooltipBoxStyle,
            left: pos.x,
            top:  pos.y,
            animation: 'tooltip-in 120ms ease both',
          }}
        >
          {pos.placement === 'above'
            ? <span style={arrowDown(pos.arrowLeft)} />
            : <span style={arrowUp(pos.arrowLeft)} />
          }
          {pos.placement === 'above'
            ? <span style={arrowDownFill(pos.arrowLeft)} />
            : <span style={arrowUpFill(pos.arrowLeft)} />
          }
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
