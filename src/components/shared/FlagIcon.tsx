interface FlagIconProps {
  country: 'FR' | 'GB'
  size?: number
}

export function FlagIcon({ country, size = 16 }: FlagIconProps) {
  const h = Math.round(size * 0.67)

  if (country === 'FR') {
    return (
      <svg width={size} height={h} viewBox="0 0 3 2" aria-hidden style={{ borderRadius: 2, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
        <rect x="0" y="0" width="1" height="2" fill="#002395" />
        <rect x="1" y="0" width="1" height="2" fill="#EDEDEE" />
        <rect x="2" y="0" width="1" height="2" fill="#ED2939" />
      </svg>
    )
  }

  return (
    <svg width={size} height={h} viewBox="0 0 60 30" aria-hidden style={{ borderRadius: 2, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <rect width="60" height="30" fill="#012169" />
      {/* White saltire */}
      <line x1="0" y1="0" x2="60" y2="30" stroke="white" strokeWidth="6" />
      <line x1="60" y1="0" x2="0" y2="30" stroke="white" strokeWidth="6" />
      {/* Red saltire offset */}
      <line x1="0" y1="0" x2="20" y2="10" stroke="#C8102E" strokeWidth="4" />
      <line x1="40" y1="20" x2="60" y2="30" stroke="#C8102E" strokeWidth="4" />
      <line x1="60" y1="0" x2="40" y2="10" stroke="#C8102E" strokeWidth="4" />
      <line x1="20" y1="20" x2="0" y2="30" stroke="#C8102E" strokeWidth="4" />
      {/* White cross */}
      <rect x="25" y="0" width="10" height="30" fill="white" />
      <rect x="0" y="10" width="60" height="10" fill="white" />
      {/* Red cross */}
      <rect x="27" y="0" width="6" height="30" fill="#C8102E" />
      <rect x="0" y="12" width="60" height="6" fill="#C8102E" />
    </svg>
  )
}
