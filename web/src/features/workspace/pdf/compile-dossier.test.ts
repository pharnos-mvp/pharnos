import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import type { GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from '../module1-tree'
import {
  buildTdmLines,
  compileDossier,
  dataUrlToBytes,
  type CompileInput,
  type CompileNodeContent,
  type TdmEntry,
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
    productName: 'Doliprane',
    logo: null,
    autoStructural,
    contentByNumber,
  }
}

// PNG 1×1 transparent valide — pour tester l'embarquement en-tête/pied.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
function pngBytes(): Uint8Array {
  const bin = atob(PNG_1x1)
  const b = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i)
  return b
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

  it('en-tête/pied embarqués + noms longs : PDF valide (pas de troncature qui casse)', async () => {
    const inp = input(true)
    inp.titulaire = 'Laboratoires Pharmaceutiques de l’Afrique de l’Ouest et du Centre SARL'
    inp.commercialLine =
      'Co-Amoxiclav (Amoxicilline 500 mg + Acide clavulanique 125 mg), comprimé pelliculé'
    inp.header = { bytes: pngBytes(), isPng: true }
    inp.footer = { bytes: pngBytes(), isPng: true }
    const bytes = await compileDossier(inp)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4)
  })

  it('ajoute 2 pages de couverture (CTD global + Module 1) quand `cover` est fourni', async () => {
    const base = await PDFDocument.load(await compileDossier(input(true)))
    const withCover = input(true)
    withCover.cover = {
      activity: 'Nouvelle AMM',
      nomCommercial: 'Doliprane',
      dciDosage: 'Paracétamol 500 mg',
      titulaireName: 'Laboratoire X',
      titulaireAddress: '12 rue de la Santé, Cotonou',
      fabricantName: 'Usine Y',
      fabricantAddress: 'Zone industrielle, Casablanca',
      dateLabel: 'Juin 2026',
    }
    const withDoc = await PDFDocument.load(await compileDossier(withCover))
    expect(withDoc.getPageCount()).toBe(base.getPageCount() + 2)
  })

  it('sans pages auto : produit quand même un PDF', async () => {
    const bytes = await compileDossier(input(false))
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('TDM couvre tous les modules (1→5) avec n° de page pour le Module 1 peuplé', () => {
    const entries: TdmEntry[] = [
      { number: '1.1.1', label: 'Lettre de demande', depth: 1, startIndex: 2 },
    ]
    const lines = buildTdmLines(input(true), entries)

    // Un en-tête par module, dans l'ordre 1 → 5.
    const modules = lines.filter((l) => l.kind === 'module').map((l) => l.number)
    expect(modules).toEqual(['1', '2', '3', '4', '5'])

    // INDEX : les 5 modules listés.
    expect(lines.filter((l) => l.kind === 'index')).toHaveLength(5)

    // Le nœud Module 1 peuplé porte un startIndex (→ numéro de page) ; un nœud Module 3 non.
    expect(lines.find((l) => l.kind === 'entry' && l.number === '1.1.1')?.startIndex).toBe(2)
    const m3 = lines.find((l) => l.kind === 'entry' && l.number === '3.2.S.1')
    expect(m3).toBeDefined()
    expect(m3?.startIndex).toBeUndefined()
  })

  it('dataUrlToBytes décode une data URL PNG', () => {
    const r = dataUrlToBytes(`data:image/png;base64,${btoa('hi')}`)
    expect(r?.isPng).toBe(true)
    expect(r?.bytes.length).toBe(2)
  })
})
