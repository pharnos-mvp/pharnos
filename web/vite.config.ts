import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pharnos',
        short_name: 'Pharnos',
        description:
          'OS des affaires réglementaires pharmaceutiques UEMOA/CEDEAO — Catalogue, CTD Workspace, Dashboard.',
        lang: 'fr',
        theme_color: '#0a0a0a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // `mjs` inclus : le worker pdf.js est livré en `pdf.worker.min-*.mjs` (~1,2 Mo) — sans ça
        // il n'est pas précaché et l'aperçu PDF échoue hors-ligne (montage + visualiseur compilé).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Prise de contrôle immédiate → l'app est servie depuis le cache dès le rechargement
        // suivant (hors-ligne fiable, mises à jour appliquées sans recharger deux fois).
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Tests unitaires/intégration uniquement (src). Les specs Playwright (e2e/) sont exclues
    // pour éviter que Vitest ne tente de les exécuter.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Force le mode local/offline en test (pas d'auth réseau).
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
})
