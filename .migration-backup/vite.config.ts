/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const COOP_COEP = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

const appSpaFallback = {
  name: 'app-spa-fallback',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/(fr|en)(\/|$)/.test(req.url)) {
        req.url = '/app.html'
      }
      next()
    })
  },
  configurePreviewServer(server: import('vite').PreviewServer) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/(fr|en)(\/|$)/.test(req.url)) {
        req.url = '/app.html'
      }
      next()
    })
  },
}

export default defineConfig({
  server: { headers: COOP_COEP },
  preview: { headers: COOP_COEP },
  plugins: [appSpaFallback,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/**', 'logo/**', 'favicon.ico'],
      manifest: {
        name: 'Apex — Analyse gestuelle',
        short_name: 'Apex',
        description: 'Analyse descriptive de gestes sportifs, hors-ligne, sans serveur.',
        theme_color: '#0E1116',
        background_color: '#0E1116',
        display: 'standalone',
        start_url: '/app.html',
        icons: [
          { src: '/logo/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,task,onnx}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,  // 30 MB — MediaPipe + ONNX ball model
        runtimeCaching: [
          {
            // Cache MediaPipe WASM + ONNX Runtime Web WASM from jsDelivr (offline after 1st load)
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-wasm',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        app: 'app.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
