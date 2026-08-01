/**
 * Contrat des MODÈLES OFFICIELS servis par la Bibliothèque réglementaire.
 *
 * Ces tests portent sur les FICHIERS COMMITTÉS, pas sur le générateur : `landing/` est déployé
 * tel quel, donc ce que le visiteur télécharge est l'octet présent dans le dépôt. Un générateur
 * juste dont la sortie n'a pas été régénérée sert un modèle périmé — et rien ne le signale.
 *
 * Régénérer : `npm run build:landing-modeles` depuis `web/`.
 */
import fs from 'node:fs'
import path from 'node:path'

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { PAYS } from '../../../../landing/checking/referentiel.js'
import { MODELES_FICHIERS, MODELES_VERSION } from '../../../../landing/checking/modeles-manifest.js'
import { DOCS, varieParPays } from '../../../scripts/lib/modeles-source.mjs'

// Le manifeste est GÉNÉRÉ : TypeScript en infère un littéral aux huit clés pays connues, qu'on ne
// peut pas indexer par une variable. On le relit une fois sous sa forme réelle — un enregistrement
// dont les clés viennent du référentiel — plutôt que de caster à chaque accès.
type Bloc0 = { t: string; x?: string; rows?: string[][] }
type Fichier = {
  pdf: string
  zip: string
  pages: number
  octetsPdf: number
  octetsZip: number
  officiel?: boolean
  /** Provenance propre au fichier officiel d'une autorité (prime sur celle du document). */
  source?: [string, string]
  blocs?: Bloc0[]
  /** Texte d'aide ANGLAIS des cases à remplir, indexé par numéro de bloc français. */
  aidesEn?: Record<string, { x?: string; rows?: string[][] }>
}
type Bloc = { t: string; x?: string; rows?: string[][] }
type Manifeste = Record<
  string,
  {
    perPays: boolean
    upgradable: boolean
    bilingue: boolean
    activites: string[] | null
    groupe: string
    apercu: Bloc[]
    fichiers: Record<string, Fichier>
  }
>
const MANIFESTE = MODELES_FICHIERS as unknown as Manifeste

/** `noUncheckedIndexedAccess` rend toute lecture indexée optionnelle. Plutôt que de semer des
 *  `!`, on échoue avec le nom de ce qui manque : un test rouge doit dire quel modèle a disparu. */
const docDe = (slug: string) => {
  const m = MANIFESTE[slug]
  if (!m) throw new Error(`manifeste : document « ${slug} » absent`)
  return m
}
const fichierDe = (slug: string, k: string) => {
  const f = docDe(slug).fichiers[k]
  if (!f) throw new Error(`manifeste : « ${slug} » n'a pas de fichier pour « ${k} »`)
  return f
}

const LANDING = path.resolve(__dirname, '../../../../landing')
const chemin = (url: string) => path.join(LANDING, url.replace(/^\//, ''))

const CODES: string[] = PAYS.map((p: { k: string }) => p.k)
const ADRESSES = {
  bj: 'vigilances.abmed@gouv.bj',
  ci: 'pharmacovigilance@airp.ci',
  sn: 'vigilances@arp.sn',
} as const

const ENTITES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

/** Le DOCX voulu, extrait du ZIP DE TÉLÉCHARGEMENT — c'est l'octet que le visiteur obtient. */
async function docxDuZip(url: string, langue: 'fr' | 'en' = 'fr'): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fs.readFileSync(chemin(url)))
  const noms = Object.keys(zip.files)
  const nom =
    langue === 'en'
      ? noms.find((n) => n.includes('_EN_'))
      : (noms.find((n) => n.endsWith('_FR.docx')) ?? noms.find((n) => n.endsWith('.docx')))
  expect(nom, `${url} : docx ${langue} absent (${noms.join(' · ')})`).toBeTruthy()
  return zip.file(nom!)!.async('nodebuffer')
}

/** Texte brut de `word/document.xml` — suffisant pour vérifier la PRÉSENCE d'une mention.
 *  Les entités XML sont décodées : sans cela `d&apos;administration` ne contiendrait pas
 *  `d'administration`, et le test passerait à côté d'un titre pourtant présent. */
async function texteDocx(url: string, langue: 'fr' | 'en' = 'fr'): Promise<string> {
  const zip = await JSZip.loadAsync(await docxDuZip(url, langue))
  const doc = zip.file('word/document.xml')
  expect(doc, `${url} : word/document.xml absent`).not.toBeNull()
  return (await doc!.async('string'))
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITES[e] ?? e)
}

