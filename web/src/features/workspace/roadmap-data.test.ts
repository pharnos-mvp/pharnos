import { describe, expect, it } from 'vitest'

import { agencyFor, regulatoryProfileFor } from './roadmap-data'

describe('regulatoryProfileFor', () => {
  it('retourne undefined pour un pays sans barème (repli générique)', () => {
    expect(regulatoryProfileFor('ML')).toBeUndefined()
  })

  it('contacts agences (hors bloc destinataire des lettres) — ARP + AIRP', () => {
    expect(agencyFor('SN')).toMatchObject({
      telephone: '+221 33 868 11 27',
      email: 'contact@arp.sn',
    })
    expect(agencyFor('CI')?.email).toBe('secretariat@airp.ci')
    // Pays sans contacts fournis : champs absents (la fiche masque les lignes).
    expect(agencyFor('ML')?.telephone).toBeUndefined()
  })

  it("Côte d'Ivoire (AIRP) — décret n° 2015-602 + modalités n° 01509 + circulaire n° 0914", () => {
    const p = regulatoryProfileFor('CI')
    expect(p?.currency).toBe('FCFA')
    expect(p?.fees).toMatchObject({
      new_ma: 500000,
      renewal: 250000,
      variation_minor: 50000,
      variation_major: 500000,
    })
    // Réduction UEMOA (moitié prix) + perception par forme/dosage/présentation = notes.
    for (const k of ['new_ma', 'renewal', 'variation'] as const) {
      expect(p?.fees.notes?.[k]?.fr, k).toContain('UEMOA')
      expect(p?.fees.notes?.[k]?.en, k).toBeTruthy()
    }
    // Échantillons : 30 modèles-vente + CoA ≥ 2/3 durée de vie + cas hospitaliers/PGHT.
    expect(p?.samples.new_ma).toHaveLength(3)
    expect(p?.samples.new_ma?.[0]?.fr).toContain('Trente (30)')
    expect(p?.samples.reserve?.fr).toBeTruthy()
    // Dépôt sur sessions programmées (note circulaire n° 0914/AIRP).
    expect(p?.submissionNote?.fr).toMatch(/sessions/i)
    expect(p?.submissionNote?.en).toBeTruthy()
    // Délai non fixé par les textes fournis.
    expect(p?.processingDays).toBeUndefined()
  })

  it('Bénin (ABMed) — barème CEO', () => {
    const p = regulatoryProfileFor('BJ')
    expect(p?.fees).toMatchObject({
      new_ma: 500000,
      renewal: 250000,
      variation_minor: 50000,
      variation_major: 100000,
    })
    expect(p?.processingDays).toBe(120)
  })

  it('Sénégal (ARP) — décret n° 2025-1833, industrie étrangère/générique en montants nus', () => {
    const p = regulatoryProfileFor('SN')
    expect(p?.currency).toBe('FCFA')
    expect(p?.fees).toMatchObject({
      new_ma: 1000000,
      renewal: 500000,
      variation_minor: 100000,
      variation_major: 1000000,
    })
    // Les cas particuliers (princeps, accélérée, industrie locale, pénalité de retard)
    // sont portés par les notes bilingues de chaque activité.
    for (const k of ['new_ma', 'renewal', 'variation'] as const) {
      expect(p?.fees.notes?.[k]?.fr, k).toBeTruthy()
      expect(p?.fees.notes?.[k]?.en, k).toBeTruthy()
    }
    expect(p?.fees.notes?.new_ma?.fr).toContain('1 500 000')
    expect(p?.fees.notes?.renewal?.fr).toContain('1 %')
    // Échantillons : le décret tarife l'autorisation d'importation (section 3),
    // mais ne fixe pas le nombre de modèles-vente (réserve) ni le délai de traitement.
    expect(p?.samples.new_ma?.[0]?.fr).toContain('100 000')
    expect(p?.samples.new_ma?.[0]?.en).toContain('100,000')
    expect(p?.samples.renewal_variation?.[0]?.fr).toContain('100 000')
    expect(p?.samples.reserve?.fr).toBeTruthy()
    expect(p?.processingDays).toBeUndefined()
  })
})
