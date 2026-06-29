# Apex — Analyse de geste sportif

Real-time in-browser biomechanical gesture analysis app: captures motion via webcam, analyzes joint angles and movements, and generates reports — fully offline, no server, no account needed.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/apex/` — the main React + Vite app (frontend only, no backend needed)
- `artifacts/apex/src/engine/` — core biomechanics engine (pose estimation, filters, interpreters)
- `artifacts/apex/src/components/` — UI: catalogue, capture, report, builder, landing, shared
- `artifacts/apex/src/lib/` — i18n (fr/en), scripts catalog, export/import, utilities
- `artifacts/apex/public/` — static assets: fonts, logos, ONNX models, guide images
- `artifacts/apex/src/components/shared/DesignTokens.css` — app design system (Aurora glassmorphic theme)

## Architecture decisions

- **Fully client-side / offline-first**: ONNX Runtime Web + MediaPipe run in-browser; no server calls needed
- **COOP/COEP headers required**: Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy must be set for SharedArrayBuffer (ONNX multi-threaded inference)
- **Two entry points consolidated**: Original had `index.html` (landing) and `app.html` (app); migrated to single `index.html` → `app-main.tsx` entry
- **react-router-dom v6**: App uses v6 API (BrowserRouter, Routes, Route); pinned to `^6.28.0` to avoid v7 breaking changes
- **Lang-prefixed routes**: All app routes are under `/:lang/(fr|en)/...`; vite config SPA fallback rewrites these to index.html

## Product

- Sport catalogue: browse 20+ sports with built-in gesture scripts
- Capture screen: real-time pose estimation via webcam, records gesture sequences
- Report view: biomechanical analysis with angles, rotations, speeds, and comparison to reference model
- Builder: create custom gesture analysis scripts
- Landing page: public-facing marketing page
- Bilingual (French / English)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
