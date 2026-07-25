import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import {
  pullRefContent,
  rowToOrgRefAdoption,
  rowToRefEntry,
  rowToRefVersion,
  syncRefContent,
  type OrgRefAdoptionRow,
  type RefEntryRow,
  type RefVersionRow,
} from './ref-sync'

vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))
const { supaHolder } = vi.hoisted(() => ({
  supaHolder: { current: null as unknown },
}))
vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(async () => supaHolder.current) }))

const versionRow: RefVersionRow = {
  id: 'v-1',
  label: 'v2026.1',
  status: 'published',
  effective_date: null,
  release_note: 'Socle initial',
  published_at: '2026-07-25T00:00:00.000Z',
  created_at: '2026-07-25T00:00:00.000Z',
}

const entryRow: RefEntryRow = {
  id: 'e-1',
  version_id: 'v-1',
  country: 'SN',
  section: 'fees',
  payload: { currency: 'FCFA', fees: { new_ma: 1000000 } },
  provenance: { texte: 'Décret n° 2025-1833', jo: 'JO n° 7871 du 29/12/2025' },
  created_at: '2026-07-25T00:00:00.000Z',
}

const adoptionRow: OrgRefAdoptionRow = {
  id: 'a-1',
  org_id: 'org-1',
  version_id: 'v-1',
  adopted_at: '2026-07-25T10:00:00.000Z',
  adopted_by_email: 'admin@ex.com',
}

/** Chaîne de requête PostgREST factice : tous les modificateurs renvoient la même thenable. */
interface Chain extends PromiseLike<{ data: unknown; error: unknown }> {
  eq: () => Chain
  in: () => Chain
  order: () => Chain
  limit: () => Chain
  range: () => Chain
}
function chain(rows: unknown[], error: unknown = null): Chain {
  const p = Promise.resolve({ data: error ? null : rows, error })
  const c = {
    eq: () => c,
    in: () => c,
    order: () => c,
    limit: () => c,
    range: () => c,
    then: p.then.bind(p),
  } as Chain
  return c
}

/**
 * Stub Supabase indexé PAR TABLE. Un stub « tout sauf ref_versions → entries » renverrait les
 * lignes de `ref_entries` pour `org_ref_adoptions` : le pull écrirait une ligne poubelle sans
 * qu'aucune assertion ne le voie (faux-vert relevé en revue P4.2 — même famille que l'invariant
 * de la PR #369). Une table non stubbée renvoie donc [] explicitement.
 */
const supabaseWith = (
  versions: RefVersionRow[],
  entries: RefEntryRow[],
  adoptions: OrgRefAdoptionRow[] = [],
  onSelect?: (table: string) => void,
) =>
  ({
    from: (table: string) => ({
      select: () => {
        onSelect?.(table)
        return chain(
          table === 'ref_versions'
            ? versions
            : table === 'ref_entries'
              ? entries
              : table === 'org_ref_adoptions'
                ? adoptions
                : [],
        )
      },
    }),
  }) as unknown as SupabaseClient

beforeEach(async () => {
  await db.refVersions.clear()
  await db.refEntries.clear()
  await db.orgRefAdoptions.clear()
  localStorage.removeItem('pharnos.lastPull.ref.org-1')
  localStorage.removeItem('pharnos.lastPull.ref.org-2')
  vi.restoreAllMocks()
})

describe('ref-sync mapping', () => {
  it('rowToRefVersion → camelCase, release_note null-safe', () => {
    expect(rowToRefVersion(versionRow)).toEqual({
      id: 'v-1',
      label: 'v2026.1',
      status: 'published',
      effectiveDate: null,
      releaseNote: 'Socle initial',
      publishedAt: '2026-07-25T00:00:00.000Z',
      createdAt: '2026-07-25T00:00:00.000Z',
      isBaseline: false,
    })
  })

  it('is_baseline : absent d’une row (colonne antérieure à 0074) ⇒ false, jamais undefined', () => {
    expect(rowToRefVersion({ ...versionRow, is_baseline: true }).isBaseline).toBe(true)
    expect(rowToRefVersion(versionRow).isBaseline).toBe(false)
  })

  it('rowToOrgRefAdoption → camelCase, e-mail null-safe', () => {
    expect(rowToOrgRefAdoption(adoptionRow)).toEqual({
      id: 'a-1',
      orgId: 'org-1',
      versionId: 'v-1',
      adoptedAt: '2026-07-25T10:00:00.000Z',
      adoptedByEmail: 'admin@ex.com',
    })
  })

  it('rowToRefEntry → payload/provenance conservés tels quels', () => {
    const rec = rowToRefEntry(entryRow)
    expect(rec.versionId).toBe('v-1')
    expect(rec.country).toBe('SN')
    expect(rec.payload).toEqual({ currency: 'FCFA', fees: { new_ma: 1000000 } })
    expect(rec.provenance).toEqual({
      texte: 'Décret n° 2025-1833',
      jo: 'JO n° 7871 du 29/12/2025',
    })
  })
})

