import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

import { type DeliverableJob, renderDeliverables } from './index'

/**
 * ÉMETTEUR DES LIVRABLES DE RÉFÉRENCE — l'outil du banc d'essai et des cas relus par le CEO.
 *
 * Il remplace `docs/gabarits/tools/render-deliverables.mjs`, qui portait deux chemins absolus
 * `D:/pharnos-mvp/…`, un `createRequire` vers `web/node_modules` et sa liste de travaux en dur. Le
 * moteur de mise en page, lui, vit désormais dans `./index` — **pur, sans `node:fs`**, donc
 * exécutable tel quel par le navigateur au moment de la livraison (`/u/{token}`). C'est la même
 * fonction qui produit les fichiers ici et chez le client : elle ne peut pas diverger d'elle-même.
 *
 * Comme `ref-seed.emit.test.ts`, **il vit DANS la suite** (`npm test` le rejoue) plutôt que derrière
 * une exclusion de configuration. Deux raisons, et la seconde est la vraie :
 *
 * 1. Sa sortie est ignorée par git (`docs/gabarits/RCP/.gitignore`) : la régénérer ne salit rien.
 * 2. Surtout, il est le seul test à faire passer les **VRAIS documents** — Gynoril et KV-Kacin —
 *    dans la mise en page. Ils portent ce qu'aucun jeu d'essai synthétique n'a spontanément :
 *    tableaux MedDRA, encadrés repliés, `≥`, `µ`, lignes à conduit de points, marqueurs d'absence.
 *    Une régression de rendu se voit ici avant de se voir chez un client.
 *
 * `npm run deliverables` fait la même chose, quand on veut seulement rafraîchir les fichiers.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = resolve(HERE, '../../../../docs/gabarits/RCP')

/**
 * Le livrable : DEUX documents en DOCX + PDF, et UN SEUL rapport, en PDF. Le rapport n'a pas
 * vocation à être édité par le client — il constate, il ne se complète pas.
 */
const JOBS: (Omit<DeliverableJob, 'markdown'> & { src: string })[] = [
  { src: 'Gynoril-conforme-FR', name: 'Gynoril-RCP-FR', profile: 'document', docx: true },
  { src: 'Gynoril-conforme-EN', name: 'Gynoril-SmPC-EN', profile: 'document', docx: true },
  {
    src: 'Gynoril-rapport-analyse',
    name: 'Gynoril-revue-reglementaire-RCP',
    profile: 'report',
    docx: false,
    signature: true,
    header: 'GYNORIL — Revue réglementaire',
  },
  // Cas réel : KV-Kacin 500 (amikacine injectable), source ANGLAISE, dépôt Bénin.
  { src: 'KV-Kacin-conforme-FR', name: 'KV-Kacin-RCP-FR', profile: 'document', docx: true },
  { src: 'KV-Kacin-conforme-EN', name: 'KV-Kacin-SmPC-EN', profile: 'document', docx: true },
  {
    src: 'KV-Kacin-rapport-analyse',
    name: 'KV-Kacin-SmPC-regulatory-review',
    profile: 'report',
    docx: false,
    signature: true,
    header: 'KV-KACIN 500 — Regulatory Review',
  },
  // Gabarit de RÉFÉRENCE en anglais (miroir de la maquette ABMed) : ce n'est pas un livrable
  // client, c'est le socle que le CEO archive dans RA-source/Template/RCP/.
  {
    src: 'Gabarit-SmPC-EN-UEMOA',
    name: 'Gabarit-SmPC-EN-UEMOA',
    profile: 'document',
    docx: true,
    header: 'SmPC template — UEMOA',
  },
]

it('émet les livrables de référence dans docs/gabarits/RCP', async () => {
  const jobs = JOBS.map((j) => ({ ...j, markdown: readFileSync(`${BASE}/${j.src}.md`, 'utf8') }))
  const { files, dropped } = await renderDeliverables(jobs)

  // Un caractère retiré du PDF change le sens d'une ligne — « très fréquent (≥ 1/10) » sans son
  // opérateur devient faux. On ÉCHOUE plutôt que de l'écrire dans un fichier livré.
  expect(dropped, `caractères non traçables : ${dropped.join(' ')}`).toEqual([])
  expect(files).toHaveLength(JOBS.filter((j) => j.docx).length + JOBS.length)

  for (const f of files) writeFileSync(`${BASE}/${f.fileName}`, f.bytes)
})
