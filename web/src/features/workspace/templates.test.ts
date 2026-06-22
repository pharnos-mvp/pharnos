import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { TEMPLATES, templateKeyForNode, type TemplateContext } from './templates'

function plain(node: JSONContent): string {
  const self = node.text ?? ''
  const kids = (node.content ?? []).map(plain).join(' ')
  return `${self} ${kids}`.trim()
}

const ctx: TemplateContext = {
  nomCommercial: 'KV-Kacin 500',
  dci: 'Amikacine',
  dosage: '500 mg / 2 ml',
  dciDosage: 'Amikacine 500 mg / 2 ml',
  forme: 'Solution injectable',
  presentation: 'flacon de 2 ml',
  demandeurNom: 'KESHAVLAL VAJECHAND',
  demandeurAdresse: 'Aban House, 25/31 Rope Walk Street, Mumbai - 400023, Inde',
  fabricantNom: 'PHARMAX INDIA PRIVATE LIMITED',
  fabricantAdresse: 'Plot 12, GIDC, Gujarat, Inde',
  agencyName: 'AIRP',
  agencyFull: 'Autorité Ivoirienne de Régulation Pharmaceutique',
  agencyCivilite: 'Monsieur le Directeur Général',
  agencyAdresse: 'Abidjan, Cocody',
  country: 'CI',
  ville: 'Mumbai',
  date: '12 mai 2026',
  poste: 'Directeur des Affaires Réglementaires',
  signataire: 'Dr. KESHAVLAL VAJECHAND',
  pght: '5 000',
}

describe('templates (génération de documents)', () => {
  it('Cover : objet + infos produit + agence', () => {
    const text = plain(TEMPLATES.cover.build(ctx))
    expect(text).toContain('AMM du produit KV-Kacin 500')
    expect(text).toContain('Amikacine')
    expect(text).toContain('KESHAVLAL VAJECHAND')
    expect(text).toContain('Autorité Ivoirienne de Régulation Pharmaceutique')
  })

  it('PGHT : objet + montant', () => {
    const text = plain(TEMPLATES.pght.build(ctx))
    expect(text).toContain('Attestation de Prix Grossiste Hors Taxe')
    expect(text).toContain('5 000')
  })

  it('liaison nœud → template selon le format', () => {
    expect(templateKeyForNode('ctd', '1.1.1')).toBe('cover')
    expect(templateKeyForNode('ctd', '1.1.2')).toBe('pght')
    expect(templateKeyForNode('ectd', '1.0.1')).toBe('cover')
    expect(templateKeyForNode('ctd', '1.3.1')).toBeUndefined()
  })

  it('opération « renouvellement » → la lettre de demande devient lettre de renouvellement', () => {
    expect(templateKeyForNode('ctd', '1.1.1', 'renewal')).toBe('renewal')
    expect(templateKeyForNode('ectd', '1.0.1', 'renewal')).toBe('renewal')
    // PGHT et nouvelle AMM inchangés
    expect(templateKeyForNode('ctd', '1.1.2', 'renewal')).toBe('pght')
    expect(templateKeyForNode('ctd', '1.1.1', 'new_ma')).toBe('cover')
  })

  it('valeurs manquantes → marqueurs à compléter', () => {
    const text = plain(TEMPLATES.cover.build({ ...ctx, dci: '', dosage: '', dciDosage: '' }))
    expect(text).toContain('[DCI et dosage]')
  })
})

describe('templates bilingues (M3 — EN additif, FR par défaut inchangé)', () => {
  it('Cover EN : objet + libellés EN ; FR (défaut) inchangé', () => {
    const en = plain(TEMPLATES.cover.build(ctx, 'en'))
    expect(en).toContain('Application for marketing authorisation (MA) of the product KV-Kacin 500')
    expect(en).toContain('Trade name')
    expect(en).toContain('Please accept')
    expect(en).not.toContain('Demande d’enregistrement')
    const fr = plain(TEMPLATES.cover.build(ctx))
    expect(fr).toContain('Demande d’enregistrement d’AMM')
    expect(fr).not.toContain('Application for marketing authorisation')
  })

  it('PGHT EN : objet EN + montant conservé', () => {
    const en = plain(TEMPLATES.pght.build(ctx, 'en'))
    expect(en).toContain('Certificate of Wholesale Price Excluding Tax (PGHT)')
    expect(en).toContain('5 000')
  })

  it('civilité EN résolue depuis agencyCiviliteEn (repli agencyCivilite)', () => {
    const en = plain(
      TEMPLATES.cover.build({ ...ctx, agencyCiviliteEn: 'The Director General' }, 'en'),
    )
    expect(en).toContain('The Director General')
    // repli FR si pas d'EN fourni
    const enFallback = plain(TEMPLATES.cover.build(ctx, 'en'))
    expect(enFallback).toContain('Monsieur le Directeur Général')
  })
})

describe('templates — lettre de renouvellement d’AMM (renewal)', () => {
  const renewalCtx: TemplateContext = {
    ...ctx,
    ammNumero: 'BJ-2021-0456',
    ammDateDelivrance: '15/03/2021',
    ammDateExpiration: '14/03/2026',
  }

  it('FR : objet « renouvellement » + réf. AMM + bloc AMM (n° / délivrance / expiration)', () => {
    const text = plain(TEMPLATES.renewal.build(renewalCtx))
    expect(text).toContain('Demande de renouvellement d’AMM du produit KV-Kacin 500')
    expect(text).toContain('renouvellement de l’autorisation de mise sur le marché')
    expect(text).toContain('AMM n° BJ-2021-0456 délivrée le 15/03/2021') // ligne Réf.
    expect(text).toContain('14/03/2026') // date d’expiration (corps)
    expect(text).toContain('KESHAVLAL VAJECHAND') // infos produit/parties conservées
  })

  it('valeurs AMM manquantes (chemin dossier) → marqueurs éditables', () => {
    const text = plain(TEMPLATES.renewal.build(ctx))
    expect(text).toContain('[N° d’AMM]')
    expect(text).toContain('[Date de délivrance]')
    expect(text).toContain('[Date d’expiration]')
  })

  it('EN : objet « renewal » + réf. EN', () => {
    const en = plain(TEMPLATES.renewal.build({ ...renewalCtx }, 'en'))
    expect(en).toContain('Application for renewal of marketing authorisation (MA) of the product')
    expect(en).toContain('MA No. BJ-2021-0456 granted on 15/03/2021')
  })

  it('cover (nouvelle AMM) INCHANGÉ : ni « renouvellement » ni « Réf. » — pilote-safe', () => {
    const cover = plain(TEMPLATES.cover.build(renewalCtx))
    expect(cover).toContain('Demande d’enregistrement d’AMM')
    expect(cover).not.toContain('renouvellement')
    expect(cover).not.toContain('Réf.')
    expect(cover).not.toContain('BJ-2021-0456')
  })
})