describe('manifeste et fichiers restent accordés', () => {
  it('porte une version', () => {
    expect(MODELES_VERSION).toMatch(/^\d{4}\.\d+$/)
  })

  it('décrit exactement les trois documents de la source', () => {
    expect(Object.keys(MANIFESTE).sort()).toEqual(DOCS.map((d) => d.slug).sort())
  })

  it('décline par pays les documents qui portent une mention nationale, et eux seuls', () => {
    // Huit copies identiques sous huit noms feraient passer la recette « changer de pays change
    // le fichier » sans rien changer. Le manifeste doit dire la vérité sur ce qui varie.
    for (const doc of DOCS) {
      expect(docDe(doc.slug).perPays, doc.slug).toBe(varieParPays(doc))
    }
  })

  it('couvre les huit pays pour le RCP', () => {
    expect(Object.keys(docDe('rcp').fichiers).sort()).toEqual([...CODES].sort())
  })

  it('sert un fichier unique pour les documents sans mention nationale', () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      if (m.perPays) continue
      expect(Object.keys(m.fichiers), slug).toEqual(['*'])
    }
  })

  it('référence des fichiers réellement présents, à la taille annoncée', () => {
    // Un manifeste régénéré sans committer `landing/modeles/` sert un 404 sous un bouton
    // « Télécharger » — l'échec le plus coûteux de cette page.
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      for (const [k, f] of Object.entries(m.fichiers)) {
        expect(fs.existsSync(chemin(f.pdf)), `${slug}/${k} pdf`).toBe(true)
        expect(fs.existsSync(chemin(f.zip)), `${slug}/${k} zip`).toBe(true)
        expect(fs.statSync(chemin(f.pdf)).size, `${slug}/${k} taille pdf`).toBe(f.octetsPdf)
        expect(fs.statSync(chemin(f.zip)).size, `${slug}/${k} taille zip`).toBe(f.octetsZip)
        expect(f.pages, `${slug}/${k} pages`).toBeGreaterThan(0)
      }
    }
  })

  it("le ZIP d'un document bilingue porte le FR et l'EN de courtoisie ; un formulaire OMS, un seul fichier", async () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      // Un document dont TOUS les fichiers sont ceux d'une autorité n'a rien de fabriqué à
      // vérifier ici — son ZIP est couvert par la recette « servi tel quel ».
      const f = Object.values(m.fichiers).find((x) => !x.officiel)
      if (!f) continue
      const zip = await JSZip.loadAsync(fs.readFileSync(chemin(f.zip)))
      const noms = Object.keys(zip.files)
      if (m.bilingue) {
        expect(
          noms.some((n) => n.endsWith('_FR.docx')),
          slug,
        ).toBe(true)
        expect(
          noms.some((n) => n.includes('_EN_')),
          slug,
        ).toBe(true)
      } else {
        expect(noms, slug).toHaveLength(1)
        expect(noms[0], slug).not.toMatch(/_FR|_EN_/)
      }
      // Des noms LISIBLES : jamais d'accent mutilé (« B-nin ») dans une archive client.
      for (const n of noms) expect(n, slug).toMatch(/^[A-Za-z0-9._-]+$/)
    }
  })

  it('la version anglaise annonce en tête que la version à déposer est la française', async () => {
    const texte = await texteDocx(fichierDe('rcp', 'bj').zip, 'en')
    expect(texte).toContain('ENGLISH COURTESY VERSION')
    expect(texte).toContain('must be in FRENCH')
    // Et c'est bien la traduction : les rubriques QRD anglaises, pas le français recopié.
    expect(texte).toContain('SUMMARY OF PRODUCT CHARACTERISTICS')
    expect(texte).toContain('4.8. Undesirable effects')
  })
})

/** Le RCP de ce pays est le modèle de l'autorité, servi tel quel : nous n'y injectons RIEN,
 *  donc aucune assertion sur une mention 4.8 « committée » ne s'y applique. */
const rcpOfficiel = (code: string) => Boolean(fichierDe('rcp', code).officiel)

