import { beforeEach, describe, expect, it } from 'vitest'

import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
import { authorityDetail } from './authorities-data'
import { resolvedAuthorityDetail } from './ref-content'

const version = (patch: Partial<RefVersionRecord> & { id: string }): RefVersionRecord => ({
  label: patch.id,
  status: 'published',
  effectiveDate: null,
  releaseNote: '',
  publishedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...patch,
})

const entry = (patch: Partial<RefEntryRecord> & { id: string }): RefEntryRecord => ({
  versionId: 'v-1',
  country: 'SN',
  section: 'fees',
  payload: {},
  provenance: {},
  createdAt: '2026-07-01T00:00:00.000Z',
  ...patch,
})

beforeEach(async () => {
  await db.refVersions.clear()
  await db.refEntries.clear()
})

describe('resolvedAuthorityDetail', () => {
  it('réplique vide → repli intégral sur le socle code, sans version ni provenance', async () => {
    const r = await resolvedAuthorityDetail('SN')

    expect(r).toEqual({ detail: authorityDetail('SN'), provenance: {}, versionLabel: null })
  })

  it('pays inconnu des deux sources → null (EmptyState — distinct du undefined de chargement)', async () => {
    expect(await resolvedAuthorityDetail('ZZ')).toBeNull()
  })

  it('un BROUILLON présent dans la réplique n’est JAMAIS servi (double barrière avec la RLS)', async () => {
    await db.refVersions.put(version({ id: 'v-d', label: 'v2026.9-draft', status: 'draft' }))
    await db.refEntries.put(
      entry({ id: 'e-d', versionId: 'v-d', payload: { fees: { new_ma: 9999999 } } }),
    )

    const r = await resolvedAuthorityDetail('SN')

    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
  })

  it('une version publiée à date d’effet FUTURE ne s’applique pas encore (modèle MedDRA)', async () => {
    await db.refVersions.put(version({ id: 'v-f', label: 'v2027.1', effectiveDate: '2100-01-01' }))
    await db.refEntries.put(
      entry({ id: 'e-f', versionId: 'v-f', payload: { fees: { new_ma: 9999999 } } }),
    )

    const r = await resolvedAuthorityDetail('SN')

    expect(r?.versionLabel).toBe(null)
    expect(r?.detail.profile?.fees.new_ma).toBe(authorityDetail('SN')?.profile?.fees.new_ma)
  })

  it('payload malformé (samples non-tableau, montants en string) → repli code, AUCUN crash', async () => {
    await db.refVersions.put(version({ id: 'v-1', label: 'v2026.1' }))
    // L'erreur d'édition la plus probable du futur éditeur god : objet au lieu de tableau.
    await db.refEntries.put(
      entry({
        id: 'e-1',
        section: 'samples',
        payload: { samples: { new_ma: { fr: 'Trois échantillons', en: 'Three samples' } } },
      }),
    )
    await db.refEntries.put(
      entry({ id: 'e-2', section: 'fees', payload: { fees: { new_ma: '500000' } } }),
    )

    const r = await resolvedAuthorityDetail('SN')

    // Aucune section valide → la fiche reste ENTIÈREMENT sur le socle code, sans badge.
    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
    expect(r?.provenance).toEqual({})
  })

  it('une section inconnue (ctd_structure, P4.5) ne déplace NI le badge NI la provenance', async () => {
    await db.refVersions.put(
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
    )
    await db.refVersions.put(
      version({ id: 'v-9', label: 'v2026.9', publishedAt: '2026-07-20T00:00:00.000Z' }),
    )
    await db.refEntries.put(
      entry({ id: 'e-1', versionId: 'v-1', payload: { fees: { new_ma: 1234567 } } }),
    )
    await db.refEntries.put(
      entry({
        id: 'e-9',
        versionId: 'v-9',
        section: 'ctd_structure',
        payload: { ops: [{ node: '1.1.2', op: 'remove' }] },
      }),
    )

    const r = await resolvedAuthorityDetail('SN')

    expect(r?.versionLabel).toBe('v2026.1')
    expect(r?.detail.profile?.fees.new_ma).toBe(1234567)
    expect(Object.keys(r?.provenance ?? {})).toEqual(['fees'])
  })

  it('section fees publiée → montants du référentiel, agence du socle, provenance + version', async () => {
    await db.refVersions.put(version({ id: 'v-1', label: 'v2026.1' }))
    await db.refEntries.put(
      entry({
        id: 'e-1',
        payload: { currency: 'FCFA', fees: { new_ma: 1234567 }, processingDays: 90 },
        provenance: { texte: 'Décret n° 2025-1833', jo: 'JO n° 7871 du 29/12/2025' },
      }),
    )

    const r = await resolvedAuthorityDetail('SN')

    expect(r?.versionLabel).toBe('v2026.1')
    expect(r?.detail.profile?.fees.new_ma).toBe(1234567)
    expect(r?.detail.profile?.processingDays).toBe(90)
    // Sections absentes du référentiel → repli code (profil PARTIEL fusionné).
    expect(r?.detail.profile?.samples).toEqual(authorityDetail('SN')?.profile?.samples)
    expect(r?.detail.agency).toEqual(authorityDetail('SN')?.agency)
    expect(r?.provenance.fees?.texte).toBe('Décret n° 2025-1833')
  })

  it('deux versions publiées → la plus récente masque la plus ancienne, section par section', async () => {
    await db.refVersions.put(
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
    )
    await db.refVersions.put(
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    )
    await db.refEntries.put(
      entry({ id: 'e-1', versionId: 'v-1', payload: { fees: { new_ma: 750000 } } }),
    )
    await db.refEntries.put(
      entry({ id: 'e-2', versionId: 'v-2', payload: { fees: { new_ma: 1000000 } } }),
    )
    // Section d'une AUTRE version, non masquée : l'agence de v-1 reste servie.
    await db.refEntries.put(
      entry({
        id: 'e-3',
        versionId: 'v-1',
        section: 'agency',
        payload: {
          name: 'ARP',
          full: 'Agence Sénégalaise',
          directeur: 'Dr X',
          sexe: 'F',
          adresse: 'Dakar',
        },
      }),
    )

    const r = await resolvedAuthorityDetail('SN')

    expect(r?.detail.profile?.fees.new_ma).toBe(1000000)
    expect(r?.detail.agency.name).toBe('ARP')
    expect(r?.detail.agency.directeur).toBe('Dr X')
    expect(r?.versionLabel).toBe('v2026.2')
  })

  it('pays servi PAR le référentiel seul (absent du code) → fiche construite, civilité dérivée', async () => {
    await db.refVersions.put(version({ id: 'v-1', label: 'v2026.1' }))
    await db.refEntries.put(
      entry({
        id: 'e-1',
        country: 'CV',
        section: 'agency',
        payload: {
          name: 'ARFA',
          full: 'Agência de Regulação',
          directeur: 'Dr Y',
          sexe: 'F',
          adresse: 'Praia',
          officialLang: 'pt',
        },
      }),
    )

    const r = await resolvedAuthorityDetail('CV')

    expect(r?.detail.agency.name).toBe('ARFA')
    expect(r?.detail.officialLang).toBe('pt')
    expect(r?.detail.civilite).toContain('Madame')
    expect(r?.detail.profile).toBeUndefined()
  })

  it('entrée orpheline (version absente de la réplique) → ignorée, repli code', async () => {
    await db.refEntries.put(entry({ id: 'e-1', versionId: 'v-fantôme' }))

    const r = await resolvedAuthorityDetail('SN')

    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
  })
})
