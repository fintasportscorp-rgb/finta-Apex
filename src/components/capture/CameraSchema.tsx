// Minimal isometric schematic showing where to place the camera and how the
// subject should face for a given script view. Iso projection of a unit cube,
// subject as a stick figure, camera as a small body+lens with a cone of sight.
import type { ViewType } from '../../lib/scripts'

const COS30 = Math.cos(Math.PI / 6) // 0.866
const SIN30 = Math.sin(Math.PI / 6) // 0.5

// World coords: subject at origin, facing +X. Z is up.
function iso(x: number, y: number, z: number): { x: number; y: number } {
  return {
    x: (x - y) * COS30,
    y: (x + y) * SIN30 - z,
  }
}

interface ViewLayout {
  camera: [number, number, number] // (x, y, z) in world units
  label: { fr: string; en: string }
}

const LAYOUTS: Record<ViewType, ViewLayout> = {
  // Subject faces +X. "Right" side is -Y, "Left" side is +Y, "Front" is +X.
  frontal:        { camera: [ 3.0,  0.0, 0.6], label: { fr: 'Caméra de face',          en: 'Camera in front' } },
  posterior:      { camera: [-3.0,  0.0, 0.6], label: { fr: 'Caméra dans le dos',      en: 'Camera behind' } },
  sagittal_right: { camera: [ 0.0, -3.0, 0.6], label: { fr: 'Caméra de profil droit',  en: 'Camera on the right' } },
  sagittal_left:  { camera: [ 0.0,  3.0, 0.6], label: { fr: 'Caméra de profil gauche', en: 'Camera on the left' } },
  oblique_right:  { camera: [ 2.1, -2.1, 0.6], label: { fr: 'Caméra oblique droite',   en: 'Camera 45° front-right' } },
  oblique_left:   { camera: [ 2.1,  2.1, 0.6], label: { fr: 'Caméra oblique gauche',   en: 'Camera 45° front-left' } },
  overhead:       { camera: [ 0.0,  0.0, 3.2], label: { fr: 'Caméra en plongée',       en: 'Camera overhead' } },
}

interface CameraSchemaProps {
  view: ViewType
  lang?: 'fr' | 'en'
  /** Optional distance hint shown under the schema. */
  distanceHint?: string
}

