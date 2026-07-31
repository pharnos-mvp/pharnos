/**
 * Génère les MODÈLES OFFICIELS servis par la Bibliothèque réglementaire de pharnos.com.
 *
 *   Régénérer : `npm run build:landing-modeles` (depuis web/). À relancer après toute modif de
 *   `lib/modeles-source.mjs` ou de `landing/checking/vigilance.js`, puis COMMITTER la sortie —
 *   `landing/` est déployé tel quel, sans build (cf. .github/workflows/deploy-landing.yml).
 *
 * POURQUOI GÉNÉRER PLUTÔT QUE DÉPOSER DES FICHIERS
 * Le fichier servi doit porter la mention de pharmacovigilance du pays de dépôt (rubrique 4.8).
 * En le dérivant de `landing/checking/vigilance.js` — la source que la page affiche aussi — un
 * modèle téléchargé ne peut pas diverger de ce que l'écran annonce.
 *
 * ⚠️ SEUL LE RCP VARIE PAR PAYS. La notice et l'étiquetage de la maquette ABMed 2026 ne portent
 * aucun contact national : en produire huit copies identiques sous huit noms différents ferait
 * passer la recette « changer de pays change le fichier » tout en ne changeant rien. Un document
 * est décliné par pays si, et seulement si, il contient un bloc `vig`.
 *
 * ⚠️ AUCUNE MARQUE PHARNOS dans le document. Ces fichiers repartent dans des dossiers d'AMM ;
 * l'étape 3 du process d'upgrade l'interdit sur toute pièce déposée, et le modèle en est une.
 *
 * PIÈGE PDF déjà payé (cf. docs/PLAN-UPGRADE-FRONTEND.md §C) : on trace UNE CHAÎNE ENTIÈRE par
 * ligne, jamais mot à mot. Le positionnement manuel mot à mot produit un PDF dont les extracteurs
 * recollent le texte (« QUALITATIVEET » observé) — or l'extractibilité fait partie de la
 * conformité d'un document réglementaire.
 */
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import { PAYS } from '../../landing/checking/referentiel.js'
import { mention48 } from '../../landing/checking/vigilance.js'
import { DOCS, varieParPays } from './lib/modeles-source.mjs'

const RACINE = path.resolve(import.meta.dirname, '../..')
const SORTIE = path.join(RACINE, 'landing', 'modeles')
const MANIFESTE = path.join(RACINE, 'landing', 'checking', 'modeles-manifest.js')

/** Version du contenu des modèles — reportée dans le manifeste et affichée sur la page.
 *  À incrémenter à CHAQUE modification de `modeles-source.mjs` ou de la mention 4.8. */
const VERSION = '2026.1'

/** Date figée : sans elle, deux exécutions produisent des octets différents et toute
 *  vérification de dérive (CI, revue de diff) devient illisible. */
const FIGEE = new Date('2026-07-30T00:00:00Z')

/* ═══════════════════════ mise en page ═══════════════════════ */

const A4 = { l: 595.28, h: 841.89 }
const MARGE = { g: 56, d: 56, haut: 56, bas: 62 }
const CORPS = 10.5
const INTER = 14.6

/** Style de chaque type de bloc. `avant` = espace vertical injecté avant la première ligne. */
const STYLE = {
  doctitle: { taille: 13, gras: true, centre: true, avant: 0, apres: 18 },
  part: { taille: 11.5, gras: true, centre: true, avant: 20, apres: 10 },
  h1: { taille: 11, gras: true, centre: false, avant: 14, apres: 4 },
  h2: { taille: 10.5, gras: true, centre: false, avant: 11, apres: 3 },
  h3: { taille: 10.5, gras: true, centre: false, avant: 8, apres: 2 },
  p: { taille: CORPS, gras: false, centre: false, avant: 0, apres: 5 },
  li: { taille: CORPS, gras: false, centre: false, avant: 0, apres: 5, puce: true },
}

/* ═══════════════════════ résolution du contenu ═══════════════════════ */

/**
 * Développe les blocs d'un document pour un pays : le bloc `vig` devient son titre et ses
 * paragraphes. Aucun autre bloc ne dépend du pays — c'est ce qui rend la déclinaison vérifiable.
 *
 * @param {{blocks: Array<{t: string, x?: string}>}} doc
 * @param {string|null} pays  Code pays, ou `null` pour un document qui ne varie pas.
 */
