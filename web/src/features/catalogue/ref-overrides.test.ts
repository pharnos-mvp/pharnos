import { describe, expect, it } from 'vitest'

import type { OrgRefOverrideRecord } from '@/lib/db'
import { agencyFor } from '@/features/workspace/roadmap-data'
import { applyOverrides, overrideAgency, type ResolvedAuthority } from './ref-content'
import { isOverridePath, OVERRIDE_PATHS, type OverridePath } from './ref-overrides'

// P4.3 — « la donnée officielle se propose, la donnée LOCALE se respecte ». Ces tests verrouillent
// l'ordre de priorité (officiel → local), le refus DÉFENSIF d'une valeur illisible, et le
// recalcul de la civilité (sinon une lettre s'adresse à « Madame » sous un nom d'homme).

const ov = (fieldPath: OverridePath, value: unknown, updatedAt = '2026-07-25T10:00:00.000Z') =>
  [
    fieldPath,
    {
      id: `id-${fieldPath}`,
      orgId: 'org-1',
      country: 'SN',
      fieldPath,
      value,
      updatedByEmail: 'admin@org.test',
      createdAt: updatedAt,
      updatedAt,
    } satisfies OrgRefOverrideRecord,
  ] as const

const mapOf = (...entries: ReturnType<typeof ov>[]) =>
  new Map<string, OrgRefOverrideRecord>(entries.map((e) => [e[0], e[1]]))

const baseResolved = (): ResolvedAuthority => ({
  detail: {
    code: 'SN',
    agency: {
      name: 'ARP',
      full: 'Agence de Réglementation Pharmaceutique',
      directeur: 'Dr Alioune Ndiaye',
      sexe: 'M',
      adresse: 'Dakar, Sénégal',
      telephone: '+221 33 000 00 00',
      email: 'contact@arp.sn',
      elide: 'l’ARP',
      elideEn: 'the ARP',
    },
    civilite: 'Monsieur le Directeur Général',
    officialLang: 'fr',
  },
  provenance: {},
  versionLabel: 'v2026.1',
  adapted: [],
})

describe('whitelist des champs adaptables', () => {
  it('est le miroir de la contrainte serveur (0077) et refuse tout le reste', () => {
    expect([...OVERRIDE_PATHS]).toEqual([
      'agency.directeur',
      'agency.sexe',
      'agency.adresse',
      'agency.telephone',
      'agency.email',
      'notes.internal',
    ])
    // Les MONTANTS officiels ne sont pas adaptables (décision CEO) — ni l'identité de l'agence.
    expect(isOverridePath('fees.new_ma')).toBe(false)
    expect(isOverridePath('agency.name')).toBe(false)
    expect(isOverridePath('agency.full')).toBe(false)
    expect(isOverridePath('agency.directeur')).toBe(true)
  })
})

