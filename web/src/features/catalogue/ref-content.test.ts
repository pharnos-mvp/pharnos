import { beforeEach, describe, expect, it } from 'vitest'

import { getModule1Tree, type CtdNodeDef } from '@/features/workspace/module1-tree'
import { flattenTree, isTreeOutdated } from '@/features/workspace/tree-utils'
import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
import { authorityDetail } from './authorities-data'
import {
  loadRefCountryLookup,
  resolvedAgencyBlock,
  resolvedAuthorityDetail,
  resolvedAuthorityDetailAtVersion,
  resolvedAuthorityRows,
  resolvedModule1Tree,
} from './ref-content'
import { dossierRefStatus, loadRefState, pendingRefUpdate } from './ref-state'
import { refUpdatePreview } from './ref-diff'

const ORG = 'org-1'

/** `isBaseline` par défaut sur `v-1` : le SOCLE est une propriété EXPLICITE de la donnée (0074),
 *  jamais « la plus ancienne version de la réplique » (cf. bloquant B1 de la revue P4.2). */
const version = (patch: Partial<RefVersionRecord> & { id: string }): RefVersionRecord => ({
  label: patch.id,
  status: 'published',
  effectiveDate: null,
  releaseNote: '',
  publishedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  isBaseline: patch.id === 'v-1',
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

/** Adoption de l'org (réplique de `org_ref_adoptions`, 0072) — le plafond de résolution. */
const adopt = (versionId: string, orgId = ORG) =>
  db.orgRefAdoptions.put({
    id: `a-${orgId}-${versionId}`,
    orgId,
    versionId,
    adoptedAt: '2026-07-02T00:00:00.000Z',
    adoptedByEmail: 'admin@ex.com',
  })

beforeEach(async () => {
  await db.refVersions.clear()
  await db.refEntries.clear()
  await db.orgRefAdoptions.clear()
  // P4.3 : le résolveur lit aussi les adaptations locales — une réplique laissée sale ferait
  // passer une valeur d'org pour du contenu officiel dans les assertions suivantes.
  await db.orgRefOverrides.clear()
})

describe('resolvedAuthorityDetail — socle et plafond adopté', () => {
  it('réplique vide → repli intégral sur le socle code, sans version ni provenance', async () => {
    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r).toEqual({
      detail: authorityDetail('SN'),
      provenance: {},
      versionLabel: null,
      adapted: [],
    })
  })
  it('socle PUBLIÉ mais SANS AUCUNE ENTRÉE → repli intégral sur le code (état de construction)', async () => {
    // C'est la configuration EXACTE de la production depuis la migration 0080 (décision CEO
    // 2026-07-27) : la ligne de version socle survit — elle porte le plafond d'adoption et
    // l'épinglage de 137 dossiers — mais ses entrées sont vidées pour que le CODE redevienne seul
    // maître pendant la construction. Distinct du cas « réplique vide » ci-dessus : ici une version
    // publiée EXISTE et est même adoptée. Si le résolveur se contentait de constater sa présence
    // pour cesser de replier, la fiche Autorité se viderait pour tous les pays.
    await db.refVersions.put(version({ id: 'v-1', label: 'v2026.1', isBaseline: true }))
    await adopt('v-1')

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.detail).toEqual(authorityDetail('SN'))
    // Aucune source citée : il n'y a pas de contenu publié à sourcer, et prétendre le contraire
    // serait un faux sur une surface opposable.
    expect(r?.provenance).toEqual({})
    expect(r?.versionLabel).toBeNull()
  })

  it('pays inconnu des deux sources → null (EmptyState — distinct du undefined de chargement)', async () => {
    expect(await resolvedAuthorityDetail('ZZ', ORG)).toBeNull()
  })

  it('version SOCLE (la plus ancienne publiée) : appliquée sans adoption — état de départ', async () => {
    await db.refVersions.put(version({ id: 'v-1', label: 'v2026.1' }))
    await db.refEntries.put(
      entry({
        id: 'e-1',
        payload: { currency: 'FCFA', fees: { new_ma: 1234567 }, processingDays: 90 },
        provenance: { texte: 'Décret n° 2025-1833', jo: 'JO n° 7871 du 29/12/2025' },
      }),
    )

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.versionLabel).toBe('v2026.1')
    expect(r?.detail.profile?.fees.new_ma).toBe(1234567)
    expect(r?.detail.profile?.processingDays).toBe(90)
    // Sections absentes du référentiel → repli code (profil PARTIEL fusionné).
    expect(r?.detail.profile?.samples).toEqual(authorityDetail('SN')?.profile?.samples)
    expect(r?.provenance.fees?.texte).toBe('Décret n° 2025-1833')
  })

  it('une version publiée NON ADOPTÉE ne s’applique PAS (consentement par org, P4.2)', async () => {
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

    const r = await resolvedAuthorityDetail('SN', ORG)

    // Plafond = socle v2026.1 : le nouveau barème est publié mais reste inappliqué.
    expect(r?.versionLabel).toBe('v2026.1')
    expect(r?.detail.profile?.fees.new_ma).toBe(750000)
  })

  it('après ADOPTION, la version plus récente masque la précédente, section par section', async () => {
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
    // Section d'une version ANTÉRIEURE, non masquée : l'agence de v-1 reste servie.
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
    await adopt('v-2')

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.detail.profile?.fees.new_ma).toBe(1000000)
    expect(r?.detail.agency.name).toBe('ARP')
    expect(r?.detail.agency.directeur).toBe('Dr X')
    expect(r?.versionLabel).toBe('v2026.2')
  })

  it('l’adoption d’une org ne fuit PAS sur une autre org (isolation du plafond)', async () => {
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
    await adopt('v-2', 'org-autre')

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.detail.profile?.fees.new_ma).toBe(750000)
    expect(r?.versionLabel).toBe('v2026.1')
  })

  it('un BROUILLON présent dans la réplique n’est JAMAIS servi (double barrière avec la RLS)', async () => {
    await db.refVersions.put(version({ id: 'v-d', label: 'v2026.9-draft', status: 'draft' }))
    await db.refEntries.put(
      entry({ id: 'e-d', versionId: 'v-d', payload: { fees: { new_ma: 9999999 } } }),
    )
    await adopt('v-d') // même adoptée (impossible côté serveur), une non-publiée ne s'applique pas

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
  })

  it('une version publiée à date d’effet FUTURE ne s’applique pas encore (modèle MedDRA)', async () => {
    await db.refVersions.put(version({ id: 'v-f', label: 'v2027.1', effectiveDate: '2100-01-01' }))
    await db.refEntries.put(
      entry({ id: 'e-f', versionId: 'v-f', payload: { fees: { new_ma: 9999999 } } }),
    )
    await adopt('v-f')

    const r = await resolvedAuthorityDetail('SN', ORG)

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

    const r = await resolvedAuthorityDetail('SN', ORG)

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
    await adopt('v-9')

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.versionLabel).toBe('v2026.1')
    expect(r?.detail.profile?.fees.new_ma).toBe(1234567)
    expect(Object.keys(r?.provenance ?? {})).toEqual(['fees'])
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

    const r = await resolvedAuthorityDetail('CV', ORG)

    expect(r?.detail.agency.name).toBe('ARFA')
    expect(r?.detail.officialLang).toBe('pt')
    expect(r?.detail.civilite).toContain('Madame')
    expect(r?.detail.profile).toBeUndefined()
  })

  it('entrée orpheline (version absente de la réplique) → ignorée, repli code', async () => {
    await db.refEntries.put(entry({ id: 'e-1', versionId: 'v-fantôme' }))

    const r = await resolvedAuthorityDetail('SN', ORG)

    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
  })
})

