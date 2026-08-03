/**
 * Rendu Word d'un livrable d'upgrade — profil `document` (RCP / SmPC) et profil `report`.
 *
 * Fidèle au gabarit ABMed 2026 : Arial, A4, marges 2,5 cm, titres #0B3D92, sous-titres gras
 * soulignés. **Aucune marque de fournisseur** : c'est la pièce qui part à l'agence (étape 3 §3).
 *
 * Module PUR — `docx` seul, aucune API Node ni DOM. Il tourne à l'identique dans le navigateur
 * (livraison sur `/u/{token}`) et sous Node (banc d'essai U0).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LeaderType,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

import { type Block, dotOf, isMissing, runs } from './blocks'
import { BAND, BLUE, FONT, GREY, PT, RULE, SMALL_PT, TITLE_PT } from './style'

const TEXT_W = 9072 // largeur utile en twips (A4 − 2 × 2,5 cm)
const LEAD_RATIO = 0.56 // le conduit de points s'arrête à 56 % de la largeur
const LEADER_AT = Math.round(TEXT_W * LEAD_RATIO)
const UNIT_AT = LEADER_AT + 90

export interface DocxOptions {
  /** En-tête courant — le nom du produit. Absent de la première page, qui porte déjà le titre. */
  header: string
}

/**
 * ⚠️ **Le DOCX n'est PAS reproductible à l'octet, et ce n'est pas rattrapable ici.**
 *
 * `docx@9.7.1` inscrit l'instant de l'empaquetage dans `docProps/core.xml` (`dcterms:created` et
 * `dcterms:modified`, à la milliseconde) et son `IPropertiesOptions` n'expose aucun champ pour
 * l'injecter. Mesuré entrée par entrée : **les 26 autres entrées du paquet sont identiques**, y
 * compris `word/document.xml` — seul cet horodatage bouge.
 *
 * ⚠️ Et figer cette entrée ne suffirait pas : les **en-têtes locaux du ZIP** portent eux aussi un
 * horodatage, donc deux paquets resteraient différents à l'octet. La comparaison binaire d'un DOCX
 * est hors de portée sans réécrire l'empaqueteur — ce qui ne vaudrait pas son prix, Word réécrivant
 * ces métadonnées au premier enregistrement du client.
 *
 * Conséquence pour la recette U5 : la conformité du rendu navigateur au rendu serveur se vérifie
 * **à l'octet pour les PDF**, et **entrée par entrée, `docProps/core.xml` excepté**, pour les DOCX.
 */
export const DOCX_NONDETERMINISTIC_ENTRY = 'docProps/core.xml'

