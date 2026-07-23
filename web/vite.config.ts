import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'

// Upload des sourcemaps vers Sentry, UNIQUEMENT quand le jeton est présent (job Deploy).
// Sans jeton (local, e2e, forks du repo public) : aucune sourcemap générée → build inchangé.
// Les .map sont cachées (`hidden` : aucune référence dans les JS servis) et SUPPRIMÉES de
// dist après upload : le code source ne part jamais chez Cloudflare Pages. Le plugin injecte
// des Debug IDs dans les bundles → symbolication sans gestion manuelle de release.
const sentryUpload = !!process.env.SENTRY_AUTH_TOKEN

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

// Assets pdf.js NON JS, TOUS requis — pdf.js les charge par URL et, si l'URL manque, il ABANDONNE
// SILENCIEUSEMENT le contenu concerné (page blanche / éléments absents, jamais d'erreur visible) :
//  • `cmaps/*.bcmap` (`cMapUrl`)          → PDF à polices CID (scans, formulaires) sinon en BLANC ;
//  • `standard_fonts/*` (`standardFontDataUrl`) → métriques fausses des 14 polices non embarquées ;
//  • `wasm/*.wasm` (`wasmUrl`)            → décodeurs JBIG2 / JPEG2000 / couleur (qcms). Sans eux,
//    les scans à couches (MRC : masques JBIG2 + fond JPEG) perdent leur COUCHE DE TEXTE — le
//    document paraît vide alors qu'il est parfaitement lisible ailleurs (retour CEO, cas réel
//    `KV-10D_GMP.pdf` : « ignoring XObject: JBig2 failed to initialize ») ;
//  • `iccs/*.icc` (`iccUrl`)              → profil ICC CMYK (couleurs justes).
// Exposés sous `/pdf/` : servis depuis node_modules en dev (middleware), copiés dans `dist/pdf/` au
// build. Runtime-cachés par le SW (offline). CSP : `script-src 'wasm-unsafe-eval'` déjà en place.
function pdfjsAssets(): Plugin {
  const root = path.resolve(import.meta.dirname, 'node_modules/pdfjs-dist')
  const SUBDIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const
  // `WebAssembly.instantiateStreaming` EXIGE `application/wasm` ; les replis `*_nowasm_fallback.js`
  // sont importés comme MODULES → doivent être servis en JavaScript (sinon import bloqué).
  const mimeOf = (file: string) =>
    file.endsWith('.wasm')
      ? 'application/wasm'
      : /\.m?js$/.test(file)
        ? 'text/javascript; charset=utf-8'
        : 'application/octet-stream'
  return {
    name: 'pharnos:pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/pdf\/(cmaps|standard_fonts|wasm|iccs)\/([\w.-]+)$/.exec(
          (req.url ?? '').split('?')[0] ?? '',
        )
        if (!m) return next()
        const file = path.join(root, m[1] ?? '', m[2] ?? '')
        // Confiné au sous-dossier attendu (anti path-traversal) + existence.
        if (!file.startsWith(path.join(root, m[1] ?? '')) || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', mimeOf(file))
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      const out = path.resolve(import.meta.dirname, 'dist/pdf')
      for (const sub of SUBDIRS) {
        const src = path.join(root, sub)
        if (fs.existsSync(src)) fs.cpSync(src, path.join(out, sub), { recursive: true })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preconnectSupabase(),
    pdfjsAssets(),
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
        // `dist/pdf/**` HORS précache : sans cette exclusion, le glob `js` happe les replis
        // `*_nowasm_fallback.js` (~600 Ko) et alourdit l'installation pour tout le monde, alors que
        // ces assets sont déjà couverts par le cache À L'USAGE ci-dessous.
        globIgnores: ['pdf/**'],
        // Assets pdf.js (cmaps, polices, wasm, profils ICC) : hors précache (≈6,8 Mo →
        // installation trop lourde), mais cachés À L'USAGE → un PDF à polices CID ou un scan à
        // masques JBIG2 vu une fois en ligne reste lisible hors-ligne.
        // Immuables par version de pdf.js → CacheFirst.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/pdf/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pharnos-pdfjs-assets',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Prise de contrôle immédiate → l'app est servie depuis le cache dès le rechargement
        // suivant (hors-ligne fiable, mises à jour appliquées sans recharger deux fois).
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
    // En DERNIER : le plugin doit voir les chunks finaux (après PWA/Tailwind) pour uploader.
    ...(sentryUpload
      ? [
          sentryVitePlugin({
            org: 'pharnos',
            project: 'javascript-react',
            // Org hébergée en région EU : l'upload doit cibler le silo de données allemand.
            url: 'https://de.sentry.io',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  build: {
    // `hidden` : .map générées pour l'upload mais JAMAIS référencées dans les JS servis.
    sourcemap: sentryUpload ? 'hidden' : false,
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
