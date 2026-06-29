// Minimal stroke-based sport glyphs. 24×24 viewBox.
// Stroke uses `currentColor` so the parent controls the hue.
import type { SportIconName } from './sportMeta'

interface SportIconProps {
  name: SportIconName
  size?: number
  strokeWidth?: number
}

export function SportIcon({ name, size = 28, strokeWidth = 1.5 }: SportIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'bow':
      // Bow (curve) + arrow shaft + arrowhead
      return (
        <svg {...common}>
          <path d="M6 4 C 14 8, 14 16, 6 20" />
          <path d="M6 4 L 6 20" strokeDasharray="1 2" />
          <path d="M3 12 L 21 12" />
          <path d="M18 9 L 21 12 L 18 15" />
        </svg>
      )
    case 'runner':
      // Stylised runner — head + bent torso + leg + arm
      return (
        <svg {...common}>
          <circle cx="14" cy="5" r="1.6" />
          <path d="M5 18 L 9 13 L 13 14 L 16 11" />
          <path d="M9 13 L 7 8 L 13 8" />
          <path d="M13 14 L 14 19 L 18 21" />
          <path d="M16 11 L 19 9" />
        </svg>
      )
    case 'shuttle':
      // Shuttlecock — cork ball + feather skirt
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="2.5" />
          <path d="M9.5 8.5 L 5 21" />
          <path d="M14.5 8.5 L 19 21" />
          <path d="M10.5 10 L 8 21" />
          <path d="M13.5 10 L 16 21" />
          <path d="M5 21 L 19 21" />
        </svg>
      )
    case 'hoop':
      // Basket hoop — backboard + rim + net
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="9" rx="1" />
          <rect x="9" y="6" width="6" height="4" />
          <path d="M9 12 L 9 14 L 15 14 L 15 12" />
          <path d="M9 14 C 10 18, 14 18, 15 14" />
          <path d="M10.5 14 L 11.5 17.5" />
          <path d="M13.5 14 L 12.5 17.5" />
        </svg>
      )
    case 'glove':
      // Boxing glove — rounded fist with thumb
      return (
        <svg {...common}>
          <path d="M6 9 C 6 6, 9 5, 12 5 L 16 5 C 18 5, 19 7, 19 10 L 19 16 C 19 18, 17 20, 15 20 L 8 20 C 6 20, 5 18, 5 16 L 5 12" />
          <path d="M6 9 C 5 9, 4 10, 4 11 C 4 12, 5 13, 6 13" />
          <path d="M5 14 L 19 14" />
        </svg>
      )
    case 'bike':
      // Bicycle — two wheels + frame
      return (
        <svg {...common}>
          <circle cx="6" cy="16" r="4" />
          <circle cx="18" cy="16" r="4" />
          <path d="M6 16 L 11 9 L 16 16" />
          <path d="M11 9 L 14 9" />
          <path d="M14 9 L 18 16" />
          <circle cx="13" cy="14" r="0.7" fill="currentColor" />
        </svg>
      )
    case 'ball-seam':
      // Ball with two seam arcs
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4.5 9 C 9 11, 15 11, 19.5 9" />
          <path d="M4.5 15 C 9 13, 15 13, 19.5 15" />
        </svg>
      )
    case 'club':
      // Golf club + ball
      return (
        <svg {...common}>
          <path d="M16 3 L 9 17" />
          <path d="M9 17 L 6 21 L 12 19 Z" />
          <circle cx="20" cy="20" r="1.5" />
        </svg>
      )
    case 'rings':
      // Two rings (gymnastics)
      return (
        <svg {...common}>
          <circle cx="9" cy="14" r="4" />
          <circle cx="15" cy="14" r="4" />
          <path d="M9 10 L 9 4" />
          <path d="M15 10 L 15 4" />
          <path d="M7 4 L 17 4" />
        </svg>
      )
    case 'spine':
      // Vertebral column / silhouette
      return (
        <svg {...common}>
          <path d="M12 3 C 14 5, 10 7, 12 9 C 14 11, 10 13, 12 15 C 14 17, 10 19, 12 21" />
          <path d="M9 5 L 15 5" />
          <path d="M9 9 L 15 9" />
          <path d="M9 13 L 15 13" />
          <path d="M9 17 L 15 17" />
        </svg>
      )
    case 'racket':
      // Tennis/padel racket
      return (
        <svg {...common}>
          <ellipse cx="10" cy="8" rx="6" ry="5" />
          <path d="M10 4.5 L 10 11.5" strokeWidth="0.8" />
          <path d="M6 8 L 14 8" strokeWidth="0.8" />
          <path d="M14 12 L 19 19" />
          <path d="M18 18 L 21 21" strokeWidth="2.5" />
        </svg>
      )
    case 'oar':
      // Rowing oar
      return (
        <svg {...common}>
          <path d="M3 12 L 17 12" />
          <ellipse cx="20" cy="12" rx="3" ry="1.8" />
          <path d="M3 9 L 3 15" />
        </svg>
      )
    case 'ski':
      // Two skis crossing
      return (
        <svg {...common}>
          <path d="M5 4 L 14 22" />
          <path d="M5 2 C 6 3, 6 4, 5 5" />
          <path d="M19 4 L 10 22" />
          <path d="M19 2 C 18 3, 18 4, 19 5" />
        </svg>
      )
    case 'wave':
      // Swimming wave
      return (
        <svg {...common}>
          <path d="M3 9 C 6 6, 9 12, 12 9 C 15 6, 18 12, 21 9" />
          <path d="M3 15 C 6 12, 9 18, 12 15 C 15 12, 18 18, 21 15" />
        </svg>
      )
    case 'barbell':
      // Barbell
      return (
        <svg {...common}>
          <path d="M3 12 L 21 12" />
          <rect x="4"  y="8"  width="3" height="8" rx="0.7" />
          <rect x="17" y="8"  width="3" height="8" rx="0.7" />
          <rect x="2"  y="10" width="2" height="4" rx="0.5" />
          <rect x="20" y="10" width="2" height="4" rx="0.5" />
        </svg>
      )
    default:
      // Generic motion glyph — 3 stacked dashes
      return (
        <svg {...common}>
          <path d="M5 8 L 15 8" />
          <path d="M5 12 L 19 12" />
          <path d="M5 16 L 12 16" />
        </svg>
      )
  }
}