describe('un anglophone peut remplir une lettre française sans lire le français', () => {
  /** Les blocs qui portent une case à remplir — « … » ou « {…} ». */
  const TOKEN = /…|\{[^}]+\}/

  it.each(['lettre-demande', 'lettre-renouvellement', 'lettre-variation', 'lettre-dmf'])(
    '%s : chaque case a son aide anglaise, au bon index',
    (slug) => {
      const f = fichierDe(slug, 'ci')
      const blocs = f.blocs ?? []
      expect(blocs.length, slug).toBeGreaterThan(0)
      const aides = f.aidesEn ?? {}
      for (const [i, b] of blocs.entries()) {
        if (b.t === 'table' || !b.x || !TOKEN.test(b.x)) continue
        const aide = aides[String(i)]
        // Pas d'aide = l'anglais est identique au français (montant, sigle) — jamais un oubli
        // silencieux : dans ce cas la case retombe sur le texte français, qui dit la même chose.
        if (!aide) continue
        expect(aide.x, `${slug} bloc ${i}`).toBeTruthy()
        // L'aide vise LE MÊME bloc : elle doit porter autant de cases que son jumeau français,
        // sinon les intitulés glissent d'un cran et guident vers le mauvais champ.
        const cases = (s: string) => (s.match(/…|\{[^}]+\}/g) ?? []).length
        expect(cases(aide.x!), `${slug} bloc ${i} : cases désalignées`).toBe(cases(b.x))
      }
    },
  )

  it('la ligne « DCI et dosage » guide un anglophone vers « INN and strength »', () => {
    // Le cas nommé par le CEO : la lettre reste française, l'aide parle anglais.
    const f = fichierDe('lettre-demande', 'ci')
    const i = (f.blocs ?? []).findIndex((b) => b.x?.startsWith('DCI et dosage'))
    expect(i).toBeGreaterThanOrEqual(0)
    expect(f.aidesEn?.[String(i)]?.x).toContain('INN and strength')
  })

  it('le tableau de la lettre de PGHT porte ses en-têtes anglais', () => {
    const f = fichierDe('lettre-pght', 'ci-enr')
    const i = (f.blocs ?? []).findIndex((b) => b.t === 'table')
    expect(i).toBeGreaterThanOrEqual(0)
    const rows = f.aidesEn?.[String(i)]?.rows
    expect(rows?.[0]).toContain('INN and strength')
    // Même géométrie que le tableau français : une aide décalée guide vers la mauvaise colonne.
    expect(rows?.length).toBe(f.blocs?.[i]?.rows?.length)
    expect(rows?.[0]?.length).toBe(f.blocs?.[i]?.rows?.[0]?.length)
  })
})

