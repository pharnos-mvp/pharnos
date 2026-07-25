import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import {
  pullRefContent,
  rowToRefEntry,
  rowToRefVersion,
  syncRefContent,
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

/** Stub Supabase : `from(table).select(cols)…` → data fournie par table (+ compteur d'appels). */
const supabaseWith = (versions: RefVersionRow[], entries: RefEntryRow[], onSelect?: () => void) =>
  ({
    from: (table: string) => ({
      select: () => {
        onSelect?.()
        return chain(table === 'ref_versions' ? versions : entries)
      },
    }),
  }) as unknown as SupabaseClient

beforeEach(async () => {
  await db.refVersions.clear()
  await db.refEntries.clear()
  localStorage.removeItem('pharnos.lastPull.ref')
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

describe('syncRefContent — throttle TTL', () => {
  it('un pull par fenêtre de 15 min : le second cycle ne touche pas le réseau', async () => {
    let selects = 0
    supaHolder.current = supabaseWith([versionRow], [entryRow], () => {
      selects += 1
    })

    await syncRefContent('org-1')
    expect(await db.refVersions.count()).toBe(1)
    expect(selects).toBeGreaterThan(0)
    const after = selects

    await syncRefContent('org-1')
    expect(selects).toBe(after) // TTL non écoulé → aucun nouvel appel réseau

    localStorage.removeItem('pharnos.lastPull.ref') // TTL « écoulé »
    await syncRefContent('org-1')
    expect(selects).toBeGreaterThan(after)
  })
})
