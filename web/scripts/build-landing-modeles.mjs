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
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
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
// 2026.7 : purge de cache forcée — des copies de PDF antérieures au correctif CSP du 31/07
// (double `content-security-policy`) traînaient dans les caches navigateurs et rendaient le
// volet lecteur intermittent ; changer la version change la clé de cache de TOUS les fichiers.
const VERSION = '2026.9'

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

/* ═══════════════ résolution du contenu (pays + activité + langue) ═══════════════ */

const codeAgence = (k) => k.toUpperCase()

/** Ce que la lettre SOLLICITE, selon l'activité — jamais « l'enregistrement » par défaut. */
const ACTE = {
  enr: { fr: "l'enregistrement", en: 'the registration' },
  renouv: { fr: 'le renouvellement', en: 'the renewal' },
}
const ACTE_OBJET = {
  enr: { fr: 'enregistrement', en: 'registration' },
  renouv: { fr: 'renouvellement', en: 'renewal' },
}

/**
 * Développe les blocs pour un pays et une langue. `vig`, `agence` et `salut` sont résolus ici ;
 * les autres blocs choisissent `en` quand elle existe, sinon gardent le texte.
 */
function resoudre(doc, pays, langue, activite) {
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
      // `libelles` : tableau « libellé / valeur » (pas de ligne d'en-tête, colonne de gauche
      // fixe). Le drapeau suit le bloc jusqu'à la feuille de remplissage, qui doit savoir NE PAS
      // rendre la colonne des libellés saisissable — sinon l'utilisateur peut effacer
      // « Titulaire de l'AMM » et déposer un tableau qui ne dit plus ce qu'il montre.
      out.push({
        t: 'table',
        rows: langue === 'en' && b.rowsEn ? b.rowsEn : b.rows,
        ...(b.libelles ? { libelles: true } : {}),
      })
      continue
    }
    if (b.t === 'break') {
      out.push({ t: 'break' })
      continue
    }
    let x = tx(b)
    if (x.includes('{CIV}')) {
      if (!pays) throw new Error(`${doc.slug} : {CIV} sans pays`)
      const ag = agencyFor(codeAgence(pays))
      x = x.replaceAll('{CIV}', langue === 'en' ? agencyCiviliteEn() : agencyCivilite(ag))
    }
    if (x.includes('{ACTE')) {
      if (!activite) throw new Error(`${doc.slug} : {ACTE} sans activité`)
      x = x
        .replaceAll('{ACTE_OBJET}', ACTE_OBJET[activite][langue === 'en' ? 'en' : 'fr'])
        .replaceAll('{ACTE}', ACTE[activite][langue === 'en' ? 'en' : 'fr'])
    }
    // L'autorité NOMMÉE au fil du texte — « je m'engage à informer l'AIRP » devient « l'ABMed »
    // au Bénin. Sans ces jetons, décliner un modèle par pays laisserait le sigle ivoirien dans
    // les sept autres lettres : le pire des faux, parce qu'il est crédible.
    //
    // ⚠️ `{AGENCE}` prend la forme ÉLIDÉE du référentiel, pas le sigle nu : le français ne dit pas
    // « informer l'DPM » mais « informer LA DPM ». L'élision est une donnée du pays, pas une règle
    // qu'on pourrait deviner à partir du sigle.
    if (x.includes('{AGENCE') || x.includes('{PAYS}')) {
      if (!pays) throw new Error(`${doc.slug} : {AGENCE}/{PAYS} sans pays`)
      const ag = agencyFor(codeAgence(pays))
      const p = PAYS.find((q) => q.k === pays)
      const iLangue = langue === 'en' ? 1 : 0
      // L'élidée vient du MÊME référentiel que le bloc destinataire (`roadmap-data`), pas du
      // référentiel du Checking : celui-ci dit « l'autorité nationale » pour GW et NE, ce qui
      // donnait une lettre nommant la DPM/MT en tête et l'appelant « l'autorité nationale » douze
      // lignes plus bas. Sur un courrier officiel, ça se lit comme un texte non relu.
      x = x
        .replaceAll('{AGENCE_FULL}', ag.name ? `${ag.full} (${ag.name})` : ag.full)
        .replaceAll('{AGENCE}', langue === 'en' ? ag.elideEn : ag.elide)
        .replaceAll('{PAYS}', Array.isArray(p.nom) ? p.nom[iLangue] : p.nom)
    }
    out.push({ t: b.t, x })
  }
  return langue === 'en' ? [...AVERTISSEMENT_EN, ...out] : out
}