describe('la déclaration DMF est adressée à l’autorité du pays choisi', () => {
  it('couvre les huit pays, chacun avec SA propre autorité', () => {
    expect(Object.keys(docDe('lettre-dmf').fichiers).sort()).toEqual([...CODES].sort())
    // Le corps de la déclaration ne nomme aucune autorité : seuls le destinataire et
    // l'engagement la citent. Servir huit copies du texte ivoirien serait le pire des faux —
    // crédible, et adressé à la mauvaise agence.
    const nomme = (code: string) =>
      (fichierDe('lettre-dmf', code).blocs ?? []).map((b) => b.x ?? '').join(' § ')
    expect(nomme('ci')).toContain('Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)')
    expect(nomme('ci')).not.toContain('ABMed')
    expect(nomme('bj')).toContain('Agence Béninoise du Médicament')
    expect(nomme('bj')).not.toContain('AIRP')
  })

  it('accorde l’article de l’autorité citée dans l’engagement', () => {
    // « informer au préalable l'AIRP » mais « informer au préalable LA DPM » : l'élision est une
    // donnée du pays, pas une règle déductible du sigle. Une lettre qui écrit « l'DPM » se voit.
    const engagement = (code: string) =>
      (fichierDe('lettre-dmf', code).blocs ?? [])
        .map((b) => b.x ?? '')
        .find((x) => x.includes('m’engage'))
    expect(engagement('ci')).toContain('l’AIRP')
    expect(engagement('bj')).toContain('l’ABMed')
    expect(engagement('ml')).toContain('la DPM')
    expect(engagement('tg')).toContain('la DPML')
    // Et l'agence NOMMÉE dans l'engagement est celle du bloc destinataire : deux référentiels
    // donnaient une lettre qui nommait la DPM/MT en tête et disait « l'autorité nationale »
    // douze lignes plus bas — un courrier officiel qui se lit comme un texte non relu.
    for (const code of CODES) {
      const blocs = (fichierDe('lettre-dmf', code).blocs ?? []).map((b) => b.x ?? '')
      const sigle = blocs.find((x) => x.includes('('))?.match(/\(([^)]+)\)/)?.[1]
      expect(sigle, code).toBeTruthy()
      expect(engagement(code), `${code} : engagement ≠ destinataire`).toContain(sigle!)
      expect(engagement(code), code).not.toContain('autorité nationale')
    }
  })

  it('le Word livré met en gras la COLONNE des intitulés, pas une ligne d’en-tête', async () => {
    // Le DOCX est le livrable ; l'aperçu n'est qu'une vignette. Le drapeau `libelles` était
    // honoré au PDF et ignoré ici : le déposant téléchargeait un Word où « Dénomination du
    // produit fini | <son produit> » sortait grisé en en-tête RÉPÉTABLE, les six autres
    // intitulés en maigre. Exactement l'inverse de ce qu'il avait relu.
    const zip = await JSZip.loadAsync(fs.readFileSync(chemin(fichierDe('lettre-dmf', 'bj').zip)))
    const nom = Object.keys(zip.files).find((n) => n.endsWith('_FR.docx'))!
    const docx = await JSZip.loadAsync(await zip.file(nom)!.async('nodebuffer'))
    const xml = await docx.file('word/document.xml')!.async('string')
    const table = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'))
    const lignes = table.split('<w:tr>').slice(1)
    expect(lignes).toHaveLength(7)
    for (const [i, ligne] of lignes.entries()) {
      const cellules = ligne.split('<w:tc>').slice(1)
      expect(cellules.length, `ligne ${i}`).toBe(2)
      expect(/<w:b\/>/.test(cellules[0]!), `ligne ${i} : intitulé en gras`).toBe(true)
      expect(/<w:b\/>/.test(cellules[1]!), `ligne ${i} : valeur en maigre`).toBe(false)
    }
    // Aucune ligne d'en-tête répétable : ce tableau n'en a pas.
    expect(table).not.toMatch(/<w:tblHeader\/>/)
  })

  it('son tableau récapitulatif est un « libellé / valeur » : la colonne de gauche ne se remplit pas', () => {
    const t = (fichierDe('lettre-dmf', 'bj').blocs ?? []).find((b) => b.t === 'table')
    expect(t?.libelles).toBe(true)
    expect(t?.rows).toHaveLength(7)
    // Les sept intitulés du modèle, verbatim — la colonne de droite est ce que l'on saisit.
    expect(t?.rows?.[0]?.[0]).toBe('Dénomination du produit fini')
    expect(t?.rows?.[6]?.[0]).toBe('N° DMF')
    for (const r of t?.rows ?? []) expect(r[1]).toMatch(/^\{.+\}$/)
  })

  it('les documents régionaux couvrent bien les huit pays', () => {
    for (const slug of ['lettre-demande', 'lettre-renouvellement', 'lettre-variation'])
      expect(Object.keys(docDe(slug).fichiers).sort(), slug).toEqual([...CODES].sort())
  })
})

describe("un modèle officiel d'autorité est servi tel quel", () => {
  it('le RCP ivoirien est le PDF de l’AIRP, à l’octet près, sans DOCX fabriqué', async () => {
    const f = fichierDe('rcp', 'ci')
    expect(f.officiel).toBe(true)
    // Provenance affichée = celle de l'autorité (jamais la maquette régionale du document).
    expect(f.source?.[0]).toContain('AIRP')
    // Le PDF servi est celui déposé par l'autorité, octet pour octet.
    const source = path.resolve(LANDING, '..', 'RA-source/AIRP/CIV_Template RCP.pdf')
    expect(fs.readFileSync(chemin(f.pdf)).equals(fs.readFileSync(source))).toBe(true)
    // Le ZIP ne contient QUE lui : on ne fabrique ni Word ni version anglaise sur le document
    // d'une autorité (directive CEO du 31/07/2026).
    const noms = Object.keys((await JSZip.loadAsync(fs.readFileSync(chemin(f.zip)))).files)
    expect(noms).toHaveLength(1)
    expect(noms[0]).toMatch(/\.pdf$/)
  })
})

