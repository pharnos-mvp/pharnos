// Assemble le CTD Builder DANS le déploiement de la landing : `web/dist-builder/` → `landing/ctd-builder/`.
//
// Pourquoi un assemblage et pas un dossier versionné : `landing/` est déployée TELLE QUELLE
// (aucun build). Committer un bundle compilé y ferait entrer un artefact qui dérive de sa source
// au premier oubli — le dépôt a déjà payé ce prix avec les modèles générés de la Bibliothèque.
// L'assemblage a lieu en CI, juste avant `wrangler pages deploy landing`.
//
// Pourquoi pas un second projet Cloudflare : un projet Pages publie UN dossier. Deux workflows
// visant le même projet s'écraseraient l'un l'autre ; un projet de plus, lui, ajoute un domaine,
// un certificat et une surface à surveiller pour un produit qui vit très bien sous un chemin de
// `pharnos.com`. La séparation qui compte — celle des bases IndexedDB — est déjà acquise, parce
// que `pharnos.com` et `app.pharnos.com` sont deux origines distinctes.
//
//   node scripts/assemble-builder.mjs     — `npm run assemble:builder`
import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '../dist-builder')
const DEST = path.resolve(import.meta.dirname, '../../landing/ctd-builder')

if (!existsSync(path.join(SRC, 'index.html'))) {
  console.error(
    `✗ ${path.join(SRC, 'index.html')} introuvable — lance \`npm run build:builder\` d'abord.`,
  )
  process.exit(1)
}

// Table rase : sans elle, un asset supprimé d'une version à l'autre resterait servi
// indéfiniment sous son ancienne URL empreintée.
rmSync(DEST, { recursive: true, force: true })
cpSync(SRC, DEST, { recursive: true })

console.log(`✓ CTD Builder assemblé dans landing/ctd-builder/ (depuis web/dist-builder/)`)
