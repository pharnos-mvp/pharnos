// deno test — l'assemblage des markdowns livrables. Pur : aucun réseau, aucune base.
import { assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1'

import { CONFORMITY_SPECS, flattenRubrics } from './conformity-specs.ts'
import { lacunesDuDocument } from './report-core.ts'
import {
  activityContextLine,
  activityLabel,
  analyseDepuisParts,
  assembleDocument,
  MISSING_MARKER,
  MISSING_MARKER_EN,
  produitDepuisRubrique1,
  sectionHeading,
  slugFrom,
  statsLivrable,
  type LigneAssemblage,
} from './deliverable-markdown.ts'

const spec = CONFORMITY_SPECS.rcp
const flat = flattenRubrics(spec)
const isParent = (id: string) => Boolean(flat.find((r) => r.id === id)?.children?.length)

/** Un jeu de lignes complet : chaque rubrique du gabarit, contenu trivial. */
function lignesCompletes(): Map<string, LigneAssemblage> {
  const m = new Map<string, LigneAssemblage>()
  for (const r of flat) {
    m.set(r.id, {
      sectionId: r.id,
      title: `Titre ${r.id}`,
      status: r.id === '8' ? 'missing' : 'filled',
      content: r.id === '8' ? MISSING_MARKER : `Contenu de la rubrique ${r.id}.`,
    })
  }
  return m
}

function traductionsCompletes(): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of flat) {
    if (isParent(r.id)) continue
    m.set(r.id, `Content of section ${r.id}.`)
  }
  return m
}

const META = {
  product: 'KV-KACIN 500',
  sourceName: 'RCP_Kacin.pdf',
  country: 'BJ',
  activity: "nouvelle demande d'AMM",
}

Deno.test('assemblage : la convention de titres est EXACTEMENT celle des références', () => {
  // Entier → `###`, décimale → `####`, sous-partie nommée → gras, prescription → `###` sans numéro.
  assertEquals(sectionHeading({ id: '4' }, 'T'), '### 4. T')
  assertEquals(sectionHeading({ id: '4.8' }, 'T'), '#### 4.8. T')
  assertEquals(sectionHeading({ id: '4.8-a' }, 'T'), '**T**')
  assertEquals(sectionHeading({ id: 'prescription' }, 'T'), '### T')
})

Deno.test('assemblage : FR complet — en-tête, pays, activité, et chaque rubrique', () => {
  const doc = assembleDocument('fr', spec, lignesCompletes(), new Map(), META)
  if (typeof doc !== 'string') throw new Error(doc.erreur)
  assertStringIncludes(doc, '# RCP KV-KACIN 500 — version conforme')
  assertStringIncludes(doc, 'Pays de dépôt : BJ · Activité : nouvelle demande d’AMM.'.replace('’', "'"))
  assertStringIncludes(doc, '`RCP_Kacin.pdf`')
  for (const r of flat) assertStringIncludes(doc, `Titre ${r.id}`)
  // Une lacune reste une lacune — le marqueur voyage tel quel.
  assertStringIncludes(doc, MISSING_MARKER)
})

Deno.test('assemblage : EN — titres du gabarit verrouillé, lacunes en marqueur EN', () => {
  const doc = assembleDocument('en', spec, lignesCompletes(), traductionsCompletes(), META)
  if (typeof doc !== 'string') throw new Error(doc.erreur)
  assertStringIncludes(doc, '# KV-KACIN 500 SmPC — English version')
  // Le titre vient de la DONNÉE GÉNÉRÉE, jamais du titre français posé par le moteur.
  assertStringIncludes(doc, 'NAME OF THE MEDICINAL PRODUCT')
  assertEquals(doc.includes('Titre 1'), false)
  // ⚠️ Le statut se RECOPIE : la rubrique 8 `missing` sort en marqueur EN, pas en traduction.
  assertStringIncludes(doc, MISSING_MARKER_EN)
})

