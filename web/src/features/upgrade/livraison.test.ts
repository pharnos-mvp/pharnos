// La livraison — le seul appel dont la sortie devient un DOCUMENT DÉPOSÉ chez une agence.
import { describe, expect, it } from 'vitest'

import { extensionDe, fabriquerFichiers, labelFichier, lireLivrable, nomArchive } from './livraison'

const FR = [
  '## RÉSUMÉ DES CARACTÉRISTIQUES DU PRODUIT',
  '',
  '### 1. DÉNOMINATION DU MÉDICAMENT',
  '',
  'KV-KACIN 500, poudre pour solution injectable.',
].join('\n')

const RAPPORT = ['# Revue réglementaire du RCP', '', '## Constats', '', 'Aucun.'].join('\n')

const LIVRABLE = {
  fr: FR,
  en: FR.replace('RÉSUMÉ DES CARACTÉRISTIQUES DU PRODUIT', 'SUMMARY OF PRODUCT CHARACTERISTICS'),
  rapport: RAPPORT,
  slug: 'KV-Kacin',
  reportHeader: 'KV-KACIN 500 — Revue réglementaire',
  reportLang: 'fr',
  created: '2026-08-09T12:00:00.000Z',
  sourceKind: 'text',
}

describe('lireLivrable', () => {
  it('⚠️ un champ manquant REFUSE — jamais un fichier au contenu `undefined`', () => {
    // `poster` ne valide rien : sans cette garde, un `rapport` absent traverserait jusqu'au rendu
    // et produirait un PDF vide, téléchargé, ouvert chez l'agence.
    expect('erreur' in lireLivrable({ ...LIVRABLE, rapport: undefined })).toBe(true)
    expect('erreur' in lireLivrable({ ...LIVRABLE, fr: '' })).toBe(true)
    expect('erreur' in lireLivrable(null)).toBe(true)
    const ok = lireLivrable(LIVRABLE)
    expect('erreur' in ok).toBe(false)
  })
})

describe('fabriquerFichiers', () => {
  it('rend les CINQ fichiers, et deux fabrications donnent les MÊMES octets', async () => {
    const l = lireLivrable(LIVRABLE)
    if ('erreur' in l) throw new Error(l.erreur)
    const a = await fabriquerFichiers(l)
    const b = await fabriquerFichiers(l)
    if ('erreur' in a || 'erreur' in b) throw new Error('fabrication refusée')
    expect(a.files).toHaveLength(5)
    // ⚠️ La conformité binaire est LE critère de recette U5 : `created` vient du serveur, le même
    // pour le navigateur et le banc — sans elle, pdf-lib horodate et chaque rendu diverge.
    for (let i = 0; i < a.files.length; i++) {
      if (a.files[i]!.kind !== 'pdf') continue // les DOCX portent l'horodatage de la lib (connu)
      expect(
        Buffer.from(a.files[i]!.bytes).equals(Buffer.from(b.files[i]!.bytes)),
        a.files[i]!.fileName,
      ).toBe(true)
    }
    // LOT B3 : l'archive porte le nom du document que l'acheteur connaît — la langue
    // source absente (fixture sans `sourceLang`) retombe sur la forme du gabarit.
    expect(a.zipName).toBe('KV-Kacin_RCP Upgrade.zip')
  })

  it('⚠️ SANS date de complétion, on REFUSE — jamais un repli sur l’horloge locale', async () => {
    // Un repli silencieux rendrait la conformité binaire invérifiable exactement le jour où on en
    // a besoin, et personne ne le verrait : les fichiers sortiraient quand même.
    const l = lireLivrable({ ...LIVRABLE, created: null })
    if ('erreur' in l) throw new Error(l.erreur)
    const r = await fabriquerFichiers(l)
    expect('erreur' in r).toBe(true)
  })
})

describe('nomArchive (LOT B3)', () => {
  it("l'archive porte le nom du document que l'acheteur connaît", () => {
    expect(nomArchive('KV-RL', 'fr')).toBe('KV-RL_RCP Upgrade.zip')
    expect(nomArchive('KV-RL', 'en')).toBe('KV-RL_SmPC Upgrade.zip')
    // Un job d'avant la migration 0093 retombe sur la forme du gabarit (FR).
    expect(nomArchive('KV-RL', null)).toBe('KV-RL_RCP Upgrade.zip')
  })
})

describe('lireLivrable : stats et langue source (LOT B3)', () => {
  const base = {
    fr: '# RCP',
    en: '# SmPC',
    rapport: '# Revue',
    slug: 'KV-RL',
    reportHeader: 'KV-RL — Revue réglementaire',
    reportLang: 'fr',
    created: '2026-08-14T02:59:59.866Z',
    sourceKind: 'ocr',
  }

  it('des stats complètes passent, une langue source EN aussi', () => {
    const l = lireLivrable({
      ...base,
      sourceLang: 'en',
      stats: { reprises: 23, aCompleter: 6, deplaces: 11, aRelire: 4 },
    })
    expect('erreur' in l).toBe(false)
    if ('erreur' in l) return
    expect(l.sourceLang).toBe('en')
    expect(l.stats).toEqual({ reprises: 23, aCompleter: 6, deplaces: 11, aRelire: 4 })
  })

  it('des stats INCOMPLÈTES tombent à null entières — jamais une tuile à `undefined`', () => {
    const l = lireLivrable({ ...base, stats: { reprises: 23, aCompleter: 6 } })
    expect('erreur' in l).toBe(false)
    if ('erreur' in l) return
    expect(l.stats).toBeNull()
    // Absentes (job d'avant 0093) : null aussi, et la langue inconnue reste null.
    const vieux = lireLivrable(base)
    if ('erreur' in vieux) return
    expect(vieux.stats).toBeNull()
    expect(vieux.sourceLang).toBeNull()
  })
})

describe('labelFichier + extensionDe (LOT B1)', () => {
  it('des labels HUMAINS, décidés sur le nom — jamais sur une position de liste', () => {
    expect(labelFichier('KV-RL-RCP-FR.pdf', 'fr')).toBe('RCP — français')
    expect(labelFichier('KV-RL-RCP-FR.docx', 'fr')).toBe('RCP — français')
    expect(labelFichier('KV-RL-SmPC-EN.pdf', 'fr')).toBe('SmPC — anglais')
    expect(labelFichier('KV-RL-revue-reglementaire-RCP.pdf', 'fr')).toContain('Revue réglementaire')
    expect(labelFichier('KV-RL-SmPC-regulatory-review.pdf', 'en')).toContain('Regulatory review')
    // Un nom inconnu garde son nom : mentir sur un fichier serait pire qu'être technique.
    expect(labelFichier('mystere.bin', 'fr')).toBe('mystere.bin')
  })

  it("l'extension s'affiche en capitales, comme au mockup", () => {
    expect(extensionDe('KV-RL-RCP-FR.docx')).toBe('DOCX')
    expect(extensionDe('KV-RL-RCP-FR.pdf')).toBe('PDF')
    // Sans point : rien — jamais le nom entier en capitales.
    expect(extensionDe('mystere')).toBe('')
  })
})
