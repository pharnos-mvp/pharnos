import { describe, expect, it } from 'vitest'

import { dossierBaseName, safeFileName, slugify } from './download-utils'

describe('safeFileName — préserve espaces/casse/accents, retire les caractères interdits', () => {
  it('conserve espaces, casse et accents', () => {
    expect(safeFileName('Gynoril ovule')).toBe('Gynoril ovule')
    expect(safeFileName('Énoxaparine 40 mg')).toBe('Énoxaparine 40 mg')
  })

  it('retire les caractères interdits par les systèmes de fichiers', () => {
    expect(safeFileName('A/B:C*D?E"F<G>H|I\\J')).toBe('A B C D E F G H I J')
  })

  it('compacte les espaces et coupe les bords', () => {
    expect(safeFileName('  Doliprane   500  ')).toBe('Doliprane 500')
  })

  it('repli sur "document" si vide', () => {
    expect(safeFileName('   ')).toBe('document')
    expect(safeFileName('//::')).toBe('document')
  })
})

describe('dossierBaseName — {Nom produit}_M1_{sigle pays}', () => {
  it('format exact attendu par le CEO (espaces conservés, sigle en minuscules)', () => {
    expect(dossierBaseName('Gynoril ovule', 'BJ')).toBe('Gynoril ovule_M1_bj')
  })

  it('le PDF compilé et l’audit dérivent du même socle', () => {
    const base = dossierBaseName('Doliprane 500 mg', 'CI')
    expect(`${base}.pdf`).toBe('Doliprane 500 mg_M1_ci.pdf')
    expect(`${base}_Audit.pdf`).toBe('Doliprane 500 mg_M1_ci_Audit.pdf')
  })

  it('tolère un pays vide', () => {
    expect(dossierBaseName('X', '')).toBe('X_M1_')
  })
})

describe('slugify (inchangé — usages .html/exports)', () => {
  it('slug minuscule à tirets', () => {
    expect(slugify('Gynoril Ovule')).toBe('gynoril-ovule')
  })
})