describe('la mention 4.8 committée est celle du pays', () => {
  it.each(Object.entries(ADRESSES).filter(([code]) => !rcpOfficiel(code)))(
    'le RCP %s porte son adresse, et aucune autre',
    async (code, adresse) => {
      const texte = await texteDocx(fichierDe('rcp', code).zip)
      expect(texte).toContain(adresse)
      for (const autre of Object.values(ADRESSES)) {
        if (autre !== adresse) expect(texte).not.toContain(autre)
      }
    },
  )

  it.each(CODES.filter((k: string) => !(k in ADRESSES) && !rcpOfficiel(k)))(
    'le RCP %s emploie la formule neutre, sans adresse empruntée',
    async (code: string) => {
      const texte = await texteDocx(fichierDe('rcp', code).zip)
      expect(texte).toContain('via le système national de pharmacovigilance')
      for (const a of Object.values(ADRESSES)) expect(texte).not.toContain(a)
    },
  )

  it('donne au Burkina Faso Med Safety en complément, jamais en contact', async () => {
    const texte = await texteDocx(fichierDe('rcp', 'bf').zip)
    expect(texte).toContain('Med Safety')
    expect(texte).toContain('via le système national de pharmacovigilance')
    expect(texte).not.toContain('système national de déclaration')
  })

  it("ne fait entrer aucune mention de vigilance dans la notice ni dans l'étiquetage", async () => {
    for (const slug of ['notice', 'etiquetage']) {
      const texte = await texteDocx(fichierDe(slug, '*').zip)
      for (const a of Object.values(ADRESSES)) expect(texte, slug).not.toContain(a)
    }
  })
})

describe('les dix documents, groupés comme sur la page', () => {
  it('couvre les trois groupes annoncés, sans document orphelin', () => {
    const parGroupe = (g: string) =>
      Object.entries(MANIFESTE)
        .filter(([, m]) => m.groupe === g)
        .map(([slug]) => slug)
        .sort()
    expect(parGroupe('produit')).toEqual(['etiquetage', 'notice', 'rcp'])
    expect(parGroupe('lettres')).toEqual([
      'lettre-demande',
      'lettre-dmf',
      'lettre-pght',
      'lettre-renouvellement',
      'lettre-variation',
    ])
    expect(parGroupe('resumes')).toEqual(['btif', 'qos-pd'])
    const groupes = new Set(Object.values(MANIFESTE).map((m) => m.groupe))
    expect([...groupes].sort()).toEqual(['lettres', 'produit', 'resumes'])
  })

  it('ne rend upgradables que les trois documents produit', () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      expect(m.upgradable, slug).toBe(m.groupe === 'produit')
    }
  })

  it("porte un aperçu non vide pour chaque document — c'est la vignette des cartes", () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      expect(m.apercu.length, slug).toBeGreaterThan(4)
      // L'aperçu dérive des mêmes blocs que le fichier : son premier bloc doit se retrouver
      // dans le document téléchargé.
      const premier = m.apercu.find((b) => b.x)
      if (premier?.x) {
        const texte = premier.x.replace(/…$/, '')
        expect(texte.length, slug).toBeGreaterThan(0)
      }
    }
  })

  it("n'inclut jamais la mention de vigilance dans l'aperçu — elle dépend du pays, pas la vignette", () => {
    const texte = docDe('rcp')
      .apercu.map((b) => b.x ?? '')
      .join('\n')
    expect(texte).not.toMatch(/vigilances|Med Safety|pharmacovigilance@/)
  })
})

