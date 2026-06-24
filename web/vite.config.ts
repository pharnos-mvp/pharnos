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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
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
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Icône installée (Android/Windows) : fond plein blanc → zone de sécurité OK.
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // `mjs` inclus : le worker pdf.js (`pdf.worker.min-*.mjs`, ~1,2 Mo) est PRÉCACHÉ.
        // T9 l'avait sorti du précache (runtime cache + warm-up) pour alléger l'installation,
        // mais le warm-up s'est avéré trop fragile en recette (aperçu PDF hors-ligne cassé si
        // le workspace n'a pas été visité en ligne dans la session SW). Offline-first prime :
        // la fiabilité de l'aperçu vaut 1,2 Mo d'installation.
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
  build: {
    rollupOptions: {
      output: {
        // Isole Radix UI (shadcn) dans un chunk vendor STABLE → jamais inliné dans `index-*.js`.
        // Sans ça, retirer un seul consommateur (ex. un sélecteur passé en <select> natif) suffit à
        // faire basculer ~10 Ko de Radix dans l'entrée (gate de budget). Chargé au boot SI l'entrée
        // en a besoin, sinon paresseusement — coût de boot inchangé, mais entrée lean et déterministe.
        manualChunks(id) {
          if (id.includes('node_modules/@radix-ui')) return 'vendor-radix'
        },
      },
    },
  },
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
