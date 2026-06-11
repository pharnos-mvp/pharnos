import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Preconnect vers l'API Supabase (auth + REST + Storage) : la poignée de main TLS démarre
// pendant le parse du HTML au lieu d'attendre le 1er fetch — gain réel sur latences élevées
// (terrain UEMOA). L'URL est bakée au build (env) → injection ici, pas de hardcode.
function preconnectSupabase(): Plugin {
  return {
    name: 'pharnos:preconnect-supabase',
    transformIndexHtml() {
      const url = process.env.VITE_SUPABASE_URL
      if (!url) return []
      return [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: new URL(url).origin, crossorigin: '' },
          injectTo: 'head',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preconnectSupabase(),
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
        // Le worker pdf.js (`pdf.worker.min-*.mjs`, ~1,2 Mo) est SORTI du précache : il pesait
        // un tiers de l'installation initiale du SW (lent en 3G). Il passe en runtime cache
        // (CacheFirst, ci-dessous) + warm-up en ligne sur la page workspace → l'aperçu PDF
        // hors-ligne reste garanti dès la première session en ligne (e2e offline le vérifie).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.mjs$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker',
              // Les assets sont fingerprintés : 2 entrées suffisent (version courante + une MAJ).
              expiration: { maxEntries: 2 },
            },
          },
        ],
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
      // Specs de conformité des templates réglementaires : SOURCE UNIQUE partagée avec les
      // Edge Functions (TS pur, sans API Deno) — le front génère les squelettes « Remplir le
      // template » depuis les mêmes rubriques que les constats de l'Edge.
      '@specs': path.resolve(
        import.meta.dirname,
        '../supabase/functions/_shared/conformity-specs.ts',
      ),
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
      // Plancher anti-régression (baseline unitaire 2026-06-11 − 2 pts ; les flux UI sont
      // couverts par Playwright, hors de cette mesure). Ratchet : resserrer quand la
      // couverture monte, ne jamais desserrer sans décision explicite.
      thresholds: { statements: 29, branches: 19, functions: 27, lines: 30 },
    },
  },
})
