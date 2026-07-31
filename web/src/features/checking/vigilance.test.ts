/**
 * Contrat de la mention de pharmacovigilance 4.8 (`landing/checking/vigilance.js`).
 *
 * Ce que ces tests protègent n'est pas de l'affichage : la mention 4.8 est recopiée telle quelle
 * dans des dossiers d'AMM réels. Une adresse inventée, ou glissée du mauvais pays, survivrait au
 * dépôt et repartirait signée par le titulaire. Le test le plus important de ce fichier est donc
 * celui qui interdit TOUTE adresse électronique absente de `INDEX-vigilance-UEMOA.md`.
 */
import { describe, expect, it } from 'vitest'

import { PAYS } from '../../../../landing/checking/referentiel.js'
import {
  aUnContact,
  mention48,
  VIG_CANAL_NEUTRE,
  VIG_CORPS,
  VIG_TITRE,
  VIGILANCE,
} from '../../../../landing/checking/vigilance.js'

/** Les SEULES adresses établies par une source déposée, au 30/07/2026. */
const ADRESSES_SOURCEES = [
  'vigilances.abmed@gouv.bj',
  'pharmacovigilance@airp.ci',
  'vigilances@arp.sn',
]
const PAYS_AVEC_CONTACT = ['bj', 'ci', 'sn']

const codes = () => Object.keys(VIGILANCE)

describe('couverture des pays', () => {
  it('couvre exactement les pays du référentiel — ni plus, ni moins', () => {
    expect(codes().sort()).toEqual(PAYS.map((p: { k: string }) => p.k).sort())
  })

  it('rend une mention pour chacun des huit pays', () => {
    for (const k of codes()) {
      const m = mention48(k)
      expect(m.titre).toBe(VIG_TITRE)
      expect(m.paragraphes.length).toBeGreaterThan(0)
    }
  })

  it('refuse un pays inconnu au lieu de rendre une mention vide', () => {
    // Silencieusement vide, la rubrique 4.8 partirait sans son bloc réglementaire.
    expect(() => mention48('xx')).toThrow(/pays inconnu/)
  })
})

describe('aucune adresse non sourcée', () => {
  it("ne contient aucune adresse électronique en dehors des trois qu'une source publie", () => {
    const tout = codes()
      .flatMap((k) => [...mention48(k).paragraphes, VIGILANCE[k].organisme])
      .join('\n')
    const trouvees = tout.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []
    for (const a of trouvees) expect(ADRESSES_SOURCEES).toContain(a)
  })

  it('publie une adresse pour exactement trois pays sur huit', () => {
    expect(codes().filter(aUnContact).sort()).toEqual([...PAYS_AVEC_CONTACT].sort())
  })

  it("n'attribue jamais l'adresse d'un pays à un autre", () => {
    const attendu: Record<string, string> = {
      bj: 'vigilances.abmed@gouv.bj',
      ci: 'pharmacovigilance@airp.ci',
      sn: 'vigilances@arp.sn',
    }
    for (const [k, mail] of Object.entries(attendu)) {
      const texte = mention48(k).paragraphes.join(' ')
      expect(texte).toContain(mail)
      for (const autre of ADRESSES_SOURCEES) if (autre !== mail) expect(texte).not.toContain(autre)
    }
  })

  it('cite la source qui établit chaque pays', () => {
    for (const k of codes()) expect(VIGILANCE[k].source).toMatch(/\.(pdf|md|docx?)$/i)
  })
})

describe('le repli neutre est un cas courant, pas un cas dégradé', () => {
  it('emploie la phrase de canal neutre pour les cinq pays sans contact publié', () => {
    for (const k of codes().filter((c) => !aUnContact(c))) {
      const texte = mention48(k).paragraphes[0]
      expect(texte).toContain(VIG_CANAL_NEUTRE)
      // « système national de déclaration : » introduit un contact nommé : il ne doit pas rester
      // une amorce vide, qui se lirait comme une mention tronquée.
      expect(texte).not.toContain('système national de déclaration')
    }
  })

  it('conserve les deux phrases obligatoires dans TOUS les pays', () => {
    for (const k of codes()) expect(mention48(k).paragraphes[0]).toContain(VIG_CORPS)
  })
})

describe('Med Safety est un canal, jamais un contact national', () => {
  it('donne au Burkina Faso la formule neutre, complétée — et non remplacée', () => {
    const m = mention48('bf')
    expect(m.paragraphes[0]).toContain(VIG_CANAL_NEUTRE)
    expect(m.paragraphes).toHaveLength(2)
    expect(m.paragraphes[1]).toContain('Med Safety')
    expect(aUnContact('bf')).toBe(false)
  })

  it("ne fait figurer Med Safety dans la phrase de canal d'aucun pays", () => {
    for (const k of codes()) expect(mention48(k).paragraphes[0]).not.toContain('Med Safety')
  })
})

describe('la mention change bien avec le pays', () => {
  it('produit un texte distinct pour chaque pays qui publie un contact', () => {
    const textes = codes().map((k) => mention48(k).paragraphes.join('\n'))
    // 3 mentions nommées + Burkina (neutre + Med Safety) + le repli neutre partagé par les 4 autres.
    expect(new Set(textes).size).toBe(5)
  })
})
