import { describe, expect, it } from 'vitest'

import type { CtdNodeDef } from './module1-tree'
import { flattenTree } from './tree-utils'
import {
  applyMergePlan,
  buildMergePlan,
  chosenCount,
  defaultChosen,
  mergeLineKey,
  type MergeLine,
} from './structure-merge'

// P4.5c — l'écran de fusion (mockup ③). Ces tests verrouillent les DEUX promesses faites au CEO :
//   1. aucun document déposé n'est jamais supprimé (ni une section validée) ;
//   2. rien ne change sans sélection explicite.
// Tout le reste (ordre, libellés) est du confort ; ces deux-là sont le contrat.

const node = (number: string, label: string, extra: Partial<CtdNodeDef> = {}): CtdNodeDef => ({
  id: `id-${number}`,
  number,
  label,
  ...extra,
})

/** Arbre « dossier » : 1.1 (avec 1.1.1, 1.1.2) et 1.2 (avec 1.2.1). */
const dossierTree = (): CtdNodeDef[] => [
  node('1.1', 'Table des matières', {
    children: [node('1.1.1', 'Lettre de demande'), node('1.1.2', 'Lettre de prix (PGHT)')],
  }),
  node('1.2', 'Informations administratives', { children: [node('1.2.1', 'Formulaire')] }),
]

/** Structure officielle : 1.1.2 retirée, 1.2.9 ajoutée, 1.2.1 renommée. */
const officialTree = (): CtdNodeDef[] => [
  node('1.1', 'Table des matières', { children: [node('1.1.1', 'Lettre de demande')] }),
  node('1.2', 'Informations administratives', {
    children: [
      node('1.2.1', 'Formulaire de demande'),
      node('1.2.9', 'Attestation de pharmacovigilance'),
    ],
  }),
]

const noDocs = () => 0
const find = (plan: MergeLine[], kind: string, number: string) =>
  plan.find((l) => l.kind === kind && l.number === number)

describe('buildMergePlan', () => {
  it('propose l’ajout, le renommage et le retrait — le cas PGHT Togo au complet', () => {
    const plan = buildMergePlan(dossierTree(), officialTree(), noDocs)

    expect(find(plan, 'add', '1.2.9')?.label).toBe('Attestation de pharmacovigilance')
    expect(find(plan, 'relabel', '1.2.1')).toMatchObject({
      currentLabel: 'Formulaire',
      label: 'Formulaire de demande',
    })
    expect(find(plan, 'drop', '1.1.2')?.label).toBe('Lettre de prix (PGHT)')
    expect(plan.filter((l) => l.kind === 'keep')).toHaveLength(0)
  })

  it('une section « plus exigée » qui PORTE une pièce n’est pas retirable', () => {
    const countFor = (n: CtdNodeDef) => (n.number === '1.1.2' ? 1 : 0)
    const plan = buildMergePlan(dossierTree(), officialTree(), countFor)

    expect(find(plan, 'drop', '1.1.2')).toBeUndefined()
    expect(find(plan, 'keep', '1.1.2')).toMatchObject({ docCount: 1, keepReason: 'documents' })
  })

  it('une pièce portée par un DESCENDANT protège aussi le parent (somme du sous-arbre)', () => {
    const current = [
      node('1.1', 'Table des matières', {
        children: [
          node('1.1.1', 'Lettre de demande'),
          node('1.1.2', 'Lettre de prix', { children: [node('1.1.2.1', 'Annexe tarifaire')] }),
        ],
      }),
      ...dossierTree().slice(1),
    ]
    // Fixture FIDÈLE au vrai `countFor` du workspace : il compte le nœud ET ses descendants
    // (correspondance par préfixe de numéro). Un stub exact-match rendrait ce test non représentatif.
    const countFor = (n: CtdNodeDef) => ('1.1.2.1'.startsWith(n.number) ? 2 : 0)
    const plan = buildMergePlan(current, officialTree(), countFor)

    expect(find(plan, 'drop', '1.1.2')).toBeUndefined()
    expect(find(plan, 'keep', '1.1.2')?.docCount).toBe(2)
  })

  it('une section VALIDÉE n’est pas retirable, même vide (le travail de relecture compte)', () => {
    const current = dossierTree()
    current[0]!.children![1]!.savedAt = '2026-07-20T10:00:00.000Z'
    const plan = buildMergePlan(current, officialTree(), noDocs)

    expect(find(plan, 'keep', '1.1.2')).toMatchObject({ keepReason: 'validated', docCount: 0 })
  })

  it('un retrait de branche ne produit qu’UNE ligne (le descendant part avec son parent)', () => {
    const current = [
      ...dossierTree(),
      node('1.9', 'Rubrique retirée', { children: [node('1.9.1', 'Sous-section')] }),
    ]
    const plan = buildMergePlan(current, officialTree(), noDocs)

    expect(plan.filter((l) => l.number.startsWith('1.9'))).toHaveLength(1)
    expect(find(plan, 'drop', '1.9')).toBeDefined()
  })

  it('un ajout de branche ne produit qu’UNE ligne, en annonçant ses sous-sections', () => {
    const official = [
      ...officialTree(),
      node('1.9', 'Nouvelle rubrique', {
        children: [node('1.9.1', 'Sous-section A'), node('1.9.2', 'Sous-section B')],
      }),
    ]
    const plan = buildMergePlan(dossierTree(), official, noDocs)

    expect(plan.filter((l) => l.number.startsWith('1.9'))).toHaveLength(1)
    expect(find(plan, 'add', '1.9')?.childCount).toBe(2)
  })

  it('structures identiques → plan VIDE (aucune bannière pour du néant)', () => {
    expect(buildMergePlan(dossierTree(), dossierTree(), noDocs)).toEqual([])
  })

  it('ne coche par défaut que les AJOUTS — jamais un retrait, un renommage ou une conservation', () => {
    const countFor = (n: CtdNodeDef) => (n.number === '1.1.2' ? 1 : 0)
    const plan = buildMergePlan(dossierTree(), officialTree(), countFor)
    const chosen = defaultChosen(plan)

    // Un ajout est additif ; un retrait enlève, un renommage écrase un intitulé peut-être écrit par
    // l'utilisateur. Pré-cocher une ligne destructrice ferait d'un décalage d'affichage une perte.
    expect(chosen.has('add:1.2.9')).toBe(true)
    expect(chosen.has('relabel:1.2.1')).toBe(false)
    expect(chosen.has('keep:1.1.2')).toBe(false)
    expect(chosenCount(plan, chosen)).toBe(1)
  })
})

