import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import {
  findEgress,
  findForbiddenModules,
  formatEgressFailure,
  formatIsolationFailure,
  type EmittedFile,
} from './src/builder/isolation.ts'

/**
 * Cible de build du **CTD Builder** — l'offre « monter des dossiers conformes au CTD UEMOA »,
 * servie sur **`pharnos.com/ctd-builder/`**, une entrée du header du site.
 *
 * ⚠️ AUCUN nouveau projet Cloudflare. Le builder est **assemblé dans le déploiement de la
 * landing** (`deploy-landing.yml` → projet `pharnos-landing`). Un projet Pages publie UN dossier :
 * deux workflows visant le même projet s'écraseraient. D'où un seul workflow qui assemble
 * `landing/` + `landing/ctd-builder/`.
 *
 * ⚠️ La séparation des caches est tout de même assurée, et c'est ce qui compte (§4.4) : IndexedDB
 * est partagée **par origine**, et `pharnos.com` n'est pas `app.pharnos.com`. Le builder sans
 * compte et la plateforme multi-tenant ne partagent donc aucune base locale — sans qu'il faille
 * un troisième domaine pour l'obtenir.
 *
 * Pourquoi une seconde configuration Vite plutôt qu'un drapeau dans `vite.config.ts` : les deux
 * artefacts n'ont ni le même périmètre, ni la même CSP, ni le même cycle de déploiement, et
 * surtout le builder doit pouvoir prouver ce qu'il NE contient pas. Un drapeau se trompe en
 * silence ; deux cibles se comparent. C'est le « on ne reconstruit rien, on scinde » : même
 * `src/`, deux assemblages.
 *
 *   Build    : npm run build:builder     → web/dist-builder/
 *   Assemble : npm run assemble:builder  → landing/ctd-builder/ (non versionné)
 *   Headers  : npm run headers:builder   → section /ctd-builder/* de landing/_headers
 *   Deploy   : .github/workflows/deploy-landing.yml
 *
 * Ce qui n'est PAS ici, et le sera au lot indiqué :
 *  • service worker / PWA → B9 (activation atomique : on ne pose pas un SW avant sa stratégie) ;
 *  • assets pdf.js et reconnaissance de caractères → B1/B2, quand l'aperçu des pièces arrive
 *    (les recopier maintenant alourdirait l'artefact de ~30 Mo pour du code absent) ;
 *  • upload de sourcemaps Sentry → jamais : la télémétrie est bannie de cette cible.
 */

/**
 * Le builder est servi à la RACINE de son propre domaine. `base` reste explicite : c est ce qui
 * a changé en passant d un chemin de la vitrine à un projet dédié, et ce qu il faudrait
 * modifier si l on revenait en arrière (ce que la revue déconseille — cf. §10.1 du plan).
 */
const BASE = '/'

/** Identifiant de build affiché dans l'app — voir `src/builder/build-id.d.ts`. */
const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'

/**
 * LE garde-fou du produit, en deux étages.
 *
 *  1. **Dépendances** — aucun module interdit (client réseau, `*-sync.ts`, outbox, télémétrie,
 *     authentification) parmi ceux ÉMIS dans les chunks. On lit `chunk.modules` plutôt que
 *     `this.getModuleIds()` : ce dernier contient aussi ce que Rollup a résolu sans le retenir.
 *  2. **Capacité** — aucune adresse absolue ni primitive de sortie dans le CODE émis, chunks
 *     ET assets JS. Deux raisons, découvertes en revue :
 *       • un `fetch('https://…')` écrit à la main n'importe rien d'interdit, donc l'étage 1 ne
 *         le voit pas ;
 *       • Vite compile les **web workers dans un build imbriqué** et les émet en ASSET : ils
 *         n'apparaissent JAMAIS dans `chunk.modules`. Vérifié — `?worker` faisait entrer
 *         `@supabase/supabase-js` entier avec l'URL du projet de production, build vert.
 *
 * Le plugin est également appliqué aux builds de workers (`worker.plugins` ci-dessous), pour que
 * l'étage 1 y opère aussi avec la précision du graphe de modules.
 *
 * Biais assumé : ce contrôle est CONSERVATEUR. `chunk.modules` peut mentionner un module
 * entièrement secoué (réexport de barril) — il vaut mieux un build à expliquer qu'un artefact
 * dont on ne peut plus certifier le contenu.
 */
function builderIsolationGate(): Plugin {
  return {
    name: 'pharnos:builder-isolation',
    generateBundle(_options, bundle) {
      const emittedModules: string[] = []
      const emittedCode: EmittedFile[] = []
      for (const [file, output] of Object.entries(bundle)) {
        if (output.type === 'chunk') {
          emittedModules.push(...Object.keys(output.modules))
          emittedCode.push({ file, code: output.code })
        } else if (typeof output.source === 'string' && /\.[cm]?js$/.test(file)) {
          // Asset JavaScript = très probablement un build imbriqué (worker). Son graphe de
          // modules est hors d'atteinte ici ; son code, non.
          emittedCode.push({ file, code: output.source })
        }
      }

      const forbidden = findForbiddenModules(emittedModules)
      if (forbidden.length > 0) this.error(formatIsolationFailure(forbidden))

      const egress = findEgress(emittedCode)
      if (egress.length > 0) this.error(formatEgressFailure(egress))
    },
  }
}

