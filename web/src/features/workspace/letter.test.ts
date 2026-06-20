import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import {
  buildLetterContext,
  emptyLetterFields,
  letterFieldsFromValues,
  productToLetterFields,
} from './letter-context'
import { letterDocToHtml } from './letter-render'
import { TEMPLATES } from './templates'

describe('buildLetterContext (lettre standalone Bibliothèque, pilotée par pays)', () => {
  it('le pays cible remplit le destinataire (agence + civilité + ville depuis l’adresse)', () => {
    const f = { ...emptyLetterFields('BJ'), demandeurAdresse: 'Aban House, Cotonou - 12345, Bénin' }
    const fr = buildLetterContext(f, 'fr')
    expect(fr.agencyFull).toContain('Agence Béninoise du Médicament')
    expect(fr.agencyFull).toContain('(ABMed)')
    expect(fr.agencyCivilite).toContain('Directeur') // directeur BJ = M
    expect(fr.ville).toBe('Cotonou') // extrait de l’adresse du demandeur
    const en = buildLetterContext(f, 'en')
    expect(en.agencyCiviliteEn).toBe('The Director General')
  })

  it('champs vides → marqueurs localisés (FR/EN)', () => {
    expect(buildLetterContext(emptyLetterFields('SN'), 'fr').nomCommercial).toBe('[Nom commercial]')
    expect(buildLetterContext(emptyLetterFields('SN'), 'en').nomCommercial).toBe('[Trade name]')
  })

  it('letterFieldsFromValues lit les valeurs persistées (repli sur les défauts)', () => {
    const f = letterFieldsFromValues({ country: 'ML', nomCommercial: 'X' })
    expect(f.country).toBe('ML')
    expect(f.nomCommercial).toBe('X')
    expect(f.pght).toBe('')
  })
})

describe('letterDocToHtml (rendu A4 générique du courrier)', () => {
  it('rend l’alignement à droite, les puces et le gras depuis le doc de lettre', () => {
    const ctx = buildLetterContext({ ...emptyLetterFields('CI'), nomCommercial: 'KV-Kacin' }, 'fr')
    const html = letterDocToHtml(TEMPLATES.cover.build(ctx, 'fr'))
    expect(html).toContain('class="l-p l-r"') // date / destinataire alignés à droite
    expect(html).toContain('<ul class="l-ul">') // liste des infos produit
    expect(html).toContain('<strong>') // libellés en gras
    expect(html).toContain('KV-Kacin')
  })

  it('échappe le HTML des valeurs saisies (anti-injection)', () => {
    const ctx = buildLetterContext(
      { ...emptyLetterFields('CI'), nomCommercial: '<script>x</script>' },
      'fr',
    )
    const html = letterDocToHtml(TEMPLATES.cover.build(ctx, 'fr'))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('M3.1 — désignation autorité, devise PGHT, synchro produit', () => {
  it('la désignation choisie surcharge la civilité auto de l’agence (repli auto si vide)', () => {
    const f = { ...emptyLetterFields('BJ'), civilite: 'Madame la Directrice Générale' }
    expect(buildLetterContext(f, 'fr').agencyCivilite).toBe('Madame la Directrice Générale')
    expect(buildLetterContext(emptyLetterFields('BJ'), 'fr').agencyCivilite).toContain('Directeur')
  })

  it('devise PGHT : portée au contexte et affichée dans la lettre (défaut FCFA)', () => {
    const f = { ...emptyLetterFields('SN'), pght: '12 500', pghtCurrency: 'Naira' }
    const ctx = buildLetterContext(f, 'fr')
    expect(ctx.pghtCurrency).toBe('Naira')
    const html = letterDocToHtml(TEMPLATES.pght.build(ctx, 'fr'))
    expect(html).toContain('PGHT (Naira)')
    expect(html).toContain('12 500')
    expect(buildLetterContext(emptyLetterFields('SN'), 'fr').pghtCurrency).toBe('FCFA')
  })

  it('productToLetterFields mappe la fiche produit (titulaire→demandeur, fabricant)', () => {
    const product: ProductRecord = {
      id: 'p1',
      orgId: 'o1',
      nomCommercial: 'KV-Super Muscle',
      dci: 'Diclofénac',
      dosage: '50 mg',
      forme: 'Comprimé',
      presentation: 'Boîte de 20',
      classeTherapeutique: '',
      codeAtc: '',
      titulaire: 'KESHAVLAL VAJECHAND',
      titulaireAdresse: 'Mumbai, Inde',
      fabricant: 'AURA LIFECARE',
      fabricantAdresse: 'Gujarat, Inde',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
    }
    const f = productToLetterFields(product)
    expect(f.nomCommercial).toBe('KV-Super Muscle')
    expect(f.demandeurNom).toBe('KESHAVLAL VAJECHAND')
    expect(f.demandeurAdresse).toBe('Mumbai, Inde')
    expect(f.fabricantNom).toBe('AURA LIFECARE')
  })
})