describe('plafond = SOCLE DÉCLARÉ, jamais « la plus ancienne de la réplique » (bloquant B1)', () => {
  /** Deux versions publiées ; le socle est déclaré sur `v-1` sauf mention contraire. */
  const seedTwo = async (opts?: { baseline?: 'v-1' | 'v-2' | 'aucun' }) => {
    const base = opts?.baseline ?? 'v-1'
    await db.refVersions.bulkPut([
      version({
        id: 'v-1',
        label: 'v2026.1',
        publishedAt: '2026-03-01T00:00:00.000Z',
        isBaseline: base === 'v-1',
      }),
      version({
        id: 'v-2',
        label: 'v2026.2',
        publishedAt: '2026-07-15T00:00:00.000Z',
        isBaseline: base === 'v-2',
      }),
    ])
    await db.refEntries.bulkPut([
      entry({ id: 'e-1', versionId: 'v-1', payload: { fees: { new_ma: 750000 } } }),
      entry({ id: 'e-2', versionId: 'v-2', payload: { fees: { new_ma: 1000000 } } }),
    ])
  }

  it('socle ARCHIVÉ (donc absent) → AUCUNE version tierce appliquée : repli socle code', async () => {
    // Avant le fix : `versions[0]` = v2026.2 → 1 000 000 appliqué SANS adoption et SANS bannière.
    await seedTwo({ baseline: 'aucun' })

    const r = await resolvedAuthorityDetail('SN', ORG)
    const s = await loadRefState(ORG)

    expect(s.ceiling).toBe(null)
    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
    // …et la mise à jour reste ANNONCÉE (la file n'est pas vidée en silence).
    expect(s.pending.map((v) => v.label)).toEqual(['v2026.1', 'v2026.2'])
  })

  it('version ADOPTÉE absente de la réplique (cap de pull) → plafond = socle, pas un tiers', async () => {
    await seedTwo()
    await adopt('v-inconnue')

    const s = await loadRefState(ORG)

    expect(s.ceiling?.label).toBe('v2026.1')
    expect((await resolvedAuthorityDetail('SN', ORG))?.detail.profile?.fees.new_ma).toBe(750000)
  })

  it('la version ADOPTÉE archivée ne rétrograde pas au-dessous du socle', async () => {
    await seedTwo()
    await adopt('v-2')
    await db.refVersions.update('v-2', { status: 'archived' })

    const s = await loadRefState(ORG)

    expect(s.ceiling?.label).toBe('v2026.1') // socle, jamais une version non consentie
  })
})