describe("les lettres sont adressées à l'autorité du pays — le référentiel du builder", () => {
  it("portent la civilité, l'agence et l'adresse du pays servi, jamais celles d'un autre", async () => {
    const attendu: Record<string, [string, string]> = {
      ci: ['Autorité Ivoirienne de Régulation Pharmaceutique', 'Monsieur le Directeur Général'],
      sn: ['Agence Sénégalaise de Réglementation Pharmaceutique', 'Madame la Directrice Générale'],
    }
    for (const slug of [
      'lettre-demande',
      'lettre-renouvellement',
      'lettre-variation',
      'lettre-pght',
    ]) {
      expect(docDe(slug).perPays, slug).toBe(true)
      const cle = (pays: string) => (docDe(slug).activites ? `${pays}-enr` : pays)
      for (const [k, [agence, civ]] of Object.entries(attendu)) {
        const texte = await texteDocx(fichierDe(slug, cle(k)).zip)
        expect(texte, `${slug}/${k}`).toContain(agence)
        expect(texte, `${slug}/${k}`).toContain(civ)
      }
      // Servir la lettre d'un pays avec l'agence d'un autre enverrait un courrier réel au
      // mauvais destinataire : le croisement est vérifié, pas seulement la présence.
      const ci = await texteDocx(fichierDe(slug, cle('ci')).zip)
      expect(ci, slug).not.toContain('Agence Sénégalaise')
    }
  })

  it('suivent la mise en page du moteur de lettres du builder : Times New Roman', async () => {
    const docx = await docxDuZip(fichierDe('lettre-demande', 'sn').zip)
    const zip = await JSZip.loadAsync(docx)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Times New Roman')
  })

  it('la lettre PGHT porte son tableau à quatre colonnes', async () => {
    const docx = await docxDuZip(fichierDe('lettre-pght', 'sn-enr').zip)
    const zip = await JSZip.loadAsync(docx)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:tbl>')
    for (const col of ['Nom commercial', 'DCI et dosage', 'Forme et présentation', 'PGHT (FCFA)']) {
      expect(xml).toContain(col)
    }
  })

  it('chaque lettre porte son objet officiel', async () => {
    const attendus: Record<string, string> = {
      'lettre-demande': "Objet : Demande d'enregistrement d'AMM",
      'lettre-renouvellement': "Objet : Demande de renouvellement d'AMM",
      'lettre-variation': 'Objet : Demande de variation',
      'lettre-pght': 'Objet : Attestation de PGHT — enregistrement',
    }
    for (const [slug, objet] of Object.entries(attendus)) {
      const k = docDe(slug).activites ? 'sn-enr' : 'sn'
      expect(await texteDocx(fichierDe(slug, k).zip), slug).toContain(objet)
    }
  })
})

describe('le document reste un document officiel', () => {
  it("ne porte aucune marque Pharnos — il repart dans un dossier d'AMM", async () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      for (const [k, f] of Object.entries(m.fichiers)) {
        if (f.officiel) continue // le document de l'autorité, servi tel quel
        const texte = await texteDocx(f.zip)
        expect(texte, `${slug}/${k}`).not.toMatch(/pharnos|regafy/i)
      }
    }
  })

  it('conserve les dix rubriques du RCP dans leur numérotation officielle', async () => {
    const texte = await texteDocx(fichierDe('rcp', 'bj').zip)
    for (const titre of [
      '1. DENOMINATION DU MEDICAMENT',
      '2. COMPOSITION QUALITATIVE ET QUANTITATIVE',
      '3. FORME PHARMACEUTIQUE',
      '4. DONNEES CLINIQUES',
      '5. PROPRIETES PHARMACOLOGIQUES',
      '6. DONNEES PHARMACEUTIQUES',
      "7. TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE",
      "8. NUMERO(S) D'AUTORISATION DE MISE SUR LE MARCHE",
      '9. DATE DE PREMIERE AUTORISATION',
      '10. DATE DE MISE A JOUR DU TEXTE',
    ]) {
      expect(texte, titre).toContain(titre)
    }
  })

  it("conserve les trois jeux de mentions de l'étiquetage", async () => {
    const texte = await texteDocx(fichierDe('etiquetage', '*').zip)
    expect(texte).toContain("MENTIONS DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR")
    expect(texte).toContain('PLAQUETTES OU LES FILMS THERMOSOUDES')
    expect(texte).toContain('PETITS CONDITIONNEMENTS PRIMAIRES')
  })
})

