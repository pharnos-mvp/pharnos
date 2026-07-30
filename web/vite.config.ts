import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'

import tesseractPkg from './node_modules/tesseract.js/package.json' with { type: 'json' }

/** Version de tesseract.js — sert à VERSIONNER le cache de ses assets, qui ne sont pas empreintés. */
const tesseractVersion: string = tesseractPkg.version

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

// Assets de la reconnaissance de caractères (tesseract.js), TOUS servis en MÊME ORIGINE.
//
// ⚠️ Deux raisons, et la seconde est la plus importante. La CSP de l'app est `script-src 'self'` avec
// un `connect-src` limité : les chemins par défaut de tesseract.js pointent vers un CDN et seraient
// bloqués. Mais surtout, faire télécharger les modèles depuis un tiers révélerait à ce tiers qu'un
// dossier réglementaire est en cours de traitement — un dossier d'AMM est confidentiel par nature.
//
// Ce qui est copié, et pourquoi ce choix précis :
//  • `core/tesseract-core*-lstm.*` → noyau **LSTM seul**, en TROIS variantes (relaxed SIMD, SIMD,
//    base) parce que `getCore.js` choisit par détection de fonctionnalité et **lève** si le fichier
//    retenu manque. Chaque variante coûte 6,4 Mo au téléchargement : la colle `.wasm.js` (3,7 Mo,
//    elle embarque un repli) PUIS le `.wasm` (2,7 Mo) qu'elle va chercher — mesuré, pas estimé ;
//  • `lang/*.traineddata.gz` → modèles **`4.0.0_best_int`** (fra 0,7 Mo + eng 2,8 Mo). Les modèles
//    `4.0.0` standard pèsent 16,4 Mo pour une exactitude MOINDRE : ils embarquent en plus l'ancien
//    moteur, que nous n'utilisons pas ;
//  • `worker.min.js` → le worker de tesseract.js (`worker-src 'self'` déjà en place).
// Hors précache du service worker, cachés À L'USAGE. Le compte honnête : **23 Mo dans l'artefact de
// déploiement** (les trois variantes doivent être présentes) mais **~10 Mo par utilisateur** — une
// seule variante de noyau plus les deux modèles — et une seule fois, grâce au cache. Sur un marché
// où la bande passante se paie, c'est le prix à ne pas faire payer à qui ne dépose jamais de scan :
// d'où le `globIgnores` ci-dessous et la décision de n'océriser qu'après `classifyPdfPages`.
function ocrAssets(): Plugin {
  const CORE = path.resolve(import.meta.dirname, 'node_modules/tesseract.js-core')
  const LANG_ROOT = path.resolve(import.meta.dirname, 'node_modules/@tesseract.js-data')
  const WORKER = path.resolve(import.meta.dirname, 'node_modules/tesseract.js/dist/worker.min.js')
  // Les TROIS variantes LSTM, et il n'y a pas de choix : `getCore.js` de tesseract.js sélectionne
  // par détection de fonctionnalité (relaxed SIMD → SIMD → base) et **lève** si le fichier retenu
  // est absent. N'en servir que deux ferait échouer la reconnaissance sur toute une famille de
  // navigateurs, avec un message parlant d'`importScripts` et non de variante manquante.
  // Chaque variante = la colle `.wasm.js` (chargée par le worker) + le `.wasm` qu'elle va chercher.
  // ⚠️ Les `.wasm` NUS ne sont pas copiés, et ce n'est pas un oubli : la colle `.wasm.js` embarque le
  // binaire en base64 (`wa ??= Ga("AGFzbQ…")`) et ne va JAMAIS chercher de fichier `.wasm`. Les
  // copier ajoutait 8,1 Mo d'artefact que personne ne télécharge — vérifié dans le paquet.
  const CORE_FILES = [
    'tesseract-core-relaxedsimd-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-lstm.wasm.js',
  ]
  const LANGS = ['fra', 'eng']
  const LANG_VARIANT = '4.0.0_best_int'
  const mime = (file: string) =>
    file.endsWith('.wasm')
      ? 'application/wasm'
      : file.endsWith('.gz')
        ? 'application/gzip'
        : /\.m?js$/.test(file)
          ? 'text/javascript; charset=utf-8'
          : 'application/octet-stream'
  /** Chemin sur disque d'une URL `/ocr/...`, ou `null` si elle ne correspond à rien d'attendu. */
  const resolve = (pathname: string): string | null => {
    if (pathname === '/ocr/worker.min.js') return WORKER
    const core = /^\/ocr\/core\/([\w.-]+)$/.exec(pathname)
    if (core && CORE_FILES.includes(core[1] ?? '')) return path.join(CORE, core[1] ?? '')
    const lang = /^\/ocr\/lang\/(\w+)\.traineddata\.gz$/.exec(pathname)
    if (lang && LANGS.includes(lang[1] ?? '')) {
      return path.join(LANG_ROOT, lang[1] ?? '', LANG_VARIANT, `${lang[1]}.traineddata.gz`)
    }
    return null
  }
  return {
    name: 'pharnos:ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = resolve((req.url ?? '').split('?')[0] ?? '')
        // Liste blanche EXPLICITE plutôt que confinement d'un préfixe : aucune portion de l'URL
        // n'atteint le système de fichiers sans avoir été reconnue.
        if (!file || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', mime(file))
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      const out = path.resolve(import.meta.dirname, 'dist/ocr')
      fs.mkdirSync(path.join(out, 'core'), { recursive: true })
      fs.mkdirSync(path.join(out, 'lang'), { recursive: true })
      // ⚠️ LEVER, jamais copier « si le fichier existe ». Un build vert avec un asset absent est la
      // pire panne possible ici : `public/_redirects` renvoie `index.html` en 200 pour toute URL
      // inconnue, donc tesseract recevrait du HTML en guise de modèle, l'écrirait dans son système
      // de fichiers virtuel, et son initialisation échouerait SANS jamais rejeter (sa chaîne d'init
      // se termine par un `.catch(() => {})`). L'utilisateur resterait sur « Reconnaissance… »
      // indéfiniment. Une montée de version amont, ou un `npm ci --omit=dev`, suffit à déclencher ce
      // scénario — les paquets de modèles sont en devDependencies.
      const copy = (src: string, dest: string) => {
        if (!fs.existsSync(src)) {
          this.error(`asset OCR introuvable : ${src} — build interrompu (voir pharnos:ocr-assets)`)
        }
        fs.copyFileSync(src, dest)
      }
      copy(WORKER, path.join(out, 'worker.min.js'))
      for (const f of CORE_FILES) copy(path.join(CORE, f), path.join(out, 'core', f))
      for (const l of LANGS) {
        copy(
          path.join(LANG_ROOT, l, LANG_VARIANT, `${l}.traineddata.gz`),
          path.join(out, 'lang', `${l}.traineddata.gz`),
        )
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
    ocrAssets(),
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
        globIgnores: ['pdf/**', 'ocr/**'],
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
          // Assets de reconnaissance de caractères : inutiles à qui ne dépose jamais de scan, et
          // immuables. `CacheFirst` pour qu'un deuxième dossier scanné ne les retélécharge pas — sur
          // une connexion UEMOA, c'est la différence entre une minute et cinq.
          // ⚠️ Le nom du cache porte la VERSION de tesseract.js : ces URL ne sont pas empreintées, et
          // un `CacheFirst` de six mois servirait sinon l'ancien noyau après une montée de version —
          // voire un ancien noyau avec un nouveau worker.
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: `pharnos-ocr-assets-${tesseractVersion}`,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 180 },
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