describe('loadRefState — plafond et file d’attente', () => {
  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
      version({ id: 'v-3', label: 'v2026.3', publishedAt: '2026-07-20T00:00:00.000Z' }),
    ])
  })

  it('sans adoption : plafond = socle, les deux suivantes sont en attente', async () => {
    const s = await loadRefState(ORG)

    expect(s.ceiling?.label).toBe('v2026.1')
    expect(s.pending.map((v) => v.label)).toEqual(['v2026.2', 'v2026.3'])
  })

  it('adopter la plus récente vide la file (le plafond prend les intermédiaires)', async () => {
    await adopt('v-3')

    const s = await loadRefState(ORG)

    expect(s.ceiling?.label).toBe('v2026.3')
    expect(s.pending).toEqual([])
  })

  it('adopter une version INTERMÉDIAIRE laisse la suivante en attente', async () => {
    await adopt('v-2')

    const s = await loadRefState(ORG)

    expect(s.ceiling?.label).toBe('v2026.2')
    expect(s.pending.map((v) => v.label)).toEqual(['v2026.3'])
  })
})

describe('pendingRefUpdate — ciblage par pays', () => {
  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    ])
    await db.refEntries.bulkPut([
      entry({ id: 'e-1', versionId: 'v-1', payload: { fees: { new_ma: 750000 } } }),
      entry({
        id: 'e-2',
        versionId: 'v-2',
        country: 'TG',
        payload: { fees: { new_ma: 400000 } },
      }),
    ])
  })

  it('alerte sur le pays TOUCHÉ, pas sur les autres fiches', async () => {
    expect((await pendingRefUpdate(ORG, 'TG'))?.target.label).toBe('v2026.2')
    expect(await pendingRefUpdate(ORG, 'SN')).toBeNull()
    expect((await pendingRefUpdate(ORG))?.countries).toEqual(['TG'])
  })

  it('plus rien à adopter après adoption', async () => {
    await adopt('v-2')

    expect(await pendingRefUpdate(ORG)).toBeNull()
    expect(await pendingRefUpdate(ORG, 'TG')).toBeNull()
  })

  it('une version ne portant QUE `ctd_structure` alerte BIEN (P4.5 : la section est rendue)', async () => {
    // Avant P4.5, `ctd_structure` était hors liste blanche → aucune alerte (rien ne la rendait).
    // Depuis, `resolvedModule1Tree` applique ses deltas : une structure nationale qui change EST
    // une mise à jour à adopter, sinon les nouveaux dossiers du pays naîtraient sur l'ancien arbre
    // sans que personne ne le sache.
    await db.refEntries.update('e-2', {
      section: 'ctd_structure',
      payload: { deltas: [{ kind: 'remove', number: '1.2.6' }] },
    })

    expect((await pendingRefUpdate(ORG))?.countries).toEqual(['TG'])
  })

  it('une section VRAIMENT inconnue n’alerte toujours pas (garde-fou conservé)', async () => {
    // Le critère d'entrée dans la liste blanche reste « un consommateur réel » : publier une
    // section que rien ne rend ne doit jamais déclencher de bannière (piège d'origine).
    await db.refEntries.update('e-2', { section: 'ctd_labels_v3' })

    expect(await pendingRefUpdate(ORG)).toBeNull()
  })
})