Deno.test('assemblage : une rubrique ABSENTE fait refuser — jamais un document amputé', () => {
  // La leçon de `d224665` : une borne qui tronque en silence rend un rapport calculé sur un
  // document amputé. Ici, l'assembleur refuse et NOMME la rubrique.
  const lignes = lignesCompletes()
  lignes.delete('4.8')
  const doc = assembleDocument('fr', spec, lignes, new Map(), META)
  assertEquals(typeof doc === 'string', false)
  assertMatch((doc as { erreur: string }).erreur, /4\.8/)
})

Deno.test('assemblage : une traduction absente sur une rubrique RENSEIGNÉE fait refuser', () => {
  // Livrer du français sous un titre anglais produirait un « companion » qui ne l'est pas.
  const traductions = traductionsCompletes()
  traductions.delete('4.8')
  const doc = assembleDocument('en', spec, lignesCompletes(), traductions, META)
  assertEquals(typeof doc === 'string', false)
  assertMatch((doc as { erreur: string }).erreur, /4\.8/)
})

Deno.test('produit : dérivé de la rubrique 1, jamais « votre produit »', () => {
  // Le défaut que cette fonction ferme : `productName: 'votre produit'` en dur — le rapport payé
  // posait sa question « sans objet » sur « votre produit ».
  assertEquals(
    produitDepuisRubrique1('KV-KACIN 500, poudre pour solution injectable.'),
    'KV-KACIN 500',
  )
  assertEquals(produitDepuisRubrique1('GYNORIL Ovule.'), 'GYNORIL Ovule')
  // Une rubrique 1 manquante rend VIDE : l'appelant dit qu'il ne sait pas, il n'invente pas.
  assertEquals(produitDepuisRubrique1(MISSING_MARKER), '')
  assertEquals(produitDepuisRubrique1(undefined), '')
  assertEquals(produitDepuisRubrique1(''), '')
  // Un paragraphe entier n'est pas une dénomination.
  assertEquals(produitDepuisRubrique1('x'.repeat(200)), '')
})

Deno.test('slug : même règle que le harnais U0', () => {
  assertEquals(slugFrom('KV-KACIN 500'), 'KV-KACIN-500')
  assertEquals(slugFrom('  Gynoril® Ovule  '), 'Gynoril-Ovule')
})

Deno.test('activité : les deux vocabulaires convergent, et l’inconnu se tait', () => {
  // L'app dit `new_ma`, la landing dit `amm`/`renouv` — même consigne, une seule source.
  assertEquals(activityContextLine('new_ma'), activityContextLine('amm'))
  assertMatch(activityContextLine('renouv'), /RENOUVELLEMENT/)
  // ⚠️ Le repli est le SILENCE, jamais une consigne inventée.
  assertEquals(activityContextLine(''), '')
  assertEquals(activityContextLine(null), '')
  assertEquals(activityContextLine('constructor'), '')
  // Les libellés d'en-tête suivent.
  assertEquals(activityLabel('renouv', 'fr'), "renouvellement d'AMM")
  assertEquals(activityLabel('amm', 'en'), 'new MA application')
  assertEquals(activityLabel(null, 'fr'), 'non précisée')
})

Deno.test('revue : un TABLEAU absent fait refuser le rapport entier — « Aucun. » est une affirmation', () => {
  // `renderReportMarkdown` écrit « Aucun. » pour une liste vide : livrer « aucune terminologie à
  // aligner » parce qu'une ligne manque serait le défaut corrigé en `d224665`.
  const complet = new Map<string, unknown>([
    ['terminology', { terminology: [] }],
    ['relocations', { relocations: [{ content: 'x' }] }],
    ['findings', { findings: [] }],
    ['recommendations', { recommendations: [] }],
  ])
  const ok = analyseDepuisParts(complet)
  assertEquals('erreur' in ok, false)

  for (const manquant of ['terminology', 'relocations', 'findings', 'recommendations']) {
    const trous = new Map(complet)
    trous.delete(manquant)
    const refus = analyseDepuisParts(trous)
    assertEquals('erreur' in refus, true, manquant)
    assertMatch((refus as { erreur: string }).erreur, new RegExp(manquant))
  }
  // Un contenu présent mais MALFORMÉ (la liste n'en est pas une) refuse aussi.
  const casse = new Map(complet)
  casse.set('findings', { findings: 'pas une liste' })
  assertEquals('erreur' in analyseDepuisParts(casse), true)

  // ⚠️ Et le tableau VIDÉ PAR L'ANCRAGE refuse : `pruneUnverifiable` peut écarter toutes les
  // lignes (le compte est dans `droppedClaims`) — rendre alors « Aucun. » serait une affirmation
  // fausse dans un rapport payé. Un tableau vide SANS écartées, lui, est un vrai constat.
  const vide = new Map(complet)
  vide.set('terminology', { terminology: [], droppedClaims: ['ligne écartée'] })
  const refus = analyseDepuisParts(vide)
  assertEquals('erreur' in refus, true)
  assertMatch((refus as { erreur: string }).erreur, /ancrage/)
  assertEquals('erreur' in analyseDepuisParts(complet), false)
})


