import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, it } from 'vitest'

import { buildRefSeedStatements, REF_SEED_LABEL } from './ref-seed'

/**
 * ÉMETTEUR DU SOCLE — l'outil de la bascule GO-LIVE.
 *
 * Écrit le socle réglementaire ACTUEL DU CODE en SQL prêt à devenir une migration, dans un
 * répertoire IGNORÉ PAR GIT. Deux choix délibérés :
 *
 * 1. **Rien n'est commité.** Un fichier SQL de socle dans le dépôt serait PÉRIMÉ dès la
 *    prochaine correction de `roadmap-data.ts` — pire qu'absent, puisqu'on appliquerait un socle
 *    qui ne correspond plus au code. Pendant la construction, le socle bouge librement (décision
 *    CEO 2026-07-27, cf. migration `0080`) : la seule garantie qui tienne est de générer au
 *    dernier moment, depuis le code.
 * 2. **Il vit DANS la suite** (`npm test` le rejoue) plutôt que derrière une exclusion de config :
 *    la sortie est ainsi régénérée en permanence, et si le générateur casse un jour, on l'apprend
 *    tout de suite et non le jour du GO-LIVE. Sa santé fonctionnelle est vérifiée à part par
 *    `ref-seed.test.ts`. Zéro dépendance ajoutée : vitest est déjà le lanceur TS du projet.
 *
 * Jour J : `npm run ref:seed-sql` → copier la sortie en `00NN_ref_baseline_golive.sql` → relire →
 * appliquer. Procédure complète au § « Bascule GO-LIVE du référentiel » de
 * `docs/PLAN-ORG-REFERENTIEL.md`.
 */
const OUT = resolve(process.cwd(), '.ref-seed/GO-LIVE-ref-baseline.sql')

it(`émet le socle ${REF_SEED_LABEL} depuis le code`, () => {
  const stmts = buildRefSeedStatements()
  expect(stmts.length).toBeGreaterThan(1)

  const header = [
    '-- ⚠️  GÉNÉRÉ par `npm run ref:seed-sql` — NE PAS ÉDITER À LA MAIN, NE PAS COMMITER TEL QUEL.',
    '-- Renommer en `00NN_ref_baseline_golive.sql` pour en faire une migration, après relecture.',
    '--',
    '-- Contenu : le socle réglementaire du CODE (`roadmap-data.ts`) sérialisé dans la version',
    '-- socle. C’est l’acte qui ALLUME le protocole de référentiel versionné : à partir de là, une',
    '-- correction ne se fait plus dans le code mais par une nouvelle version publiée, adoptée par',
    '-- chaque organisation. Ne l’appliquer qu’au signal explicite du CEO (GO-LIVE + pilotes).',
    '--',
    '-- Les entrées de la version socle avaient été vidées par `0080` : ce fichier les rétablit',
    '-- avec le contenu réel du moment. Idempotent — la clé (version, pays, section) est unique.',
    '',
  ].join('\n')

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${header}${stmts.join('\n\n')}\n`, 'utf8')
  console.info(`\n✓ socle écrit : ${OUT}\n  ${stmts.length} statements`)
})
