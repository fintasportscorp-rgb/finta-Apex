# Apex — Real-Time Biomechanical Analysis

> A serverless, in-browser motion analysis platform for 155+ sports gestures.
> Descriptive. Client-only. Privacy-preserving.

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose-00897B)](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
[![i18n](https://img.shields.io/badge/i18n-FR%20%2F%20EN-blue)](https://www.i18next.com)

---

## What is Apex?

Apex captures athletic movements through a single device camera and computes biomechanical measures in real time — no server, no account, no video upload. It runs entirely in the browser.

**Core purpose:**

- Detect and track body landmarks using MediaPipe Pose Landmarker (33 keypoints)
- Compute joint angles, rotations, speeds, positions, accelerations, cadences, and hitting planes
- Compare a captured sequence against a reference recording using Dynamic Time Warping
- Generate a structured differential report in natural language

**What Apex never does:**

- Judge performance ("good" / "bad", colour scores, pass/fail)
- Store video on any server
- Require an account or internet connection during analysis

---

## Key Features

| Feature | Details |
|---|---|
| **Real-time pose tracking** | MediaPipe Pose Landmarker at camera FPS (~30 fps), up to 2 subjects |
| **7 measure primitives** | Angle · Rotation · Speed · Position · Acceleration · Cadence · Hitting Plane |
| **Ball tracking** | HSV blob detection + ONNX neural fallback, contact detection |
| **Sequence comparison** | DTW alignment · Procrustes spatial normalisation · Circular angle math |
| **Multi-view support** | Up to 3 camera angles per gesture (sagittal, frontal, posterior, oblique, overhead) |
| **155+ sport scripts** | Archery to volleyball — declarative JSON DSL, bilingual labels |
| **Script builder** | No-code 5-step wizard with integrated DSL linter |
| **Differential report** | Envelope curves · Kinetic chain Gantt · Symmetry heatmap · Natural language synthesis |
| **Export / Import** | JSON activity files — RAM-only session store, nothing persists without export |
| **Bilingual UI** | French (default) + English, switchable at runtime |

---

## Tech Stack

### Runtime

| Layer | Technology |
|---|---|
| UI framework | React 18.3 + TypeScript 5.9 |
| Bundler | Vite 7 |
| Routing | React Router 6.28 |
| Computer vision | MediaPipe Pose Landmarker (`@mediapipe/tasks-vision`) |
| Ball detection | ONNX Runtime Web 1.27 |
| Compression | fflate 0.8 |
| Internationalisation | i18next 24 + react-i18next 15 |

### Design System

- **Aurora 2030** — dark glassmorphism with CSS custom properties
- **Fonts:** Space Grotesk (display) · IBM Plex Sans (UI) · IBM Plex Mono (data & reports)
- **Charts:** SVG-native — `MeasureChart`, `GanttChainChart`, `SymmetryChart`, `HittingPlaneChart`
- Theme tokens in `artifacts/apex/src/components/shared/DesignTokens.css`

### Development

| Tool | Purpose |
|---|---|
| Vitest 2 | Unit + component tests |
| React Testing Library | Component testing |
| jsdom 26 | DOM environment for tests |
| ESLint 9 + typescript-eslint | Static analysis |
| tsx | Script runner for engine baseline |

---

## Architecture

```
Browser
│
└── App  (index.html → app-main.tsx)
    │
    ├── Catalogue       /:lang/app                Browse 155+ sport gestures
    │
    ├── CaptureScreen   /:lang/app/:sport/:gesture/capture
    │   ├─ MediaPipe PoseLandmarker               33 landmarks @ ~30 fps
    │   ├─ HybridBallTracker                      HSV blob + ONNX neural detection
    │   ├─ DSL Interpreter                        Executes per-frame JSON script measures
    │   ├─ SkeletonOverlay                        2D pose visualisation
    │   ├─ GuidancePills                          Distance · angle · conformity HUD
    │   └─ SequenceBar                            Multi-rep timeline
    │
    ├── ReportView      /:lang/app/:sport/:gesture/report
    │   ├─ MeasureChart                           Envelope curves (mean ± SD over reps)
    │   ├─ GanttChainChart                        Kinetic chain onset/peak piano roll
    │   ├─ SymmetryChart                          Left-right heatmap
    │   ├─ HittingPlaneChart                      Racket/implement plane angle
    │   └─ SynthesisView                          Natural language differential synthesis
    │
    └── BuilderWizard   /:lang/builder
        └─ 5 steps: metadata → view → side → measures → validate
```

### Data Hierarchy

```
Activity  (one session)
  └─ Sequence  (all reps of the same gesture)
       └─ Instance  (single rep)
            └─ MeasureResult[]
                 └─ MeasureSample[]  (time-series)
```

### Differential Engine

1. **DTW** — aligns two sequences in time (dynamic time warping)
2. **Procrustes** — removes scale and translation differences between skeleton poses
3. **Circular math** — `atan2(sin(a−b), cos(a−b))` prevents 360°/0° wrap artefacts
4. **Phase-wise comparison** — compares measures within matched gesture phases

---

## Sports Catalogue

155+ canonical motions across 20+ disciplines:

| Discipline | Example gestures |
|---|---|
| Archery | anchor, draw, release, follow-through, stance |
| Athletics | block start, sprint, hurdle, high jump, long jump, javelin, shot put, walk |
| Badminton | smash, clear, drop, drive, net kill, serve |
| Basketball | jump shot, layup, chest pass, dribble, defensive slide |
| Boxing | jab, cross, hook, uppercut, footwork |
| Cycling | attack seated, cornering, descent, braking |
| Golf | full swing, chip, putt |
| Gymnastics | floor routine, balance beam, vault, uneven bars |
| Handball | shot, jump shot, pass |
| Kinesiology | functional movement patterns |
| Padel | smash, forehand, backhand, serve |
| Rowing | drive, catch, finish, recovery |
| Alpine Ski | carving, mogul, slalom |
| Swimming | crawl stroke cycle, tumble turn |
| Tennis | forehand, backhand, serve, volley |
| Volleyball | spike, set, dig, block |
| Weightlifting | clean, snatch, jerk |
| + more | Football, Basketball, Handball … |

Each script is a JSON file in `artifacts/apex/src/scripts/` following the v1.1 DSL schema.

---

## Design Invariants

These constraints are frozen and must not be changed:

1. **Descriptive only** — Apex measures and compares; it never judges. No "good/bad", no colour scoring, no thresholds.
2. **Mono-camera 2D** — All computation uses 2D projected landmarks. Rotations outside the camera plane are flagged `out_of_plane`.
3. **Client-only** — No video leaves the device. The session store lives in RAM and is vacuumed on page unload. JSON export is the only persistence mechanism.
4. **No accounts** — "Athlete", "coach", and "expert" are workflow roles, not identities. There is no authentication.
5. **Circular angle math** — Angle differences always use `atan2(sin(a−b), cos(a−b))` to avoid wrap-around artefacts at the 0°/360° boundary.
6. **Deterministic** — Given the same JSON pose frames and the same script, the engine always produces identical output.

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 10+

### Install

```bash
git clone <your-repo-url>
cd <repo>
pnpm install
```

### Development server

```bash
pnpm --filter @workspace/apex run dev
```

The app is served at the URL shown in the terminal (proxied through the Replit shared gateway at `/`).

> **Note:** MediaPipe Pose Landmarker requires `SharedArrayBuffer`, which depends on COOP/COEP response headers. The Vite dev config sets these automatically:
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```

### Typecheck

```bash
pnpm --filter @workspace/apex run typecheck
```

### Run tests

```bash
# All tests (requires jsdom)
pnpm --filter @workspace/apex run test

# Engine-only (pure computation, no DOM, no camera)
pnpm --filter @workspace/apex run engine:test

# Watch mode
pnpm --filter @workspace/apex run test:watch

# Regenerate engine baseline fixtures
pnpm --filter @workspace/apex run engine:baseline
```

---

## Project Structure

```
artifacts/apex/                         # React + Vite app (workspace package @workspace/apex)
├── public/
│   ├── models/
│   │   └── pose_landmarker_full.task   # MediaPipe pose model (~30 MB)
│   ├── fonts/                          # Self-hosted webfonts
│   ├── logo/                           # App icons and favicons
│   └── guide/                          # Guide images (CaptureGuide overlay)
│
├── src/
│   ├── engine/                         # Core computation — pure TS, no React
│   │   ├── primitives/
│   │   │   ├── angle.ts                # Joint angle between 3 landmarks
│   │   │   ├── rotation.ts             # Segment rotation relative to reference axis
│   │   │   ├── speed.ts                # Landmark or segment speed
│   │   │   ├── position.ts             # Normalised landmark position
│   │   │   ├── acceleration.ts         # Derivative of speed
│   │   │   ├── cadence.ts              # Cyclic frequency (steps/min, strokes/min)
│   │   │   └── hittingPlane.ts         # Racket / implement plane angle
│   │   ├── filters/
│   │   │   └── oneEuro.ts              # One-Euro filter for landmark smoothing
│   │   ├── ball/
│   │   │   ├── HybridBallTracker.ts    # HSV blob + ONNX neural fallback
│   │   │   ├── NeuralBallDetector.ts   # ONNX Runtime Web inference
│   │   │   └── contactDetect.ts        # Ball-racket contact detection
│   │   ├── differential/
│   │   │   ├── dtw.ts                  # Dynamic time warping alignment
│   │   │   ├── procrustes.ts           # Spatial normalisation
│   │   │   ├── phasewise.ts            # Phase-matched comparison
│   │   │   └── circular.ts             # Circular angle arithmetic
│   │   ├── segmentation/               # Discrete / cyclic / continuous segmentation
│   │   ├── interpreter.ts              # DSL script executor (per-frame)
│   │   ├── linter.ts                   # DSL validation — 11 rules
│   │   ├── resolver.ts                 # Landmark name → index lookup
│   │   ├── types.ts                    # Core types (33 landmark names, MeasureResult …)
│   │   └── __tests__/                  # Engine unit tests + JSON fixtures
│   │
│   ├── components/
│   │   ├── capture/                    # CaptureScreen, SkeletonOverlay, GuidancePills
│   │   ├── report/                     # ReportView, MeasureChart, GanttChainChart, …
│   │   ├── catalogue/                  # Catalogue, ScriptCard, SportIcon
│   │   ├── builder/                    # BuilderWizard (5-step no-code editor)
│   │   ├── analysis/                   # AnalysisScreen, SynthesisView
│   │   ├── landing/                    # LandingPage (public marketing)
│   │   └── shared/
│   │       ├── DesignTokens.css        # Aurora 2030 design system tokens
│   │       ├── Chip.tsx
│   │       ├── FlagIcon.tsx
│   │       ├── NewsTicker.tsx
│   │       ├── Readout.tsx
│   │       └── Tooltip.tsx
│   │
│   ├── lib/
│   │   ├── scripts.ts                  # Script loader — Vite glob over src/scripts/*.json
│   │   ├── export.ts                   # RAM session store + JSON export/import + vacuum
│   │   ├── kineticChain.ts             # Kinetic chain onset/peak analysis
│   │   ├── symmetry.ts                 # Left-right symmetry metrics
│   │   ├── script-translations.ts      # Bilingual measure and gesture labels
│   │   └── i18n/
│   │       ├── index.ts                # i18next initialisation
│   │       ├── en.json                 # English strings
│   │       └── fr.json                 # French strings
│   │
│   ├── scripts/                        # 155+ sport gesture JSON scripts (DSL v1.1)
│   │   ├── archery_release.json
│   │   ├── badminton_smash.json
│   │   ├── tennis_serve.json
│   │   └── ...
│   │
│   ├── App.tsx                         # Router — /:lang/* routes + language sync
│   └── app-main.tsx                    # Entry point (mounts App, installs vacuum)
│
├── index.html                          # Single HTML entry
├── vite.config.ts                      # Vite config — COOP/COEP headers, SPA fallback
├── tsconfig.json
└── package.json                        # Workspace package (@workspace/apex)
```

---

## DSL Script Format

Each sport gesture is described in a declarative JSON file. Example (simplified):

```json
{
  "id": "badminton_smash",
  "version": "1.1",
  "sport": "badminton",
  "gesture": "smash",
  "segmentation": "discrete",
  "available_views": [
    {
      "view": "sagittal_right",
      "priority": 1,
      "primary": true,
      "feasibility_2d": "ok"
    }
  ],
  "measures": [
    {
      "id": "shoulder_abduction",
      "primitive": "angle",
      "points": ["left_shoulder", "left_elbow", "left_wrist"],
      "expose": true
    },
    {
      "id": "trunk_rotation",
      "primitive": "rotation",
      "points": ["left_hip", "left_shoulder"],
      "reference": "vertical",
      "expose": true
    }
  ]
}
```

The DSL linter enforces 11 validation rules at import time and inside the Builder Wizard.

### Adding a new sport script

1. Create `artifacts/apex/src/scripts/{sport}_{gesture}.json` following the v1.1 DSL schema
2. Add bilingual measure and gesture labels to `artifacts/apex/src/lib/script-translations.ts`
3. Import it in the Builder Wizard — the integrated linter runs all 11 rules on load
4. Add a fixture test in `artifacts/apex/src/engine/__tests__/` if you introduce a new primitive

---

## Required HTTP Headers

MediaPipe uses `SharedArrayBuffer` for multi-threaded WASM inference. These headers are mandatory:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The Vite dev server sets them automatically. For production, configure them at your hosting layer (CDN, reverse proxy, or platform config).

---

## Browser Requirements

| Requirement | Minimum |
|---|---|
| Browser | Chrome 111+ · Edge 111+ · Firefox 120+ · Safari 17+ |
| Camera | Any device camera (front or rear) |
| RAM | 4 GB recommended (MediaPipe model + ONNX runtime) |
| Network | Required only on first load |

---

## Privacy

- **No video storage** — only skeleton landmark JSON is held in memory during a session
- **No server calls** — all inference runs locally in the browser via WebAssembly
- **No accounts** — no registration, no login, no tracking
- **Session isolation** — the in-RAM store is vacuumed on page unload; nothing persists without an explicit JSON export by the user

---

## Specification Documents

Detailed technical specifications live at the project root (in the original repository):

| Document | Contents |
|---|---|
| `spec-00` | Frozen design decisions registry |
| `spec-01` | Measurement foundation — 33 landmarks, 7 primitives |
| `spec-02` | DSL grammar and schema |
| `spec-02-addendum-v1.1` | Multi-view support + 11 linter rules |
| `spec-03` | Discrete / cyclic / continuous segmentation |
| `spec-04` | DTW + Procrustes differential engine |
| `spec-05` | Data hierarchy and export contracts |
| `spec-06` | Report generation (SVG, print-to-PDF) |
| `spec-07` | Camera guidance overlay |
| `spec-08` | Builder wizard architecture |
| `spec-09` | Test harness and fixture contracts |
| `spec-10` | AI script generation contract |

---

## Deployment

Apex is a fully static single-page application. No backend is required.

Build output goes to `artifacts/apex/dist/public/`. Upload it to any static CDN or connect the repo to a platform (Netlify, Vercel, Cloudflare Pages). Ensure the host sets the COOP/COEP headers listed above.

---

## License

Proprietary — all rights reserved.  
Contact [vistao.sports@gmail.com](mailto:vistao.sports@gmail.com) for licensing enquiries.
