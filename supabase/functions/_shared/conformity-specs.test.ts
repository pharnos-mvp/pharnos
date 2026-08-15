// deno test — specs de conformité : invariants structurels (la PR U1 fait foi de la
// transcription des templates ; ces tests verrouillent la cohérence interne).
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  CONFORMITY_SPECS,
  flattenRubrics,
  idsSousDecoupage,
  specForDocType,
  specPromptText,
} from './conformity-specs.ts'

Deno.test('RCP : 34 entrées au gabarit, dont 5 sous-découpages — 29 RUBRIQUES', () => {
  // 29 est le chiffre que l'acheteur voit à l'écran et peut vérifier en comptant les lignes de son
  // propre document. Les sous-découpages (`4.2-posologie`…) sont un artefact du moteur : ils
  // portent le numéro de leur parent, donc les afficher mettait trois « 4.2 » dans la liste.
  const toutes = flattenRubrics(CONFORMITY_SPECS.rcp)
  const morceaux = idsSousDecoupage(CONFORMITY_SPECS.rcp)
  assertEquals(toutes.length, 34)
  assertEquals([...morceaux].sort(), [
    '4.2-administration',
    '4.2-posologie',
    '4.6-allaitement',
    '4.6-fertilite',
    '4.6-grossesse',
  ])
  assertEquals(toutes.length - morceaux.size, 29)
  // Les têtes de section RESTENT des rubriques : elles existent dans le document.
  for (const id of ['4', '4.2', '4.6', '5', '6']) {
    assert(!morceaux.has(id), `${id} est une rubrique, pas un morceau`)
  }
})

Deno.test('flattenRubrics est en PRÉ-ORDRE : un parent précède toujours ses morceaux', () => {
  // L'écran agrège l'état d'une rubrique découpée en lisant ses morceaux au moment où il traite le
  // PARENT, puis les consomme. En post-ordre, les morceaux seraient déjà consommés et l'agrégat
  // silencieusement vide — la rubrique afficherait l'état de sa seule ligne propre. Une ligne de
  // test pour fermer un basculement qui ne lèverait aucune erreur.
  const ids = flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => r.id)
  for (const [parent, morceau] of [
    ['4.2', '4.2-posologie'],
    ['4.6', '4.6-fertilite'],
  ]) {
    assert(ids.indexOf(parent!) < ids.indexOf(morceau!), `${parent} doit précéder ${morceau}`)
  }
})

Deno.test('les autres gabarits n’ont AUCUN sous-découpage — la notice garde ses 26 lignes', () => {
  // Le compte affiché, gabarit par gabarit. Ce test est le garde-fou d'un piège mesuré : dériver
  // les morceaux du TIRET dans l'identifiant (au lieu de les déclarer) masquait 17 des 26 lignes
  // de la notice — `2-avertissements`, `6-fabricant`… sont de VRAIS intertitres imprimés dans une
  // notice patient — et `ville-date` de la page de garde. Le jour où l'un de ces gabarits devient
  // livrable, l'acheteur aurait vu 9 lignes pour un document qui en porte 26, sans erreur ni trace.
  const attendus: Record<string, [number, number]> = {
    cover: [14, 0],
    pght: [8, 0],
    rcp: [34, 5],
    notice: [26, 0],
    labeling: [17, 0],
  }
  for (const [nom, spec] of Object.entries(CONFORMITY_SPECS)) {
    const [entrees, morceaux] = attendus[nom]!
    assertEquals(flattenRubrics(spec).length, entrees, `${nom} : nombre d'entrées`)
    assertEquals(idsSousDecoupage(spec).size, morceaux, `${nom} : sous-découpages`)
  }
})

Deno.test('un tiret ne fait pas un morceau : `ville-date` de la page de garde reste une rubrique', () => {
  // Contre-exemple RÉEL, trouvé en écrivant ce test : la page de garde porte « ville-date »
  // (« Ville et date »), un identifiant composé qui n'est le morceau de personne. Un raccourci
  // « l'id contient un tiret » l'aurait effacé de la liste de l'acheteur le jour où ce gabarit
  // devient livrable — sans erreur, sans trace.
  assert(flattenRubrics(CONFORMITY_SPECS.cover).some((r) => r.id === 'ville-date'))
  assert(!idsSousDecoupage(CONFORMITY_SPECS.cover).has('ville-date'))
  // La notice porte même des identifiants à DEUX tirets (« 2-autres-medicaments ») dont le parent
  // est « 2 » : aucune découpe de chaîne ne pouvait les classer correctement.
  assert(flattenRubrics(CONFORMITY_SPECS.notice).some((r) => r.id === '2-autres-medicaments'))
  assert(!idsSousDecoupage(CONFORMITY_SPECS.notice).has('2-autres-medicaments'))
  // Un morceau est toujours l'ENFANT de la rubrique qu'il découpe : marquer `interne` sur une
  // rubrique de premier niveau la ferait disparaître sans que rien ne la reprenne.
  for (const [nom, spec] of Object.entries(CONFORMITY_SPECS)) {
    const enfants = new Set(flattenRubrics(spec).flatMap((p) => (p.children ?? []).map((c) => c.id)))
    for (const id of idsSousDecoupage(spec)) {
      assert(enfants.has(id), `${nom} : « ${id} » est marqué interne mais n'est l'enfant de personne`)
    }
  }
})

Deno.test('les 5 specs existent et portent une référence de template', () => {
  const types = Object.keys(CONFORMITY_SPECS).sort()
  assertEquals(types, ['cover', 'labeling', 'notice', 'pght', 'rcp'])
  for (const spec of Object.values(CONFORMITY_SPECS)) {
    assert(spec.reference.length > 10, `${spec.docType} : référence manquante`)
    assert(spec.rules.length >= 3, `${spec.docType} : règles globales manquantes`)
    assert(spec.rubrics.length >= 5, `${spec.docType} : rubriques manquantes`)
  }
})

