import type { JSONContent } from '@tiptap/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  createGeneratedDoc,
  deleteGeneratedDoc,
  listGeneratedDocs,
  regenerateGeneratedDoc,
  updateGeneratedDocContent,
} from './generated-docs-repository'
import type { TemplateContext } from './templates'

const ORG = 'org-1'

const ctx: TemplateContext = {
  nomCommercial: 'Doliprane',
  dci: 'Paracétamol',
  dosage: '500 mg',
  dciDosage: 'Paracétamol 500 mg',
  forme: 'Comprimé',
  presentation: 'boîte de 16',
  demandeurNom: 'Labo X',
  demandeurAdresse: '1 rue A, Abidjan',
  fabricantNom: 'Usine Y',
  fabricantAdresse: '2 rue B, Casablanca',
  agencyName: 'AIRP',
  agencyFull: 'Autorité Ivoirienne de Régulation Pharmaceutique',
  agencyCivilite: 'Monsieur le Directeur Général',
  agencyAdresse: 'Abidjan, Cocody',
  country: 'CI',
  ville: 'Abidjan',
  date: '7 juin 2026',
  poste: 'Responsable RA',
  signataire: 'Awa Koné',
  pght: '1 200',
}

beforeEach(async () => {
  await db.generatedDocs.clear()
  await db.outbox.clear()
})

describe('generated docs repository (offline-first)', () => {
  it('génère un document depuis un template (+ outbox create)', async () => {
    const g = await createGeneratedDoc(ORG, {
      dossierId: 'd1',
      nodeNumber: '1.1.1',
      templateKey: 'cover',
      context: ctx,
    })
    expect(g.title).toContain('AMM')
    expect(g.nodeNumber).toBe('1.1.1')
    expect(await listGeneratedDocs('d1')).toHaveLength(1)
    const outbox = await db.outbox.where('entity').equals('generated_doc').toArray()
    expect(outbox[0]?.op).toBe('create')
  })

  it('met à jour le contenu édité', async () => {
    const g = await createGeneratedDoc(ORG, {
      dossierId: 'd1',
      nodeNumber: '1.1.1',
      templateKey: 'cover',
      context: ctx,
    })
    const edited: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'contenu édité' }] }],
    }
    await updateGeneratedDocContent(g.id, edited)
    const after = await db.generatedDocs.get(g.id)
    expect(JSON.stringify(after?.content)).toContain('contenu édité')
  })

  it('régénère depuis le template (écrase, renvoie le contenu)', async () => {
    const g = await createGeneratedDoc(ORG, {
      dossierId: 'd1',
      nodeNumber: '1.1.2',
      templateKey: 'pght',
      context: ctx,
    })
    const content = await regenerateGeneratedDoc(g.id, { ...ctx, pght: '9 999' })
    expect(JSON.stringify(content)).toContain('9 999')
  })

  it('supprime (soft delete)', async () => {
    const g = await createGeneratedDoc(ORG, {
      dossierId: 'd1',
      nodeNumber: '1.1.1',
      templateKey: 'cover',
      context: ctx,
    })
    await deleteGeneratedDoc(g.id)
    expect(await listGeneratedDocs('d1')).toHaveLength(0)
  })
})