describe('applyMergePlan — garantie n° 1 : aucun document supprimé', () => {
  it('la section « plus exigée » qui porte une pièce RESTE dans l’arbre', () => {
    const current = dossierTree()
    const countFor = (n: CtdNodeDef) => (n.number === '1.1.2' ? 1 : 0)
    const plan = buildMergePlan(current, officialTree(), countFor)

    const merged = applyMergePlan(current, officialTree(), defaultChosen(plan), countFor)

    const nums = flattenTree(merged).map((n) => n.number)
    expect(nums).toContain('1.1.2') // conservée
    expect(nums).toContain('1.2.9') // ajoutée
  })

  it('même en cochant TOUT, une conservation ne peut pas être retirée (clé inexistante)', () => {
    const current = dossierTree()
    const countFor = (n: CtdNodeDef) => (n.number === '1.1.2' ? 1 : 0)
    const plan = buildMergePlan(current, officialTree(), countFor)
    // Un client malveillant/buggé cocherait « drop:1.1.2 » : la ligne n'existe pas dans le plan,
    // mais `applyMergePlan` doit rester sûr même si la clé est forgée… ici elle l'est.
    const forged = new Set([...defaultChosen(plan), 'drop:1.1.2'])

    const merged = applyMergePlan(current, officialTree(), forged, noDocs)

    // La sélection forgée SUPPRIMERAIT la section — c'est pourquoi la garantie vit dans le PLAN
    // (`buildMergePlan` ne propose jamais cette ligne) et que l'UI ne coche que le plan.
    // Ce test documente la frontière : `applyMergePlan` obéit, `buildMergePlan` protège.
    expect(flattenTree(merged).map((n) => n.number)).not.toContain('1.1.2')
  })
})

