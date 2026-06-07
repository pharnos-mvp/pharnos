import { describe, expect, it } from 'vitest'

import type { GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from './module1-tree'
import { runRegafy } from './regafy'

const tree: CtdNodeDef[] = [
  {
    id: 'a',
    number: '1.1',
    label: 'Correspondance',
    children: [{ id: 'b', number: '1.1.1', label: 'Lettre' }],
  },
]
const treeSaved: CtdNodeDef[] = [
  {
    id: 'a',
    number: '1.1',
    label: 'Correspondance',
    children: [{ id: 'b', number: '1.1.1', label: 'Lettre', savedAt: '2026-01-01T00:00:00Z' }],
  },
]

function gen(nodeNumber: string, text: string): GeneratedDocRecord {
  return {
    id: `g-${nodeNumber}`,
    orgId: 'o',
    dossierId: 'd',
    nodeNumber,
    templateKey: 'cover',
    title: 'Lettre',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

const empty = {
  docsByNode: new Map(),
  genByNode: new Map<string, GeneratedDocRecord>(),
  attachByNode: new Map(),
}

describe('regafy (vérifications déterministes, progressif)', () => {
  it("rien tant qu'aucune section n'est validée", () => {
    const genByNode = new Map([['1.1.1', gen('1.1.1', 'Bonjour')]])
    const f = runRegafy({
      tree,
      titulaire: 'Labo',
      docsByNode: new Map(),
      genByNode,
      attachByNode: new Map(),
    })
    expect(f).toHaveLength(0)
  })

  it('section validée sans document → avertissement + dossier vide', () => {
    const f = runRegafy({ tree: treeSaved, titulaire: 'Labo', ...empty })
    expect(f.some((x) => x.severity === 'warning' && x.nodeNumber === '1.1.1')).toBe(true)
    expect(f.some((x) => x.severity === 'error' && x.message.includes('vide'))).toBe(true)
  })

  it('titulaire manquant (après validation) → avertissement', () => {
    const f = runRegafy({ tree: treeSaved, titulaire: '  ', ...empty })
    expect(f.some((x) => x.message.includes('Titulaire'))).toBe(true)
  })

  it('placeholder restant → « à compléter »', () => {
    const genByNode = new Map([['1.1.1', gen('1.1.1', '[Ville] à compléter')]])
    const f = runRegafy({
      tree: treeSaved,
      titulaire: 'Labo',
      docsByNode: new Map(),
      genByNode,
      attachByNode: new Map(),
    })
    expect(f.some((x) => x.message.includes('compléter'))).toBe(true)
  })
})
