import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  pullRefContent,
  rowToRefEntry,
  rowToRefVersion,
  type RefEntryRow,
  type RefVersionRow,
} from './ref-sync'

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

/** Stub Supabase minimal : `from(table).select('*')` → data fournie par table. */
const supabaseWith = (versions: RefVersionRow[], entries: RefEntryRow[]) =>
  ({
    from: (table: string) => ({
      select: () =>
        Promise.resolve({
          data: table === 'ref_versions' ? versions : entries,
          error: null,
        }),
    }),
  }) as unknown as SupabaseClient

beforeEach(async () => {
  await db.refVersions.clear()
  await db.refEntries.clear()
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
    await pullRefContent(supabaseWith([versionRow], [entryRow]))

    expect(await db.refVersions.count()).toBe(1)
    expect(await db.refEntries.count()).toBe(1)
    expect((await db.refVersions.get('v-1'))?.label).toBe('v2026.1')
  })

  it('est idempotent (re-pull identique → mêmes lignes, pas de doublon)', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow]))
    await pullRefContent(supabaseWith([versionRow], [entryRow]))

    expect(await db.refVersions.count()).toBe(1)
    expect(await db.refEntries.count()).toBe(1)
  })

  it('une version dépubliée côté serveur disparaît aussi localement', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow]))
    await pullRefContent(supabaseWith([], []))

    expect(await db.refVersions.count()).toBe(0)
    expect(await db.refEntries.count()).toBe(0)
  })

  it('une erreur serveur laisse la réplique locale INTACTE (offline-first)', async () => {
    await pullRefContent(supabaseWith([versionRow], [entryRow]))

    const enPanne = {
      from: () => ({
        select: () => Promise.resolve({ data: null, error: new Error('503') }),
      }),
    } as unknown as SupabaseClient
    await expect(pullRefContent(enPanne)).rejects.toThrow('503')

    expect(await db.refVersions.count()).toBe(1)
    expect(await db.refEntries.count()).toBe(1)
  })
})
