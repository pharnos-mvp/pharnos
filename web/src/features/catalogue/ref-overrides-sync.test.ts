import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks de HAUT NIVEAU (hoistés) : `vi.doMock` dans un test n'aurait aucun effet, le module
// `ref-overrides` étant déjà résolu au moment où le test s'exécute.
const { calls, upsertPayloads, deleteFilters, serverRows, panne } = vi.hoisted(() => ({
  calls: [] as string[],
  upsertPayloads: [] as unknown[],
  deleteFilters: [] as Record<string, string>[],
  serverRows: { value: [] as unknown[] },
  panne: { permanent: false },
}))

vi.mock('@/lib/supabase', () => ({
  getSupabase: () =>
    Promise.resolve({
      from: () => ({
        // Serveur FIDÈLE : il retient ce qu'on lui écrit et le restitue au pull (un mock qui
        // renvoie toujours [] ferait passer le pull de remplacement pour destructeur à tort).
        upsert: (row: unknown) => {
          calls.push('upsert')
          upsertPayloads.push(row)
          if (panne.permanent) {
            return Promise.resolve({ error: { code: '23514', message: 'check constraint' } })
          }
          const r = row as Record<string, string>
          serverRows.value = [
            ...serverRows.value.filter((x) => {
              const e = x as Record<string, string>
              return !(
                e.org_id === r.org_id &&
                e.country === r.country &&
                e.field_path === r.field_path
              )
            }),
            {
              ...r,
              updated_by_email: 'admin@org.test',
              created_at: '2026-07-25T10:00:00.000Z',
              updated_at: '2026-07-25T10:00:00.000Z',
            },
          ]
          return Promise.resolve({ error: null })
        },
        delete: () => {
          const filters: Record<string, string> = {}
          const chain = {
            eq: (col: string, val: string) => {
              filters[col] = val
              if (Object.keys(filters).length === 3) {
                calls.push('delete')
                deleteFilters.push(filters)
                serverRows.value = serverRows.value.filter((x) => {
                  const e = x as Record<string, string>
                  return !(
                    e.org_id === filters.org_id &&
                    e.country === filters.country &&
                    e.field_path === filters.field_path
                  )
                })
                return Promise.resolve({ error: null })
              }
              return chain
            },
          }
          return chain
        },
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => {
                calls.push('pull')
                return Promise.resolve({ data: serverRows.value, error: null })
              },
            }),
          }),
        }),
      }),
    }),
}))
vi.mock('@/lib/sync-prefs', () => ({ isSyncEnabled: () => true }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))

import { db } from '@/lib/db'
import { reportError } from '@/lib/sentry'
import { overrideKey, setOverride, setOverrideSyncHook } from './ref-overrides'
import { syncRefOverrides } from './ref-overrides-sync'

// La pose d'une adaptation ne connaît plus la synchronisation : elle appelle un crochet, que la
// plateforme branche depuis `src/main.tsx`. On reproduit ce branchement ici — les cas qui vérifient
// « une pose déclenche un cycle » testent donc AUSSI le câblage réel, au lieu de le supposer.
setOverrideSyncHook(syncRefOverrides)

const KEY = overrideKey('org-1', 'SN', 'agency.directeur')

const ITEM = (id: string, entityId: string, op: 'create' | 'delete', orgId = 'org-1') => ({
  id,
  entity: 'refOverride',
  entityId,
  op,
  payload: { orgId, country: 'SN', fieldPath: 'agency.directeur' },
  createdAt: '2026-07-25T10:00:00.000Z',
})

const REC = (id: string, orgId: string) => ({
  id,
  orgId,
  country: 'SN',
  fieldPath: 'agency.directeur',
  value: 'Dr Aminata Diop',
  updatedByEmail: '',
  createdAt: '2026-07-25T10:00:00.000Z',
  updatedAt: '2026-07-25T10:00:00.000Z',
})

beforeEach(async () => {
  calls.length = 0
  upsertPayloads.length = 0
  deleteFilters.length = 0
  serverRows.value = []
  panne.permanent = false
  vi.clearAllMocks()
  await db.orgRefOverrides.clear()
  await db.outbox.clear()
})

describe('identité par clé MÉTIER', () => {
  it('deux poses du même champ visent UNE seule ligne (pas deux uuid concurrents)', async () => {
    await setOverride('org-1', 'SN', 'agency.directeur', 'Dr A')
    await setOverride('org-1', 'sn', 'agency.directeur', 'Dr B') // pays non normalisé
    await syncRefOverrides('org-1') // les poses déclenchent un cycle en fire-and-forget
    const rows = await db.orgRefOverrides.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(KEY)
    expect(rows[0]?.country).toBe('SN') // normalisé à l'écriture (le serveur l'impose)
    expect(rows[0]?.value).toBe('Dr B')
  })
})

