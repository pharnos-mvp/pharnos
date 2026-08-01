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

  describe('déclaration DMF (obligation AIRP — note n° 1668)', () => {
    it("ne s'ouvre qu'au 1.2.3 d'un dossier ivoirien", () => {
      expect(templateKeyForNode('ctd', '1.2.3', 'new_ma', 'CI')).toBe('dmf')
      expect(templateKeyForNode('ectd', '1.2.3', 'new_ma', 'CI')).toBe('dmf')
      // Aucun autre pays n'impose cette déclaration : le nœud reste sans modèle.
      expect(templateKeyForNode('ctd', '1.2.3', 'new_ma', 'BJ')).toBeUndefined()
      expect(templateKeyForNode('ctd', '1.2.3', 'new_ma', 'SN')).toBeUndefined()
      // Sans pays (appelant historique), le socle régional répond seul — comportement inchangé.
      expect(templateKeyForNode('ctd', '1.2.3')).toBeUndefined()
      expect(templateKeyForNode('ctd', '1.2.4', 'new_ma', 'CI')).toBeUndefined()
    })

    it('ne vaut que pour les DEUX opérations que la note n° 1668 énumère', () => {
      // « Toute nouvelle demande d'enregistrement […] ; Toute demande de renouvellement […] ».
      expect(templateKeyForNode('ctd', '1.2.3', 'new_ma', 'CI')).toBe('dmf')
      expect(templateKeyForNode('ctd', '1.2.3', 'renewal', 'CI')).toBe('dmf')
      // La VARIATION n'y figure pas : ne pas annoncer une pièce que l'AIRP ne réclame pas là.
      expect(templateKeyForNode('ctd', '1.2.3', 'variation', 'CI')).toBeUndefined()
      expect(templateKeyForNode('ectd', '1.2.3', 'variation', 'CI')).toBeUndefined()
      // Opération inconnue : on ne propose rien plutôt que de proposer à tort.
      expect(templateKeyForNode('ctd', '1.2.3', undefined, 'CI')).toBeUndefined()
    })

    it("le socle régional prime : un modèle national n'évince aucune lettre existante", () => {
      expect(templateKeyForNode('ctd', '1.1.1', 'new_ma', 'CI')).toBe('cover')
      expect(templateKeyForNode('ctd', '1.1.2', 'new_ma', 'CI')).toBe('pght')
      expect(templateKeyForNode('ctd', '1.1.1', 'renewal', 'CI')).toBe('renewal')
    })

    it('reprend la prose de la note AIRP et récapitule les 7 informations', () => {
      const doc = TEMPLATES.dmf.build(ctx)
      const text = plain(doc)
      expect(text).toContain('Déclaration relative à la certification des numéros DMF')
      expect(text).toContain('est exact, valide et conforme')
      expect(text).toContain('pays d’origine de cette substance active')
      expect(text).toContain('pour servir et valoir ce que de droit')
      // L'engagement vise l'agence du dossier, pas un sigle codé en dur.
      expect(text).toContain('informer au préalable l’AIRP')
      // Le récapitulatif est un VRAI tableau (compilé par drawTable / exporté en DOCX), 7 lignes.
      const table = (doc.content ?? []).find((n) => n.type === 'table')
      expect(table).toBeDefined()
      expect((table?.content ?? []).filter((r) => r.type === 'tableRow')).toHaveLength(7)
      // Ce que le dossier sait est pré-rempli.
      expect(text).toContain('KV-Kacin 500')
      expect(text).toContain('Amikacine')
      expect(text).toContain('PHARMAX INDIA PRIVATE LIMITED')
    })

    it('ce que le dossier ignore reste un marqueur éditable, jamais une valeur devinée', () => {
      const text = plain(TEMPLATES.dmf.build(ctx))
      expect(text).toContain('[Site de fabrication de la substance active]')
      expect(text).toContain('[Autorité de réglementation]')
      expect(text).toContain('[N° DMF]')
      // Renseignés, les mêmes champs remplacent le marqueur.
      const rempli = plain(
        TEMPLATES.dmf.build({
          ...ctx,
          apiFabricantSite: 'Zhejiang Ruibang, Hangzhou, Chine — qa@ruibang.cn — +86 571 000',
          dmfAutorite: 'US FDA',
          dmfNumero: 'DMF 032145',
        }),
      )
      expect(rempli).toContain('DMF 032145')
      expect(rempli).toContain('US FDA')
      expect(rempli).not.toContain('[N° DMF]')
    })

    it('version anglaise de courtoisie', () => {
      const text = plain(TEMPLATES.dmf.build(ctx, 'en'))
      expect(text).toContain('Declaration on the certification of DMF numbers')
      expect(text).toContain('accurate, valid and consistent')
      expect(text).toContain('DMF No.')
    })
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
    expect(text).toContain('14/03/2026') // date d’expiration (corps, dans la liste produit)
    expect(text).toContain('KESHAVLAL VAJECHAND') // infos produit/parties conservées
    expect(text).not.toContain('référencée comme suit') // phrase d'intro retirée (retour CEO)
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