export function CameraSchema({ view, lang = 'fr', distanceHint }: CameraSchemaProps) {
  const layout = LAYOUTS[view] ?? LAYOUTS.frontal
  const SCALE = 26
  const VB_W  = 260
  const VB_H  = 180
  // shift origin so floor sits centered horizontally and a bit lower vertically
  const OX = VB_W / 2
  const OY = VB_H * 0.62

  // ── Floor diamond ──────────────────────────────────────────────────────
  const floorRadius = 2.4
  const corners = [
    iso(-floorRadius, -floorRadius, 0),
    iso( floorRadius, -floorRadius, 0),
    iso( floorRadius,  floorRadius, 0),
    iso(-floorRadius,  floorRadius, 0),
  ].map(p => ({ x: OX + p.x * SCALE, y: OY + p.y * SCALE }))

  const floorPath = `M ${corners[0].x} ${corners[0].y}
                     L ${corners[1].x} ${corners[1].y}
                     L ${corners[2].x} ${corners[2].y}
                     L ${corners[3].x} ${corners[3].y} Z`

  // ── Grid lines ─────────────────────────────────────────────────────────
  const gridLines: JSX.Element[] = []
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue
    const a = iso(i, -floorRadius, 0)
    const b = iso(i,  floorRadius, 0)
    const c = iso(-floorRadius, i, 0)
    const d = iso( floorRadius, i, 0)
    gridLines.push(
      <line key={`gx${i}`}
        x1={OX + a.x * SCALE} y1={OY + a.y * SCALE}
        x2={OX + b.x * SCALE} y2={OY + b.y * SCALE}
        stroke="rgba(124,241,249,0.10)" strokeWidth={0.7}
      />,
      <line key={`gy${i}`}
        x1={OX + c.x * SCALE} y1={OY + c.y * SCALE}
        x2={OX + d.x * SCALE} y2={OY + d.y * SCALE}
        stroke="rgba(124,241,249,0.10)" strokeWidth={0.7}
      />,
    )
  }

  // ── Subject silhouette (always at origin) ──────────────────────────────
  const feet     = iso(0, 0, 0)
  const torsoTop = iso(0, 0, 1.4)
  const head     = iso(0, 0, 1.7)
  const sx_feet  = OX + feet.x * SCALE
  const sy_feet  = OY + feet.y * SCALE
  const sx_top   = OX + torsoTop.x * SCALE
  const sy_top   = OY + torsoTop.y * SCALE
  const sx_head  = OX + head.x * SCALE
  const sy_head  = OY + head.y * SCALE

  // Facing-direction arrow at the subject's feet (pointing +X = where subject looks)
  const facingTipW = iso(0.65, 0, 0)
  const facingTipS = { x: OX + facingTipW.x * SCALE, y: OY + facingTipW.y * SCALE }

  // ── Camera ─────────────────────────────────────────────────────────────
  const [cx, cy, cz] = layout.camera
  const camProj = iso(cx, cy, cz)
  const cam = { x: OX + camProj.x * SCALE, y: OY + camProj.y * SCALE }

  // Camera body — small square. Lens cone — triangle pointing at subject's torso.
  const subjAim = iso(0, 0, 0.9)
  const aim = { x: OX + subjAim.x * SCALE, y: OY + subjAim.y * SCALE }

  // Compute lens-cone edges: two points perpendicular to the cam→aim axis at the cam side
  const dx = aim.x - cam.x
  const dy = aim.y - cam.y
  const dlen = Math.hypot(dx, dy) || 1
  const nx = -dy / dlen
  const ny =  dx / dlen
  const SPREAD = 7  // pixels — half-width of the lens cone at camera
  const lensA = { x: cam.x + nx * SPREAD, y: cam.y + ny * SPREAD }
  const lensB = { x: cam.x - nx * SPREAD, y: cam.y - ny * SPREAD }

  // Camera shadow on floor (small ellipse)
  const camFloor = iso(cx, cy, 0)
  const shadow = { x: OX + camFloor.x * SCALE, y: OY + camFloor.y * SCALE }

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: '100%', maxWidth: 320, height: 'auto', display: 'block' }}
      aria-label={layout.label[lang]}
    >
      <defs>
        <radialGradient id="cam-aim-glow">
          <stop offset="0%"   stopColor="#61ced6" stopOpacity="0.55" />
          <stop offset="70%"  stopColor="#61ced6" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#61ced6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Floor */}
      <path d={floorPath} fill="rgba(124,241,249,0.06)" stroke="rgba(124,241,249,0.25)" strokeWidth={1} />
      {gridLines}

      {/* Camera shadow vertical drop line */}
      <line x1={cam.x} y1={cam.y} x2={shadow.x} y2={shadow.y}
        stroke="rgba(97,206,214,0.25)" strokeWidth={0.8} strokeDasharray="2 3" />
      <ellipse cx={shadow.x} cy={shadow.y} rx={5} ry={2}
        fill="rgba(97,206,214,0.20)" />

      {/* Lens cone (camera → subject) — translucent triangle */}
      <path
        d={`M ${lensA.x} ${lensA.y} L ${aim.x} ${aim.y} L ${lensB.x} ${lensB.y} Z`}
        fill="url(#cam-aim-glow)"
        opacity={0.85}
      />

      {/* Sight line dashed from camera to subject torso */}
      <line x1={cam.x} y1={cam.y} x2={aim.x} y2={aim.y}
        stroke="rgba(97,206,214,0.7)" strokeWidth={1} strokeDasharray="4 2" />

      {/* Subject — feet circle + body line + head */}
      <circle cx={sx_feet} cy={sy_feet} r={4}
        fill="rgba(70,172,179,0.18)" stroke="rgba(70,172,179,0.55)" strokeWidth={1} />
      {/* Facing arrow */}
      <line x1={sx_feet} y1={sy_feet} x2={facingTipS.x} y2={facingTipS.y}
        stroke="#46acb3" strokeWidth={1.4} />
      <polygon
        points={`
          ${facingTipS.x},${facingTipS.y}
          ${facingTipS.x - 5},${facingTipS.y - 3}
          ${facingTipS.x - 5},${facingTipS.y + 3}
        `}
        fill="#46acb3"
      />
      {/* Body */}
      <line x1={sx_feet} y1={sy_feet} x2={sx_top} y2={sy_top}
        stroke="#46acb3" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={sx_head} cy={sy_head} r={4} fill="#46acb3" />

      {/* Camera body */}
      <CameraIcon x={cam.x} y={cam.y} />

      {/* Caption */}
      <text
        x={VB_W / 2}
        y={VB_H - 8}
        textAnchor="middle"
        fontFamily="var(--font-data)"
        fontSize={9}
        letterSpacing="0.16em"
        fill="rgba(181,216,219,0.7)"
      >
        {layout.label[lang].toUpperCase()}
      </text>

      {distanceHint && (
        <text
          x={VB_W / 2}
          y={14}
          textAnchor="middle"
          fontFamily="var(--font-data)"
          fontSize={9}
          letterSpacing="0.16em"
          fill="rgba(181,216,219,0.45)"
        >
          {distanceHint.toUpperCase()}
        </text>
      )}
    </svg>
  )
}

// ── Camera glyph ───────────────────────────────────────────────────────────

function CameraIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 10}, ${y - 6})`}>
      {/* Body */}
      <rect x={0} y={0} width={20} height={12} rx={2}
        fill="rgba(97,206,214,0.20)" stroke="#61ced6" strokeWidth={1.2} />
      {/* Lens */}
      <circle cx={13} cy={6} r={3} fill="rgba(2,13,14,0.7)" stroke="#61ced6" strokeWidth={1} />
      <circle cx={13} cy={6} r={1.4} fill="#61ced6" />
      {/* Viewfinder bump */}
      <rect x={4} y={-2} width={5} height={3} rx={0.5}
        fill="rgba(97,206,214,0.30)" stroke="#61ced6" strokeWidth={0.8} />
    </g>
  )
}