describe('refUpdatePreview — le diff du dialog de consentement', () => {
  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({
        id: 'v-2',
        label: 'v2026.2',
        publishedAt: '2026-07-15T00:00:00.000Z',
        releaseNote: 'Sénégal — redevances',
      }),
    ])
    await db.refEntries.bulkPut([
      entry({
        id: 'e-1',
        versionId: 'v-1',
        payload: { currency: 'FCFA', fees: { new_ma: 750000, renewal: 300000 } },
        provenance: { texte: 'Arrêté antérieur' },
      }),
      entry({
        id: 'e-2',
        versionId: 'v-2',
        payload: { currency: 'FCFA', fees: { new_ma: 1000000, renewal: 300000 } },
        provenance: { texte: 'Décret n° 2025-1833', jo: 'JO n° 7871 du 29/12/2025' },
      }),
    ])
  })

  it('liste UNIQUEMENT les champs qui changent, avant/après, et cite la source', async () => {
    const p = await refUpdatePreview(ORG, 'v-2', 'fr')

    expect(p?.ceilingLabel).toBe('v2026.1')
    expect(p?.rows).toHaveLength(1)
    const row = p!.rows[0]!
    expect(row).toMatchObject({ country: 'SN', section: 'fees' })
    expect(row.before).toContain('750')
    expect(row.after).toContain('1')
    expect(p?.sources.map((s) => s.texte)).toEqual(['Décret n° 2025-1833'])
  })

  it('null pour une version déjà appliquée (pas de dialog vide)', async () => {
    await adopt('v-2')

    expect(await refUpdatePreview(ORG, 'v-2', 'fr')).toBeNull()
    expect(await refUpdatePreview(ORG, 'v-inconnue', 'fr')).toBeNull()
  })
})

