import { describe, expect, it } from 'vitest'

import {
  currentMapOf,
  toProvenance,
  describeEntry,
  entryError,
  entryIsInert,
  newDelta,
  prefillEntry,
  SECTION_LABEL,
  toPayload,
  type DraftEntry,
  type SectionKey,
} from './ref-draft'

/**
 * Fiche d'une version publiée : le god la relit AVANT de cliquer « Restaurer ce contenu ». Un champ
 * absent de l'affichage se restaure donc à l'aveugle — la fiche taisait la civilité du destinataire,
 * la langue officielle, les trois notes de barème, les échantillons de renouvellement, la note et la
 * PORTÉE des deltas, et ne montrait qu'une langue sur deux (Major M3 de la revue).
 *
 * Ce test ne liste pas les champs à la main : il parcourt les clés que `toPayload` PRODUIT et exige
 * une ligne pour chacune. Ajouter un champ au payload sans l'afficher casse le build.
 */

/** Chemins de feuilles d'un payload ; les index d'array sont réduits à `[]` (une ligne prouve). */
const leafPaths = (v: unknown, prefix = ''): string[] => {
  if (Array.isArray(v)) return [...new Set(v.flatMap((x) => leafPaths(x, `${prefix}[]`)))]
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) => leafPaths(x, prefix ? `${prefix}.${k}` : k))
  return [prefix]
}

/** Chemin de payload → fragment qui DOIT apparaître dans la fiche. Pas d'entrée = test rouge. */
const EXPECT: Record<string, string> = {
  'name#agency': 'ZAG',
  'full#agency': 'ZFULL',
  'directeur#agency': 'ZDIR',
  'sexe#agency': 'Madame',
  'adresse#agency': 'ZADR',
  'telephone#agency': 'ZTEL',
  'email#agency': 'ZMAIL',
  'officialLang#agency': 'Français',
  'currency#fees': 'ZMN',
  'fees.new_ma#fees': '111',
  'fees.renewal#fees': '222',
  'fees.variation_minor#fees': '333',
  'fees.variation_major#fees': '444',
  'fees.notes.new_ma.fr#fees': 'ZNOTE1',
  'fees.notes.new_ma.en#fees': 'ZNOTE1EN',
  'fees.notes.renewal.fr#fees': 'ZNOTE2',
  'fees.notes.renewal.en#fees': 'ZNOTE2EN',
  'fees.notes.variation.fr#fees': 'ZNOTE3',
  'fees.notes.variation.en#fees': 'ZNOTE3EN',
  'processingDays#fees': '90',
  'note.fr#submission': 'ZSUBFR',
  'note.en#submission': 'ZSUBEN',
  'samples.new_ma[].fr#samples': 'ZSAMP1',
  'samples.new_ma[].en#samples': 'ZSAMP1EN',
  'samples.renewal_variation[].fr#samples': 'ZSAMP2',
  'samples.renewal_variation[].en#samples': 'ZSAMP2EN',
  'samples.reserve.fr#samples': 'ZRES',
  'samples.reserve.en#samples': 'ZRESEN',
  'deltas[].kind#ctd_structure': 'nouveau',
  'deltas[].number#ctd_structure': '1.2.9',
  'deltas[].label#ctd_structure': 'ZLABEL',
  'deltas[].note#ctd_structure': 'ZNOTE',
  'deltas[].format#ctd_structure': 'ECTD',
  'deltas[].activities[]#ctd_structure': 'Renouvellement',
}

