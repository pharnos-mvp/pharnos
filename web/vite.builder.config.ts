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
 * Cible de build du **CTD Builder autonome** — produit distinct de la plateforme, servi sur une
 * ORIGINE distincte (`builder.pharnos.com`).
 *
 * Pourquoi une seconde configuration plutôt qu'un drapeau dans `vite.config.ts` : les deux
 * artefacts n'ont ni le même périmètre, ni la même CSP, ni le même cycle de déploiement, et
 * surtout le builder doit pouvoir prouver ce qu'il NE contient pas. Un drapeau se trompe en
 * silence ; deux cibles se comparent.
 *
 * ⚠️ L'origine séparée n'est pas cosmétique (§4.4) : IndexedDB est partagée par origine, et le
 * dépôt porte déjà une garde de purge du cache local au changement de compte. Faire cohabiter un
 * builder sans compte et la plateforme multi-tenant sur la même origine, c'est programmer une
 * collision de caches — et, ici, une perte de dossiers.
 *
 *   Build   : npm run build:builder      → web/dist-builder/
 *   Headers : npm run headers:builder
 *   Deploy  : .github/workflows/deploy-builder.yml (projet Pages `pharnos-builder`)
 *
 * Ce qui n'est PAS ici, et le sera au lot indiqué :
 *  • service worker / PWA → B9 (activation atomique : on ne pose pas un SW avant sa stratégie) ;
 *  • assets pdf.js et reconnaissance de caractères → B1/B2, quand l'aperçu des pièces arrive
 *    (les recopier maintenant alourdirait l'artefact de ~30 Mo pour du code absent) ;
 *  • upload de sourcemaps Sentry → jamais : la télémétrie est bannie de cette cible.
 */

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
 * Assets statiques partagés avec la plateforme (icônes, favicon). `publicDir` pointe sur
 * `public-builder/` — qui ne contient que ce qui DIFFÈRE (les en-têtes HTTP) — pour qu'aucun
 * fichier de la plateforme n'atterrisse ici par inadvertance. Le partage est donc explicite,
 * fichier par fichier.
 *
 * Liste blanche + échec dur si un fichier manque : `public-builder/_redirects` renvoie
 * `index.html` en 200 pour toute URL inconnue, donc une icône absente ne produirait pas un 404
 * mais du HTML servi comme image — une panne muette, exactement le motif déjà rencontré avec les
 * modèles de reconnaissance de caractères.
 */
function sharedPublicAssets(): Plugin {
  const FILES = ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']
  return {
    name: 'pharnos:builder-shared-assets',
    // `writeBundle` et non `closeBundle` : `closeBundle` s'exécute AUSSI quand le build a échoué
    // plus tôt, et son propre message d'erreur MASQUE alors la vraie cause. Constaté en écrivant
    // le test négatif du garde-fou d'isolation : la violation était remplacée à l'écran par un
    // « entrée HTML introuvable » incompréhensible.
    writeBundle() {
      const from = path.resolve(import.meta.dirname, 'public')
      const to = path.resolve(import.meta.dirname, 'dist-builder')
      for (const file of FILES) {
        const src = path.join(from, file)
        if (!fs.existsSync(src)) {
          this.error(`asset partagé introuvable : ${src} — build interrompu`)
        }
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
    sharedPublicAssets(),
    renameEntryHtml(),
  ],
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
  // `.env` versionné), mais le dépannage documenté dans `deploy-builder.yml` publie
  // `dist-builder/` depuis un poste de développement : l'accident serait silencieux et public.
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
