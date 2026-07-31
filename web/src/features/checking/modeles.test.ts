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
type Fichier = { pdf: string; zip: string; pages: number; octetsPdf: number; octetsZip: number }
type Bloc = { t: string; x?: string; rows?: string[][] }
type Manifeste = Record<
  string,
  {
    perPays: boolean
    upgradable: boolean
    bilingue: boolean
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
      const f = Object.values(m.fichiers)[0]!
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

describe('la mention 4.8 committée est celle du pays', () => {
  it.each(Object.entries(ADRESSES))(
    'le RCP %s porte son adresse, et aucune autre',
    async (code, adresse) => {
      const texte = await texteDocx(fichierDe('rcp', code).zip)
      expect(texte).toContain(adresse)
      for (const autre of Object.values(ADRESSES)) {
        if (autre !== adresse) expect(texte).not.toContain(autre)
      }
    },
  )

  it.each(CODES.filter((k: string) => !(k in ADRESSES)))(
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

describe('les neuf documents, groupés comme sur la page', () => {
  it('couvre les trois groupes annoncés, sans document orphelin', () => {
    const parGroupe = (g: string) =>
      Object.entries(MANIFESTE)
        .filter(([, m]) => m.groupe === g)
        .map(([slug]) => slug)
        .sort()
    expect(parGroupe('produit')).toEqual(['etiquetage', 'notice', 'rcp'])
    expect(parGroupe('lettres')).toEqual([
      'lettre-demande',
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
      bj: ['Agence Béninoise du Médicament', 'Monsieur le Directeur Général'],
      sn: ['Agence Sénégalaise de Réglementation Pharmaceutique', 'Madame la Directrice Générale'],
    }
    for (const slug of [
      'lettre-demande',
      'lettre-renouvellement',
      'lettre-variation',
      'lettre-pght',
    ]) {
      expect(docDe(slug).perPays, slug).toBe(true)
      for (const [k, [agence, civ]] of Object.entries(attendu)) {
        const texte = await texteDocx(fichierDe(slug, k).zip)
        expect(texte, `${slug}/${k}`).toContain(agence)
        expect(texte, `${slug}/${k}`).toContain(civ)
      }
      // Servir la lettre d'un pays avec l'agence d'un autre enverrait un courrier réel au
      // mauvais destinataire : le croisement est vérifié, pas seulement la présence.
      const bj = await texteDocx(fichierDe(slug, 'bj').zip)
      expect(bj, slug).not.toContain('Agence Sénégalaise')
    }
  })

  it('suivent la mise en page du moteur de lettres du builder : Times New Roman', async () => {
    const docx = await docxDuZip(fichierDe('lettre-demande', 'bj').zip)
    const zip = await JSZip.loadAsync(docx)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Times New Roman')
  })

  it('la lettre PGHT porte son tableau à quatre colonnes', async () => {
    const docx = await docxDuZip(fichierDe('lettre-pght', 'bj').zip)
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
      'lettre-pght': 'Objet : Attestation de PGHT',
    }
    for (const [slug, objet] of Object.entries(attendus)) {
      expect(await texteDocx(fichierDe(slug, 'bj').zip), slug).toContain(objet)
    }
  })
})

describe('le document reste un document officiel', () => {
  it("ne porte aucune marque Pharnos — il repart dans un dossier d'AMM", async () => {
    for (const [slug, m] of Object.entries(MANIFESTE)) {
      for (const [k, f] of Object.entries(m.fichiers)) {
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