/** Entrée dont TOUS les champs de TOUTES les sections portent une valeur reconnaissable. */
const maximal = (section: SectionKey): DraftEntry => ({
  ...prefillEntry('SN', section),
  agName: 'ZAG',
  agFull: 'ZFULL',
  agDirecteur: 'ZDIR',
  agSexe: 'F',
  agAdresse: 'ZADR',
  agTel: 'ZTEL',
  agEmail: 'ZMAIL',
  agLang: 'fr',
  currency: 'ZMN',
  feeNewMa: '111',
  feeRenewal: '222',
  feeVarMin: '333',
  feeVarMaj: '444',
  processingDays: '90',
  noteNewMaFr: 'ZNOTE1',
  noteNewMaEn: 'ZNOTE1EN',
  noteRenewalFr: 'ZNOTE2',
  noteRenewalEn: 'ZNOTE2EN',
  noteVariationFr: 'ZNOTE3',
  noteVariationEn: 'ZNOTE3EN',
  subFr: 'ZSUBFR',
  subEn: 'ZSUBEN',
  samplesNewMaFr: 'ZSAMP1',
  samplesNewMaEn: 'ZSAMP1EN',
  samplesRenewFr: 'ZSAMP2',
  samplesRenewEn: 'ZSAMP2EN',
  reserveFr: 'ZRES',
  reserveEn: 'ZRESEN',
  structureReset: false,
  deltas: [
    {
      ...newDelta(),
      kind: 'add',
      number: '1.2.9',
      label: 'ZLABEL',
      note: 'ZNOTE',
      format: 'ectd',
      activities: ['renewal'],
    },
  ],
})

describe('M3 — la fiche rend TOUT ce que le payload contient', () => {
  for (const section of Object.keys(SECTION_LABEL) as SectionKey[]) {
    it(`${section} : aucune clé de payload sans ligne d'affichage`, () => {
      const e = maximal(section)
      const rendered = describeEntry(e, 'fr')
        .map((r) => `${r.label.fr} ${r.value}`)
        .join(' ~ ')
      for (const path of leafPaths(toPayload(e))) {
        const key = `${path}#${section}`
        const fragment = EXPECT[key]
        expect(fragment, `aucune ligne d'affichage prévue pour « ${key} »`).toBeDefined()
        expect(rendered, `« ${key} » n'apparaît pas dans la fiche`).toContain(fragment!)
      }
    })
  }

  it('M-D — un pays LUSOPHONE n’est pas rendu « Français »', () => {
    // Le test d'exhaustivité passait en épinglant `agLang: 'fr'` : faux vert sur le champ FAUX.
    const gw = { ...maximal('agency'), country: 'GW', agLang: 'pt' as const }
    expect((toPayload(gw) as { officialLang: string }).officialLang).toBe('pt')
    expect(describeEntry(gw, 'fr').map((r) => r.value)).toContain('Portugais')
    expect(describeEntry(gw, 'en').map((r) => r.value)).toContain('Portuguese')
  })

  it('les DEUX langues sont rendues, pas seulement celle de l’interface', () => {
    // Un god francophone restaurait une version dont il n'avait jamais vu la moitié anglaise.
    const fr = describeEntry(maximal('submission'), 'fr')
    expect(fr.map((r) => r.value)).toEqual(expect.arrayContaining(['ZSUBFR', 'ZSUBEN']))
    expect(fr.map((r) => r.label.fr).join(' ')).toContain('(EN)')
  })

  it('une paire identique dans les deux langues ne fait qu’UNE ligne (pas de bruit)', () => {
    const e = { ...maximal('submission'), subFr: 'Même texte', subEn: 'Même texte' }
    expect(describeEntry(e, 'fr').filter((r) => r.value === 'Même texte')).toHaveLength(1)
  })
})