describe('resolvedAuthorityDetailAtVersion — dossier épinglé (P4.2b)', () => {
  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    ])
    await db.refEntries.bulkPut([
      entry({ id: 'e-1', versionId: 'v-1', payload: { fees: { new_ma: 750000 } } }),
      entry({ id: 'e-2', versionId: 'v-2', payload: { fees: { new_ma: 1000000 } } }),
    ])
    await adopt('v-2') // l'org applique la v2026.2…
  })

  it('un dossier épinglé garde le barème de SA version, même si l’org a adopté plus récent', async () => {
    const pinned = await resolvedAuthorityDetailAtVersion('SN', ORG, 'v-1')

    expect(pinned?.detail.profile?.fees.new_ma).toBe(750000)
    expect(pinned?.versionLabel).toBe('v2026.1')
  })

  it('sans épinglage (ancien dossier) → version appliquée par l’org', async () => {
    const r = await resolvedAuthorityDetailAtVersion('SN', ORG, null)

    expect(r?.detail.profile?.fees.new_ma).toBe(1000000)
  })

  it('version épinglée inconnue localement → repli socle code (jamais de valeur fausse)', async () => {
    const r = await resolvedAuthorityDetailAtVersion('SN', ORG, 'v-purgée')

    expect(r?.versionLabel).toBe(null)
    expect(r?.detail).toEqual(authorityDetail('SN'))
  })

  it('épinglage BORNÉ au plafond : une version non adoptée par l’org ne sert pas son barème', async () => {
    // Majeur M1 : `dossiers.ref_version_id` est écrivable par un éditeur non-admin (PostgREST) —
    // sans borne, il se servait le barème d'une version que l'org n'a jamais consentie.
    await db.orgRefAdoptions.clear() // l'org retombe au socle v-1
    const r = await resolvedAuthorityDetailAtVersion('SN', ORG, 'v-2')

    expect(r?.detail.profile?.fees.new_ma).toBe(750000)
    expect(r?.versionLabel).toBe('v2026.1')
  })
})