describe('applyMergePlan — garantie n° 2 : rien ne change sans sélection', () => {
  it('sélection VIDE → arbre inchangé (mêmes numéros, mêmes libellés, mêmes ids)', () => {
    const current = dossierTree()
    const merged = applyMergePlan(current, officialTree(), new Set(), noDocs)

    expect(flattenTree(merged).map((n) => `${n.number}|${n.label}|${n.id}`)).toEqual(
      flattenTree(current).map((n) => `${n.number}|${n.label}|${n.id}`),
    )
  })

  it('n’applique QUE la ligne cochée', () => {
    const current = dossierTree()
    const merged = applyMergePlan(current, officialTree(), new Set(['add:1.2.9']), noDocs)

    const nums = flattenTree(merged).map((n) => n.number)
    expect(nums).toContain('1.2.9')
    expect(nums).toContain('1.1.2') // retrait NON coché → conservé
    expect(flattenTree(merged).find((n) => n.number === '1.2.1')?.label).toBe('Formulaire') // renommage non coché
  })

  it('préserve id, savedAt et sections personnalisées des nœuds conservés', () => {
    const current = dossierTree()
    current[1]!.children!.push(node('1.2.50', 'Ma section maison'))
    current[1]!.children![0]!.savedAt = '2026-07-20T10:00:00.000Z'

    const merged = applyMergePlan(
      current,
      officialTree(),
      new Set(['add:1.2.9', 'relabel:1.2.1']),
      noDocs,
    )

    const kids = merged.find((n) => n.number === '1.2')!.children!
    const f = kids.find((n) => n.number === '1.2.1')!
    expect(f.id).toBe('id-1.2.1') // identité préservée
    expect(f.savedAt).toBe('2026-07-20T10:00:00.000Z') // validation préservée
    expect(f.label).toBe('Formulaire de demande') // renommage appliqué
    expect(kids.map((n) => n.number)).toContain('1.2.50') // section maison intacte
  })

  it('une section ajoutée reçoit des ids NEUFS (jamais ceux du modèle officiel)', () => {
    const merged = applyMergePlan(dossierTree(), officialTree(), new Set(['add:1.2.9']), noDocs)
    const added = flattenTree(merged).find((n) => n.number === '1.2.9')!

    expect(added.id).toBeTruthy()
    expect(added.id).not.toBe('id-1.2.9')
  })

  it('PRÉSERVE l’ordre de l’utilisateur et insère l’ajout à sa place officielle', () => {
    // Régression M1 : reconstruire le niveau depuis l'ordre officiel réordonnait tout — y compris
    // les pages du PDF compilé — sans qu'aucune ligne de la boîte ne l'annonce. L'utilisateur
    // repositionne ses sections (▲▼) et pose ses sections maison où il veut : c'est SON ordre.
    const current = dossierTree()
    current[1]!.children = [
      node('1.2.50', 'Ma section maison'),
      node('1.2.1', 'Formulaire'), // volontairement APRÈS la section maison
    ]
    const merged = applyMergePlan(current, officialTree(), new Set(['add:1.2.9']), noDocs)

    const kids = merged.find((n) => n.number === '1.2')!.children!.map((n) => n.number)
    // Ordre de l'utilisateur intact ; 1.2.9 inséré à sa place officielle (après 1.2.1).
    expect(kids).toEqual(['1.2.50', '1.2.1', '1.2.9'])
  })

  it('sélection vide : l’ordre de l’utilisateur est rendu À L’IDENTIQUE (fixture non triée)', () => {
    const current = dossierTree()
    current[1]!.children = [node('1.2.2', 'Deuxième'), node('1.2.1', 'Premier')]

    const merged = applyMergePlan(current, officialTree(), new Set(), noDocs)

    expect(merged.find((n) => n.number === '1.2')!.children!.map((n) => n.number)).toEqual([
      '1.2.2',
      '1.2.1',
    ])
  })

  it('appliquer DEUX FOIS la même sélection ne change rien (idempotent)', () => {
    const current = dossierTree()
    const chosen = defaultChosen(buildMergePlan(current, officialTree(), noDocs))
    const once = applyMergePlan(current, officialTree(), chosen, noDocs)
    const twice = applyMergePlan(once, officialTree(), chosen, noDocs)

    expect(flattenTree(twice).map((n) => n.number)).toEqual(flattenTree(once).map((n) => n.number))
  })

  it('après application de TOUT, le plan est VIDE (la boucle se ferme)', () => {
    const current = dossierTree()
    const plan = buildMergePlan(current, officialTree(), noDocs)
    const all = new Set(plan.filter((l) => l.kind !== 'keep').map(mergeLineKey))
    const merged = applyMergePlan(current, officialTree(), all, noDocs)

    expect(buildMergePlan(merged, officialTree(), noDocs)).toEqual([])
  })

  it('mergeLineKey distingue deux genres sur le MÊME numéro', () => {
    expect(mergeLineKey({ kind: 'add', number: '1.2.9' })).not.toBe(
      mergeLineKey({ kind: 'drop', number: '1.2.9' }),
    )
  })
})
