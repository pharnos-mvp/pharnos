// Export DOCX des lettres (cover/PGHT) — **importé à la demande** (clic « DOCX ») pour garder la
// lib `docx` hors du chunk de la Bibliothèque (mirror form-docx). Générique sur les nœuds des
// lettres (cf. letter-render) → source unique du contenu = templates.ts. Times New Roman 12pt, A4.
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from 'docx'
import type { JSONContent } from '@tiptap/core'

import { isBoldNode } from './letter-render'

const FONT = 'Times New Roman'
const SZ = 24 // 12pt en demi-points

function inlineRuns(nodes: JSONContent[] | undefined): TextRun[] {
  return (nodes ?? []).flatMap((n) => {
    if (n.type === 'hardBreak') return [new TextRun({ break: 1, font: FONT, size: SZ })]
    if (n.type === 'text')
      return [new TextRun({ text: n.text ?? '', bold: isBoldNode(n), font: FONT, size: SZ })]
    return []
  })
}

export function letterDocToDocx(doc: JSONContent): Document {
  const children: Paragraph[] = []
  for (const n of doc.content ?? []) {
    if (n.type === 'paragraph') {
      children.push(
        new Paragraph({
          alignment: n.attrs?.textAlign === 'right' ? AlignmentType.RIGHT : AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: inlineRuns(n.content),
        }),
      )
    } else if (n.type === 'bulletList') {
      for (const li of n.content ?? []) {
        const p = (li.content ?? [])[0]
        children.push(
          new Paragraph({
            numbering: { reference: 'lbul', level: 0 },
            spacing: { after: 60 },
            children: inlineRuns(p?.content),
          }),
        )
      }
    }
  }
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering: {
      config: [
        {
          reference: 'lbul',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  })
}

export async function letterDocxBlob(doc: JSONContent): Promise<Blob> {
  return Packer.toBlob(letterDocToDocx(doc))
}