describe('resolvedAgencyBlock + lookup + lignes Autorités (P4.4-pré)', () => {
  const arp = {
    name: 'ARP',
    full: 'Agence Sénégalaise (publiée)',
    directeur: 'Dr A. B. Sow',
    sexe: 'M',
    adresse: 'Dakar, adresse publiée',
    officialLang: 'fr',
  }

  beforeEach(async () => {
    await db.refVersions.put(version({ id: 'v-1', label: 'v2026.1' }))
    await db.refEntries.put(entry({ id: 'e-a', section: 'agency', payload: arp }))
  })

  it('resolvedAgencyBlock : agence publiée au plafond, repli code pour les autres pays', async () => {
    const sn = await resolvedAgencyBlock('SN', ORG)
    expect(sn.agency.adresse).toBe('Dakar, adresse publiée')
    expect(sn.civilite).toBe('Monsieur le Directeur Général')

    const bj = await resolvedAgencyBlock('BJ', ORG) // pas d'entrée publiée → socle code
    expect(bj.agency.name).toBe('ABMed')
    // Pays inconnu des deux sources → générique du socle (jamais null : comportement agencyFor).
    expect((await resolvedAgencyBlock('ZZ', ORG)).agency.name).toBe('ANRP')
  })

  it('resolvedAgencyBlock sous une version ÉPINGLÉE : ne sert pas plus récent que le dossier', async () => {
    await db.refVersions.put(
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    )
    await db.refEntries.put(
      entry({
        id: 'e-a2',
        versionId: 'v-2',
        section: 'agency',
        payload: { ...arp, directeur: 'Dr Successeur' },
      }),
    )
    await adopt('v-2')

    expect((await resolvedAgencyBlock('SN', ORG)).agency.directeur).toBe('Dr Successeur')
    expect((await resolvedAgencyBlock('SN', ORG, 'v-1')).agency.directeur).toBe('Dr A. B. Sow')
  })

  it('loadRefCountryLookup : une passe, tous pays — publié au plafond, code sinon', async () => {
    const lookup = await loadRefCountryLookup(ORG)
    expect(lookup('SN').agency.adresse).toBe('Dakar, adresse publiée')
    expect(lookup('CI').agency.name).toBe('AIRP')
    expect(lookup('GW').officialLang).toBe('pt')
  })

  it('resolvedAuthorityRows : noms overlayés + pays servi par le SEUL référentiel ajouté', async () => {
    await db.refEntries.put(
      entry({
        id: 'e-cv',
        country: 'CV',
        section: 'agency',
        payload: {
          name: 'ARFA',
          full: 'Agência de Regulação',
          directeur: '',
          sexe: 'M',
          adresse: 'Praia',
        },
      }),
    )
    await db.refEntries.put(
      entry({ id: 'e-cvf', country: 'CV', section: 'fees', payload: { fees: { new_ma: 200000 } } }),
    )
    // L'empreinte RA du pays ajouté (compteurs dossiers/AMM) doit être calculée comme pour le socle.
    const dossierCv = {
      id: 'd-cv',
      orgId: ORG,
      productId: 'p1',
      productName: 'X',
      format: 'ctd',
      activity: 'new_ma',
      country: 'CV',
      status: 'draft',
      tree: [],
      excludedDocIds: [],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
      archivedAt: null,
    }

    const rows = await resolvedAuthorityRows(ORG, [dossierCv as never], [])

    expect(rows.find((r) => r.code === 'SN')?.agency.adresse).toBe('Dakar, adresse publiée')
    const cv = rows.find((r) => r.code === 'CV')
    expect(cv?.agency.name).toBe('ARFA')
    expect(cv?.hasProfile).toBe(true) // badge « Barème » sur le contenu résolu, pas le code
    expect(cv?.dossierCount).toBe(1)
    expect(rows.filter((r) => r.code === 'CV')).toHaveLength(1)
  })

  it('une version publiée NON ADOPTÉE n’ajoute NI pays NI nom à la liste (plafond respecté)', async () => {
    await db.refVersions.put(
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    )
    await db.refEntries.put(
      entry({
        id: 'e-tg2',
        versionId: 'v-2',
        country: 'CV',
        section: 'agency',
        payload: { name: 'ARFA', full: 'Agência', directeur: '', sexe: 'M', adresse: 'Praia' },
      }),
    )

    const rows = await resolvedAuthorityRows(ORG, [], [])

    expect(rows.find((r) => r.code === 'CV')).toBeUndefined()
  })

  it('un patch agence PARTIEL ne vide JAMAIS directeur/adresse/civilité (fusion champ par champ)', async () => {
    // L'erreur god la plus probable : « je corrige le sigle » ({name, full} seuls). Sans fusion,
    // la civilité retombait sur le générique et l'adresse partait en « [Adresse de l'agence] »
    // dans une lettre OPPOSABLE (revue #416, M4).
    await db.refEntries.put(
      entry({
        id: 'e-patch',
        country: 'BJ',
        section: 'agency',
        payload: { name: 'ABMED', full: 'Agence Béninoise du Médicament (nouvelle dénomination)' },
      }),
    )

    const block = await resolvedAgencyBlock('BJ', ORG)

    expect(block.agency.name).toBe('ABMED')
    expect(block.agency.directeur).toBe('Dr Yossounon Chabi') // socle conservé
    expect(block.agency.adresse).toBe('Cotonou, Zone résidentielle')
    expect(block.civilite).toBe('Monsieur le Directeur Général') // sexe du socle, pas le défaut
  })

  it('le bloc résolu porte la CLÉ pays|version pour laquelle il a été calculé (garde M1)', async () => {
    expect((await resolvedAgencyBlock('SN', ORG)).key).toBe('SN|')
    expect((await resolvedAgencyBlock('SN', ORG, 'v-1')).key).toBe('SN|v-1')
    expect((await resolvedAgencyBlock('SN', ORG, null)).key).toBe('SN|')
  })
})

