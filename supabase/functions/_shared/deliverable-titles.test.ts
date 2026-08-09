// deno test — la table générée ne peut PAS diverger du gabarit verrouillé.
//
// Ce test RE-DÉRIVE les titres EN depuis `docs/gabarits/RCP/Gabarit-SmPC-EN-UEMOA.md` avec le même
// algorithme que le harnais U0, puis compare entrée par entrée avec `DELIVERABLE_TITLES_EN`. C'est
// la seule forme qui attrape une modification du gabarit non répercutée dans la donnée générée —
// et elle tourne en CI (`deno test --allow-read` couvre déjà la lecture du dépôt).
import { assertEquals } from 'jsr:@std/assert@1'

import { CONFORMITY_SPECS, flattenRubrics, type RubricSpec } from './conformity-specs.ts'
import { DELIVERABLE_TITLES_EN } from './deliverable-titles.ts'

Deno.test('titres EN : la donnée générée reflète le gabarit, entrée par entrée', async () => {
  const spec = CONFORMITY_SPECS.rcp
  const flat = flattenRubrics(spec)
  const isParent = (r: RubricSpec) => Boolean(r.children?.length)
  const gabarit = await Deno.readTextFile(
    new URL('../../../docs/gabarits/RCP/Gabarit-SmPC-EN-UEMOA.md', import.meta.url),
  )

  // Même algorithme que `bench-harness.ts` : titres numérotés par en-tête, sous-parties par lignes
  // en gras DANS L'ORDRE, et la rubrique `prescription` par son intitulé fixe.
  const attendu = new Map<string, string>()
  const dashParents = flat.filter((r) => isParent(r) && r.children!.some((c) => c.id.includes('-')))
  let current: RubricSpec | undefined
  let taken = 0
  for (const line of gabarit.split('\n')) {
    const h = line.match(/^#{3,4} (?:(\d+(?:\.\d+)?)\. )?(.+)$/)
    if (h) {
      const [, id, title] = h
      if (id) {
        attendu.set(id, title.trim())
        current = dashParents.find((p) => p.id === id)
        taken = 0
      } else if (/^CONDITIONS OF/i.test(title)) {
        attendu.set('prescription', title.trim())
        current = undefined
      }
      continue
    }
    const bold = line.match(/^\*\*<?([^*<>]+)>?\*\*$/)
    if (bold && current && taken < current.children!.length) {
      attendu.set(current.children![taken].id, bold[1].trim())
      taken++
    }
  }

  // Chaque rubrique du gabarit a son titre, et c'est EXACTEMENT celui de la donnée générée.
  for (const r of flat) {
    assertEquals(
      DELIVERABLE_TITLES_EN.get(r.id),
      attendu.get(r.id),
      `rubrique ${r.id} : la donnée générée diverge du gabarit`,
    )
  }
  // Et rien de plus : une entrée orpheline signalerait une rubrique retirée du référentiel.
  assertEquals(DELIVERABLE_TITLES_EN.size, flat.length)
})
