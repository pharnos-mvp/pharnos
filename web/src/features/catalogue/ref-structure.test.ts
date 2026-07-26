import { describe, expect, it } from 'vitest'

import { REG_ACTIVITIES } from '@/features/workspace/dossier-constants'
import { getModule1Tree, type CtdNodeDef } from '@/features/workspace/module1-tree'
import { flattenTree } from '@/features/workspace/tree-utils'
import {
  applyStructureDeltas,
  CTD_ACTIVITY_CODES,
  deltaFromPayload,
  deltasFor,
  structureDeltaIssues,
  structureFromPayload,
  type CtdDelta,
} from './ref-structure'

// P4.5 — la structure du Module 1 devient une donnée versionnée par pays (cas du CEO : « le PGHT
// n'est plus exigé au Togo »). Ces tests verrouillent : (a) le refus DÉFENSIF d'un delta
// inapplicable — miroir du contrat serveur `ctdDeltaEffective` ; (b) le fait qu'un delta ne peut
// JAMAIS casser l'arbre (calcul TOTAL) ; (c) l'ordre d'application indépendant de la saisie god.

const numbers = (tree: CtdNodeDef[]) => flattenTree(tree).map((n) => n.number)
const find = (tree: CtdNodeDef[], number: string) =>
  flattenTree(tree).find((n) => n.number === number)

describe('deltaFromPayload — miroir strict du contrat serveur', () => {
  it('accepte les trois genres avec leurs champs obligatoires', () => {
    expect(deltaFromPayload({ kind: 'remove', number: '1.1.2' })).toEqual({
      kind: 'remove',
      number: '1.1.2',
    })
    expect(deltaFromPayload({ kind: 'add', number: '1.2.9', label: 'Pharmacovigilance' })).toEqual({
      kind: 'add',
      number: '1.2.9',
      label: 'Pharmacovigilance',
    })
    expect(deltaFromPayload({ kind: 'relabel', number: '1.3.3', label: 'Étiquetage' })?.kind).toBe(
      'relabel',
    )
  })

  it('refuse ce que l’Edge refuse : genre inconnu, numéro non CTD, libellé vide, racine', () => {
    expect(deltaFromPayload({ kind: 'reorder', number: '1.2.6' })).toBeUndefined()
    expect(deltaFromPayload({ kind: 'remove', number: '1.2.x' })).toBeUndefined()
    expect(deltaFromPayload({ kind: 'add', number: '1.2.9', label: '   ' })).toBeUndefined()
    // Retirer une racine OU une branche de 1er niveau : refusé (les pièces déposées dessous
    // disparaîtraient du dossier ET du PDF compilé, en silence).
    expect(deltaFromPayload({ kind: 'remove', number: '1' })).toBeUndefined()
    expect(deltaFromPayload({ kind: 'remove', number: '1.2' })).toBeUndefined()
    // …mais AJOUTER une rubrique de 1er niveau reste permis.
    expect(deltaFromPayload({ kind: 'add', number: '1.9', label: 'Rubrique' })?.kind).toBe('add')
    // Trim du numéro : parité stricte avec l'Edge (un espace est invisible à l'œil).
    expect(deltaFromPayload({ kind: 'remove', number: ' 1.1.2 ' })?.number).toBe('1.1.2')
    expect(deltaFromPayload({ kind: 'remove', number: '1.1.2', format: 'pdf' })).toBeUndefined()
    expect(
      deltaFromPayload({ kind: 'relabel', number: '1.3.3', label: 'X', activities: [] }),
    ).toBeUndefined()
    expect(deltaFromPayload(null)).toBeUndefined()
    expect(deltaFromPayload('remove')).toBeUndefined()
  })

  it('normalise : trim du numéro/libellé, note vide omise', () => {
    const d = deltaFromPayload({
      kind: 'add',
      number: ' 1.2.9 ',
      label: ' Attestation ',
      note: '  ',
    })
    expect(d).toEqual({ kind: 'add', number: '1.2.9', label: 'Attestation' })
  })
})

describe('structureFromPayload', () => {
  it('undefined quand AUCUN delta n’est applicable (pas de bannière pour du néant)', () => {
    expect(structureFromPayload({ deltas: [] })).toBeUndefined()
    expect(structureFromPayload({})).toBeUndefined()
    expect(structureFromPayload({ deltas: [{ kind: 'remove', number: 'zz' }] })).toBeUndefined()
  })

  it('garde les deltas valides et jette les malformés (publication partielle utile)', () => {
    const out = structureFromPayload({
      deltas: [
        { kind: 'remove', number: 'zz' },
        { kind: 'remove', number: '1.1.2' },
      ],
    })
    expect(out).toEqual([{ kind: 'remove', number: '1.1.2' }])
  })
})

