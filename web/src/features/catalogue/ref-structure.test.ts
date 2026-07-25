import { describe, expect, it } from 'vitest'

import { getModule1Tree, type CtdNodeDef } from '@/features/workspace/module1-tree'
import { flattenTree } from '@/features/workspace/tree-utils'
import {
  applyStructureDeltas,
  deltaFromPayload,
  deltasFor,
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