describe('overrideAgency', () => {
  it('la valeur locale a le DERNIER mot sur la valeur officielle', () => {
    const base = baseResolved().detail.agency
    const { agency, adapted } = overrideAgency(
      base,
      mapOf(ov('agency.directeur', 'Dr Aminata Diop'), ov('agency.email', 'ra@arp.sn')),
    )
    expect(agency.directeur).toBe('Dr Aminata Diop')
    expect(agency.email).toBe('ra@arp.sn')
    // Ce qui n'est pas adapté reste OFFICIEL.
    expect(agency.adresse).toBe(base.adresse)
    expect(agency.name).toBe('ARP')
    expect(adapted).toEqual(['agency.directeur', 'agency.email'])
  })

  it('ne mute jamais l’objet officiel reçu (le socle est partagé par toute l’app)', () => {
    const base = agencyFor('SN')
    const before = base.directeur
    overrideAgency(base, mapOf(ov('agency.directeur', 'Dr Autre')))
    expect(base.directeur).toBe(before)
  })

  it('IGNORE une valeur illisible plutôt que de la rendre (payload jsonb hostile)', () => {
    const base = baseResolved().detail.agency
    for (const bad of [42, null, {}, [], '', '   ', true]) {
      const { agency, adapted } = overrideAgency(base, mapOf(ov('agency.directeur', bad)))
      expect(agency.directeur, JSON.stringify(bad)).toBe(base.directeur)
      expect(adapted).toEqual([])
    }
  })

  it('n’accepte que M/F pour la civilité (toute autre valeur laisse l’officielle)', () => {
    const base = baseResolved().detail.agency
    expect(overrideAgency(base, mapOf(ov('agency.sexe', 'F'))).agency.sexe).toBe('F')
    const bad = overrideAgency(base, mapOf(ov('agency.sexe', 'X')))
    expect(bad.agency.sexe).toBe('M')
    expect(bad.adapted).toEqual([])
  })

  it('une civilité invalide n’efface pas le marquage des AUTRES champs adaptés', () => {
    // Régression : une première implémentation « annulait » la civilité invalide en retirant la
    // DERNIÈRE entrée de la liste — donc le destinataire, pourtant bien adapté, perdait son badge.
    const base = baseResolved().detail.agency
    const { agency, adapted } = overrideAgency(
      base,
      mapOf(ov('agency.directeur', 'Dr Aminata Diop'), ov('agency.sexe', 'X')),
    )
    expect(agency.directeur).toBe('Dr Aminata Diop')
    expect(adapted).toEqual(['agency.directeur'])
  })

  it('liste les champs adaptés dans l’ordre de la whitelist (affichage stable)', () => {
    const { adapted } = overrideAgency(
      baseResolved().detail.agency,
      mapOf(ov('agency.email', 'a@b.c'), ov('agency.directeur', 'Dr X')),
    )
    expect(adapted).toEqual(['agency.directeur', 'agency.email'])
  })

  it('sans aucune adaptation, renvoie l’objet officiel TEL QUEL (aucune copie inutile)', () => {
    const base = baseResolved().detail.agency
    const out = overrideAgency(base, new Map())
    expect(out.agency).toBe(base)
    expect(out.adapted).toEqual([])
  })
})

describe('applyOverrides (fiche complète)', () => {
  it('RECALCULE la civilité quand le sexe est adapté', () => {
    const out = applyOverrides(
      baseResolved(),
      mapOf(ov('agency.directeur', 'Dr Aminata Diop'), ov('agency.sexe', 'F')),
    )
    expect(out.detail.civilite).toBe('Madame la Directrice Générale')
    expect(out.detail.agency.directeur).toBe('Dr Aminata Diop')
  })

  it('conserve l’agence OFFICIELLE comme repère de l’éditeur', () => {
    const out = applyOverrides(baseResolved(), mapOf(ov('agency.adresse', 'BP 999 Dakar')))
    expect(out.detail.agency.adresse).toBe('BP 999 Dakar')
    expect(out.officialAgency?.adresse).toBe('Dakar, Sénégal')
  })

  it('expose la note interne et l’auteur de la dernière adaptation', () => {
    const out = applyOverrides(
      baseResolved(),
      mapOf(
        ov('agency.adresse', 'BP 999', '2026-07-20T08:00:00.000Z'),
        ov('notes.internal', 'Passer par le bureau d’ordre', '2026-07-24T09:00:00.000Z'),
      ),
    )
    expect(out.internalNote).toBe('Passer par le bureau d’ordre')
    expect(out.adaptedByEmail).toBe('admin@org.test')
    expect(out.adapted).toContain('notes.internal')
  })

  it('la note interne n’altère JAMAIS le bloc destinataire (jamais dans un courrier)', () => {
    const base = baseResolved()
    const out = applyOverrides(base, mapOf(ov('notes.internal', 'note confidentielle')))
    expect(out.detail.agency).toEqual(base.detail.agency)
    expect(out.detail.civilite).toBe(base.detail.civilite)
  })

  it('sans adaptation, la fiche résolue est renvoyée INCHANGÉE', () => {
    const base = baseResolved()
    expect(applyOverrides(base, new Map())).toBe(base)
  })

  it('la version officielle reste citée : adapter n’efface pas la provenance', () => {
    const out = applyOverrides(baseResolved(), mapOf(ov('agency.directeur', 'Dr X')))
    expect(out.versionLabel).toBe('v2026.1')
  })
})