describe('deltasFor — filtres format/activité (décision A)', () => {
  const deltas: CtdDelta[] = [
    { kind: 'remove', number: '1.1.2' }, // partout
    { kind: 'remove', number: '1.4.1', format: 'ectd' },
    { kind: 'relabel', number: '1.3.3', label: 'X', activities: ['renewal'] },
  ]

  it('sans filtre = applicable partout', () => {
    expect(deltasFor(deltas, 'ctd', 'new_ma').map((d) => d.number)).toEqual(['1.1.2'])
  })

  it('respecte le format', () => {
    expect(deltasFor(deltas, 'ectd', 'new_ma').map((d) => d.number)).toEqual(['1.1.2', '1.4.1'])
  })

  it('respecte l’activité, et une activité inconnue n’attrape pas un delta restreint', () => {
    expect(deltasFor(deltas, 'ctd', 'renewal').map((d) => d.number)).toEqual(['1.1.2', '1.3.3'])
    expect(deltasFor(deltas, 'ctd', undefined).map((d) => d.number)).toEqual(['1.1.2'])
  })
})

describe('M4 — l’arbre de VARIATION est opt-in', () => {
  // L'arbre de variation n'est pas l'arbre standard amputé : sa numérotation est homonyme sans
  // être synonyme (« 1.2.1 » = formulaire de demande de VARIATION). Un delta rédigé face à
  // l'arbre d'enregistrement ne s'y transpose donc pas tout seul.
  const unscoped: CtdDelta[] = [{ kind: 'relabel', number: '1.2.1', label: 'Nouveau libellé' }]

  it('un delta NON scopé épargne l’arbre de variation (CTD)', () => {
    expect(deltasFor(unscoped, 'ctd', 'variation')).toEqual([])
    // …alors qu'il s'applique bien partout ailleurs.
    expect(deltasFor(unscoped, 'ctd', 'renewal')).toHaveLength(1)
    expect(deltasFor(unscoped, 'ctd', 'notif_response')).toHaveLength(1)
  })

  it('viser la variation reste possible — il faut le DIRE', () => {
    const scoped: CtdDelta[] = [
      { kind: 'relabel', number: '1.2.1', label: 'X', activities: ['variation'] },
    ]
    expect(deltasFor(scoped, 'ctd', 'variation')).toHaveLength(1)
    expect(deltasFor(scoped, 'ctd', 'new_ma')).toEqual([])
  })

  it('en eCTD, « variation » retombe sur l’arbre standard : le delta non scopé s’applique', () => {
    // `getModule1Tree('ectd', 'variation')` sert MODULE1_ECTD_CEDEAO — l'exception M4 vise
    // l'arbre de variation CTD UEMOA, pas l'étiquette d'activité.
    expect(deltasFor(unscoped, 'ectd', 'variation')).toHaveLength(1)
  })

  it('l’arbre de variation reste INTACT sous un delta non scopé (bout en bout)', () => {
    const varBase = getModule1Tree('ctd', 'variation')
    const applied = applyStructureDeltas(varBase, deltasFor(unscoped, 'ctd', 'variation'))
    expect(find(applied, '1.2.1')?.label).toBe(find(varBase, '1.2.1')?.label)
  })
})

describe('M6 — les activités visées sont des codes RÉELS, pas du texte libre', () => {
  it('rejette une coquille (« variations ») : sans cela, publié, adopté… et sans effet', () => {
    expect(
      deltaFromPayload({ kind: 'remove', number: '1.1.2', activities: ['variations'] }),
    ).toBeUndefined()
    expect(
      deltaFromPayload({ kind: 'remove', number: '1.1.2', activities: ['Nouvelle AMM'] }),
    ).toBeUndefined()
  })

  it('une SEULE activité inconnue disqualifie le delta (jamais de scope partiel silencieux)', () => {
    expect(
      deltaFromPayload({
        kind: 'relabel',
        number: '1.3.3',
        label: 'X',
        activities: ['renewal', 'renouvellement'],
      }),
    ).toBeUndefined()
  })

  it('accepte les codes connus, espaces compris', () => {
    expect(
      deltaFromPayload({ kind: 'remove', number: '1.1.2', activities: [' variation '] })
        ?.activities,
    ).toEqual(['variation'])
  })

  it('la liste est le MIROIR des activités qu’un dossier peut porter', () => {
    // Si le produit gagne une activité, ce test tombe : le référentiel doit pouvoir la viser.
    for (const a of REG_ACTIVITIES) {
      expect(CTD_ACTIVITY_CODES, a.code).toContain(a.code)
    }
    // `transfer` a quitté le sélecteur mais reste porté par des dossiers existants.
    expect(CTD_ACTIVITY_CODES).toContain('transfer')
  })

  it('un AJOUT sans parent déductible est refusé des deux côtés', () => {
    expect(deltaFromPayload({ kind: 'add', number: '2', label: 'Module national' })).toBeUndefined()
    expect(deltaFromPayload({ kind: 'add', number: '1.9', label: 'Rubrique' })?.kind).toBe('add')
  })
})

