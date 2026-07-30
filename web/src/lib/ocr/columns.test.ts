import { describe, expect, it } from 'vitest'

import { readingOrder, type LineBox } from './columns'

/** Ligne de gauche d'un dépliant à deux colonnes (image de 1650 px de large). */
const gauche = (y: number, text: string): LineBox => ({ x0: 60, y0: y, x1: 780, text })
/** Ligne de droite. */
const droite = (y: number, text: string): LineBox => ({ x0: 870, y0: y, x1: 1590, text })
/** Titre pleine largeur. */
const pleine = (y: number, text: string): LineBox => ({ x0: 60, y0: y, x1: 1590, text })

describe('readingOrder', () => {
  it('démêle un dépliant bilingue : chaque colonne devient CONTIGUË', () => {
    // Le cas réel qui a motivé ce module (notice KV-Kacin 500). Tesseract rend les lignes dans
    // l'ordre où il les balaie — en traversant les colonnes — et la phrase française se retrouvait
    // coupée par quatre-vingt-dix caractères d'anglais. La citation du modèle, contiguë, devenait
    // alors introuvable : rubrique « Non fourni » sur un document juste.
    const lignes = [
      gauche(100, 'INDICATIONS: Amikacin sulfate is an antibiotic'),
      droite(100, 'INDICATIONS : Le sulfate d’amikacine est un antibiotique'),
      gauche(140, 'active against Gram-negative organisms.'),
      droite(140, 'actif contre les organismes à Gram négatif.'),
      gauche(180, 'CONTRA-INDICATIONS: Hypersensitivity.'),
      droite(180, 'CONTRE-INDICATIONS : Hypersensibilité.'),
      gauche(220, 'WARNINGS: use cautiously in renal failure.'),
      droite(220, 'AVERTISSEMENTS : prudence en cas d’insuffisance.'),
    ]
    const fr = readingOrder(lignes).join('\n')
    // Les trois phrases françaises se suivent, sans une seule ligne anglaise entre elles.
    expect(fr).toContain(
      [
        'INDICATIONS : Le sulfate d’amikacine est un antibiotique',
        'actif contre les organismes à Gram négatif.',
        'CONTRE-INDICATIONS : Hypersensibilité.',
      ].join('\n'),
    )
    // ...et l'anglais aussi, de son côté.
    expect(fr).toContain(
      [
        'INDICATIONS: Amikacin sulfate is an antibiotic',
        'active against Gram-negative organisms.',
        'CONTRA-INDICATIONS: Hypersensitivity.',
      ].join('\n'),
    )
  })

  it('les titres PLEINE LARGEUR viennent en tête, jamais au milieu d’une colonne', () => {
    const lignes = [
      pleine(50, 'NOTICE : INFORMATION DE L’UTILISATEUR'),
      gauche(100, 'Composition anglaise'),
      droite(100, 'Composition française'),
      gauche(140, 'Posologie anglaise'),
      droite(140, 'Posologie française'),
      gauche(180, 'Conservation anglaise'),
      droite(180, 'Conservation française'),
      gauche(220, 'Fabricant anglais'),
      droite(220, 'Fabricant français'),
    ]
    const out = readingOrder(lignes)
    expect(out[0]).toBe('NOTICE : INFORMATION DE L’UTILISATEUR')
  })

  it('une page à UNE seule colonne garde son ordre d’origine', () => {
    // Inventer des colonnes là où il n'y en a pas disperserait un texte qui, lui, était contigu.
    const lignes = Array.from({ length: 12 }, (_, i) => pleine(i * 40, `Ligne ${i}`))
    expect(readingOrder(lignes)).toEqual(lignes.map((l) => l.text))
  })

  it('une marge vide n’est pas une colonne', () => {
    // Sans la vérification que les DEUX côtés portent du texte, une page à colonne unique large
    // trouverait toujours une « gouttière » dans sa marge droite et serait réordonnée pour rien.
    const lignes = Array.from({ length: 12 }, (_, i) => ({
      x0: 60,
      y0: i * 40,
      x1: 900,
      text: `Ligne ${i}`,
    }))
    expect(readingOrder(lignes)).toEqual(lignes.map((l) => l.text))
  })

  it('trop peu de lignes : aucune réorganisation', () => {
    const lignes = [gauche(0, 'a'), droite(0, 'b'), gauche(40, 'c')]
    expect(readingOrder(lignes)).toEqual(['a', 'b', 'c'])
  })

  it('quelques titres pleine largeur ne réfutent pas la gouttière', () => {
    // Un dépliant réel alterne titres pleine largeur et corps sur deux colonnes. Compter chaque
    // traversée comme une réfutation ferait manquer toutes les vraies gouttières.
    const lignes = [
      pleine(0, 'TITRE UN'),
      gauche(40, 'en un'),
      droite(40, 'fr un'),
      gauche(80, 'en deux'),
      droite(80, 'fr deux'),
      gauche(120, 'en trois'),
      droite(120, 'fr trois'),
      gauche(160, 'en quatre'),
      droite(160, 'fr quatre'),
      gauche(200, 'en cinq'),
      droite(200, 'fr cinq'),
    ]
    const out = readingOrder(lignes).join('\n')
    expect(out).toContain('fr un\nfr deux\nfr trois\nfr quatre\nfr cinq')
  })
})
