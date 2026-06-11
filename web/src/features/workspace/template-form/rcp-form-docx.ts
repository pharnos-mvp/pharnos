// Export .docx du formulaire RCP — réplique du générateur du gabarit CEO
// (RCP_formulaire_interactif.html) : Times New Roman 12pt, titres navy #263F73, sous-sous-titres
// noirs soulignés, page A4 marges 1 pouce, options cochées en puces. Le document exporté ne
// contient QUE les saisies et les options cochées (champs vides omis), plus la structure
// officielle. **Import dynamique** côté appelant : la lib `docx` reste hors du chunk d'entrée.
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from 'docx'

import { RCP_FORM_MODEL, type RcpFormState } from './rcp-form-model'

const NAVY = '263F73'
const BLACK = '000000'
const FONT = 'Times New Roman'
const SZ = 24 // 12pt en demi-points

const titleP = (t: string) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 280 },
    children: [new TextRun({ text: t, bold: true, color: NAVY, font: FONT, size: SZ })],
  })
const secP = (t: string) =>
  new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text: t, bold: true, color: NAVY, font: FONT, size: SZ })],
  })
const subP = (t: string) =>
  new Paragraph({
    spacing: { before: 180, after: 70 },
    children: [new TextRun({ text: t, bold: true, color: NAVY, font: FONT, size: SZ })],
  })
const subsubP = (t: string) =>
  new Paragraph({
    spacing: { before: 110, after: 40 },
    children: [
      new TextRun({
        text: t,
        bold: true,
        underline: { type: UnderlineType.SINGLE },
        color: BLACK,
        font: FONT,
        size: SZ,
      }),
    ],
  })
const bodyP = (t: string) =>
  new Paragraph({
    spacing: { after: 90 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text: t, color: BLACK, font: FONT, size: SZ })],
  })
const ruleP = () =>
  new Paragraph({
    spacing: { before: 200, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
    children: [new TextRun({ text: '', font: FONT, size: SZ })],
  })
/** Valeur multiligne → un paragraphe par ligne (lignes vides préservées). */
const valueParas = (text: string) =>
  String(text)
    .split(/\r?\n/)
    .map(
      (ln) =>
        new Paragraph({
          spacing: { after: 90 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: ln, color: BLACK, font: FONT, size: SZ })],
        }),
    )
const labelValueP = (label: string, value: string) =>
  new Paragraph({
    spacing: { after: 90 },
    children: [
      new TextRun({ text: label, color: BLACK, font: FONT, size: SZ }),
      new TextRun({ text: value, color: BLACK, font: FONT, size: SZ }),
    ],
  })
const checkedP = (text: string) =>
  new Paragraph({
    numbering: { reference: 'rcpbul', level: 0 },
    spacing: { after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, color: BLACK, font: FONT, size: SZ })],
  })

export function buildRcpFormDocument(state: RcpFormState): Document {
  const children: Paragraph[] = []
  for (const b of RCP_FORM_MODEL) {
    switch (b.type) {
      case 'title':
        children.push(titleP(b.text ?? ''))
        break
      case 'sec':
        children.push(secP(b.text ?? ''))
        break
      case 'sub':
        children.push(subP(b.text ?? ''))
        break
      case 'subsub':
        children.push(subsubP(b.text ?? ''))
        break
      case 'static':
        children.push(bodyP(b.text ?? ''))
        break
      case 'rule':
        children.push(ruleP())
        break
      case 'line': {
        const v = (state.values[b.key] ?? '').trim()
        if (!v) break
        children.push(b.label ? labelValueP(b.label, v) : bodyP(v))
        break
      }
      case 'para': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) for (const p of valueParas(state.values[b.key] ?? '')) children.push(p)
        break
      }
      case 'duree': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) children.push(bodyP(`${v} mois`))
        break
      }
      case 'atc': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) children.push(labelValueP(b.label, v))
        if ((state.checks[b.chkKey] ?? []).includes(0)) children.push(bodyP(`${b.chkLabel}.`))
        break
      }
      case 'checks': {
        const picked = state.checks[b.key] ?? []
        b.options.forEach((opt, i) => {
          if (picked.includes(i)) children.push(checkedP(opt))
        })
        break
      }
    }
  }

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering: {
      config: [
        {
          reference: 'rcpbul',
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
            size: { width: 11906, height: 16838 }, // A4 en twips
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  })
}

export async function rcpFormDocxBlob(state: RcpFormState): Promise<Blob> {
  return Packer.toBlob(buildRcpFormDocument(state))
}
