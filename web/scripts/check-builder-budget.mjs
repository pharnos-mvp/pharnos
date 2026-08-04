// check-builder-budget.mjs — plafond de POIDS de l'artefact du CTD Builder autonome.
//
// Pourquoi cette cible et pas la plateforme : le builder s'installe sur des postes de laboratoire,
// souvent derrière une connexion d'entreprise lente et sur du matériel qu'on ne choisit pas. Et il
// est vendu comme un outil qui « fonctionne sans connexion » — donc tout doit être là au premier
// chargement, sans le luxe du chargement à la demande sur lequel la plateforme peut s'appuyer.
//
// ⚠️ Le plafond porte sur le GZIP, parce que c'est ce que le réseau transporte réellement, et il
// couvre TROIS familles : JS, CSS et POLICES. Les polices ne sont pas un détail — elles pèsent à
// elles seules plus que le budget JS, et les omettre (première version de ce script) laissait la
// moitié du poids réel hors de tout plafond.
//
// Le plafond n'est pas une aspiration : c'est le poids d'aujourd'hui plus une marge de manœuvre
// explicite. Le dépasser doit être un ACTE — on relève la constante en connaissance de cause, dans
// le même commit que ce qui l'a fait grossir, jamais par accident.
import { gzipSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve(import.meta.dirname, '../dist-builder')

/**
 * Plafonds en Ko gzip. Mesures du 2026-08-04 (lot B1, socle de dossiers entré) :
 * JS 115, CSS 19, polices 151.
 *
 * ⚠️ Les POLICES comptent, et pas pour la forme : à elles seules elles pèsent plus que le budget
 * JS. Les oublier — première version de ce script — laissait passer l'ajout d'une fonte de poids
 * arbitraire dans un artefact dont la raison d'être écrite est « tout doit être là au premier
 * chargement ». Elles sont auto-hébergées (aucun CDN, qui apprendrait au passage qu'un poste
 * monte un dossier) et déjà compressées, donc incompressibles : c'est un poids qu'on ne récupère
 * pas par la configuration, seulement en retirant des graisses ou des jeux de caractères.
 */
const BUDGET_KO = { js: 145, css: 28, polices: 165 }

if (!fs.existsSync(DIST)) {
  console.error(`✗ ${DIST} introuvable — lancer d'abord : npm run build:builder`)
  process.exit(1)
}

const assets = path.join(DIST, 'assets')
const files = fs.existsSync(assets) ? fs.readdirSync(assets) : []

// ⚠️ AVANT toute mesure, et c'est le même piège que pour les en-têtes (`check-headers.mjs`) :
// après un build échoué le dossier peut exister et être vide. Mesuré plus bas, « 0 Ko » passerait
// tranquillement sous le plafond — un contrôle vert sur le néant.
if (files.length === 0) {
  console.error("✗ aucun asset dans dist-builder/assets — le build n'a rien produit")
  process.exit(1)
}

// ⚠️ Ce que ce script mesure exactement : le POIDS TOTAL de l'artefact par famille de fichiers,
// pas « l'entrée » au sens strict. Aujourd'hui les deux coïncident (un seul chunk, aucun
// `React.lazy` dans le builder), mais dès que le chargement à la demande arrivera — pdf.js au lot
// B2 — un chunk paresseux serait compté comme de l'entrée. Le biais est CONSERVATEUR (le contrôle
// échoue trop tôt, jamais trop tard) ; c'est le libellé qui doit rester honnête, pas la mesure qui
// doit devenir permissive.
const parExt = (...exts) => files.filter((f) => exts.some((e) => f.endsWith(e)))

function koGzip(list) {
  let total = 0
  for (const f of list) total += gzipSync(fs.readFileSync(path.join(assets, f))).length
  return total / 1024
}

const fichiersJs = parExt('.js')
if (fichiersJs.length === 0) {
  // Un `assets/` qui ne contiendrait que du CSS mesurerait « 0 Ko de JS » et passerait au vert.
  console.error(
    "✗ aucun chunk JS dans dist-builder/assets — le build n'a pas produit l'application",
  )
  process.exit(1)
}

const lignes = [
  ['JS', koGzip(fichiersJs), BUDGET_KO.js],
  ['CSS', koGzip(parExt('.css')), BUDGET_KO.css],
  ['Polices', koGzip(parExt('.woff2', '.woff', '.ttf')), BUDGET_KO.polices],
]

let depasse = false
for (const [nom, mesure, plafond] of lignes) {
  const ok = mesure <= plafond
  if (!ok) depasse = true
  const pct = Math.round((mesure / plafond) * 100)
  console.log(
    `${ok ? '✓' : '✗'} ${nom.padEnd(8)} ${mesure.toFixed(1).padStart(6)} Ko gzip / ${plafond} Ko  (${pct} %)`,
  )
}

if (depasse) {
  console.error(
    '\n✗ Budget dépassé. Le builder doit tenir sur un poste de laboratoire, hors ligne, au premier\n' +
      "  chargement. Deux issues, et une seule est bonne par défaut : alléger ce qui vient d'entrer,\n" +
      '  ou relever BUDGET_KO dans ce fichier — dans le MÊME commit, avec la raison.',
  )
  process.exit(1)
}
console.log('\n✓ Artefact du CTD Builder dans son budget.')
