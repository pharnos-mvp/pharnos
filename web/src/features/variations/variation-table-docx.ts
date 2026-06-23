// Export .docx du tableau comparatif des modifications — table NATIVE `docx` (≠ moteur de lettres,
// qui est prose seule). Style maison : A4 marges 1 pouce, Times New Roman 12pt, en-tête navy #263F73.
// **Import dynamique** côté appelant (la lib `docx` reste hors du chunk principal).
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

import type { ComparisonTable } from './variation-table'

const NAVY = '263F73'
const FONT = 'Times New Roman'
const SZ = 22 // 11pt en demi-points (cellules)

const cellParas = (text: string, opts: { bold?: boolean; color?: string } = {}) =>
  String(text)
    .split(/\r?\n/)
    .map(
      (ln) =>
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: ln, bold: opts.bold, color: opts.color, font: FONT, size: SZ }),
          ],
        }),
    )

const headerCell = (text: string, pct: number) =>
  new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: cellParas(text, { bold: true, color: 'FFFFFF' }),
  })

const bodyCell = (text: string, pct: number) =>
  new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: cellParas(text),
  })

export function buildComparisonDocx(table: ComparisonTable): Document {
  // Largeurs en % depuis la table (varie si la colonne « Justification » est masquée).
  const colPct = table.colFractions.map((f) => Math.round(f * 100))
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: table.title, bold: true, color: NAVY, font: FONT, size: 28 })],
    }),
    ...table.meta.map(
      (m) =>
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${m.label} : `, bold: true, font: FONT, size: SZ }),
            new TextRun({ text: m.value, font: FONT, size: SZ }),
          ],
        }),
    ),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: colPct,
      rows: [
        new TableRow({
          tableHeader: true,
          children: table.headers.map((h, i) => headerCell(h, colPct[i] ?? 20)),
        }),
        ...table.rows.map(
          (r) => new TableRow({ children: r.map((c, i) => bodyCell(c, colPct[i] ?? 20)) }),
        ),
      ],
    }),
  ]

  if (table.footnote) {
    children.push(
      new Paragraph({
        spacing: { before: 160 },
        children: [new TextRun({ text: table.footnote, italics: true, font: FONT, size: 20 })],
      }),
    )
  }

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 en twips
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  })
}

export async function comparisonDocxBlob(table: ComparisonTable): Promise<Blob> {
  return Packer.toBlob(buildComparisonDocx(table))
}
