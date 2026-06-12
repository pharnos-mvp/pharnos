import { describe, expect, it } from 'vitest'

import type { DocumentRecord, DossierAttachmentRecord, GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from './module1-tree'
import {
  attachmentsForNode,
  buildViewables,
  completionStats,
  docsForNode,
  nextLeafAfter,
} from './dossier-selectors'

const node = (number: string, children?: CtdNodeDef[]): CtdNodeDef =>
  ({ id: `id-${number}`, number, label: `Nœud ${number}`, children }) as CtdNodeDef

const doc = (id: string, fileName = `${id}.pdf`): DocumentRecord =>
  ({ id, fileName, filePath: null }) as DocumentRecord

describe('docsForNode / attachmentsForNode (rattachement par préfixe)', () => {
  it('inclut le nœud lui-même et ses descendants, pas ses voisins', () => {
    const map = new Map([
      ['1.2.4.1', [doc('a')]],
      ['1.2.5', [doc('b')]],
      ['1.3', [doc('c')]],
    ])
    expect(docsForNode(map, node('1.2')).map((d) => d.id)).toEqual(['a', 'b'])
    expect(docsForNode(map, node('1.2.4.1')).map((d) => d.id)).toEqual(['a'])
    expect(docsForNode(map, node('1.4'))).toEqual([])
  })

  it('nœud racine sans numéro : ne matche jamais par préfixe', () => {
    const map = new Map<string, DossierAttachmentRecord[]>([
      ['1.1', [{ id: 'x', fileName: 'x.pdf', filePath: null } as DossierAttachmentRecord]],
    ])
    expect(attachmentsForNode(map, node(''))).toEqual([])
  })
})

describe('completionStats', () => {
  it('pourcentage de feuilles documentées', () => {
    const flat = [node('1', [node('1.1')]), node('1.1'), node('1.2'), node('1.3')]
    const counts: Record<string, number> = { '1.1': 2, '1.2': 0, '1.3': 1 }
    const { okCount, pct, leaves } = completionStats(flat, (n) => counts[n.number] ?? 0)
    expect(leaves.map((l) => l.number)).toEqual(['1.1', '1.2', '1.3'])
    expect(okCount).toBe(2)
    expect(pct).toBe(67)
  })

  it('arbre vide → 0 % sans division par zéro', () => {
    expect(completionStats([], () => 0).pct).toBe(0)
  })
})

describe('nextLeafAfter', () => {
  it('saute les sections parentes et renvoie la feuille suivante', () => {
    const flat = [node('1.1'), node('1.2', [node('1.2.1')]), node('1.2.1'), node('1.3')]
    expect(nextLeafAfter(flat, flat[0]!)?.number).toBe('1.2.1')
    expect(nextLeafAfter(flat, flat[2]!)?.number).toBe('1.3')
    expect(nextLeafAfter(flat, flat[3]!)).toBeNull()
  })
})

describe('buildViewables', () => {
  const gen = (templateKey: string): GeneratedDocRecord =>
    ({ id: 'g1', templateKey, title: 'Lettre de demande', sourceDocId: 's1' }) as GeneratedDocRecord

  it('lettre générée d’abord, puis pièces jointes, puis documents produit', () => {
    const out = buildViewables({
      selectedGenDocs: [gen('cover')],
      selectedAttachments: [
        { id: 'a1', fileName: 'a1.pdf', filePath: null } as DossierAttachmentRecord,
      ],
      selectedDocs: [doc('d1')],
      sourceNamesById: new Map(),
      targetLangLabel: 'FR',
    })
    expect(out.map((v) => v.kind)).toEqual(['letter', 'attachment', 'doc'])
    expect(out[0]!.label).toBe('Lettre de demande')
  })

  it('version conforme : onglet « <original>_CONFORME », coexiste avec la traduction', () => {
    const translation = {
      id: 'g1',
      templateKey: 'translation',
      title: 'RCP — traduction (FR)',
      sourceDocId: 's1',
    } as GeneratedDocRecord
    const upgrade = {
      id: 'g2',
      templateKey: 'upgrade',
      title: 'RCP — version conforme',
      sourceDocId: 'g1',
    } as GeneratedDocRecord
    const out = buildViewables({
      selectedGenDocs: [translation, upgrade],
      selectedAttachments: [],
      selectedDocs: [],
      sourceNamesById: new Map([
        ['s1', 'RCP_source.pdf'],
        ['g1', 'RCP — traduction (FR)'],
      ]),
      targetLangLabel: 'FR',
    })
    expect(out).toHaveLength(2) // les DEUX onglets coexistent sur le même nœud
    expect(out[0]).toMatchObject({
      kind: 'letter',
      isTranslation: true,
      label: 'RCP_source_FR.docx',
    })
    expect(out[1]).toMatchObject({
      kind: 'letter',
      isUpgrade: true,
      label: 'RCP — traduction (FR)_CONFORME',
    })
  })

  it('traduction : onglet nommé « <original>_<LANG>.docx »', () => {
    const out = buildViewables({
      selectedGenDocs: [gen('translation')],
      selectedAttachments: [],
      selectedDocs: [],
      sourceNamesById: new Map([['s1', 'RCP_source.pdf']]),
      targetLangLabel: 'FR',
    })
    expect(out[0]).toMatchObject({
      kind: 'letter',
      isTranslation: true,
      label: 'RCP_source_FR.docx',
    })
  })
})
