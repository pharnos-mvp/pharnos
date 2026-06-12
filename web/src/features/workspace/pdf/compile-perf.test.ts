import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import type { GeneratedDocRecord } from '@/lib/db'
import { getModule1Tree } from '../module1-tree'
import {
  compileDossier,
  type CompileInput,
  type CompileNodeContent,
  type CompilePiece,
} from './compile-dossier'

/**
 * Garde-fou perf du DoD (M6) : un dossier Module 1 UEMOA réaliste (lettres générées +
 * pièces PDF multi-pages) doit se compiler **bien en-dessous du budget de 10 s**.
 */

async function makePdf(pages: number, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595.28, 841.89])
    page.drawText(`${label} — page ${p + 1}/${pages}`, { x: 60, y: 790, size: 12, font })
    for (let i = 0; i < 42; i++) {
      page.drawText(
        `Ligne ${i + 1} : contenu réglementaire de démonstration pour mesurer la compilation PDF.`,
        { x: 60, y: 760 - i * 17, size: 10, font },
      )
    }
  }
  return doc.save()
}

function piece(bytes: Uint8Array, fileName: string): CompilePiece {
  return { bytes, mime: 'application/pdf', fileName }
}

function genLetter(nodeNumber: string, title: string): GeneratedDocRecord {
  return {
    id: `g-${nodeNumber}`,
    orgId: 'o',
    dossierId: 'd',
    nodeNumber,
    templateKey: 'cover',
    title,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Madame, Monsieur, ' },
            { type: 'text', text: title, marks: [{ type: 'bold' }] },
          ],
        },
        ...Array.from({ length: 8 }, () => ({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Paragraphe de corps de lettre réglementaire, suffisamment long pour occuper plusieurs lignes une fois rendu en PDF sur une page A4.',
            },
          ],
        })),
      ],
    },
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

describe('compileDossier — budget perf DoD (M6 : compile < 10 s)', () => {
  it('compile un dossier Module 1 UEMOA réaliste sous le budget', async () => {
    const tree = getModule1Tree('ctd')
    const contentByNumber = new Map<string, CompileNodeContent>()
    contentByNumber.set('1.1.1', {
      generated: [genLetter('1.1.1', 'Lettre de demande')],
      pieces: [],
    })
    contentByNumber.set('1.1.2', { generated: [genLetter('1.1.2', 'Lettre de PGHT')], pieces: [] })

    const specs: [node: string, name: string, pages: number][] = [
      ['1.3.1', 'RCP.pdf', 12],
      ['1.3.2', 'Notice.pdf', 6],
      ['1.3.3', 'Etiquetage.pdf', 2],
      ['1.2.4.1', 'BPF-GMP.pdf', 4],
      ['1.2.4.3', 'FSC.pdf', 2],
      ['1.2.3.2', 'COPP.pdf', 3],
      ['1.2.3.4', 'COA.pdf', 5],
      ['1.2.6.1', 'AMM.pdf', 3],
    ]
    let piecePages = 0
    for (const [node, name, pages] of specs) {
      piecePages += pages
      contentByNumber.set(node, {
        generated: [],
        pieces: [piece(await makePdf(pages, name), name)],
      })
    }

    const input: CompileInput = {
      tree,
      moduleLabel: 'Module 1',
      country: 'Bénin',
      titulaire: 'Laboratoire Démo SARL',
      commercialLine: 'Produit Démo (DCI 500 mg, comprimé)',
      productName: 'Produit Démo',
      logo: null,
      autoStructural: true,
      contentByNumber,
    }

    const t0 = performance.now()
    const bytes = await compileDossier(input)
    const ms = performance.now() - t0

    const doc = await PDFDocument.load(bytes)
    // Baseline mesurée localement : ~240 ms pour 59 pages → ~42× sous le budget de 10 s.
    // L'assertion garde une large marge pour rester non-flaky sur des runners CI lents.
    expect(bytes[0]).toBe(0x25) // en-tête %PDF
    expect(doc.getPageCount()).toBeGreaterThan(piecePages) // pièces + TDM + gardes + lettres
    expect(ms).toBeLessThan(10_000) // budget DoD M6
  })
})
