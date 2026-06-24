import type { JSONContent } from '@tiptap/core'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { tiptapToDocxBlob } from './tiptap-docx'

const tableDoc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Comparatif :' }] },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rubrique' }] }],
            },
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valeur' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dosage' }] }],
            },
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '500 mg' }] }],
            },
          ],
        },
      ],
    },
  ],
}

async function documentXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.async('string')
}

describe('tiptapToDocxBlob — tableaux', () => {
  it('exporte un tableau et préserve le texte des cellules (zéro perte au .docx)', async () => {
    const blob = await tiptapToDocxBlob(tableDoc)
    expect(blob.size).toBeGreaterThan(0)
    const xml = await documentXml(blob)
    // Le tableau et le texte de chaque cellule sont présents dans le document Word.
    expect(xml).toContain('<w:tbl>')
    for (const cell of ['Rubrique', 'Valeur', 'Dosage', '500 mg']) expect(xml).toContain(cell)
  })

  it('reste compatible avec le contenu sans tableau (paragraphes/listes)', async () => {
    const blob = await tiptapToDocxBlob({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titre' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'point' }] }],
            },
          ],
        },
      ],
    })
    const xml = await documentXml(blob)
    expect(xml).toContain('Titre')
    expect(xml).toContain('point')
    expect(xml).not.toContain('<w:tbl>')
  })
})