export function buildDeliverableDocx(blocks: readonly Block[], { header }: DocxOptions): Document {
  const common = { font: FONT, size: PT * 2 }
  const small = { font: FONT, size: SMALL_PT * 2, color: GREY }

  const para = (b: Block): (Paragraph | Table)[] => {
    if (b.t === 'title') {
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 320 },
          children: [
            new TextRun({ ...common, size: TITLE_PT * 2, bold: true, color: BLUE, text: b.text }),
          ],
        }),
      ]
    }
    if (b.t === 'h1' || b.t === 'h2') {
      return [
        new Paragraph({
          spacing: { before: b.t === 'h1' ? 280 : 220, after: 90 },
          children: [new TextRun({ ...common, bold: true, color: BLUE, text: b.text })],
        }),
      ]
    }
    if (b.t === 'sub') {
      return [
        new Paragraph({
          spacing: { before: 140, after: 60 },
          children: [new TextRun({ ...common, bold: true, underline: {}, text: b.text })],
        }),
      ]
    }
    if (b.t === 'lead') {
      // Puce écrite EN DUR, comme dans le PDF : les deux formats doivent être identiques, sans
      // dépendre du moteur de listes de Word. Deux taquets alignent nombres puis unités.
      return [
        new Paragraph({
          indent: { left: 340 },
          spacing: { after: 40 },
          tabStops: [
            { type: TabStopType.RIGHT, position: LEADER_AT, leader: LeaderType.DOT },
            { type: TabStopType.LEFT, position: UNIT_AT },
          ],
          children: [
            new TextRun({ ...common, text: `•  ${b.label}` }),
            new TextRun({ ...common, children: [new Tab(), b.num] }),
            new TextRun({ ...common, children: [new Tab(), b.unit] }),
          ],
        }),
      ]
    }
    if (b.t === 'bullet') {
      const dot = dotOf(b.text)
      return [
        new Paragraph({
          indent: { left: 340, hanging: 200 },
          spacing: { after: 60 },
          children: [
            new TextRun({ ...common, color: dot ?? undefined, text: '•  ' }),
            ...runs(b.text).map(
              (r) => new TextRun({ ...common, bold: r.bold, italics: r.italic, text: r.text }),
            ),
          ],
        }),
      ]
    }
    if (b.t === 'quote') {
      return b.lines.map(
        (l, i) =>
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: BAND },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 8 } },
            indent: { left: 200, right: 200 },
            spacing: {
              before: i ? 0 : 200,
              after: i === b.lines.length - 1 ? 240 : 100,
            },
            children: runs(l).map(
              (r) =>
                new TextRun({
                  ...common,
                  size: SMALL_PT * 2,
                  bold: r.bold || i === 0,
                  italics: r.italic,
                  text: r.text,
                }),
            ),
          }),
      )
    }
    if (b.t === 'table') {
      const [head, ...body] = b.rows
      // Voir le PDF : un markdown malformé peut produire un tableau sans en-tête. Ne rien rendre
      // vaut mieux que lever au milieu d'un livrable payé.
      if (!head) return []
      const row = (cells: readonly string[], isHead: boolean) =>
        new TableRow({
          tableHeader: isHead,
          children: cells.map((c) => {
            const dot = dotOf(c)
            return new TableCell({
              shading: isHead ? { type: ShadingType.CLEAR, fill: BAND } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [
                    ...(dot
                      ? [new TextRun({ ...common, size: SMALL_PT * 2, color: dot, text: '● ' })]
                      : []),
                    ...runs(c).map(
                      (r) =>
                        new TextRun({
                          ...common,
                          size: SMALL_PT * 2,
                          bold: r.bold || isHead,
                          italics: r.italic,
                          text: r.text,
                        }),
                    ),
                  ],
                }),
              ],
            })
          }),
        })
      const line = { style: BorderStyle.SINGLE, size: 2, color: RULE }
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: line,
            bottom: line,
            left: line,
            right: line,
            insideHorizontal: line,
            insideVertical: line,
          },
          rows: [row(head, true), ...body.map((r) => row(r, false))],
        }),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
      ]
    }
    const missing = isMissing(b.text)
    return [
      new Paragraph({
        spacing: { after: b.hard ? 0 : 120 },
        children: runs(b.text).map(
          (r) =>
            new TextRun({
              ...common,
              ...(missing ? { size: SMALL_PT * 2, color: GREY } : {}),
              bold: r.bold,
              italics: r.italic,
              text: r.text,
            }),
        ),
      }),
    ]
  }

  const pageNumberParagraph = () =>
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ ...small, children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES] }),
      ],
    })

  return new Document({
    // ⚠️ Ni « Pharnos » ni « Regafy » ici : le RCP part à l'agence et ne porte AUCUNE marque de
    // fournisseur (étape 3 §3) — une propriété Word est visible d'un clic droit, c'est une marque
    // comme une autre. Mais laisser le défaut de `docx`, `Un-named`, fait négligé sur une pièce
    // d'AMM. Le nom du produit est neutre, et vrai.
    creator: header,
    lastModifiedBy: header,
    styles: { default: { document: { run: { font: FONT, size: PT * 2 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1417, right: 1417, bottom: 1134, left: 1417 },
          },
          // ⚠️ `titlePage` appartient à `properties` : c'est lui qui émet `<w:titlePg/>` dans
          // `sectPr`. Posé au niveau de la section, il est ignoré EN SILENCE — Word retombe alors
          // sur l'en-tête par défaut, et la première page porte le bandeau qu'on voulait lui retirer.
          titlePage: true,
        },
        // Nom du produit en haut à DROITE, absent de la première page (elle porte déjà le titre).
        // Le pied ne porte que la pagination, à droite : aucune marque de fournisseur sur une pièce
        // qui part à l'agence.
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 120 },
                children: [new TextRun({ ...small, text: header })],
              }),
            ],
          }),
          first: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        footers: {
          default: new Footer({ children: [pageNumberParagraph()] }),
          first: new Footer({ children: [pageNumberParagraph()] }),
        },
        children: blocks.flatMap(para),
      },
    ],
  })
}
