# Apex — Real-Time Biomechanical Analysis

> A serverless, in-browser motion analysis platform for 152+ sports gestures.  
> Descriptive. Client-only. Privacy-preserving.

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose-00897B)](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
[![PWA](https://img.shields.io/badge/PWA-offline--first-5A0FC8)](https://vite-pwa-org.netlify.app)
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

- Judge performance ("good" / "bad", color scores, pass/fail)
- Store video on any server
- Require an account or internet connection during analysis

---

## Key Features

| Feature | Details |
|---|---|
| **Real-time pose tracking** | MediaPipe Pose Landmarker at camera FPS (~30 fps), multi-pose (up to 2 subjects) |
| **7 measure primitives** | Angle · Rotation · Speed · Position · Acceleration · Cadence · Hitting Plane |
| **Ball tracking** | HSV blob detection + ONNX neural fallback, contact detection |
| **Sequence comparison** | DTW alignment · Procrustes spatial normalization · Circular angle math |
| **Multi-view support** | Up to 3 camera angles per gesture (sagittal, frontal, posterior, oblique, overhead) |
| **152+ sport scripts** | Archery to volleyball, declarative JSON DSL, bilingual labels |
| **Script builder** | No-code 5-step wizard with integrated DSL linter |
| **Differential report** | Envelope curves · Kinetic chain Gantt · Symmetry heatmap · Natural language synthesis |
| **Export / Import** | JSON activity files (no server, RAM-only session store) |
| **Offline-first PWA** | Workbox caching — works after first load with no network |
| **Bilingual UI** | French (default) + English, switchable at runtime |

---

## Tech Stack

### Runtime

| Layer | Technology |
|---|---|
| UI framework | React 18.3 + TypeScript 5.7 |
| Bundler | Vite 5.4 |
| Routing | React Router 6.28 |
| Computer vision | MediaPipe Pose Landmarker (`@mediapipe/tasks-vision`) |
| Ball detection | ONNX Runtime Web 1.20 |
| Compression | fflate 0.8 |
| Internationalization | i18next 24 + react-i18next 15 |
| Service worker / PWA | vite-plugin-pwa + Workbox 7.3 |

### Design system

- **Aurora 2030** — dark glassmorphism, CSS variables
- **Fonts:** Space Grotesk (display) · IBM Plex Sans (UI) · IBM Plex Mono (data/reports)
- **Charts:** SVG-native (MeasureChart, GanttChainChart, SymmetryChart, HittingPlaneChart)

### Development

| Tool | Purpose |
|---|---|
| Vitest 2.1 | Unit + component tests |
| React Testing Library | Component testing |
| jsdom 26 | DOM environment |
| ESLint 9 + typescript-eslint | Static analysis |
| tsx | Script runner for engine baseline |

---

## Architecture

```
Browser
│
├── LandingPage   /index.html        Public marketing entry
│
└── App           /app.html          Application entry
    │
    ├── Catalogue  /:lang/app         Browse 152+ sport gestures
    │
    ├── CaptureScreen  /capture       Real-time camera + pose + ball tracking
    │   ├─ MediaPipe PoseLandmarker   33 landmarks @ ~30 fps
    │   ├─ HybridBallTracker          HSV blob + ONNX neural detection
    │   ├─ DSL Interpreter            Executes per-frame JSON script measures
    │   ├─ SkeletonOverlay            2D pose visualization
    │   ├─ GuidancePills              Distance · angle · conformity HUD
    │   └─ SequenceBar                Multi-rep timeline
    │
    ├── AnalysisScreen  /report       Post-capture reporting
    │   ├─ MeasureChart               Envelope curves (mean ± SD over reps)
    │   ├─ GanttChainChart            Kinetic chain onset/peak piano roll
    │   ├─ SymmetryChart              Left-right heatmap
    │   ├─ HittingPlaneChart          Racket plane angle
    │   └─ SynthesisView              Natural language differential synthesis
    │
    └── BuilderWizard  /builder       No-code DSL script editor
        └─ 5 steps: metadata → view → side → measures → validate
```

### Data hierarchy

```
Activity  (one session)
  └─ Sequence  (all reps of the same gesture)
      └─ Instance  (single rep)
          └─ MeasureResult[]
              └─ MeasureSample[]  (time series)
```

### Differential engine

1. **DTW** — Aligns two sequences in time (dynamic time warping)
2. **Procrustes** — Removes scale/translation differences between skeleton poses
3. **Circular math** — `atan2(sin(a−b), cos(a−b))` prevents 360°/0° wrap artifacts
4. **Phase-wise comparison** — Compares measures within matched gesture phases

---

## Sports Catalogue

152 canonical motions across 20+ disciplines:

| Discipline | Example gestures |
|---|---|
| Archery | anchor, draw, release, followthrough |
| Athletics | block start, sprint, hurdle clearance, high jump, javelin, shot put |
| Badminton | smash, clear, drop, drive, net kill, serve |
| Basketball | jump shot, layup, chest pass, dribble, defensive slide |
| Boxing | jab, cross, hook, uppercut, footwork |
| Cycling | attack seated, cornering, descent, braking |
| Golf | full swing, chip, putt |
| Tennis | forehand, backhand, serve, volley |
| Volleyball | spike, set, dig, block |
| ... | + cricket, hockey, padel, rugby, swimming, gymnastics, martial arts |

Each script is a JSON file in `/src/scripts/` following the v1.1 DSL schema.

---

## Design Invariants

These constraints are frozen and must not be changed:

1. **Descriptive only** — Apex measures and compares; it never judges. No "good/bad", no color scoring, no thresholds.
2. **Mono-camera 2D** — All computation uses 2D projected landmarks. Rotations outside the camera plane are flagged `out_of_plane`.
3. **Client-only** — No video leaves the device. The session store lives in RAM and is vacuumed on page unload. JSON export is the only persistence mechanism.
4. **No accounts** — "Athlete", "coach", and "expert" are workflow roles, not identities. There is no authentication.
5. **Circular angle math** — Angle differences always use `atan2(sin(a−b), cos(a−b))` to avoid wrap-around artifacts at the 0°/360° boundary.
6. **Deterministic** — Given the same JSON pose frames and the same script, the engine always produces identical output.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
git clone https://github.com/cvapps/cvapps.git
cd cvapps
npm install
```

### Development server

```bash
npm run dev
```

Opens at `http://localhost:5173`.

> **Note:** MediaPipe Pose Landmarker requires `SharedArrayBuffer`, which needs COOP/COEP headers. The Vite dev config sets these automatically.

### Production build

```bash
npm run build
```

Output goes to `/dist`. The app is fully static — deploy to any CDN (Netlify, Vercel, GitHub Pages).

### Preview production build

```bash
npm run preview
```

---

## Project Structure

```
cvapps/
├── public/
│   ├── models/
│   │   └── pose_landmarker_full.task   # MediaPipe model (30 MB, Workbox-cached)
│   └── icons/                          # PWA icons
│
├── src/
│   ├── engine/                         # Core computation (pure, no React)
│   │   ├── primitives/
│   │   │   ├── Angle.ts
│   │   │   ├── Rotation.ts
│   │   │   ├── Speed.ts
│   │   │   ├── Position.ts
│   │   │   ├── Acceleration.ts
│   │   │   ├── Cadence.ts
│   │   │   └── HittingPlane.ts
│   │   ├── filters/
│   │   │   └── oneEuro.ts              # One-Euro filter for landmark smoothing
│   │   ├── ball/
│   │   │   ├── HybridBallTracker.ts
│   │   │   ├── NeuralBallDetector.ts   # ONNX inference
│   │   │   └── contactDetect.ts
│   │   ├── differential/
│   │   │   ├── dtw.ts
│   │   │   ├── procrustes.ts
│   │   │   ├── phasewise.ts
│   │   │   └── circular.ts
│   │   ├── interpreter.ts              # DSL script executor
│   │   ├── linter.ts                   # DSL validation (11 rules)
│   │   ├── resolver.ts                 # Landmark name → index
│   │   ├── types.ts                    # Core type definitions
│   │   └── __tests__/                  # Engine unit tests + fixtures
│   │
│   ├── components/                     # React UI components
│   │   ├── CaptureScreen.tsx           # Main capture view
│   │   ├── AnalysisScreen.tsx          # Post-capture report
│   │   ├── BuilderWizard.tsx           # Script builder
│   │   ├── Catalogue.tsx               # Sport/gesture browser
│   │   ├── MeasureChart.tsx            # Envelope plot
│   │   ├── GanttChainChart.tsx         # Kinetic chain timing
│   │   ├── SymmetryChart.tsx           # L/R symmetry
│   │   ├── HittingPlaneChart.tsx       # Racket plane
│   │   ├── ReportView.tsx              # Full report layout
│   │   ├── LandingPage.tsx             # Public landing
│   │   └── ...
│   │
│   ├── lib/
│   │   ├── scripts.ts                  # Script loader (Vite glob, 152+ JSONs)
│   │   ├── export.ts                   # Session store + JSON export/import
│   │   ├── kineticChain.ts             # Kinetic chain analysis
│   │   ├── symmetry.ts                 # Left-right metrics
│   │   ├── script-translations.ts      # 65K+ bilingual labels
│   │   └── i18n/
│   │       ├── en.json
│   │       └── fr.json
│   │
│   ├── scripts/                        # 152+ sport JSON scripts
│   │   ├── archery_release.json
│   │   ├── badminton_smash.json
│   │   ├── tennis_serve.json
│   │   └── ...
│   │
│   ├── App.tsx                         # Router + language wrapper
│   └── main.tsx                        # App entry point
│
├── index.html                          # Public landing entry
├── app.html                            # App entry
├── vite.config.ts
├── tsconfig.app.json
├── netlify.toml
└── vercel.json
```

---

## Testing

```bash
# All tests
npm run test

# Watch mode
npm run test:watch

# Engine-only (pure computation, no DOM)
npm run engine:test

# Regenerate baseline fixtures
npm run engine:baseline
```

Engine tests use JSON fixture files (deterministic pose frames) — no camera, no MediaPipe, no DOM required.

---

## DSL Script Format

Each sport gesture is described in a JSON script. Example (simplified):

```json
{
  "id": "badminton_smash",
  "version": "1.1",
  "sport": "badminton",
  "gesture": "smash",
  "segmentation": "discrete",
  "available_views": ["sagittal_right", "frontal"],
  "phases": ["preparation", "swing", "contact", "followthrough"],
  "views": {
    "sagittal_right": {
      "measures": [
        {
          "id": "shoulder_abduction",
          "primitive": "angle",
          "landmarks": ["left_shoulder", "left_elbow", "left_wrist"],
          "unit": "deg"
        },
        {
          "id": "trunk_rotation",
          "primitive": "rotation",
          "segment": ["left_hip", "left_shoulder"],
          "reference": "vertical",
          "unit": "deg"
        }
      ]
    }
  }
}
```

The DSL linter enforces 11 validation rules at build time and at runtime in the Builder Wizard.

---

## Deployment

Apex is a fully static single-page application. No server is required.

### Netlify

```toml
# netlify.toml is pre-configured
# Push to main → auto-deploy
```

### Vercel

```json
// vercel.json is pre-configured
// Connect repo in Vercel dashboard
```

### Any static CDN

```bash
npm run build
# Upload /dist to your CDN
```

**Required HTTP headers** (for SharedArrayBuffer / MediaPipe):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Both `netlify.toml` and `vercel.json` set these headers automatically.

---

## Browser Requirements

| Requirement | Minimum |
|---|---|
| Browser | Chrome 111+ · Edge 111+ · Firefox 120+ · Safari 17+ |
| Camera | Any device camera (front or rear) |
| Memory | 4 GB RAM recommended (MediaPipe model + ONNX runtime) |
| Network | Required only on first load (PWA caches everything) |

---

## Privacy

- **No video storage** — only skeleton landmark JSON is kept in memory
- **No server calls** — all inference runs locally in the browser
- **No accounts** — no registration, no login, no tracking
- **Session isolation** — RAM store is cleared on page unload; nothing persists without explicit JSON export

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow the DSL v1.1 schema for new sport scripts
4. Run `npm run lint && npm run test` before pushing
5. Open a pull request with a clear description of what changed and why

### Adding a sport script

1. Create `/src/scripts/{sport}_{gesture}.json` following the DSL schema
2. Add bilingual labels to `src/lib/script-translations.ts`
3. Run the linter: the Builder Wizard validates scripts on import
4. Add a fixture test in `src/engine/__tests__/` if new primitives are used

---

## License

Proprietary — all rights reserved. Contact [finta.sports.corp@gmail.com](mailto:finta.sports.corp@gmail.com) for licensing inquiries.

---

## Specification Documents

Detailed technical specifications live at the project root:

| Document | Contents |
|---|---|
| `INDEX.md` | Master guide — read first |
| `spec-00-decisions-tranchees.md` | Frozen design decisions registry |
| `spec-01-socle-de-mesure.md` | Measurement foundation (33 landmarks, 7 primitives) |
| `spec-02-dsl-de-script.md` | DSL grammar and schema |
| `spec-02-addendum-v1.1-multivue.md` | Multi-view support + 11 linter rules |
| `spec-03-segmentation-reconnaissance.md` | Discrete / cyclic / continuous segmentation |
| `spec-04-moteur-de-differentiel.md` | DTW + Procrustes differential engine |
| `spec-05-donnees-export.md` | Data hierarchy and export contracts |
| `spec-06-rapport.md` | Report generation (SVG, print-to-PDF) |
| `spec-07-guidage-camera-sujet.md` | Camera guidance overlay |
| `spec-08-ui-builder.md` | Builder wizard architecture |
| `spec-09-harnais-validation.md` | Test harness and fixture contracts |
| `spec-10-contrat-agentique-fable.md` | AI script generation contract |