/** Un emplacement à compléter dans un modèle — même motif que la feuille de remplissage. */
const TOKENS_AIDE = /…|\{[^}]+\}/

/**
 * Texte d'AIDE anglais des cases à remplir, indexé par numéro de bloc.
 *
 * À quoi ça sert : la feuille de remplissage sert un document FRANÇAIS (c'est la version à
 * déposer) ; un utilisateur anglophone y verrait sinon « DCI et dosage » écrit dans une case et ne
 * saurait pas quoi taper. La page pioche donc son aide ICI, dans la traduction qui existe déjà —
 * jamais dans un glossaire parallèle, qui divergerait au premier ajout.
 *
 * On ne garde QUE les blocs qui portent une case, et d'eux que le strict nécessaire : embarquer
 * les blocs anglais entiers ferait grossir de 68 % un manifeste rechargé à chaque visite.
 *
 * ⚠️ L'index est celui du bloc FRANÇAIS : l'aide de la case n° 3 est lue au bloc n° 3. On échoue
 * si les deux langues ne se développent pas pareil, plutôt que de décaler toutes les aides d'un
 * cran — une aide décalée est pire que pas d'aide.
 */
function aidesEn(doc, pays, activite) {
  const en = resoudre(doc, pays, 'en', activite).slice(AVERTISSEMENT_EN.length)
  const fr = resoudre(doc, pays, 'fr', activite)
  if (en.length !== fr.length)
    throw new Error(
      `${doc.slug} : blocs FR (${fr.length}) et EN (${en.length}) désalignés — ` +
        "le texte d'aide des cases serait décalé",
    )
  const out = {}
  const memeTexte = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  fr.forEach((b, i) => {
    // Rien à stocker quand l'anglais est identique au français (« {date} », un montant, un
    // libellé déjà international) : l'aide retombe sur le bloc français et dit la même chose.
    if (b.t === 'table') {
      if (!memeTexte(b.rows, en[i].rows)) out[i] = { rows: en[i].rows }
    } else if (typeof b.x === 'string' && TOKENS_AIDE.test(b.x) && b.x !== en[i].x) {
      out[i] = { x: en[i].x }
    }
  })
  return out
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
      // En-tête du laboratoire : des lignes SERRÉES, comme un bloc d'adresse — les espacer comme
      // des paragraphes coûtait une page entière. La déclaration DMF tient ainsi sur une page
      // pour six pays sur huit ; la Guinée-Bissau et le Niger en prennent deux, leurs noms
      // d'autorité étant plus longs. Ce n'est pas un défaut : le bloc signature reste solidaire
      // (garde anti-orphelin), et la grille n'annonce plus une pagination qui varie.
      entete: { taille: 11, avant: 0, apres: 0 },
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
    // Emplacement du PAPIER À EN-TÊTE (lettres) : marqueur puis filet, la forme du gabarit
    // fourni. L'aperçu doit montrer cette place, sinon le lecteur croit qu'elle n'existe pas et
    // découvre le décalage seulement en ouvrant le Word.
    if (doc.layout === 'lettre') {
      const yEntete = A4.h - 34
      page.drawText('[En-tête du laboratoire]', {
        x: G.marge.g,
        y: yEntete,
        size: 8.5,
        font: reg,
        color: rgb(0.6, 0.63, 0.66),
      })
      page.drawLine({
        start: { x: G.marge.g, y: yEntete - 6 },
        end: { x: A4.l - G.marge.d, y: yEntete - 6 },
        thickness: 0.6,
        color: rgb(0.6, 0.63, 0.66),
      })
    }
  }
  nouvellePage()

  const ENCRE = rgb(0.07, 0.09, 0.13)

  /**
   * Premier bloc du BLOC SIGNATURE — la suite de lignes « à droite » qui ferme la lettre.
   *
   * Une signature séparée de son nom par un saut de page n'est pas une lettre : c'est une lettre
   * abîmée. Quand la fin ne tient pas entière, elle part ensemble sur la page suivante. Calculé
   * ici, une fois, plutôt qu'au fil du dessin où l'on ne sait plus ce qui reste à venir.
   */
  let debutSignature = blocs.length
  while (debutSignature > 0 && blocs[debutSignature - 1].t === 'right') debutSignature--
  // La hauteur À RÉSERVER n'est pas la hauteur totale du bloc : le dessin teste `y < marge.bas`
  // AVANT chaque ligne, donc la dernière ligne s'écrit encore juste au-dessus de la marge. On
  // retranche sa hauteur et son espacement, sinon la garde se déclenche alors que ça tenait —
  // et renvoie en page 2 des lettres qui tenaient sur une seule.
  const coutBloc = (b) => G.style[b.t].avant + G.inter(G.style[b.t].taille) + G.style[b.t].apres
  const signature = blocs.slice(debutSignature)
  const hauteurSignature =
    signature.reduce((h, b) => h + coutBloc(b), 0) - coutBloc(signature.at(-1) ?? blocs[0])

  for (const [iBloc, b] of blocs.entries()) {
    // La fin de lettre ne se coupe pas : si elle ne tient pas, on tourne la page avant elle.
    // `iBloc > 0` : un document fait ENTIÈREMENT de blocs « à droite » commencerait sinon par une
    // page blanche, la garde se déclenchant sur la première page encore vide.
    if (
      iBloc > 0 &&
      iBloc === debutSignature &&
      debutSignature < blocs.length &&
      y - hauteurSignature < G.marge.bas
    )
      nouvellePage()
    if (b.t === 'break') {
      nouvellePage()
      continue
    }
    if (b.t === 'table') {
      // Une grille réelle, pas des lignes de texte. Les cellules S'ENROULENT : le tableau de la
      // déclaration DMF porte des libellés longs (« Autorité de réglementation approbatrice du
      // numéro de DMF ») que le modèle de l'autorité écrit lui-même sur deux lignes. Raccourcir
      // ces libellés pour tenir sur une ligne reviendrait à réécrire un document officiel.
      const cols = b.rows[0].length
      const wCol = largeur / cols
      const PAD = 5
      const hLigne = 11
      y -= 4
      for (const [ri, row] of b.rows.entries()) {
        const font = ri === 0 && !b.libelles ? gras : reg
        // Première colonne d'un tableau « libellé / valeur » : c'est un intitulé, il est en gras.
        const fonteCell = (ci) => (b.libelles && ci === 0 ? gras : font)
        const cellules = row.map((cell, ci) =>
          lignes(assainir(String(cell), `${doc.slug}/table`), fonteCell(ci), 9, wCol - 2 * PAD),
        )
        const hL = Math.max(20, Math.max(...cellules.map((l) => l.length)) * hLigne + 9)
        if (y - hL < G.marge.bas) nouvellePage()
        cellules.forEach((ls, ci) => {
          const x0 = G.marge.g + ci * wCol
          page.drawRectangle({
            x: x0,
            y: y - hL,
            width: wCol,
            height: hL,
            borderColor: ENCRE,
            borderWidth: 0.7,
          })
          ls.forEach((l, li) => {
            page.drawText(l, {
              x: x0 + PAD,
              y: y - 11 - li * hLigne,
              size: 9,
              font: fonteCell(ci),
              color: ENCRE,
            })
          })
        })
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

/**
 * ESPACEMENTS DE COURRIER, en vingtièmes de point (`spacing`). Un courrier officiel respire :
 * des paragraphes collés se lisent comme une note interne, pas comme une lettre à une autorité.
 * `line: 276` = interligne 1,15 — la valeur des lettres compilées du builder.
 */
const ESPACE = {
  doctitle: { before: 0, after: 320 },
  part: { before: 240, after: 200 },
  h1: { before: 280, after: 120 },
  h2: { before: 240, after: 100 },
  h3: { before: 240, after: 120 },
  p: { before: 0, after: 200 },
  li: { before: 0, after: 120 },
  right: { before: 0, after: 60 },
  entete: { before: 0, after: 0 },
}
const INTERLIGNE = 276

/** Marges intérieures des cellules (twips) — sans elles le texte touche le trait. */
const MARGE_CELLULE = { top: 90, bottom: 90, left: 130, right: 130 }

/**
 * Pied de page des modèles GÉNÉRÉS : la source, le pays, et notre signature discrète.
 *
 * ⚠️ Décision CEO du 31/07/2026 — elle ne vaut QUE pour les modèles que nous fabriquons et
 * offrons. Deux documents n'en portent jamais : le PDF officiel d'une autorité, servi tel quel,
 * et le livrable d'une mise à niveau, qui part au dépôt sous le seul nom du titulaire
 * (étape 3 §3 du process d'upgrade).
 */
function piedPharnos(doc, paysNom) {
  const legende = [doc.source[0], paysNom].filter(Boolean).join(' — ')
  const gris = '9AA1A9'
  return new Footer({
    children: [
      // Emplacement de PIED du laboratoire (lettres) : le courrier repart sur son papier, il lui
      // faut sa ligne de pied — coordonnées, RCS, mentions. Un modèle qui n'en laisse pas la
      // place oblige à défaire la mise en page pour l'ajouter.
      ...(doc.layout === 'lettre' ? [new Paragraph({ children: [PIED_LABO()] })] : []),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 120 },
        children: [
          new TextRun({ text: `${legende} — by `, size: 15, color: gris, font: 'Arial' }),
          new ExternalHyperlink({
            link: 'https://pharnos.com/',
            children: [
              new TextRun({ text: 'Pharnos', size: 15, color: gris, font: 'Arial', underline: {} }),
            ],
          }),
        ],
      }),
    ],
  })
}

