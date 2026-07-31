/**
 * Génère les MODÈLES OFFICIELS servis par la Bibliothèque réglementaire de pharnos.com.
 *
 *   Régénérer : `npm run build:landing-modeles` (depuis web/). À relancer après toute modif de
 *   `lib/modeles-source.mjs`, de `landing/checking/vigilance.js` ou du référentiel d'agences,
 *   puis COMMITTER la sortie — `landing/` est déployé tel quel, sans build.
 *
 * CE QUI EST PRODUIT, par document (et par pays quand il varie) :
 *   • un PDF français — l'aperçu du lecteur ;
 *   • un ZIP de téléchargement : le DOCX français (la version à déposer) et, pour les documents
 *     bilingues, un DOCX anglais DE COURTOISIE qui l'annonce en tête — la version opposable est
 *     la française. Les formulaires OMS (QOS-PD, BTIF) sont anglais par nature : fichier unique.
 *
 * LES LETTRES suivent la mise en page du moteur de lettres du builder (`pdf/compile-dossier`) :
 * Times 12, interligne 1,45, marges 2,5 cm, blocs « à droite » décalés à 56 % de la largeur puis
 * ALIGNÉS À GAUCHE. Leur bloc destinataire vient du même référentiel d'agences que les lettres
 * compilées des dossiers (`roadmap-data.ts`) — civilité, agence, adresse déjà en production.
 *
 * ⚠️ AUCUNE MARQUE PHARNOS dans les documents : ils repartent dans des dossiers d'AMM.
 * PIÈGE PDF payé : UNE CHAÎNE ENTIÈRE par ligne, jamais mot à mot (extractibilité).
 */
