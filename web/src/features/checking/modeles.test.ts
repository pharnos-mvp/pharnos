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

const LANDING = path.resolve(__dirname, '../../../../landing')
const chemin = (url: string) => path.join(LANDING, url.replace(/^\//, ''))

const CODES = PAYS.map((p: { k: string }) => p.k)
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

/** Texte brut de `word/document.xml` — suffisant pour vérifier la PRÉSENCE d'une mention.
 *  Les entités XML sont décodées : sans cela `d&apos;administration` ne contiendrait pas
 *  `d'administration`, et le test passerait à côté d'un titre pourtant présent. */
async function texteDocx(url: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(chemin(url)))
  const doc = zip.file('word/document.xml')
  expect(doc, `${url} : word/document.xml absent`).not.toBeNull()
  return (await doc!.async('string'))
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITES[e])
}

describe('manifeste et fichiers restent accordés', () => {
  it('porte une version', () => {
    expect(MODELES_VERSION).toMatch(/^\d{4}\.\d+$/)
  })

  it('décrit exactement les trois documents de la source', () => {
    expect(Object.keys(MODELES_FICHIERS).sort()).toEqual(DOCS.map((d) => d.slug).sort())
  })

  it('décline par pays les documents qui portent une mention nationale, et eux seuls', () => {
    // Huit copies identiques sous huit noms feraient passer la recette « changer de pays change
    // le fichier » sans rien changer. Le manifeste doit dire la vérité sur ce qui varie.
    for (const doc of DOCS) {
      expect(MODELES_FICHIERS[doc.slug].perPays, doc.slug).toBe(varieParPays(doc))
    }
  })

  it('couvre les huit pays pour le RCP', () => {
    expect(Object.keys(MODELES_FICHIERS.rcp.fichiers).sort()).toEqual([...CODES].sort())
  })

  it('sert un fichier unique pour les documents sans mention nationale', () => {
    for (const [slug, m] of Object.entries(MODELES_FICHIERS)) {
      if (m.perPays) continue
      expect(Object.keys(m.fichiers), slug).toEqual(['*'])
    }
  })

  it('référence des fichiers réellement présents, à la taille annoncée', () => {
    // Un manifeste régénéré sans committer `landing/modeles/` sert un 404 sous un bouton
    // « Télécharger le modèle » — l'échec le plus coûteux de cette page.
    for (const [slug, m] of Object.entries(MODELES_FICHIERS)) {
      for (const [k, f] of Object.entries(m.fichiers)) {
        expect(fs.existsSync(chemin(f.pdf)), `${slug}/${k} pdf`).toBe(true)
        expect(fs.existsSync(chemin(f.docx)), `${slug}/${k} docx`).toBe(true)
        expect(fs.statSync(chemin(f.pdf)).size, `${slug}/${k} taille pdf`).toBe(f.octetsPdf)
        expect(fs.statSync(chemin(f.docx)).size, `${slug}/${k} taille docx`).toBe(f.octetsDocx)
        expect(f.pages, `${slug}/${k} pages`).toBeGreaterThan(0)
      }
    }
  })
})

describe('la mention 4.8 committée est celle du pays', () => {
  it.each(Object.entries(ADRESSES))(
    'le RCP %s porte son adresse, et aucune autre',
    async (code, adresse) => {
      const texte = await texteDocx(MODELES_FICHIERS.rcp.fichiers[code].docx)
      expect(texte).toContain(adresse)
      for (const autre of Object.values(ADRESSES)) {
        if (autre !== adresse) expect(texte).not.toContain(autre)
      }
    },
  )

  it.each(CODES.filter((k: string) => !(k in ADRESSES)))(
    'le RCP %s emploie la formule neutre, sans adresse empruntée',
    async (code: string) => {
      const texte = await texteDocx(MODELES_FICHIERS.rcp.fichiers[code].docx)
      expect(texte).toContain('via le système national de pharmacovigilance')
      for (const a of Object.values(ADRESSES)) expect(texte).not.toContain(a)
    },
  )

  it('donne au Burkina Faso Med Safety en complément, jamais en contact', async () => {
    const texte = await texteDocx(MODELES_FICHIERS.rcp.fichiers.bf.docx)
    expect(texte).toContain('Med Safety')
    expect(texte).toContain('via le système national de pharmacovigilance')
    expect(texte).not.toContain('système national de déclaration')
  })

  it("ne fait entrer aucune mention de vigilance dans la notice ni dans l'étiquetage", async () => {
    for (const slug of ['notice', 'etiquetage']) {
      const texte = await texteDocx(MODELES_FICHIERS[slug].fichiers['*'].docx)
      for (const a of Object.values(ADRESSES)) expect(texte, slug).not.toContain(a)
    }
  })
})

describe('le document reste un document officiel', () => {
  it("ne porte aucune marque Pharnos — il repart dans un dossier d'AMM", async () => {
    for (const [slug, m] of Object.entries(MODELES_FICHIERS)) {
      for (const [k, f] of Object.entries(m.fichiers)) {
        const texte = await texteDocx(f.docx)
        expect(texte, `${slug}/${k}`).not.toMatch(/pharnos|regafy/i)
      }
    }
  })

  it('conserve les dix rubriques du RCP dans leur numérotation officielle', async () => {
    const texte = await texteDocx(MODELES_FICHIERS.rcp.fichiers.bj.docx)
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
    const texte = await texteDocx(MODELES_FICHIERS.etiquetage.fichiers['*'].docx)
    expect(texte).toContain("MENTIONS DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR")
    expect(texte).toContain('PLAQUETTES OU LES FILMS THERMOSOUDES')
    expect(texte).toContain('PETITS CONDITIONNEMENTS PRIMAIRES')
  })
})