describe('pullRefContent — remplacement atomique de la réplique', () => {
  it('peuple les deux tables depuis le serveur', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow]), 'org-1')

    expect(await db.refVersions.count()).toBe(1)
    expect(await db.refEntries.count()).toBe(1)
    expect((await db.refVersions.get('v-1'))?.label).toBe('v2026.1')
  })

  it('écriture IDEMPOTENTE sur lignes existantes (bulkPut, pas bulkAdd) — clear() neutralisé', async () => {
    // Sans neutraliser clear(), ce test ne prouverait rien : le clear efface tout conflit
    // possible et un bulkAdd passerait aussi (motif de faux-vert ciblé par l'invariant repo).
    await pullRefContent(supabaseWith([versionRow], [entryRow]), 'org-1')
    vi.spyOn(db.refVersions, 'clear').mockResolvedValue(undefined)
    vi.spyOn(db.refEntries, 'clear').mockResolvedValue(undefined)

    await pullRefContent(supabaseWith([versionRow], [entryRow]), 'org-1')

    expect(await db.refVersions.count()).toBe(1)
    expect(await db.refEntries.count()).toBe(1)
  })

  it('une version dépubliée côté serveur disparaît aussi localement', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow]), 'org-1')
    await pullRefContent(supabaseWith([], []), 'org-1')

    expect(await db.refVersions.count()).toBe(0)
    expect(await db.refEntries.count()).toBe(0)
  })

  it('une erreur serveur laisse la réplique locale INTACTE (offline-first)', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow]), 'org-1')

    const enPanne = {
      from: () => ({ select: () => chain([], new Error('503')) }),
    } as unknown as SupabaseClient
    await expect(pullRefContent(enPanne, 'org-1')).rejects.toThrow('503')

    expect(await db.refVersions.count()).toBe(1)
    expect(await db.refEntries.count()).toBe(1)
  })
})

describe('pullRefContent — adoptions de l’org (0072)', () => {
  it('pulle et mappe les adoptions de l’org', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow], [adoptionRow]), 'org-1')

    const rows = await db.orgRefAdoptions.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ orgId: 'org-1', versionId: 'v-1' })
  })

  it('le pull d’une org ne touche PAS les adoptions d’une autre (membre multi-orgs)', async () => {
    await db.orgRefAdoptions.put({
      id: 'a-b',
      orgId: 'org-2',
      versionId: 'v-1',
      adoptedAt: '2026-07-20T00:00:00.000Z',
      adoptedByEmail: 'autre@ex.com',
    })

    await pullRefContent(supabaseWith([versionRow], [entryRow], [adoptionRow]), 'org-1')

    expect(await db.orgRefAdoptions.where('orgId').equals('org-2').count()).toBe(1)
    expect(await db.orgRefAdoptions.where('orgId').equals('org-1').count()).toBe(1)
  })

  it('une adoption révoquée côté serveur disparaît localement (remplacement par org)', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow], [adoptionRow]), 'org-1')
    await pullRefContent(supabaseWith([versionRow], [entryRow], []), 'org-1')

    expect(await db.orgRefAdoptions.count()).toBe(0)
  })
})

describe('syncRefContent — throttle TTL', () => {
  it('le TTL est PAR ORG : changer d’org ne saute pas le pull (bloquant B2 de la revue)', async () => {
    // Clé globale = un membre multi-orgs gardait les adoptions de l'org précédente → plafond faux
    // ET dossiers épinglés sur la mauvaise version (valeur poussée au serveur, durable).
    const tables: string[] = []
    supaHolder.current = supabaseWith([versionRow], [entryRow], [adoptionRow], (t) => {
      tables.push(t)
    })

    await syncRefContent('org-1')
    const afterFirst = tables.length
    expect(afterFirst).toBeGreaterThan(0)

    await syncRefContent('org-1') // même org, TTL non écoulé → aucun appel
    expect(tables.length).toBe(afterFirst)

    await syncRefContent('org-2') // AUTRE org → doit re-puller
    expect(tables.length).toBeGreaterThan(afterFirst)
  })

  it('un pull par fenêtre de 15 min : le second cycle ne touche pas le réseau', async () => {
    let selects = 0
    supaHolder.current = supabaseWith([versionRow], [entryRow], [], () => {
      selects += 1
    })

    await syncRefContent('org-1')
    expect(await db.refVersions.count()).toBe(1)
    expect(selects).toBeGreaterThan(0)
    const after = selects

    await syncRefContent('org-1')
    expect(selects).toBe(after) // TTL non écoulé → aucun nouvel appel réseau

    localStorage.removeItem('pharnos.lastPull.ref.org-1') // TTL « écoulé »
    await syncRefContent('org-1')
    expect(selects).toBeGreaterThan(after)
  })
})
