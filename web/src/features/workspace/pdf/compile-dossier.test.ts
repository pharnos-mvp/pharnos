import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import type { GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from '../module1-tree'
import {
  compileDossier,
  dataUrlToBytes,
  type CompileInput,
  type CompileNodeContent,
} from './compile-dossier'

function gen(nodeNumber: string): GeneratedDocRecord {
  return {
    id: `g-${nodeNumber}`,
    orgId: 'o',
    dossierId: 'd',
    nodeNumber,
    templateKey: 'cover',
    title: 'Lettre',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bonjour ' },
            { type: 'text', text: 'en gras', marks: [{ type: 'bold' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'un point' }] }],
            },
          ],
        },
      ],
    },
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

const tree: CtdNodeDef[] = [
  {
    number: '1.1',
    label: 'Correspondance',
    children: [{ number: '1.1.1', label: 'Lettre de demande' }],
  },
  { number: '1.3', label: 'Produit', children: [{ number: '1.3.1', label: 'RCP' }] },
]

function input(autoStructural: boolean): CompileInput {
  const contentByNumber = new Map<string, CompileNodeContent>()
  contentByNumber.set('1.1.1', { generated: gen('1.1.1'), pieces: [] })
  return {
    tree,
    moduleLabel: 'Module 1',
    country: "Côte d'Ivoire",
    titulaire: 'Laboratoire X',
    commercialLine: 'Doliprane (Paracétamol 500 mg)',
    logo: null,
    autoStructural,
    contentByNumber,
  }
}

describe('compileDossier (compilation PDF)', () => {
  it('produit un PDF valide : TDM + garde + annonce + lettre', async () => {
    const bytes = await compileDossier(input(true))
    expect(bytes.length).toBeGreaterThan(800)
    // En-tête %PDF
    expect(bytes[0]).toBe(0x25)
    expect(bytes[1]).toBe(0x50)
    const doc = await PDFDocument.load(bytes)
    // TDM(1) + garde 1.1 + annonce 1.1.1 + lettre(≥1) ; la section 1.3 sans contenu est exclue
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4)
  })

  it('sans pages auto : produit quand même un PDF', async () => {
    const bytes = await compileDossier(input(false))
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('dataUrlToBytes décode une data URL PNG', () => {
    const r = dataUrlToBytes(`data:image/png;base64,${btoa('hi')}`)
    expect(r?.isPng).toBe(true)
    expect(r?.bytes.length).toBe(2)
  })
})
