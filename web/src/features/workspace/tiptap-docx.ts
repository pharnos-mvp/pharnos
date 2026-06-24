import type { JSONContent } from '@tiptap/core'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

/**
 * Convertit un contenu ProseMirror/TipTap en **.docx** (Word) — pour télécharger une traduction
 * éditable. Couvre le sous-ensemble utilisé : paragraphes, titres, gras/italique, sauts de ligne,
 * listes à puces/numérotées **et tableaux** (extension-table). **Chargé en import dynamique** (la
 * lib `docx` reste hors du chunk d'entrée).
 */

function inlineRuns(nodes: JSONContent[] | undefined, opts?: { bold?: boolean }): TextRun[] {
  const runs: TextRun[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (n.type === 'text') {
      const marks = n.marks ?? []
      runs.push(
        new TextRun({
          text: n.text ?? '',
          bold: !!opts?.bold || marks.some((m) => m.type === 'bold' || m.type === 'strong'),
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

/** Convertit un bloc (titre / paragraphe / liste) en paragraphes Word. Réutilisé au niveau racine
 *  ET dans les cellules de tableau. `bold` force le gras (en-têtes de tableau). */
function blockParagraphs(block: JSONContent, opts?: { bold?: boolean }): Paragraph[] {
  switch (block.type) {
    case 'heading':
      return [
        new Paragraph({
          heading: headingFor(Number(block.attrs?.level ?? 2)),
          children: inlineRuns(block.content, opts),
        }),
      ]
    case 'paragraph':
      return [
        new Paragraph({
          alignment:
            block.attrs?.textAlign === 'center'
              ? AlignmentType.CENTER
              : block.attrs?.textAlign === 'right'
                ? AlignmentType.RIGHT
                : undefined,
          children: inlineRuns(block.content, opts),
        }),
      ]
    case 'bulletList':
      return (block.content ?? []).map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            children: inlineRuns(firstParagraph(item)?.content, opts),
          }),
      )
    case 'orderedList': {
      const out: Paragraph[] = []
      let i = 1
      for (const item of block.content ?? []) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${i}. ` }),
              ...inlineRuns(firstParagraph(item)?.content, opts),
            ],
          }),
        )
        i++
      }
      return out
    }
    default:
      return []
  }
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '999999' } as const
const TABLE_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
  insideHorizontal: CELL_BORDER,
  insideVertical: CELL_BORDER,
}

/** Span de fusion ≥ 2 → valeur Word ; 1/absent → défaut (undefined). */
function span(v: unknown): number | undefined {
  return typeof v === 'number' && v > 1 ? v : undefined
}

/** Paragraphes d'une cellule — au moins un (Word refuse une cellule vide). */
function cellParagraphs(cell: JSONContent, header: boolean): Paragraph[] {
  const out: Paragraph[] = []
  for (const b of cell.content ?? []) out.push(...blockParagraphs(b, { bold: header }))
  return out.length ? out : [new Paragraph({ children: [new TextRun({ text: '' })] })]
}

function tableFor(node: JSONContent): Table {
  const rows = (node.content ?? [])
    .filter((r) => r.type === 'tableRow')
    .map((row) => {
      const cellNodes = (row.content ?? []).filter(
        (c) => c.type === 'tableCell' || c.type === 'tableHeader',
      )
      const cells = cellNodes.map((cell) => {
        const header = cell.type === 'tableHeader'
        return new TableCell({
          children: cellParagraphs(cell, header),
          columnSpan: span(cell.attrs?.colspan),
          rowSpan: span(cell.attrs?.rowspan),
          shading: header ? { fill: 'F0F0F0' } : undefined,
        })
      })
      const isHeaderRow = cellNodes.length > 0 && cellNodes.every((c) => c.type === 'tableHeader')
      return new TableRow({
        children: cells.length
          ? cells
          : [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
              }),
            ],
        tableHeader: isHeaderRow,
      })
    })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: rows.length
      ? rows
      : [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
              }),
            ],
          }),
        ],
  })
}

export async function tiptapToDocxBlob(content: JSONContent): Promise<Blob> {
  const children: (Paragraph | Table)[] = []
  for (const block of content.content ?? []) {
    if (block.type === 'table') children.push(tableFor(block))
    else children.push(...blockParagraphs(block))
  }
  // Word veut un paragraphe après un tableau (sinon dernier bloc collé / ouverture bancale).
  if (children.length > 0 && children[children.length - 1] instanceof Table)
    children.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  const doc = new Document({
    sections: [{ children }],
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
  })
  return Packer.toBlob(doc)
}