describe('M5 — republier l’existant à l’identique est refusé pour TOUTE section', () => {
  /** Contenu EN VIGUEUR construit depuis le payload que produirait cette entrée. */
  const inForce = (e: DraftEntry) =>
    currentMapOf([
      {
        country: e.country,
        section: e.section,
        payload: toPayload(e),
        provenance: toProvenance(e),
        version_label: 'v2026.1',
      },
    ])

  for (const section of ['agency', 'fees', 'submission', 'samples'] as SectionKey[]) {
    it(`${section} : une entrée identique au contenu en vigueur est INERTE`, () => {
      // Le garde-fou n'existait que pour la structure : les quatre autres sections pouvaient
      // republier l'existant, sonner la cloche chez tous les clients et exiger l'adoption d'une
      // mise à jour vide. « Restaurer ce contenu » rend ce geste trivial — d'où le blocage.
      const e = { ...maximal(section), provTexte: 'Arrêté qui restaure' }
      expect(entryIsInert(e, inForce(e))).toBe(true)
      expect(entryError(e, inForce(e))).not.toBeNull()
      // …et la MÊME entrée sans contenu en vigueur passe : c'est l'égalité qui bloque, pas la forme.
      expect(entryError(e)).toBeNull()
    })

    it(`${section} : une valeur modifiée n’est plus inerte`, () => {
      const e = { ...maximal(section), provTexte: 'Arrêté qui restaure' }
      const cur = inForce(e)
      const changed = {
        ...e,
        agFull: 'AUTRE',
        feeNewMa: '999',
        subFr: 'AUTRE',
        subEn: 'OTHER',
        reserveFr: 'AUTRE',
        reserveEn: 'OTHER',
      }
      expect(entryIsInert(changed, cur)).toBe(false)
    })
  }

  it('M-C — corriger la SOURCE d’un contenu par ailleurs juste reste possible', () => {
    // La provenance est ce que la fiche Autorité cite aux clients comme source opposable. L'exclure
    // du verdict rendait IMPOSSIBLE de corriger un numéro de décret erroné sur un contenu juste :
    // la fausse source restait opposable pour toujours, sans aucun contournement.
    const e = { ...maximal('fees'), provTexte: 'Décret n°2025-1833 (corrigé)' }
    const wrongSource = currentMapOf([
      {
        country: e.country,
        section: e.section,
        payload: toPayload(e),
        provenance: { texte: 'Arrêté cité par erreur' },
        version_label: 'v2026.1',
      },
    ])
    expect(entryIsInert(e, wrongSource)).toBe(false)
    expect(entryError(e, wrongSource)).toBeNull()
  })

  it('l’ordre des clés du payload n’influence PAS le verdict', () => {
    // Deux payloads égaux au contenu près ne doivent pas différer à l'octet : sinon le verdict
    // dépendrait de l'ordre d'insertion des clés côté serveur.
    const e = { ...maximal('agency'), provTexte: 'Arrêté' }
    const p = toPayload(e) as Record<string, unknown>
    const shuffled = Object.fromEntries(Object.entries(p).reverse())
    const cur = currentMapOf([
      {
        country: e.country,
        section: e.section,
        payload: shuffled,
        provenance: toProvenance(e),
        version_label: 'v2026.1',
      },
    ])
    expect(entryIsInert(e, cur)).toBe(true)
  })
})

describe('M5 — l’ordre des clés IMBRIQUÉES n’influence pas non plus le verdict', () => {
  it('un tableau d’objets réordonné CLÉ à CLÉ reste identique', () => {
    // Un `stableJson` réduit au premier niveau passerait le test plat ci-dessus tout en cessant de
    // reconnaître `fees.notes.*` et `samples.*[]` : M5 régresserait avec des tests verts.
    const e = { ...maximal('samples'), provTexte: 'Arrêté' }
    const p = toPayload(e) as { samples: { new_ma: Record<string, string>[] } }
    const deep = {
      samples: {
        ...p.samples,
        new_ma: p.samples.new_ma.map((x) => Object.fromEntries(Object.entries(x).reverse())),
      },
    }
    const cur = currentMapOf([
      {
        country: e.country,
        section: e.section,
        payload: deep,
        provenance: toProvenance(e),
        version_label: 'v2026.1',
      },
    ])
    expect(entryIsInert(e, cur)).toBe(true)
  })

  it('l’ORDRE des éléments d’une liste d’exigences, lui, COMPTE', () => {
    // Une liste d'échantillons est ordonnée : la réordonner est un vrai changement.
    const e = { ...maximal('samples'), provTexte: 'Arrêté' }
    const p = toPayload(e) as { samples: { new_ma: unknown[] } }
    const cur = currentMapOf([
      {
        country: e.country,
        section: e.section,
        payload: { samples: { ...p.samples, new_ma: [...p.samples.new_ma].reverse() } },
        provenance: toProvenance(e),
        version_label: 'v2026.1',
      },
    ])
    expect(entryIsInert(e, cur)).toBe(p.samples.new_ma.length < 2)
  })
})