describe('push des adaptations — idempotent et INDÉPENDANT DE L’ORDRE', () => {
  it('deux ops sur la même ligne suivent l’ÉTAT LOCAL, pas l’ordre de lecture de la file', async () => {
    // `db.outbox.where('entity')` rend les items dans l'ordre de la clé primaire (uuid ALÉATOIRE),
    // jamais d'insertion : un `delete` lu avant son `create` recréait une ligne serveur orpheline.
    await db.outbox.bulkAdd([ITEM('zzz', KEY, 'create'), ITEM('aaa', KEY, 'delete')])

    await syncRefOverrides('org-1')

    expect(calls.filter((c) => c !== 'pull')).toEqual(['delete'])
    // Le retrait cible la ligne par sa CLÉ MÉTIER (l'uuid serveur n'est jamais connu du client).
    expect(deleteFilters[0]).toEqual({
      org_id: 'org-1',
      country: 'SN',
      field_path: 'agency.directeur',
    })
    expect(await db.outbox.count()).toBe(0) // les DEUX ops de la ligne sont drainées
  })

  it('ligne présente localement → upsert, sans id serveur ni auteur (estampille serveur)', async () => {
    await db.orgRefOverrides.put(REC(KEY, 'org-1'))
    await db.outbox.add(ITEM('i2', KEY, 'create'))

    await syncRefOverrides('org-1')

    expect(upsertPayloads[0]).toEqual({
      org_id: 'org-1',
      country: 'SN',
      field_path: 'agency.directeur',
      value: 'Dr Aminata Diop',
    })
    const keys = Object.keys(upsertPayloads[0] as object)
    expect(keys).not.toContain('id') // l'uuid serveur reste interne à Postgres
    expect(keys).not.toContain('updated_by_email') // posé par le trigger 0077 (anti-usurpation)
  })

  it('les ops d’un AUTRE org restent en file (membre multi-orgs)', async () => {
    await db.orgRefOverrides.put(REC(overrideKey('org-2', 'SN', 'agency.directeur'), 'org-2'))
    await db.outbox.add(
      ITEM('i3', overrideKey('org-2', 'SN', 'agency.directeur'), 'create', 'org-2'),
    )
    await db.outbox.add(ITEM('i4', overrideKey('org-2', 'SN', 'agency.email'), 'delete', 'org-2'))

    await syncRefOverrides('org-1')

    expect(calls.filter((c) => c !== 'pull')).toEqual([])
    expect(await db.outbox.count()).toBe(2)
  })

  it('un rejet PERMANENT ANNULE la valeur locale (jamais un « Adapté » que le serveur refuse)', async () => {
    panne.permanent = true
    await db.orgRefOverrides.put(REC(KEY, 'org-1'))
    await db.outbox.add(ITEM('i5', KEY, 'create'))

    await syncRefOverrides('org-1')

    // Sans cette annulation, l'appareil enverrait des courriers avec un destinataire refusé par le
    // serveur, tout en affichant « valeurs adaptées par votre organisation ».
    expect(await db.orgRefOverrides.get(KEY)).toBeUndefined()
    expect(await db.outbox.count()).toBe(0) // drainé : pas de boucle de retry
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: '23514' }),
      expect.objectContaining({ entity: 'refOverrides', permanent: true }),
    )
  })
})

describe('pull de REMPLACEMENT', () => {
  it('propage un RETRAIT fait depuis un autre appareil (un curseur ne pourrait pas)', async () => {
    // Ligne déjà répliquée localement, absente du serveur → elle doit DISPARAÎTRE, sinon les
    // lettres partiraient à un destinataire retiré en affichant « Adapté ».
    await db.orgRefOverrides.put(REC(KEY, 'org-1'))
    serverRows.value = []

    await syncRefOverrides('org-1')

    expect(await db.orgRefOverrides.count()).toBe(0)
  })

  it('ma saisie SURVIT au cycle et récupère l’auteur estampillé par le serveur', async () => {
    // Le pull REMPLACE la réplique de l'org : sans le push qui précède ni la garde `pending`, ce
    // remplacement effacerait la saisie locale juste après un toast de succès. Ici on vérifie la
    // boucle complète : push (le serveur retient) → pull (il restitue, avec SON estampille).
    await db.orgRefOverrides.put({ ...REC(KEY, 'org-1'), value: 'Ma saisie' })
    await db.outbox.add(ITEM('i6', KEY, 'create'))
    // Une valeur concurrente déjà en base : mon écriture la remplace (dernier écrivain = vérité,
    // arbitrage SERVEUR — la réplique locale ne décide rien).
    serverRows.value = [
      {
        org_id: 'org-1',
        country: 'SN',
        field_path: 'agency.directeur',
        value: 'Valeur précédente',
        updated_by_email: 'autre@org.test',
        created_at: '2026-07-25T09:00:00.000Z',
        updated_at: '2026-07-25T09:30:00.000Z',
      },
    ]

    await syncRefOverrides('org-1')

    const kept = await db.orgRefOverrides.get(KEY)
    expect(kept?.value).toBe('Ma saisie')
    // L'auteur n'est JAMAIS inventé côté client : il arrive par le pull (trigger 0077).
    expect(kept?.updatedByEmail).toBe('admin@org.test')
    expect(await db.outbox.count()).toBe(0)
  })

  it('n’efface JAMAIS les lignes d’un autre org (réplique multi-orgs)', async () => {
    const otherKey = overrideKey('org-2', 'SN', 'agency.directeur')
    await db.orgRefOverrides.put(REC(otherKey, 'org-2'))
    serverRows.value = []

    await syncRefOverrides('org-1')

    expect(await db.orgRefOverrides.get(otherKey)).toBeDefined()
  })
})
