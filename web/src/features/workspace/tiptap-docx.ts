import type { JSONContent } from '@tiptap/core'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

/**
 * Convertit un contenu ProseMirror/TipTap en **.docx** (Word) — pour télécharger une traduction
 * éditable. Couvre le sous-ensemble utilisé : paragraphes, titres, gras/italique, sauts de ligne,
 * listes à puces/numérotées. **Chargé en import dynamique** (la lib `docx` reste hors du chunk
 * d'entrée). Même parcours de nœuds que `generated-doc-html.ts`.
 */

function inlineRuns(nodes: JSONContent[] | undefined): TextRun[] {
  const runs: TextRun[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (n.type === 'text') {
      const marks = n.marks ?? []
      runs.push(
        new TextRun({
          text: n.text ?? '',
          bold: marks.some((m) => m.type === 'bold' || m.type === 'strong'),
          italics: marks.some((m) => m.type === 'italic'),
        }),
      )
    }
  }
  return runs.length ? runs : [new TextRun({ text: '' })]
}

function headingFor(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (level <= 1) return HeadingLevel.HEADING_1
  if (level >= 3) return HeadingLevel.HEADING_3
  return HeadingLevel.HEADING_2
}

function firstParagraph(item: JSONContent): JSONContent | undefined {
  return (item.content ?? []).find((x) => x.type === 'paragraph')
}

export async function tiptapToDocxBlob(content: JSONContent): Promise<Blob> {
  const paras: Paragraph[] = []
  for (const block of content.content ?? []) {
    switch (block.type) {
      case 'heading':
        paras.push(
          new Paragraph({
            heading: headingFor(Number(block.attrs?.level ?? 2)),
            children: inlineRuns(block.content),
          }),
        )
        break
      case 'paragraph':
        paras.push(
          new Paragraph({
            alignment: block.attrs?.textAlign === 'center' ? AlignmentType.CENTER : undefined,
            children: inlineRuns(block.content),
          }),
        )
        break
      case 'bulletList':
        for (const item of block.content ?? []) {
          paras.push(
            new Paragraph({
              bullet: { level: 0 },
              children: inlineRuns(firstParagraph(item)?.content),
            }),
          )
        }
        break
      case 'orderedList': {
        let i = 1
        for (const item of block.content ?? []) {
          paras.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${i}. ` }),
                ...inlineRuns(firstParagraph(item)?.content),
              ],
            }),
          )
          i++
        }
        break
      }
      default:
        break
    }
  }
  if (paras.length === 0) paras.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  const doc = new Document({
    sections: [{ children: paras }],
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
  })
  return Packer.toBlob(doc)
}
