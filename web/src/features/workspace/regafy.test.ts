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

describe('regafy (vérifications déterministes)', () => {
  it('dossier vide → erreur', () => {
    const f = runRegafy({ tree, titulaire: 'Labo', ...empty })
    expect(f.some((x) => x.severity === 'error' && x.message.includes('vide'))).toBe(true)
  })

  it('titulaire manquant → avertissement', () => {
    const f = runRegafy({ tree, titulaire: '  ', ...empty })
    expect(f.some((x) => x.message.includes('Titulaire'))).toBe(true)
  })

  it('section avec contenu non validée → info', () => {
    const genByNode = new Map([['1.1.1', gen('1.1.1', 'Bonjour')]])
    const f = runRegafy({
      tree,
      titulaire: 'Labo',
      docsByNode: new Map(),
      genByNode,
      attachByNode: new Map(),
    })
    expect(f.some((x) => x.severity === 'info' && x.nodeNumber === '1.1.1')).toBe(true)
  })

  it('placeholder restant → avertissement « à compléter »', () => {
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