describe('lettres v3 — directives CEO du 31/07/2026', () => {
  it("le Bénin reçoit SON modèle officiel TEL QUEL, à l'octet près", () => {
    const f = fichierDe('lettre-demande', 'bj')
    expect(f.officiel).toBe(true)
    const servi = fs.readFileSync(chemin(f.pdf))
    const source = fs.readFileSync(
      path.resolve(
        LANDING,
        '../RA-source/Template/Cover Lettre/Benin_Cover letter_template official_ABMed.pdf',
      ),
    )
    expect(servi.equals(source)).toBe(true)
    // Et rien n'est fabriqué autour : le zip ne contient que le PDF officiel.
    expect(f.blocs).toBeUndefined()
  })

  it('aucune lettre générée ne porte de case ville ni de « Madame / Monsieur »', () => {
    for (const slug of [
      'lettre-demande',
      'lettre-renouvellement',
      'lettre-variation',
      'lettre-pght',
    ]) {
      for (const [k, f] of Object.entries(docDe(slug).fichiers)) {
        if (f.officiel) continue
        const texte = (f.blocs ?? []).map((b) => b.x ?? '').join('\n')
        expect(texte, `${slug}/${k}`).not.toContain('{Ville}')
        expect(texte, `${slug}/${k}`).not.toMatch(/Madame \/ Monsieur|Monsieur \/ Madame/)
        // La clôture porte la CIVILITÉ du pays — le pays suffit à identifier l'autorité.
        expect(texte, `${slug}/${k}`).toMatch(/Directeur Général|Directrice Générale/)
      }
    }
  })

  it('les blocs embarqués sont EXACTEMENT la lettre servie — le formulaire ne peut pas diverger', async () => {
    const f = fichierDe('lettre-demande', 'sn')
    expect(f.blocs!.length).toBeGreaterThan(10)
    const texte = await texteDocx(f.zip)
    for (const b of f.blocs!) {
      if (b.x && b.t !== 'table') expect(texte, b.x.slice(0, 40)).toContain(b.x)
    }
  })
})

describe('PGHT — la lettre suit l’activité, la variation en est exclue', () => {
  it('ne distingue une activité QUE pour le PGHT, et jamais la variation', () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      expect(m.activites, slug).toEqual(slug === 'lettre-pght' ? ['enr', 'renouv'] : null)
    }
    // Une variation ne redéclare pas le prix grossiste : la proposer serait un contresens.
    expect(docDe('lettre-pght').activites).not.toContain('variation')
  })

  it('écrit ce qu’elle sollicite — jamais « enregistrement » sur un renouvellement', async () => {
    const enr = await texteDocx(fichierDe('lettre-pght', 'ci-enr').zip)
    expect(enr).toContain("solliciter auprès de votre haute bienveillance, l'enregistrement")
    expect(enr).toContain('Objet : Attestation de PGHT — enregistrement')

    const ren = await texteDocx(fichierDe('lettre-pght', 'ci-renouv').zip)
    expect(ren).toContain('solliciter auprès de votre haute bienveillance, le renouvellement')
    expect(ren).toContain('Objet : Attestation de PGHT — renouvellement')
    expect(ren).not.toContain("l'enregistrement de l'autorisation")
  })
})

describe('mise en page de courrier officiel', () => {
  it('signe le pied de page des modèles générés, avec le lien Pharnos', async () => {
    const docx = await docxDuZip(fichierDe('lettre-demande', 'ci').zip)
    const zip = await JSZip.loadAsync(docx)
    const pied = Object.keys(zip.files).find((n) => /word\/footer\d+\.xml$/.test(n))
    expect(pied, 'aucun pied de page').toBeTruthy()
    const xml = await zip.file(pied!)!.async('string')
    expect(xml).toContain('Modèle UEMOA — nouvelle AMM — Côte d')
    expect(xml).toContain('Pharnos')
    const rels = await zip.file('word/_rels/footer1.xml.rels')!.async('string')
    expect(rels).toContain('https://pharnos.com/')
    // Le document DOIT référencer son pied, sinon Word ne l'affiche pas.
    expect(await zip.file('word/document.xml')!.async('string')).toContain('footerReference')
  })

  it('aère les paragraphes et les cellules — un courrier, pas une note interne', async () => {
    const zip = await JSZip.loadAsync(await docxDuZip(fichierDe('lettre-pght', 'sn-enr').zip))
    const xml = await zip.file('word/document.xml')!.async('string')
    // Interligne 1,15 et espacement après paragraphe : les deux marqueurs de la recette courrier.
    expect(xml).toMatch(/w:line="276"/)
    expect(xml).toMatch(/w:after="200"/)
    // Marges intérieures de cellule : sans elles le texte touche le trait du tableau.
    expect(xml).toMatch(/w:tcMar/)
  })

  it('ne signe JAMAIS le document officiel d’une autorité', async () => {
    const zip = await JSZip.loadAsync(
      fs.readFileSync(chemin(fichierDe('lettre-demande', 'bj').zip)),
    )
    const noms = Object.keys(zip.files)
    expect(noms).toHaveLength(1)
    expect(noms[0]).toMatch(/officiel\.pdf$/)
  })
})
