// Spec-08 §C — factual chip. Aurora theme: never red/green.
// Neutral = glass outline; Attention = amber glow.
interface ChipProps {
  label: string
  variant?: 'neutral' | 'attention'
}

export function Chip({ label, variant = 'neutral' }: ChipProps) {
  const isAttention = variant === 'attention'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill)',
      border: `1px solid ${isAttention ? 'rgba(124,241,249,0.5)' : 'var(--glass-edge)'}`,
      background: isAttention ? 'rgba(124,241,249,0.10)' : 'var(--glass-1)',
      fontFamily: 'var(--font-data)',
      fontSize: 10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: isAttention ? 'var(--accent-warn)' : 'var(--ink-3)',
      whiteSpace: 'nowrap',
      backdropFilter: 'var(--glass-blur-soft)',
      WebkitBackdropFilter: 'var(--glass-blur-soft)',
      boxShadow: isAttention ? '0 0 14px rgba(124,241,249,0.3)' : 'none',
    }}>
      {label}
    </span>
  )
}