describe('dossierRefStatus — état d’épinglage', () => {
  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    ])
  })

  it('org en avance sur le dossier → bascule proposée', async () => {
    await adopt('v-2')

    const s = await dossierRefStatus(ORG, 'v-1')

    expect(s).toMatchObject({ pinnedLabel: 'v2026.1', behind: true, pinnedMissing: false })
    expect(s.applied?.label).toBe('v2026.2')
  })

  it('dossier aligné sur l’org → rien à signaler', async () => {
    expect(await dossierRefStatus(ORG, 'v-1')).toMatchObject({
      behind: false,
      pinnedMissing: false,
    })
  })

  it('dossier NON épinglé (antérieur à P4.2b) → suit l’org, aucune bascule', async () => {
    await adopt('v-2')

    expect(await dossierRefStatus(ORG, null)).toMatchObject({
      pinnedLabel: null,
      behind: false,
      pinnedMissing: false,
    })
  })

  it('version épinglée introuvable → signalée (pas de silence) et aucune bascule', async () => {
    expect(await dossierRefStatus(ORG, 'v-purgée')).toMatchObject({
      pinnedLabel: null,
      behind: false,
      pinnedMissing: true,
    })
  })
})

describe('resolvedModule1Tree — la structure du Module 1 par pays (P4.5)', () => {
  const socle = () => getModule1Tree('ctd', 'new_ma')
  const nums = (t: CtdNodeDef[]) => flattenTree(t).map((n) => n.number)

  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    ])
    await db.refEntries.put(
      entry({
        id: 'e-struct',
        versionId: 'v-2',
        country: 'TG',
        section: 'ctd_structure',
        payload: {
          deltas: [
            { kind: 'remove', number: '1.2.6' },
            { kind: 'add', number: '1.2.9', label: 'Attestation de pharmacovigilance' },
          ],
        },
        provenance: { texte: 'Arrêté 2026-042/MSHP' },
      }),
    )
  })

  it('sans adoption, la structure reste celle du SOCLE (aucun consentement contourné)', async () => {
    expect(
      nums(
        await resolvedModule1Tree({ country: 'TG', orgId: ORG, format: 'ctd', activity: 'new_ma' }),
      ),
    ).toEqual(nums(socle()))
  })

  it('après adoption, applique les deltas du pays', async () => {
    await adopt('v-2')

    const out = nums(
      await resolvedModule1Tree({ country: 'TG', orgId: ORG, format: 'ctd', activity: 'new_ma' }),
    )
    expect(out).not.toContain('1.2.6')
    expect(out).toContain('1.2.9')
  })

  it('n’affecte PAS un autre pays (les deltas sont nationaux)', async () => {
    await adopt('v-2')

    expect(
      nums(
        await resolvedModule1Tree({ country: 'SN', orgId: ORG, format: 'ctd', activity: 'new_ma' }),
      ),
    ).toEqual(nums(socle()))
  })

  it('un dossier ÉPINGLÉ sur v2026.1 garde sa structure d’origine (photographie opposable)', async () => {
    await adopt('v-2')

    const pinned = await resolvedModule1Tree({
      country: 'TG',
      orgId: ORG,
      format: 'ctd',
      activity: 'new_ma',
      refVersionId: 'v-1',
    })
    expect(nums(pinned)).toEqual(nums(socle()))
    // …alors que le plafond de l'org, lui, a bien bougé.
    const ceiling = await resolvedModule1Tree({
      country: 'TG',
      orgId: ORG,
      format: 'ctd',
      activity: 'new_ma',
    })
    expect(nums(ceiling)).toContain('1.2.9')
  })

  it('l’AUTO-FUSION reste bornée au socle : un delta publié n’entre jamais tout seul', async () => {
    await adopt('v-2')
    // Reproduit la règle du workspace : `isTreeOutdated(tree, SOCLE)` pilote l'auto-fusion,
    // `isTreeOutdated(tree, RÉSOLU)` pilote la bannière. Un dossier monté sur le socle est donc
    // « à jour » pour l'auto-fusion (rien ne se greffe en silence) et « périmé » pour la bannière.
    const tree = socle()
    expect(isTreeOutdated(tree, socle())).toBe(false)
    expect(
      isTreeOutdated(
        tree,
        await resolvedModule1Tree({ country: 'TG', orgId: ORG, format: 'ctd', activity: 'new_ma' }),
      ),
    ).toBe(true)
  })

  it('un payload de deltas malformé retombe sur le socle (jamais d’arbre cassé)', async () => {
    await adopt('v-2')
    await db.refEntries.update('e-struct', { payload: { deltas: [{ kind: 'oops' }] } })

    expect(
      nums(
        await resolvedModule1Tree({ country: 'TG', orgId: ORG, format: 'ctd', activity: 'new_ma' }),
      ),
    ).toEqual(nums(socle()))
  })
})