function resoudre(doc, pays) {
  const out = []
  for (const b of doc.blocks) {
    if (b.t !== 'vig') {
      out.push(b)
      continue
    }
    if (!pays) throw new Error(`${doc.slug} contient un bloc vig mais n'est pas décliné par pays`)
    const m = mention48(pays)
    out.push({ t: 'h3', x: m.titre })
    for (const p of m.paragraphes) out.push({ t: 'p', x: p })
  }
  return out
}

/* ═══════════════════════ PDF ═══════════════════════ */

/** WinAnsi ne code pas tout. On échoue AVANT pdf-lib, avec le caractère et son contexte : une
 *  erreur « Cannot encode » sans position coûte une demi-heure de recherche à l'aveugle. */
const REMPLACEMENTS = new Map([
  ['‑', '-'], // tiret insécable
  ['–', '–'], // en-dash : présent en WinAnsi, listé pour mémoire
  [' ', ' '], // espace insécable → espace, la césure PDF est manuelle de toute façon
  [' ', ' '], // espace fine insécable
])
const WINANSI_OK = /^[ -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]*$/

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

/** Découpe en lignes tenant dans `largeur`. Un mot plus long que la ligne est coupé plutôt que
 *  de déborder en silence hors de la marge. */
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
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.nom[0]} — modèle officiel`)
  pdf.setSubject(paysNom ? `Modèle officiel — ${paysNom}` : 'Modèle officiel')
  pdf.setCreationDate(FIGEE)
  pdf.setModificationDate(FIGEE)

  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold)
  const largeur = A4.l - MARGE.g - MARGE.d

  const pages = []
  let page = null
  let y = 0
  const nouvellePage = () => {
    page = pdf.addPage([A4.l, A4.h])
    pages.push(page)
    y = A4.h - MARGE.haut
  }
  nouvellePage()

  for (const b of blocs) {
    if (b.t === 'break') {
      nouvellePage()
      continue
    }
    const st = STYLE[b.t]
    if (!st) throw new Error(`bloc inconnu « ${b.t} » dans ${doc.slug}`)
    const font = st.gras ? gras : reg
    const puce = st.puce ? '• ' : ''
    const retrait = st.puce ? 14 : 0
    const texte = assainir(puce + b.x, `${doc.slug}/${b.t}`)
    const ls = lignes(texte, font, st.taille, largeur - retrait)

    y -= st.avant
    for (const l of ls) {
      if (y < MARGE.bas) nouvellePage()
      const x = st.centre
        ? MARGE.g + (largeur - font.widthOfTextAtSize(l, st.taille)) / 2
        : MARGE.g + retrait
      // UNE chaîne entière par appel — jamais mot à mot (cf. en-tête de fichier).
      page.drawText(l, { x, y: y - st.taille, size: st.taille, font, color: rgb(0.07, 0.09, 0.13) })
      y -= INTER
    }
    y -= st.apres
  }

  // Pied de page : la pagination seule, plus le pays quand le document en dépend. Aucune marque.
  const total = pages.length
  pages.forEach((p, i) => {
    const pied = paysNom
      ? `${doc.source[0]} — ${paysNom} — ${i + 1} / ${total}`
      : `${doc.source[0]} — ${i + 1} / ${total}`
    const s = assainir(pied, `${doc.slug}/pied`)
    p.drawText(s, {
      x: A4.l - MARGE.d - reg.widthOfTextAtSize(s, 7.5),
      y: MARGE.bas - 26,
      size: 7.5,
      font: reg,
      color: rgb(0.55, 0.58, 0.62),
    })
  })

  return { octets: Buffer.from(await pdf.save()), pages: total }
}

/* ═══════════════════════ DOCX ═══════════════════════ */

const HEADING = {
  doctitle: HeadingLevel.TITLE,
  part: HeadingLevel.HEADING_1,
  h1: HeadingLevel.HEADING_2,
  h2: HeadingLevel.HEADING_3,
  h3: HeadingLevel.HEADING_4,
}

async function versDocx(doc, blocs, paysNom) {
  const enfants = blocs.map((b) => {
    if (b.t === 'break') return new Paragraph({ text: '', pageBreakBefore: true })
    const st = STYLE[b.t]
    return new Paragraph({
      // Les niveaux de titre ne sont pas décoratifs : ils alimentent le volet Navigation de Word
      // et les signets du PDF exporté — un examinateur s'y déplace.
      heading: HEADING[b.t],
      alignment: st.centre ? AlignmentType.CENTER : AlignmentType.LEFT,
      bullet: st.puce ? { level: 0 } : undefined,
      spacing: { before: st.avant * 20, after: st.apres * 20 },
      children: [new TextRun({ text: b.x, bold: st.gras, size: st.taille * 2, font: 'Arial' })],
    })
  })

  const d = new Document({
    creator: doc.source[0],
    title: `${doc.nom[0]} — modèle officiel`,
    description: paysNom ? `Modèle officiel — ${paysNom}` : 'Modèle officiel',
    // ⚠️ Ne PAS passer `created`/`modified` ici : `docx` v9 les ignore et horodate malgré tout à
    // `Date.now()`. Les dates sont figées après coup, dans `figerLesDates()`.
    lastModifiedBy: doc.source[0],
    styles: { default: { document: { run: { font: 'Arial', size: CORPS * 2 } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        children: enfants,
      },
    ],
  })
  return figerLesDates(await Packer.toBuffer(d))
}

/**
 * Rejoue l'archive DOCX en figeant les DEUX horodatages qu'elle porte.
 *
 * Sans cela, deux exécutions du générateur produisent dix fichiers binaires différents pour un
 * contenu identique : le diff devient illisible en revue, et on perd la seule question qui compte
 * devant un document réglementaire — « ce fichier a-t-il changé ? ». Le PDF, lui, est déjà figé
 * par `setCreationDate`.
 *
 * Deux sources d'horodatage, et il faut les deux :
 *   1. la date d'entrée ZIP, posée par JSZip à `Date.now()` ;
 *   2. `dcterms:created` / `dcterms:modified` de `docProps/core.xml`, que `docx` v9 écrit lui-même
 *      en ignorant les options `created`/`modified` du `Document`.
 * N'en corriger qu'une laisse la sortie instable — vérifié, c'était le cas ici.
 */
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

/* ═══════════════════════ orchestration ═══════════════════════ */

const nomPays = (k) => {
  const p = PAYS.find((x) => x.k === k)
  if (!p) throw new Error(`pays inconnu « ${k} »`)
  return Array.isArray(p.nom) ? p.nom[0] : p.nom
}

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
    const blocs = resoudre(doc, pays)
    const libelle = pays ? nomPays(pays) : null

    const { octets: pdf, pages } = await versPdf(doc, blocs, libelle)
    const docx = await versDocx(doc, blocs, libelle)

    const basePdf = `${doc.slug}${suffixe}.pdf`
    const baseDocx = `${doc.slug}${suffixe}.docx`
    fs.writeFileSync(path.join(SORTIE, basePdf), pdf)
    fs.writeFileSync(path.join(SORTIE, baseDocx), docx)
    ecrits += 2

    fichiers[k] = {
      pdf: `/modeles/${basePdf}`,
      docx: `/modeles/${baseDocx}`,
      pages,
      octetsPdf: pdf.length,
      octetsDocx: docx.length,
    }
  }

  // Les libellés voyagent DANS le manifeste : `modeles-source.mjs` pèse 25 Ko de corps de
  // documents et n'a rien à faire dans le navigateur, mais la page a besoin des mêmes titres que
  // les fichiers. Les recopier à la main dans le JS de la page les ferait diverger au premier
  // renommage.
  manifeste[doc.slug] = {
    nom: doc.nom,
    court: doc.court,
    resume: doc.resume,
    source: doc.source,
    upgradable: doc.upgradable,
    perPays,
    fichiers,
  }
}

const entete = `/**
 * FICHIER GÉNÉRÉ par web/scripts/build-landing-modeles.mjs — NE PAS ÉDITER À LA MAIN.
 * Régénérer : \`npm run build:landing-modeles\` (depuis web/), puis committer landing/modeles/.
 *
 * \`perPays: false\` signifie que le document ne porte AUCUNE mention nationale : un seul fichier
 * sert les huit pays. Le déclarer par pays donnerait huit copies identiques — une variation de
 * façade que la page présenterait comme un choix.
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
  console.log(`  ${slug.padEnd(11)} ${m.perPays ? `${n} pays` : 'commun aux 8 pays'}`)
}