import {
  AlignmentType,
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
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import { PAYS } from '../../landing/checking/referentiel.js'
import {
  VIG_CANAL_NEUTRE,
  VIG_CORPS,
  VIG_TITRE,
  VIGILANCE,
  vigCanalNomme,
} from '../../landing/checking/vigilance.js'
// Node ≥ 23 exécute le TypeScript par retrait des types : le référentiel d'agences est celui des
// lettres DU BUILDER — même source, mêmes destinataires, aucune divergence possible.
import {
  agencyCivilite,
  agencyCiviliteEn,
  agencyFor,
} from '../src/features/workspace/roadmap-data.ts'
import { DOCS, varieParPays } from './lib/modeles-source.mjs'

const RACINE = path.resolve(import.meta.dirname, '../..')
const SORTIE = path.join(RACINE, 'landing', 'modeles')
const MANIFESTE = path.join(RACINE, 'landing', 'checking', 'modeles-manifest.js')

/** Version du contenu — à incrémenter à CHAQUE modification de source, vigilance ou agences. */
const VERSION = '2026.3'

/** Date figée : sans elle, deux exécutions produisent des octets différents. */
const FIGEE = new Date('2026-07-30T00:00:00Z')

/* ═══════════════ traduction de courtoisie du bloc 4.8 ═══════════════ */

const VIG_EN = {
  titre: 'Reporting of suspected adverse reactions',
  corps:
    'Reporting suspected adverse reactions after authorisation of the medicinal product is ' +
    'important. It allows continued monitoring of the benefit/risk balance of the medicinal product.',
  canalNeutre:
    'Healthcare professionals report any suspected adverse reaction via the national ' +
    'pharmacovigilance system.',
  canalNomme: (contact) =>
    `Healthcare professionals report any suspected adverse reaction via the national reporting ` +
    `system: ${contact}.`,
}

/** Avertissement en tête de TOUTE version anglaise : la version opposable est la française. */
const AVERTISSEMENT_EN = [
  { t: 'part', x: 'ENGLISH COURTESY VERSION' },
  {
    t: 'p',
    x:
      'This English version is provided so you can fully understand the document. The version to ' +
      'be filed with the authority must be in FRENCH — use the French file included in this ' +
      'download.',
  },
]

/* ═══════════════ résolution du contenu (pays + langue) ═══════════════ */

const codeAgence = (k) => k.toUpperCase()

/**
 * Développe les blocs pour un pays et une langue. `vig`, `agence` et `salut` sont résolus ici ;
 * les autres blocs choisissent `en` quand elle existe, sinon gardent le texte.
 */
function resoudre(doc, pays, langue) {
  const tx = (b) => (langue === 'en' && b.en ? b.en : b.x)
  const out = []
  for (const b of doc.blocks) {
    if (b.t === 'vig') {
      if (!pays) throw new Error(`${doc.slug} contient un bloc vig mais n'est pas décliné par pays`)
      const v = VIGILANCE[pays]
      if (langue === 'en') {
        const canal = v.contact ? VIG_EN.canalNomme(v.contact) : VIG_EN.canalNeutre
        out.push({ t: 'h3', x: VIG_EN.titre }, { t: 'p', x: `${VIG_EN.corps} ${canal}` })
        if (v.extra)
          out.push({
            t: 'p',
            x: 'Notification may also be made through the national Med Safety application.',
          })
      } else {
        const canal = v.contact ? vigCanalNomme(v.contact) : VIG_CANAL_NEUTRE
        out.push({ t: 'h3', x: VIG_TITRE }, { t: 'p', x: `${VIG_CORPS} ${canal}` })
        if (v.extra) out.push({ t: 'p', x: v.extra })
      }
      continue
    }
    if (b.t === 'agence') {
      if (!pays)
        throw new Error(`${doc.slug} contient un bloc agence mais n'est pas décliné par pays`)
      const ag = agencyFor(codeAgence(pays))
      const civ = langue === 'en' ? agencyCiviliteEn() : agencyCivilite(ag)
      out.push(
        { t: 'right', x: civ },
        { t: 'right', x: ag.name ? `${ag.full} (${ag.name})` : ag.full },
        { t: 'right', x: ag.adresse },
      )
      continue
    }
    if (b.t === 'salut') {
      if (!pays)
        throw new Error(`${doc.slug} contient un bloc salut mais n'est pas décliné par pays`)
      const ag = agencyFor(codeAgence(pays))
      out.push({ t: 'p', x: `${langue === 'en' ? agencyCiviliteEn() : agencyCivilite(ag)},` })
      continue
    }
    if (b.t === 'table') {
      out.push({ t: 'table', rows: langue === 'en' && b.rowsEn ? b.rowsEn : b.rows })
      continue
    }
    out.push({ t: b.t, x: tx(b) })
  }
  return langue === 'en' ? [...AVERTISSEMENT_EN, ...out] : out
}

/* ═══════════════ mise en page ═══════════════ */

const A4 = { l: 595.28, h: 841.89 }

/** Deux gabarits : `document` (maquettes ABMed/OMS, Helvetica) et `lettre` — la mise en page du
 *  moteur de lettres du builder : Times 12, interligne 1,45, marges 2,5 cm, blocs décalés à 56 %. */
const GABARITS = {
  document: {
    marge: { g: 56, d: 56, haut: 56, bas: 62 },
    fontes: { reg: StandardFonts.Helvetica, gras: StandardFonts.HelveticaBold },
    fonteDocx: 'Arial',
    style: {
      doctitle: { taille: 13, gras: true, centre: true, avant: 0, apres: 18 },
      part: { taille: 11.5, gras: true, centre: true, avant: 20, apres: 10 },
      h1: { taille: 11, gras: true, avant: 14, apres: 4 },
      h2: { taille: 10.5, gras: true, avant: 11, apres: 3 },
      h3: { taille: 10.5, gras: true, avant: 8, apres: 2 },
      p: { taille: 10.5, avant: 0, apres: 5 },
      li: { taille: 10.5, avant: 0, apres: 5, puce: true },
      right: { taille: 10.5, avant: 0, apres: 5, droite: true },
    },
    inter: (taille) => taille * 1.39,
  },
  lettre: {
    marge: { g: 70.9, d: 70.9, haut: 70.9, bas: 70.9 },
    fontes: { reg: StandardFonts.TimesRoman, gras: StandardFonts.TimesRomanBold },
    fonteDocx: 'Times New Roman',
    style: {
      doctitle: { taille: 13, gras: true, centre: true, avant: 0, apres: 16 },
      part: { taille: 12, gras: true, centre: true, avant: 4, apres: 8 },
      h1: { taille: 12, gras: true, avant: 10, apres: 4 },
      h2: { taille: 12, gras: true, avant: 8, apres: 3 },
      h3: { taille: 12, gras: true, avant: 8, apres: 4 },
      p: { taille: 12, avant: 0, apres: 7 },
      li: { taille: 12, avant: 0, apres: 4, puce: true },
      right: { taille: 12, avant: 0, apres: 4, droite: true },
    },
    inter: (taille) => taille * 1.45,
  },
}

/** Bloc « à droite » des lettres : décalé à 56 % de la largeur du contenu puis aligné à GAUCHE —
 *  la recette exacte du moteur (`RIGHT_BLOCK_INDENT = CONTENT_WIDTH * 0.56`). */
const INDENT_DROIT = 0.56

/* ═══════════════ PDF ═══════════════ */

const REMPLACEMENTS = new Map([
  ['‑', '-'],
  [' ', ' '],
  [' ', ' '],
])
const WINANSI_OK = /^[ -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]*$/

function assainir(texte, ou) {
  let s = texte
  for (const [de, vers] of REMPLACEMENTS) s = s.split(de).join(vers)
  if (!WINANSI_OK.test(s)) {
    const mauvais = [...s].find((c) => !WINANSI_OK.test(c))
    throw new Error(
      `Caractère non codable en WinAnsi : « ${mauvais} » (U+${mauvais.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) dans ${ou} — « ${s.slice(0, 70)} »`,
    )
  }
  return s
}

function lignes(texte, font, taille, largeur) {
  const out = []
  for (const brut of texte.split('\n')) {
    let ligne = ''
    for (const mot of brut.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (font.widthOfTextAtSize(essai, taille) <= largeur) {
        ligne = essai
        continue
      }
      if (ligne) out.push(ligne)
      ligne = mot
      while (font.widthOfTextAtSize(ligne, taille) > largeur && ligne.length > 1) {
        let n = ligne.length
        while (n > 1 && font.widthOfTextAtSize(ligne.slice(0, n), taille) > largeur) n--
        out.push(ligne.slice(0, n))
        ligne = ligne.slice(n)
      }
    }
    out.push(ligne)
  }
  return out
}

async function versPdf(doc, blocs, paysNom) {
  const G = GABARITS[doc.layout === 'lettre' ? 'lettre' : 'document']
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.nom[0]} — modèle officiel`)
  pdf.setSubject(paysNom ? `Modèle officiel — ${paysNom}` : 'Modèle officiel')
  pdf.setCreationDate(FIGEE)
  pdf.setModificationDate(FIGEE)

  const reg = await pdf.embedFont(G.fontes.reg)
  const gras = await pdf.embedFont(G.fontes.gras)
  const largeur = A4.l - G.marge.g - G.marge.d

  const pages = []
  let page = null
  let y = 0
  const nouvellePage = () => {
    page = pdf.addPage([A4.l, A4.h])
    pages.push(page)
    y = A4.h - G.marge.haut
  }
  nouvellePage()

  const ENCRE = rgb(0.07, 0.09, 0.13)
  for (const b of blocs) {
    if (b.t === 'break') {
      nouvellePage()
      continue
    }
    if (b.t === 'table') {
      // La lettre PGHT EST un tableau : une grille réelle, pas des lignes de texte. Une cellule
      // reste sur une ligne — on échoue si elle déborde plutôt que de la tronquer.
      const cols = b.rows[0].length
      const wCol = largeur / cols
      const hL = 22
      y -= 6
      for (const [ri, row] of b.rows.entries()) {
        if (y - hL < G.marge.bas) nouvellePage()
        const font = ri === 0 ? gras : reg
        for (const [ci, cell] of row.entries()) {
          const s = assainir(String(cell), `${doc.slug}/table`)
          if (font.widthOfTextAtSize(s, 9) > wCol - 10)
            throw new Error(`table ${doc.slug} : cellule trop large « ${s} »`)
          const x0 = G.marge.g + ci * wCol
          page.drawRectangle({
            x: x0,
            y: y - hL,
            width: wCol,
            height: hL,
            borderColor: ENCRE,
            borderWidth: 0.7,
          })
          page.drawText(s, { x: x0 + 5, y: y - hL + 7, size: 9, font, color: ENCRE })
        }
        y -= hL
      }
      y -= 8
      continue
    }
    const st = G.style[b.t]
    if (!st) throw new Error(`bloc inconnu « ${b.t} » dans ${doc.slug}`)
    const font = st.gras ? gras : reg
    const puce = st.puce ? '• ' : ''
    const retraitPuce = st.puce ? 14 : 0
    const retraitDroit = st.droite ? largeur * INDENT_DROIT : 0
    const retrait = retraitPuce + retraitDroit
    const texte = assainir(puce + b.x, `${doc.slug}/${b.t}`)
    const ls = lignes(texte, font, st.taille, largeur - retrait)
    const inter = G.inter(st.taille)

    y -= st.avant
    for (const l of ls) {
      if (y < G.marge.bas) nouvellePage()
      const x = st.centre
        ? G.marge.g + (largeur - font.widthOfTextAtSize(l, st.taille)) / 2
        : G.marge.g + retrait
      page.drawText(l, { x, y: y - st.taille, size: st.taille, font, color: ENCRE })
      y -= inter
    }
    y -= st.apres
  }

  const total = pages.length
  pages.forEach((p, i) => {
    const pied = paysNom
      ? `${doc.source[0]} — ${paysNom} — ${i + 1} / ${total}`
      : `${doc.source[0]} — ${i + 1} / ${total}`
    const s = assainir(pied, `${doc.slug}/pied`)
    p.drawText(s, {
      x: A4.l - G.marge.d - reg.widthOfTextAtSize(s, 7.5),
      y: 34,
      size: 7.5,
      font: reg,
      color: rgb(0.55, 0.58, 0.62),
    })
  })

  return { octets: Buffer.from(await pdf.save()), pages: total }
}

/* ═══════════════ DOCX ═══════════════ */

const HEADING = {
  doctitle: HeadingLevel.TITLE,
  part: HeadingLevel.HEADING_1,
  h1: HeadingLevel.HEADING_2,
  h2: HeadingLevel.HEADING_3,
  h3: HeadingLevel.HEADING_4,
}

/** 56 % de la largeur utile (16 cm) en vingtièmes de point : le décalage des blocs « à droite ». */
const INDENT_DOCX = Math.round(16 * 0.56 * 567)

async function versDocx(doc, blocs, paysNom) {
  const G = GABARITS[doc.layout === 'lettre' ? 'lettre' : 'document']
  const enfants = blocs.map((b) => {
    if (b.t === 'break') return new Paragraph({ text: '', pageBreakBefore: true })
    if (b.t === 'table') {
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: b.rows.map(
          (row, ri) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: String(cell),
                            bold: ri === 0,
                            size: 19,
                            font: G.fonteDocx,
                          }),
                        ],
                      }),
                    ],
                  }),
              ),
            }),
        ),
      })
    }
    const st = G.style[b.t]
    return new Paragraph({
      heading: HEADING[b.t],
      alignment: st.centre ? AlignmentType.CENTER : AlignmentType.LEFT,
      // Bloc « à droite » du moteur de lettres : DÉCALÉ à 56 %, aligné à gauche — pas un
      // alignement droit, qui ferait flotter chaque ligne différemment.
      indent: st.droite ? { left: INDENT_DOCX } : undefined,
      bullet: st.puce ? { level: 0 } : undefined,
      spacing: { before: st.avant * 20, after: st.apres * 20 },
      children: [new TextRun({ text: b.x, bold: st.gras, size: st.taille * 2, font: G.fonteDocx })],
    })
  })

  const d = new Document({
    creator: doc.source[0],
    title: `${doc.nom[0]} — modèle officiel`,
    description: paysNom ? `Modèle officiel — ${paysNom}` : 'Modèle officiel',
    lastModifiedBy: doc.source[0],
    styles: { default: { document: { run: { font: G.fonteDocx, size: G.style.p.taille * 2 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
        children: enfants,
      },
    ],
  })
  return figerLesDates(await Packer.toBuffer(d))
}

/** Fige les DEUX horodatages du DOCX (entrées ZIP + docProps/core.xml) — reproductibilité. */
async function figerLesDates(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const rejoue = new JSZip()
  const iso = FIGEE.toISOString()
  for (const nom of Object.keys(zip.files)) {
    const f = zip.files[nom]
    if (f.dir) continue
    let contenu = await f.async('nodebuffer')
    if (nom === 'docProps/core.xml') {
      contenu = Buffer.from(
        contenu
          .toString('utf8')
          .replace(
            /(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g,
            `$1${iso}$2`,
          ),
        'utf8',
      )
    }
    rejoue.file(nom, contenu, { date: FIGEE, createFolders: false })
  }
  return rejoue.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** ZIP de téléchargement — dates figées pour la même raison. */
async function versZip(entrees) {
  const zip = new JSZip()
  for (const [nom, octets] of entrees) zip.file(nom, octets, { date: FIGEE, createFolders: false })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/* ═══════════════ orchestration ═══════════════ */

const nomPays = (k) => {
  const p = PAYS.find((x) => x.k === k)
  if (!p) throw new Error(`pays inconnu « ${k} »`)
  return Array.isArray(p.nom) ? p.nom[0] : p.nom
}

fs.rmSync(SORTIE, { recursive: true, force: true })
fs.mkdirSync(SORTIE, { recursive: true })

const manifeste = {}
let ecrits = 0

for (const doc of DOCS) {
  const perPays = varieParPays(doc)
  const cles = perPays ? PAYS.map((p) => p.k) : ['*']
  const fichiers = {}

  for (const k of cles) {
    const pays = k === '*' ? null : k
    const suffixe = pays ? `-${pays}` : ''
    const libelle = pays ? nomPays(pays) : null
    const blocsFr = resoudre(doc, pays, 'fr')

    const { octets: pdf, pages } = await versPdf(doc, blocsFr, libelle)
    const docxFr = await versDocx(doc, blocsFr, libelle)

    // Noms LISIBLES dans l'archive : translittération des accents (« Bénin » → « Benin »),
    // jamais un remplacement aveugle qui rendrait « B-nin ». `_FR` n'apparaît que quand une
    // version EN existe — un formulaire OMS anglais suffixé FR serait un contresens.
    const ascii = (s) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    const base = ascii(doc.court[0])
    const basePays = libelle ? `${base}_${ascii(libelle)}` : base
    const entrees = [[`${basePays}${doc.bilingue ? '_FR' : ''}.docx`, docxFr]]
    if (doc.bilingue) {
      const docxEn = await versDocx(doc, resoudre(doc, pays, 'en'), libelle)
      entrees.push([`${base}_EN_courtesy.docx`, docxEn])
    }
    const zip = await versZip(entrees)

    const basePdf = `${doc.slug}${suffixe}.pdf`
    const baseZip = `${doc.slug}${suffixe}.zip`
    fs.writeFileSync(path.join(SORTIE, basePdf), pdf)
    fs.writeFileSync(path.join(SORTIE, baseZip), zip)
    ecrits += 2

    fichiers[k] = {
      pdf: `/modeles/${basePdf}`,
      zip: `/modeles/${baseZip}`,
      pages,
      octetsPdf: pdf.length,
      octetsZip: zip.length,
    }
  }

  // `apercu` = première page en fac-similé, dérivé des MÊMES blocs que le fichier servi.
  const blocsApercu = resoudre(doc, perPays ? PAYS[0].k : null, 'fr')
    .filter((b) => b.t !== 'break')
    .slice(0, 16)
    .map((b) =>
      b.t === 'table'
        ? { t: 'table', rows: b.rows }
        : { t: b.t, x: b.x.length > 140 ? b.x.slice(0, 140) + '…' : b.x },
    )
  manifeste[doc.slug] = {
    nom: doc.nom,
    court: doc.court,
    resume: doc.resume,
    source: doc.source,
    groupe: doc.groupe,
    upgradable: doc.upgradable,
    bilingue: doc.bilingue,
    perPays,
    apercu: blocsApercu,
    fichiers,
  }
}

const entete = `/**
 * FICHIER GÉNÉRÉ par web/scripts/build-landing-modeles.mjs — NE PAS ÉDITER À LA MAIN.
 * Régénérer : \`npm run build:landing-modeles\` (depuis web/), puis committer landing/modeles/.
 *
 * \`zip\` est le téléchargement (DOCX français + DOCX anglais de courtoisie quand \`bilingue\`) ;
 * \`pdf\` est l'aperçu du lecteur. \`perPays: false\` = un seul fichier pour les huit pays.
 */
`
fs.writeFileSync(
  MANIFESTE,
  `${entete}export const MODELES_VERSION = ${JSON.stringify(VERSION)}\n\n` +
    `export const MODELES_FICHIERS = ${JSON.stringify(manifeste, null, 2)}\n`,
  'utf8',
)

console.log(`${ecrits} fichiers écrits dans landing/modeles/ · manifeste ${VERSION}`)
for (const [slug, m] of Object.entries(manifeste)) {
  const n = Object.keys(m.fichiers).length
  console.log(
    `  ${slug.padEnd(22)} ${m.perPays ? `${n} pays` : 'commun'} · ${m.bilingue ? 'FR+EN' : 'fichier unique'}`,
  )
}
