// La livraison — le seul appel dont la sortie devient un DOCUMENT DÉPOSÉ chez une agence.
import { describe, expect, it } from 'vitest'

import { fabriquerFichiers, lireLivrable } from './livraison'

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
    expect(a.zipName).toBe('KV-Kacin-upgrade.zip')
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
