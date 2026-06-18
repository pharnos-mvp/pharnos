// Export .docx des formulaires de templates — réplique des générateurs des gabarits CEO :
// Times New Roman 12pt, titres navy #263F73, sous-sous-titres noirs soulignés, page A4 marges
// 1 pouce, options cochées en puces, bandeaux gris (template Étiquetage ABMed). Le document
// exporté ne contient QUE les saisies et options cochées (champs vides omis), plus la
// structure officielle. **Import dynamique** côté appelant : la lib `docx` reste hors du
// chunk workspace (les helpers légers — nom d'export… — vivent dans form-types).
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  UnderlineType,
} from 'docx'

import type { Lang } from '@/lib/i18n-context'
import {
  fieldList,
  fieldText,
  resolveText,
  type TemplateFormDefinition,
  type TemplateFormState,
} from './form-types'

const NAVY = '263F73'
const BLACK = '000000'
const GRAY_BAND = 'D9D9D9'
const FONT = 'Times New Roman'
const SZ = 24 // 12pt en demi-points

const navyRun = (text: string) =>
  new TextRun({ text, bold: true, color: NAVY, font: FONT, size: SZ })
const blackRun = (text: string) => new TextRun({ text, color: BLACK, font: FONT, size: SZ })

const titleP = (t: string) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 280 },
    children: [navyRun(t)],
  })
const secP = (t: string) =>
  new Paragraph({ spacing: { before: 240, after: 100 }, children: [navyRun(t)] })
const subP = (t: string) =>
  new Paragraph({ spacing: { before: 180, after: 70 }, children: [navyRun(t)] })
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
/** Bandeau gris du template Étiquetage : titre navy bold sur fond gris, encadré fin. */
const bannerP = (t: string) =>
  new Paragraph({
    spacing: { before: 240, after: 110 },
    shading: { type: ShadingType.CLEAR, fill: GRAY_BAND },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
      left: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
      right: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
    },
    children: [navyRun(t)],
  })
const bodyP = (t: string) =>
  new Paragraph({
    spacing: { after: 90 },
    alignment: AlignmentType.JUSTIFIED,
    children: [blackRun(t)],
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
          children: [blackRun(ln)],
        }),
    )
const labelValueP = (label: string, value: string, suffix?: string) =>
  new Paragraph({
    spacing: { after: 90 },
    children: [blackRun(label), blackRun(value), ...(suffix ? [blackRun(suffix)] : [])],
  })
/** Sous-titre avec saisie inline (gabarit Notice) : libellé navy bold + valeur noire. */
const boldLabelValueP = (label: string, value: string) =>
  new Paragraph({ spacing: { after: 80 }, children: [navyRun(label), blackRun(value)] })
const checkedP = (text: string) =>
  new Paragraph({
    numbering: { reference: 'tplbul', level: 0 },
    spacing: { after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    children: [blackRun(text)],
  })

const isChecked = (state: TemplateFormState, key: string): boolean =>
  (state.checks[key] ?? []).includes(0)

export function buildFormDocument(
  def: TemplateFormDefinition,
  state: TemplateFormState,
  lang: Lang = 'fr',
): Document {
  const g = state.globals
  const v = (k: string) => (state.values[k] ?? '').trim()
  // Résolution bilingue ADDITIVE (mirror TemplatePreview) : EN si demandé ET disponible, sinon FR.
  const tx = (fr: string, en?: string) => fieldText(fr, en, lang)
  const children: Paragraph[] = []

  for (const b of def.model) {
    switch (b.type) {
      case 'title':
        children.push(titleP(tx(b.text, b.textEn)))
        break
      case 'sec':
        children.push(secP(tx(b.text, b.textEn).replace('\t', '  ')))
        break
      case 'sub':
        children.push(subP(tx(b.text, b.textEn).replace('\t', '  ')))
        break
      case 'subsub':
        children.push(subsubP(tx(b.text, b.textEn)))
        break
      case 'banner':
        children.push(bannerP(tx(b.text, b.textEn).replace('\t', '  ')))
        break
      case 'secDyn':
        children.push(secP(b.dynText(g).replace('\t', '  ')))
        break
      case 'subDyn':
        children.push(subP(b.dynText(g).replace('\t', '  ')))
        break
      case 'static':
        children.push(bodyP(tx(b.text, b.textEn)))
        break
      case 'dyn':
        children.push(bodyP(b.dynText(g)))
        break
      case 'rule':
        children.push(ruleP())
        break
      case 'bullets':
        for (const it of b.items) children.push(checkedP(resolveText(it, g)))
        break
      case 'line': {
        if (b.dependsOn && !isChecked(state, b.dependsOn)) break
        if (!v(b.key)) break
        children.push(
          b.label || b.suffix
            ? labelValueP(
                b.label ? tx(b.label, b.labelEn) : '',
                v(b.key),
                b.suffix ? tx(b.suffix, b.suffixEn) : undefined,
              )
            : bodyP(v(b.key)),
        )
        break
      }
      case 'para': {
        if (b.dependsOn && !isChecked(state, b.dependsOn)) break
        if (v(b.key)) for (const p of valueParas(state.values[b.key] ?? '')) children.push(p)
        break
      }
      case 'duree': {
        if (v(b.key)) children.push(bodyP(`${v(b.key)} ${lang === 'en' ? 'months' : 'mois'}`))
        break
      }
      case 'atc': {
        if (v(b.key)) children.push(labelValueP(tx(b.label, b.labelEn), v(b.key)))
        if (isChecked(state, b.chkKey)) children.push(bodyP(`${tx(b.chkLabel, b.chkLabelEn)}.`))
        break
      }
      case 'checks': {
        const picked = state.checks[b.key] ?? []
        fieldList(b.options, b.optionsEn, lang).forEach((opt, i) => {
          if (picked.includes(i)) children.push(checkedP(opt))
        })
        break
      }
      case 'check': {
        if (!isChecked(state, b.key)) break
        const text = b.exportText ? b.exportText(state, g) : resolveText(b.text, g)
        children.push(b.asHeading ? subP(text) : bodyP(text))
        break
      }
      case 'subSelect': {
        const chosen = state.selects[b.key] ?? ''
        if (!chosen) break
        children.push(subP(b.headingText ? b.headingText(chosen) : `${b.before}${chosen}`))
        break
      }
      case 'subLine': {
        if (v(b.key)) children.push(boldLabelValueP(b.before, v(b.key)))
        break
      }
    }
  }

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering: {
      config: [
        {
          reference: 'tplbul',
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

export async function formDocxBlob(
  def: TemplateFormDefinition,
  state: TemplateFormState,
  lang: Lang = 'fr',
): Promise<Blob> {
  return Packer.toBlob(buildFormDocument(def, state, lang))
}