Deno.test('RCP : rubriques 1 à 10 présentes, ordonnées, + conditions de prescription', () => {
  const top = CONFORMITY_SPECS.rcp.rubrics.map((r) => r.id)
  assertEquals(top, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'prescription'])
  const all = flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => r.id)
  for (const id of ['4.1', '4.2', '4.8', '4.9', '5.1', '5.3', '6.1', '6.6']) {
    assert(all.includes(id), `RCP : rubrique ${id} absente`)
  }
})

Deno.test('RCP 4.8 : pharmacovigilance ABMed obligatoire pour le Bénin uniquement', () => {
  const r48 = flattenRubrics(CONFORMITY_SPECS.rcp).find((r) => r.id === '4.8')
  const abmed = r48?.mentions?.find((m) => m.text.includes('vigilances.abmed@gouv.bj'))
  assertEquals(abmed?.requiredFor, ['BJ'])
  // Rendu prompt : présent pour BJ, absent pour CI.
  assert(specPromptText(CONFORMITY_SPECS.rcp, 'BJ').includes('vigilances.abmed@gouv.bj'))
  assert(!specPromptText(CONFORMITY_SPECS.rcp, 'CI').includes('vigilances.abmed@gouv.bj'))
})

Deno.test('RCP 2 : renvoi 6.1 imposé partout, effet notoire conditionnel, doctrine §2/6.1', () => {
  // Arbitrage CEO 2026-08-14 (LOT A) : la rubrique 2 est une phrase de composition — actifs +
  // effet notoire + renvoi 6.1 ; la formule intégrale relève du module 3.2.P.1, hors RCP.
  const r2 = CONFORMITY_SPECS.rcp.rubrics.find((r) => r.id === '2')!
  const renvoi = r2.mentions?.find((m) =>
    m.text === 'Pour la liste complète des excipients, voir rubrique 6.1.'
  )
  assert(renvoi, 'renvoi 6.1 absent de la rubrique 2')
  assertEquals(renvoi?.requiredFor, undefined, 'le renvoi 6.1 vaut pour TOUS les pays')
  const notoire = r2.mentions?.find((m) => m.text.startsWith('Excipient(s) à effet notoire'))
  assert(notoire?.when, 'la mention « effet notoire » doit porter sa condition')
  assert(
    r2.guidance?.some((g) => g.includes('3.2.P.1')),
    'la doctrine « formulation → module 3.2.P.1 » doit être une consigne de la rubrique 2',
  )
  const r61 = flattenRubrics(CONFORMITY_SPECS.rcp).find((r) => r.id === '6.1')!
  assert(
    r61.guidance?.some((g) => g.includes('véhicule')),
    'la 6.1 doit exiger la liste complète, véhicule inclus',
  )
  // Rendu prompt d'AUDIT : le renvoi (inconditionnel) se grade quel que soit le pays ; la mention
  // CONDITIONNELLE n'y entre JAMAIS — un RCP sans excipient à effet notoire n'a rien à annoncer,
  // et la grader ferait rendre « non conforme » un document correct au Checking Standard public.
  const prompt = specPromptText(CONFORMITY_SPECS.rcp, 'CI')
  assert(prompt.includes('voir rubrique 6.1'))
  assert(!prompt.includes('effet notoire'), 'mention conditionnelle gradée dans le prompt d’audit')
})

Deno.test('Notice : sections 1 à 6 + encadré + table des matières', () => {
  const ids = CONFORMITY_SPECS.notice.rubrics.map((r) => r.id)
  for (const id of ['entete', 'encadre', 'tdm', '1', '2', '3', '4', '5', '6']) {
    assert(ids.includes(id), `Notice : rubrique ${id} absente`)
  }
})

Deno.test('PGHT : objet exact et tableau 4 colonnes en FCFA', () => {
  const prompt = specPromptText(CONFORMITY_SPECS.pght)
  assert(prompt.includes('Attestation de PGHT'))
  assert(prompt.includes('PGHT (FCFA)'))
  assert(prompt.includes('Nom commercial | DCI et dosage | Forme et présentation'))
})

Deno.test('Cover : les 5 informations produit sont toutes obligatoires', () => {
  const produit = CONFORMITY_SPECS.cover.rubrics.find((r) => r.id === 'produit')
  assertEquals(produit?.children?.length, 5)
  assert(produit!.children!.every((c) => c.required))
})

Deno.test('ids uniques dans chaque spec (constats traçables)', () => {
  for (const spec of Object.values(CONFORMITY_SPECS)) {
    const ids = flattenRubrics(spec).map((r) => r.id)
    assertEquals(new Set(ids).size, ids.length, `${spec.docType} : ids dupliqués`)
  }
})

Deno.test('mapping docType Pharnos → spec (artwork → labeling, inconnu → null)', () => {
  assertEquals(specForDocType('rcp')?.docType, 'rcp')
  assertEquals(specForDocType('artwork')?.docType, 'labeling')
  assertEquals(specForDocType('labeling')?.docType, 'labeling')
  assertEquals(specForDocType('gmp'), null)
  assertEquals(specForDocType(''), null)
})

Deno.test('specPromptText : obligatoires marqués, optionnelles distinguées', () => {
  const prompt = specPromptText(CONFORMITY_SPECS.labeling)
  assert(prompt.includes('[OBLIGATOIRE]'))
  assert(prompt.includes('[optionnelle]'))
  assert(prompt.includes('FAB/EXP'))
})