Deno.test('statsLivrable : les comptes sont ceux des 29 RUBRIQUES, pas des 34 entrées', () => {
  // L'acheteur lit « rubrique 4.8 sur 29 » pendant cinq minutes, puis les quatre tuiles de la
  // livraison. Comptées sur les 34 entrées du gabarit, elles annonçaient « 31 reprises · 3 à
  // compléter » = 34 : la contradiction sautait aux yeux au dernier écran.
  const sections = flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => ({
    sectionId: r.id,
    status: 'filled' as const,
  }))
  const stats = statsLivrable(sections, { relocations: [] }, CONFORMITY_SPECS.rcp)
  assertEquals(stats.reprises + stats.aCompleter, 29)

  // Le verdict d'une rubrique découpée est le PLUS SÉVÈRE de ses morceaux : une moitié sans donnée
  // rend la rubrique « à compléter », jamais « reprise » — c'est cette moitié que l'agence verra.
  const avecTrou = sections.map((s) =>
    s.sectionId === '4.6-fertilite' ? { ...s, status: 'missing' as const } : s
  )
  const stats2 = statsLivrable(avecTrou, { relocations: [] }, CONFORMITY_SPECS.rcp)
  assertEquals(stats2.aCompleter, 1)
  assertEquals(stats2.reprises + stats2.aCompleter, 29)

  // Et le compte des tuiles est celui du RAPPORT, par construction : une seule liste de lacunes,
  // pas deux règles jumelles. C'est l'invariant qui a manqué au premier jet — la tuile disait 1,
  // le rapport payé disait 4.
  assertEquals(stats2.aCompleter, lacunesDuDocument(avecTrou, CONFORMITY_SPECS.rcp).length)
})

Deno.test('statsLivrable : les quatre comptes de l’écran de livraison, dédupliqués comme au rapport', () => {
  const sections = flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => ({
    sectionId: r.id,
    status: (r.id === '4.4' || r.id === '5.2' ? 'missing' : 'filled') as
      | 'filled'
      | 'partial'
      | 'missing',
    ...(r.id === '1'
      ? { figuresToVerify: ['≤ 28', '500'] }
      : r.id === '2'
      ? { figuresToVerify: ['500'] }
      : {}),
  }))
  const stats = statsLivrable(sections, {
    relocations: [
      { content: 'a', source_position: 'b', template_position: 'c', risk: 'd' },
      { content: 'e', source_position: 'f', template_position: 'g', risk: 'h' },
    ],
  }, CONFORMITY_SPECS.rcp)
  // ⚠️ `aRelire` DÉDUPLIQUE (« 500 » apparaît dans deux rubriques, une seule entrée au rapport) :
  // le compte doit égaler la liste que le client voit.
  assertEquals(stats, { reprises: 27, aCompleter: 2, deplaces: 2, aRelire: 2 })
  // Sans revue ni valeurs, tout tombe à zéro — jamais `undefined` dans une tuile.
  const toutesRemplies = flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => ({
    sectionId: r.id,
    status: 'filled' as const,
  }))
  assertEquals(statsLivrable(toutesRemplies, { relocations: [] }, CONFORMITY_SPECS.rcp), {
    reprises: 29,
    aCompleter: 0,
    deplaces: 0,
    aRelire: 0,
  })
})