describe('structureDeltaIssues — « un delta qui ne rend rien est refusé » (règle ⑤ du mockup)', () => {
  const treeFor = (format: 'ctd' | 'ectd', activity: string) => getModule1Tree(format, activity)
  const issues = (deltas: CtdDelta[]) => structureDeltaIssues(deltas, treeFor)

  it('signale un numéro inconnu (retrait et renommage)', () => {
    expect(issues([{ kind: 'remove', number: '9.9.9' }])).toEqual(['unknown_node'])
    expect(issues([{ kind: 'relabel', number: '9.9.9', label: 'Fantôme' }])).toEqual([
      'unknown_node',
    ])
  })

  it('signale un ajout orphelin (parent absent ⇒ nœud jamais monté)', () => {
    expect(issues([{ kind: 'add', number: '1.99.1', label: 'Orphelin' }])).toEqual(['orphan'])
  })

  it('accepte un enfant ajouté sous un parent ajouté DANS LA MÊME entrée', () => {
    expect(
      issues([
        { kind: 'add', number: '1.2.9.1', label: 'Enfant' },
        { kind: 'add', number: '1.2.9', label: 'Parent' },
      ]),
    ).toEqual([null, null])
  })

  it('signale un renommage qui ne change rien (bannière de mise à jour pour du néant)', () => {
    // Delta SCOPÉ à un seul arbre : sans le scope, le même numéro porte un autre libellé en eCTD,
    // donc le delta y produirait bien un effet — et ne serait pas fautif.
    const base = getModule1Tree('ctd', 'renewal')
    const existing = find(base, '1.3.3')!
    expect(
      issues([
        {
          kind: 'relabel',
          number: existing.number,
          label: existing.label,
          format: 'ctd',
          activities: ['renewal'],
        },
      ]),
    ).toEqual(['no_change'])
  })

  it('EFFECTIF dans un seul arbre visé suffit (1.2.7 : absent en nouvelle AMM, présent en renouvellement)', () => {
    expect(numbers(getModule1Tree('ctd', 'new_ma'))).not.toContain('1.2.7')
    expect(numbers(getModule1Tree('ctd', 'renewal'))).toContain('1.2.7')
    expect(issues([{ kind: 'remove', number: '1.2.7' }])).toEqual([null])
  })

  it('un delta scopé à la VARIATION est jugé sur l’arbre de variation, pas sur le socle', () => {
    // 1.4.2 « Dossier présentant la variation » n'existe QUE dans l'arbre de variation.
    expect(
      issues([{ kind: 'remove', number: '1.4.2', activities: ['variation'], format: 'ctd' }]),
    ).toEqual([null])
    // Le même retrait, non scopé, ne vise plus l'arbre de variation (M4) → inerte, donc signalé.
    expect(issues([{ kind: 'remove', number: '1.4.2', format: 'ctd' }])).toEqual(['unknown_node'])
  })
})

