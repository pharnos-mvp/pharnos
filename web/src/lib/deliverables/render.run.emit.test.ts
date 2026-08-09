import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

import { renderDeliverables, upgradeJobs } from './index'

/**
 * ÉMETTEUR D'UN CAS MESURÉ — la dernière marche du harnais U0.3.
 *
 * Le harnais (`docs/gabarits/tools/bench-harness.ts`) joue les trois passes sur le banc Edge et
 * écrit trois markdowns + `run.json` dans un répertoire. Ce test-outil les transforme en 5
 * fichiers livrables par LE MÊME module que la livraison navigateur — c'est toute sa raison
 * d'être : le cas mesuré et le cas livré ne peuvent pas diverger, puisqu'ils traversent le même
 * code.
 *
 *   UPGRADE_RUN_DIR=<répertoire du run> npm run deliverables:run
 *
 * Sans `UPGRADE_RUN_DIR`, il s'ignore : la CI et `npm test` ne le voient jamais s'exécuter.
 */
const DIR = process.env.UPGRADE_RUN_DIR

it.skipIf(!DIR)('émet les 5 livrables du cas mesuré par le harnais', async () => {
  const read = (name: string) => readFileSync(resolve(DIR!, name), 'utf8')
  const run = JSON.parse(read('run.json')) as {
    slug: string
    reportHeader: string
    reportLang: 'fr' | 'en'
    reportDate?: string
    created?: string
  }

  const jobs = upgradeJobs({
    fr: read('conforme-FR.md'),
    en: read('conforme-EN.md'),
    report: read('rapport.md'),
    slug: run.slug,
    reportHeader: run.reportHeader,
    reportLang: run.reportLang,
  })
  // ⚠️ La date vient du RUN, jamais de l'horloge : sans elle, `pdf-lib` horodate à la seconde et
  // la référence de la recette U5 — comparer À L'OCTET le rendu navigateur à celui du banc —
  // changerait à chaque exécution. Un run sans date est un run d'avant U5 : on refuse, on ne
  // fabrique pas une référence invérifiable.
  const created = run.created ?? (run.reportDate ? `${run.reportDate}T00:00:00.000Z` : null)
  if (!created)
    throw new Error('run.json sans `created` ni `reportDate` : référence non reproductible')
  const { files, dropped } = await renderDeliverables(jobs, { created: new Date(created) })

  expect(files).toHaveLength(5)
  // Un signe intraçable retiré d'un PDF peut changer le sens d'une ligne (fréquences, dosages) :
  // le run doit le voir, pas le découvrir chez le client.
  expect(dropped, 'caractères retirés des PDF').toEqual([])

  for (const f of files) {
    writeFileSync(resolve(DIR!, f.fileName), f.bytes)
  }
  console.log(`5 fichiers écrits dans ${DIR}`)
})