/** Marqueur de pied du laboratoire — à remplacer par ses propres mentions. */
const PIED_LABO = () =>
  new TextRun({ text: '[Pied de page]', size: 20, color: '9AA1A9', font: 'Times New Roman' })

/**
 * En-tête de lettre : l'emplacement du PAPIER À EN-TÊTE du laboratoire, marqueur puis filet —
 * la forme exacte du gabarit fourni (« Header » suivi d'un trait). Le laboratoire y dépose son
 * logo ; sans cet emplacement, il doit recréer un en-tête et la mise en page bouge.
 */
function enteteLaboratoire() {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: '[En-tête du laboratoire]',
            size: 20,
            color: '9AA1A9',
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '9AA1A9', space: 1 } },
        children: [],
      }),
    ],
  })
}

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
        // Largeur et colonnes du gabarit : 9560 dxa, réparties 3712 / 5848 — l'intitulé tient sur
        // deux lignes au plus, la valeur respire. Une largeur en pourcentage donnait deux
        // colonnes égales, et des intitulés qui débordaient sur quatre lignes.
        width: { size: 9560, type: WidthType.DXA },
        columnWidths: b.libelles ? [3712, 5848] : undefined,
        // Une ligne d'en-tête qui se répète si le tableau passe la page, et des cellules qui
        // ne collent pas au trait : c'est ce qui sépare un tableau de courrier d'une grille brute.
        // Un tableau « libellé / valeur » n'a PAS de ligne d'en-tête : ce qui se détache est sa
        // COLONNE de gauche. Sans cette distinction, le Word livré grisait « Dénomination du
        // produit fini | <nom réel du produit> » comme un en-tête répétable et laissait les six
        // autres intitulés en maigre — l'inverse de ce que l'aperçu montrait.
        rows: b.rows.map(
          (row, ri) =>
            new TableRow({
              tableHeader: !b.libelles && ri === 0,
              height: { value: 420, rule: 'atLeast' },
              children: row.map((cell, ci) => {
                const intitule = b.libelles ? ci === 0 : ri === 0
                return new TableCell({
                  margins: MARGE_CELLULE,
                  verticalAlign: VerticalAlign.CENTER,
                  shading: intitule
                    ? { type: ShadingType.CLEAR, fill: 'F1F4F9', color: 'auto' }
                    : undefined,
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 0, line: 240 },
                      children: [
                        new TextRun({
                          text: String(cell),
                          bold: intitule,
                          size: 20,
                          font: G.fonteDocx,
                        }),
                      ],
                    }),
                  ],
                })
              }),
            }),
        ),
      })
    }
    const st = G.style[b.t]
    const esp = ESPACE[b.t] ?? ESPACE.p
    return new Paragraph({
      heading: HEADING[b.t],
      alignment: st.centre ? AlignmentType.CENTER : AlignmentType.LEFT,
      // Bloc « à droite » du moteur de lettres : DÉCALÉ à 56 %, aligné à gauche — pas un
      // alignement droit, qui ferait flotter chaque ligne différemment.
      indent: st.droite ? { left: INDENT_DOCX } : undefined,
      bullet: st.puce ? { level: 0 } : undefined,
      spacing: { ...esp, line: INTERLIGNE },
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
        properties: {
          // Marges du GABARIT fourni pour les lettres (pgMar du Word de référence), afin que le
          // document produit se superpose au modèle : un déposant qui colle son en-tête ne doit
          // pas voir la mise en page glisser. Les autres documents gardent les marges maison.
          page: {
            margin:
              doc.layout === 'lettre'
                ? { top: 1340, right: 850, bottom: 280, left: 1275, header: 720, footer: 720 }
                : { top: 1134, right: 1134, bottom: 1418, left: 1134 },
          },
        },
        // Emplacement d'en-tête : sur les LETTRES seulement — un RCP ou une notice n'a pas de
        // papier à en-tête, ils partent en annexe d'un dossier, pas en courrier.
        ...(doc.layout === 'lettre' ? { headers: { default: enteteLaboratoire() } } : {}),
        footers: { default: piedPharnos(doc, paysNom) },
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
    // La bibliothèque `docx` tire un identifiant ALÉATOIRE pour le lien du pied de page : deux
    // exécutions sans le moindre changement produisaient 54 ZIP différents. Conséquences réelles :
    // le diff noyait 8 vrais fichiers sous 60 de bruit, `octetsZip` (affiché à l'utilisateur)
    // bougeait sans raison, et surtout AUCUNE barrière CI « source ↔ sortie » n'était posable —
    // c'est ce trou qui a laissé partir en production un manifeste désaccordé de son code.
    // Le quantifieur ≥ 8 épargne les `rId1`, `rId2` structurels. La classe DOIT inclure `_` et les
    // majuscules : ces identifiants n'ont pas de forme fixe, et une classe trop étroite coupe au
    // milieu — laissant une queue aléatoire (`rIdPharnosPied_gspwzb1y9jnx`) et un build toujours
    // instable, mais qui en a l'air moins.
    if (nom.endsWith('.xml') || nom.endsWith('.rels')) {
      contenu = Buffer.from(
        contenu.toString('utf8').replace(/rId[A-Za-z0-9_-]{8,}/g, 'rIdPharnosPied'),
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
  const activites = doc.activites ?? [null]
  // `doc.pays` restreint un document aux pays qui le servent. AUCUN document ne l'emploie
  // aujourd'hui — la déclaration DMF, un temps réservée à la Côte d'Ivoire, est désormais
  // transposée aux huit. On garde le mécanisme et ses deux gardes : le jour où une autorité
  // publie une pièce qui n'existe que chez elle, la restriction doit être déclarative, pas
  // réinventée. Absent → les huit pays.
  const paysDoc = doc.pays ?? PAYS.map((p) => p.k)
  for (const k of paysDoc)
    if (!PAYS.some((p) => p.k === k)) throw new Error(`pays inconnu « ${k} »`)
  // Un document qui ne varie pas par pays est servi sous une clé unique `*` : une restriction y
  // serait ignorée EN SILENCE, et la pièce nationale repartirait sous les huit drapeaux.
  if (doc.pays && !perPays)
    throw new Error(`« ${doc.slug} » : restriction par pays sur un document qui ne varie pas`)
  // Une clé = un pays (et, quand le document se décline, une activité) : `bj`, ou `bj-renouv`.
  const cles = (perPays ? paysDoc : ['*']).flatMap((k) =>
    activites.map((a) => (a ? `${k}-${a}` : k)),
  )
  const fichiers = {}

  for (const k of cles) {
    const [codePays, activite = null] = doc.activites ? k.split('-') : [k, null]
    const pays = codePays === '*' ? null : codePays
    const suffixe = pays ? `-${k}` : ''
    const libelle = pays ? nomPays(pays) : null

    // Modèle OFFICIEL déposé pour ce pays : servi TEL QUEL, à l'octet près — affiché et
    // téléchargé sans réinterprétation (directive CEO du 31/07/2026). Le ZIP ne contient que
    // lui : on ne fabrique ni DOCX ni version anglaise sur le document d'une autorité.
    const officiel = doc.officiels?.[k]
    if (officiel) {
      const octetsOfficiel = fs.readFileSync(path.join(RACINE, officiel))
      const pdfDoc = await PDFDocument.load(octetsOfficiel, { updateMetadata: false })
      const asciiOff = (t) =>
        t
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^A-Za-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      const zipOfficiel = await versZip([
        [`${asciiOff(doc.court[0])}_${asciiOff(libelle)}_officiel.pdf`, octetsOfficiel],
      ])
      const basePdf = `${doc.slug}${suffixe}.pdf`
      const baseZip = `${doc.slug}${suffixe}.zip`
      fs.writeFileSync(path.join(SORTIE, basePdf), octetsOfficiel)
      fs.writeFileSync(path.join(SORTIE, baseZip), zipOfficiel)
      ecrits += 2
      // La provenance affichée doit être celle de l'AUTORITÉ, pas la maquette régionale du
      // document : servir le fichier de l'AIRP sous l'étiquette « Maquette ABMed » serait faux.
      const sigle = agencyFor(codeAgence(pays)).name
      fichiers[k] = {
        pdf: `/modeles/${basePdf}`,
        zip: `/modeles/${baseZip}`,
        pages: pdfDoc.getPageCount(),
        octetsPdf: octetsOfficiel.length,
        octetsZip: zipOfficiel.length,
        officiel: true,
        source: [`Modèle officiel ${sigle}`, `Official ${sigle} template`],
      }
      continue
    }

    const blocsFr = resoudre(doc, pays, 'fr', activite)

    // FICHIER FOURNI par l'autorité (ou par le CEO) pour ce pays : c'est LUI que l'utilisateur
    // télécharge, à l'octet près — pas notre transposition. À la différence de `officiels`, les
    // BLOCS restent calculés : la feuille « Générer ma lettre » continue de fonctionner, et le
    // document qu'elle produit suit la même mise en page. Un gabarit servi tel quel ET une
    // feuille qui le remplit ne s'excluent pas — les confondre supprimait la seconde.
    const fourni = doc.fournis?.[pays]
    const octetsFournis = fourni
      ? {
          docx: fs.readFileSync(path.join(RACINE, fourni.docx)),
          pdf: fs.readFileSync(path.join(RACINE, fourni.pdf)),
        }
      : null

    const rendu = await versPdf(doc, blocsFr, libelle)
    const pdf = octetsFournis ? octetsFournis.pdf : rendu.octets
    const pages = octetsFournis
      ? (await PDFDocument.load(octetsFournis.pdf, { updateMetadata: false })).getPageCount()
      : rendu.pages
    const docxFr = octetsFournis ? octetsFournis.docx : await versDocx(doc, blocsFr, libelle)

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
    // Un fichier fourni part SEUL : on ne joint pas une traduction de courtoisie fabriquée par
    // nous à un document que nous servons tel quel.
    const entrees = [[`${basePays}${doc.bilingue && !octetsFournis ? '_FR' : ''}.docx`, docxFr]]
    if (doc.bilingue && !octetsFournis) {
      const docxEn = await versDocx(doc, resoudre(doc, pays, 'en', activite), libelle)
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
      // Les lettres embarquent leurs blocs résolus : le formulaire « Générer ma lettre » de la
      // page les remplit puis produit le DOCX dans le navigateur — même source, zéro divergence.
      //
      // `agence` : l'agence nommée, article compris, telle qu'elle apparaît DANS la lettre. La
      // page l'affiche au-dessus du document (« adressée à … ») ; sans elle, elle lisait l'autre
      // référentiel et annonçait « l'autorité nationale » au-dessus d'une lettre qui nomme la
      // DPM/MT. Deux sources pour un même fait finissent toujours par se contredire.
      ...(doc.layout === 'lettre'
        ? {
            blocs: blocsFr,
            aidesEn: aidesEn(doc, pays, activite),
            agence: [agencyFor(codeAgence(pays)).elide, agencyFor(codeAgence(pays)).elideEn],
          }
        : {}),
    }
  }

  // `apercu` = première page en fac-similé, dérivé des MÊMES blocs que le fichier servi.
  // Le fac-similé se peint sur le premier pays SERVI, pas sur le premier du référentiel : la
  // vignette d'une pièce que seule la Côte d'Ivoire impose montrerait sinon une lettre adressée
  // à l'ABMed du Bénin — la toute première chose que voit l'utilisateur, et elle serait fausse.
  const blocsApercu = resoudre(doc, perPays ? paysDoc[0] : null, 'fr', doc.activites?.[0] ?? null)
    .filter((b) => b.t !== 'break')
    .slice(0, 16)
    .map((b) =>
      b.t === 'table'
        ? // `libelles` suit jusqu'à la vignette : sans lui, le fac-similé rendait une ligne
          // d'en-tête que le document n'a pas — alors qu'il promet de montrer les MÊMES blocs.
          { t: 'table', rows: b.rows, ...(b.libelles ? { libelles: true } : {}) }
        : { t: b.t, x: b.x.length > 140 ? b.x.slice(0, 140) + '…' : b.x },
    )
  manifeste[doc.slug] = {
    activites: doc.activites ?? null,
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