describe('applyStructureDeltas — le cas PGHT Togo, et l’intégrité de l’arbre', () => {
  const base = getModule1Tree('ctd', 'new_ma')

  it('retire la section « plus exigée » de la structure OFFICIELLE', () => {
    const target = numbers(base).find((n) => n.startsWith('1.2.'))!
    const out = applyStructureDeltas(base, [{ kind: 'remove', number: target }])
    expect(numbers(out)).not.toContain(target)
    // Le reste de l'arbre est intact (un delta ne fait pas de dégâts collatéraux).
    expect(numbers(out).length).toBe(numbers(base).length - 1)
  })

  it('ajoute un nœud à sa place NUMÉRIQUE sous le parent déduit du numéro', () => {
    const out = applyStructureDeltas(base, [
      { kind: 'add', number: '1.2.9', label: 'Attestation de pharmacovigilance' },
    ])
    const parent = out.find((n) => n.number === '1.2')!
    const kids = parent.children!.map((c) => c.number)
    expect(kids).toContain('1.2.9')
    // Inséré APRÈS 1.2.8 (ordre numérique, pas lexicographique).
    expect(kids.indexOf('1.2.9')).toBe(kids.length - 1)
    expect(find(out, '1.2.9')?.label).toBe('Attestation de pharmacovigilance')
  })

  it('ordonne 1.2.10 APRÈS 1.2.9 (tri numérique, pas alphabétique)', () => {
    const out = applyStructureDeltas(base, [
      { kind: 'add', number: '1.2.10', label: 'Dixième' },
      { kind: 'add', number: '1.2.9', label: 'Neuvième' },
    ])
    const kids = out.find((n) => n.number === '1.2')!.children!.map((c) => c.number)
    expect(kids.indexOf('1.2.9')).toBeLessThan(kids.indexOf('1.2.10'))
  })

  it('IGNORE un ajout dont le parent est absent (jamais d’orphelin invisible)', () => {
    const out = applyStructureDeltas(base, [{ kind: 'add', number: '1.99.1', label: 'Orphelin' }])
    expect(numbers(out)).toEqual(numbers(base))
  })

  it('un ajout sur un numéro DÉJÀ présent se comporte en renommage (rejeu idempotent)', () => {
    const root = base[0]!
    const existing = root.children?.[0]?.number ?? root.number
    const once = applyStructureDeltas(base, [
      { kind: 'add', number: existing, label: 'Libellé publié' },
    ])
    const twice = applyStructureDeltas(once, [
      { kind: 'add', number: existing, label: 'Libellé publié' },
    ])
    expect(numbers(twice)).toEqual(numbers(base)) // aucun doublon
    expect(find(twice, existing)?.label).toBe('Libellé publié')
  })

  it('un renommage ne touche NI le numéro NI les enfants (le numéro est l’identité)', () => {
    const parent = base.find((n) => (n.children?.length ?? 0) > 1)!
    const out = applyStructureDeltas(base, [
      { kind: 'relabel', number: parent.number, label: 'Nouveau titre' },
    ])
    const after = out.find((n) => n.number === parent.number)!
    expect(after.label).toBe('Nouveau titre')
    expect(after.children?.map((c) => c.number)).toEqual(parent.children?.map((c) => c.number))
  })

  it('l’ordre d’application ne dépend PAS de la saisie god (add → relabel → remove)', () => {
    const deltas: CtdDelta[] = [
      { kind: 'relabel', number: '1.2.9', label: 'Renommé après ajout' },
      { kind: 'add', number: '1.2.9', label: 'Ajouté' },
    ]
    const out = applyStructureDeltas(base, deltas)
    expect(find(out, '1.2.9')?.label).toBe('Renommé après ajout')
    // …et dans l'autre sens de saisie, le résultat est le MÊME.
    expect(find(applyStructureDeltas(base, [...deltas].reverse()), '1.2.9')?.label).toBe(
      'Renommé après ajout',
    )
  })

  it('ne mute JAMAIS l’arbre d’entrée (le socle est une constante partagée)', () => {
    const before = JSON.stringify(base)
    applyStructureDeltas(base, [
      { kind: 'add', number: '1.2.9', label: 'X' },
      { kind: 'remove', number: '1.2.1' },
      { kind: 'relabel', number: '1.0', label: 'Y' },
    ])
    expect(JSON.stringify(base)).toBe(before)
  })

  it('aucun delta ⇒ l’arbre du socle À L’IDENTIQUE (comportement historique préservé)', () => {
    expect(applyStructureDeltas(base, [])).toBe(base)
  })

  it('un delta absurde ne casse pas le calcul (fonction TOTALE)', () => {
    const out = applyStructureDeltas(base, [
      { kind: 'remove', number: '9.9.9' }, // inexistant
      { kind: 'relabel', number: '9.9.9', label: 'Fantôme' }, // inexistant
    ])
    expect(numbers(out)).toEqual(numbers(base))
  })

  it('un ajout PARENT+ENFANT arrive complet quel que soit l’ordre de saisie (M3)', () => {
    // Sans tri par profondeur, l'enfant saisi d'abord était perdu EN SILENCE : son parent
    // n'existait pas encore, le delta était ignoré, et le god croyait avoir publié la sous-branche.
    const deltas: CtdDelta[] = [
      { kind: 'add', number: '1.2.9.1', label: 'Attestation' },
      { kind: 'add', number: '1.2.9', label: 'Pharmacovigilance' },
    ]
    for (const order of [deltas, [...deltas].reverse()]) {
      const out = applyStructureDeltas(base, order)
      expect(numbers(out)).toContain('1.2.9')
      expect(numbers(out), JSON.stringify(order.map((d) => d.number))).toContain('1.2.9.1')
    }
  })
})
