// CS1 — résolution des appartenances + périmètre par membre (org-repository).
// Points critiques figés ici :
//   1. le filtre user_id EXPLICITE (la RLS montre aussi les lignes des collègues : sans filtre,
//      le rôle d'un AUTRE membre pouvait gater l'UI) ;
//   2. le mapping du périmètre : pas de ligne membership_scopes → null (toute l'org, défaut) ;
//      une ligne → la liste EXACTE (y compris vide = ne voit rien) ;
//   3. un périmètre illisible ne bloque JAMAIS la résolution des orgs (fallback null —
//      la RLS serveur reste la barrière).
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchMyMemberships } from './org-repository'

interface FakeTable {
  rows?: unknown[]
  error?: { message: string } | null
}

const tables: Record<string, FakeTable> = {}
const eqCalls: Array<{ table: string; col: string; val: string }> = []
let sessionUserId: string | null = 'u-1'

vi.mock('@/lib/supabase', () => ({
  getSupabase: () =>
    Promise.resolve({
      auth: {
        getSession: () =>
          Promise.resolve({
            data: {
              session: sessionUserId ? { user: { id: sessionUserId } } : null,
            },
          }),
      },
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, val: string) => {
            eqCalls.push({ table, col, val })
            const t = tables[table] ?? {}
            return Promise.resolve({ data: t.rows ?? [], error: t.error ?? null })
          },
        }),
      }),
    }),
}))

beforeEach(() => {
  sessionUserId = 'u-1'
  eqCalls.length = 0
  tables.memberships = {
    rows: [
      { org_id: 'org-a', role: 'agence_locale', orgs: { name: 'Labo A' } },
      { org_id: 'org-b', role: 'admin', orgs: { name: 'Labo B' } },
    ],
  }
  tables.membership_scopes = { rows: [] }
})

describe('fetchMyMemberships (CS1)', () => {
  it('filtre par user_id sur les DEUX tables (jamais le rôle/périmètre d’un collègue)', async () => {
    await fetchMyMemberships()
    expect(eqCalls).toContainEqual({ table: 'memberships', col: 'user_id', val: 'u-1' })
    expect(eqCalls).toContainEqual({ table: 'membership_scopes', col: 'user_id', val: 'u-1' })
  })

  it('sans ligne de périmètre → scopedDossierIds null (toute l’org, comportement historique)', async () => {
    const out = await fetchMyMemberships()
    expect(out).toEqual([
      { orgId: 'org-a', role: 'agence_locale', orgName: 'Labo A', scopedDossierIds: null },
      { orgId: 'org-b', role: 'admin', orgName: 'Labo B', scopedDossierIds: null },
    ])
  })

  it('avec périmètre → la liste exacte, seulement pour l’org concernée', async () => {
    tables.membership_scopes = { rows: [{ org_id: 'org-a', dossier_ids: ['d-1', 'd-2'] }] }
    const out = await fetchMyMemberships()
    expect(out.find((m) => m.orgId === 'org-a')?.scopedDossierIds).toEqual(['d-1', 'd-2'])
    expect(out.find((m) => m.orgId === 'org-b')?.scopedDossierIds).toBeNull()
  })

  it('périmètre vide = liste vide (ne voit rien), PAS null', async () => {
    tables.membership_scopes = { rows: [{ org_id: 'org-a', dossier_ids: [] }] }
    const out = await fetchMyMemberships()
    expect(out.find((m) => m.orgId === 'org-a')?.scopedDossierIds).toEqual([])
  })

  it('erreur de lecture du périmètre → non bloquant (null, la RLS serveur protège)', async () => {
    tables.membership_scopes = { error: { message: 'boom' } }
    const out = await fetchMyMemberships()
    expect(out).toHaveLength(2)
    expect(out[0]!.scopedDossierIds).toBeNull()
  })

  it('sans session → aucune appartenance (pas de requête aveugle)', async () => {
    sessionUserId = null
    const out = await fetchMyMemberships()
    expect(out).toEqual([])
    expect(eqCalls).toHaveLength(0)
  })
})