/**
 * Icônes partagées avec la plateforme. Sur son propre domaine, le builder ne peut plus emprunter
 * celles de la vitrine : `img-src 'self'` interdit une image d'une autre origine, et l'entrée
 * HTML les référence en absolu. On les copie donc depuis la SOURCE UNIQUE `public/`, plutôt que
 * de dupliquer des binaires dans le dépôt.
 *
 * Échec DUR si un fichier manque : `_redirects` renvoie `index.html` en 200 pour toute URL
 * inconnue, donc une icône absente ne produirait pas un 404 mais du HTML servi comme image —
 * une panne muette, le motif déjà rencontré avec les modèles de reconnaissance de caractères.
 */
function sharedIcons(): Plugin {
  const FILES = ['favicon.svg', 'apple-touch-icon.png']
  return {
    name: 'pharnos:builder-shared-icons',
    // `writeBundle` et non `closeBundle` : ce dernier s'exécute AUSSI après un build échoué, et
    // son message masquerait la vraie cause (constaté en écrivant le test du garde-fou).
    writeBundle() {
      const from = path.resolve(import.meta.dirname, 'public')
      const to = path.resolve(import.meta.dirname, 'dist-builder')
      for (const file of FILES) {
        const src = path.join(from, file)
        if (!fs.existsSync(src)) this.error(`icône partagée introuvable : ${src}`)
        fs.copyFileSync(src, path.join(to, file))
      }
    },
  }
}

/**
 * En DÉVELOPPEMENT, Vite sert `<root>/index.html` — c'est-à-dire l'entrée de la PLATEFORME.
 * Sans cette réécriture, `npm run dev:builder` lancerait l'application complète en croyant lancer
 * le builder : un piège silencieux, et le pire genre (on teste autre chose que ce qu'on livre).
 */
function devEntryHtml(): Plugin {
  return {
    name: 'pharnos:builder-dev-entry',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? '').split('?')
        if (pathname === '/' || pathname === '/index.html') {
          // La query string est CONSERVÉE : elle porte les paramètres de recette.
          req.url = query === undefined ? '/index.builder.html' : `/index.builder.html?${query}`
        }
        next()
      })
    },
  }
}

/**
 * L'entrée s'appelle `index.builder.html` à la racine de `web/` (deux cibles, deux entrées, un
 * seul `root`) ; Cloudflare Pages sert `index.html`. On renomme après coup plutôt que de bouger
 * la racine du projet, qui casserait les chemins `/src/…` de l'entrée.
 */
function renameEntryHtml(): Plugin {
  return {
    name: 'pharnos:builder-entry-html',
    // `writeBundle` — même raison que ci-dessus : ne rien faire, et surtout ne rien DIRE, quand
    // le build a déjà échoué.
    writeBundle() {
      const out = path.resolve(import.meta.dirname, 'dist-builder')
      const built = path.join(out, 'index.builder.html')
      if (!fs.existsSync(built)) {
        this.error(`entrée HTML introuvable après build : ${built}`)
      }
      fs.renameSync(built, path.join(out, 'index.html'))
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devEntryHtml(),
    builderIsolationGate(),
    sharedIcons(),
    renameEntryHtml(),
  ],
  // Le builder est servi SOUS UN CHEMIN de pharnos.com : sans `base`, les URL d'assets émises
  // pointeraient vers la racine du site (`/assets/…`) et entreraient en collision avec celles de
  // la landing, qui a déjà un dossier `assets/`.
  base: BASE,
  // `public-builder/` : les en-têtes HTTP et le repli SPA du domaine, rien d'autre. Aucun
  // fichier de `public/` (la plateforme) ne doit atterrir ici par inadvertance.
  publicDir: 'public-builder',
  // Le garde-fou s'applique AUSSI aux builds imbriqués des web workers — sans quoi il ne voit
  // pas leur graphe de modules (constaté en revue, cf. `builderIsolationGate`).
  worker: {
    format: 'es',
    plugins: () => [builderIsolationGate()],
  },
  // ⚠️ Préfixe d'environnement volontairement INEXISTANT dans ce dépôt : sans cette ligne, Vite
  // injecte les `VITE_*` du `.env.local` du poste — dont l'URL Supabase et la clé publiable de
  // PRODUCTION — dans un artefact vendu comme dépourvu de backend. En CI c'est sans effet (aucun
  // `.env` versionné), mais un assemblage local suivi d'un `wrangler pages deploy landing`
  // publierait l'accident, silencieusement.
  envPrefix: ['PHARNOS_BUILDER_'],
  define: {
    __BUILDER_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: 'dist-builder',
    emptyOutDir: true,
    // Aucune sourcemap : elles publieraient le code source sur une origine publique sans qu'aucun
    // outil ne les consomme (pas de Sentry sur cette cible).
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'index.builder.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