describe('B1 — un dossier NEUF ne se voit pas re-greffer ce que son pays a retiré', () => {
  // Le scénario exact que la revue a trouvé : sans cible d'auto-fusion filtrée, `createDossier`
  // faisait naître le dossier sans 1.1.2 (correct), puis l'ouverture du workspace comparait au
  // SOCLE (qui contient 1.1.2) et re-greffait la section — annulant « le PGHT n'est plus exigé au
  // Togo » trois secondes après, en silence et définitivement (clé localStorage posée).
  beforeEach(async () => {
    await db.refVersions.bulkPut([
      version({ id: 'v-1', label: 'v2026.1', publishedAt: '2026-03-01T00:00:00.000Z' }),
      version({ id: 'v-2', label: 'v2026.2', publishedAt: '2026-07-15T00:00:00.000Z' }),
    ])
    await db.refEntries.put(
      entry({
        id: 'e-rm',
        versionId: 'v-2',
        country: 'TG',
        section: 'ctd_structure',
        payload: { deltas: [{ kind: 'remove', number: '1.1.2' }] },
        provenance: { texte: 'Arrêté 2026-042/MSHP' },
      }),
    )
    await adopt('v-2')
  })

  it('la CIBLE d’auto-fusion ne contient pas la section retirée (donc rien à re-greffer)', async () => {
    const q = { country: 'TG', orgId: ORG, format: 'ctd' as const, activity: 'new_ma' }
    const officiel = await resolvedModule1Tree(q)
    const cible = await resolvedModule1Tree({ ...q, kinds: ['remove', 'relabel'] })

    expect(flattenTree(officiel).map((n) => n.number)).not.toContain('1.1.2')
    expect(flattenTree(cible).map((n) => n.number)).not.toContain('1.1.2')
    // Un dossier neuf (monté sur l'officiel) n'est donc PAS « périmé » face à la cible.
    expect(isTreeOutdated(officiel, cible)).toBe(false)
  })

  it('un AJOUT publié n’entre jamais par l’auto-fusion (il attend le clic)', async () => {
    await db.refEntries.update('e-rm', {
      payload: { deltas: [{ kind: 'add', number: '1.2.9', label: 'Pharmacovigilance' }] },
    })
    const q = { country: 'TG', orgId: ORG, format: 'ctd' as const, activity: 'new_ma' }
    const cible = await resolvedModule1Tree({ ...q, kinds: ['remove', 'relabel'] })

    // La cible d'auto-fusion IGNORE l'ajout : un dossier existant ne le reçoit pas tout seul…
    expect(flattenTree(cible).map((n) => n.number)).not.toContain('1.2.9')
    // …mais la structure OFFICIELLE le contient, donc la bannière le proposera.
    const officiel = await resolvedModule1Tree(q)
    expect(flattenTree(officiel).map((n) => n.number)).toContain('1.2.9')
    expect(isTreeOutdated(getModule1Tree('ctd', 'new_ma'), officiel)).toBe(true)
  })
})
