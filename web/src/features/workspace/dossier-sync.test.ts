import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type DossierRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { reportError } from '@/lib/sentry'
import { dossierToRow, purgeLocalChildren, rowToDossier, syncDossiers } from './dossier-sync'

// --- Mock Supabase : upsert (push) configurable + chaîne select (pull) vide ---
const upsertCalls: { table: string; row: Record<string, unknown> }[] = []
let upsertResult: { error: unknown } = { error: null }

interface SelectChain {
  eq: () => SelectChain
  gt: () => SelectChain
  or: () => SelectChain
  order: () => SelectChain
  limit: () => SelectChain
  then: (onfulfilled: (value: { data: unknown[]; error: null }) => unknown) => Promise<unknown>
}
function selectChain(): SelectChain {
  const chain: SelectChain = {
    eq: () => chain,
    gt: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (onfulfilled) => Promise.resolve({ data: [], error: null }).then(onfulfilled),
  }
  return chain
}

const supabaseMock = {
  from: (table: string) => ({
    upsert: (row: Record<string, unknown>) => {
      upsertCalls.push({ table, row })
      return Promise.resolve(upsertResult)
    },
    select: () => selectChain(),
  }),
}

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(async () => supabaseMock) }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

const rec: DossierRecord = {
  id: 'd1',
  orgId: 'org-1',
  productId: 'p1',
  productName: 'Doliprane',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [{ id: 'n1', number: '1.0', label: 'TdM' }],
  excludedDocIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
  archivedAt: null,
  opYear: null,
  opNumber: null,
  purgedAt: null,
}

describe('dossier sync mapping', () => {
  it('round-trip DossierRecord <-> row (arbre préservé)', () => {
    const back = rowToDossier(dossierToRow(rec))
    expect(back).toEqual(rec)
    expect(back.tree[0]?.label).toBe('TdM')
  })

  it('mappe en snake_case', () => {
    const row = dossierToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.product_name).toBe('Doliprane')
    expect(row.product_id).toBe('p1')
  })

  it('round-trip des champs variation (variations / items / AMM, `0042`)', () => {
    const variation: DossierRecord = {
      ...rec,
      activity: 'variation',
      variations: [3, 13],
      variationItems: [{ ref: 3, nature: 'Changement de nom', before: 'A', after: 'B' }],
      ammNumero: 'AMM_2015_7457',
      ammDate: '2021-03-17',
    }
    const row = dossierToRow(variation)
    expect(row.variations).toEqual([3, 13])
    expect(row.amm_numero).toBe('AMM_2015_7457')
    expect(row.amm_date).toBe('2021-03-17')
    expect(rowToDossier(row)).toEqual(variation)
  })

  it('dossier non-variation : champs variation nuls côté row', () => {
    const row = dossierToRow(rec)
    expect(row.variations).toBeNull()
    expect(row.variation_items).toBeNull()
    expect(row.amm_numero).toBeNull()
  })

  it("n° d'opération (0046) : JAMAIS poussé par le client, mais mappé au pull", () => {
    // Le push omet op_year/op_number → l'upsert ne les écrase pas (trigger serveur seul juge).
    const row = dossierToRow(rec)
    expect('op_year' in row).toBe(false)
    expect('op_number' in row).toBe(false)
    // Le pull (row serveur numérotée) descend le n° dans Dexie.
    const numbered = rowToDossier({ ...dossierToRow(rec), op_year: 2026, op_number: 7 })
    expect(numbered.opYear).toBe(2026)
    expect(numbered.opNumber).toBe(7)
  })

  it('purge de rétention (0054) : JAMAIS poussée par le client, mais mappée au pull', () => {
    // Un appareil retardataire qui re-pousse un dossier purgé ne doit pas « dé-purger » le
    // squelette tombstone serveur → purged_at est absent du push (pattern op_year/op_number).
    const row = dossierToRow({ ...rec, purgedAt: '2026-08-01T05:37:00.000Z' })
    expect('purged_at' in row).toBe(false)
    // Le pull descend la purge dans Dexie (déclenche le miroir local des enfants).
    const purged = rowToDossier({ ...dossierToRow(rec), purged_at: '2026-08-01T05:37:00.000Z' })
    expect(purged.purgedAt).toBe('2026-08-01T05:37:00.000Z')
  })

  it('miroir local de purge : enfants effacés, BLOBS de pièces jointes inclus (espace rendu)', async () => {
    const now = '2026-08-01T00:00:00.000Z'
    await db.dossierAttachments.add({
      id: 'att-1',
      orgId: 'org-1',
      dossierId: 'd1',
      nodeNumber: '1.2',
      fileName: 'gmp.pdf',
      mimeType: 'application/pdf',
      size: 3,
      filePath: null,
      uploaded: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await db.documentBlobs.add({ id: 'att-1', blob: new Blob(['pdf']) })
    await db.generatedDocs.add({
      id: 'gen-1',
      orgId: 'org-1',
      dossierId: 'd1',
      nodeNumber: '1.0',
      templateKey: 'cover',
      title: 'Cover',
      content: {},
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await db.lifecycleEvents.add({
      id: 'ev-1',
      orgId: 'org-1',
      dossierId: 'd1',
      type: 'submitted',
      actorId: 'u1',
      actorEmail: '',
      occurredAt: now,
      payload: {},
      docRefs: [],
      createdAt: now,
    })
    // Un autre dossier n'est PAS touché (l'effacement est ciblé).
    await db.documentBlobs.add({ id: 'att-other', blob: new Blob(['x']) })

    await purgeLocalChildren('d1')

    expect(await db.dossierAttachments.where('dossierId').equals('d1').count()).toBe(0)
    expect(await db.generatedDocs.where('dossierId').equals('d1').count()).toBe(0)
    expect(await db.lifecycleEvents.where('dossierId').equals('d1').count()).toBe(0)
    expect(await db.documentBlobs.get('att-1')).toBeUndefined()
    expect(await db.documentBlobs.get('att-other')).toBeDefined()

    await db.documentBlobs.clear()
  })
})

/** Exécute syncDossiers en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncDossiers(orgId).finally(() => {
      settled = true
    })
    while (!settled) {
      // setImmediate RÉEL : laisse fake-indexeddb progresser entre deux avances d'horloge.
      await new Promise((r) => setImmediate(r))
      await vi.advanceTimersByTimeAsync(5000)
    }
    await done
  } finally {
    vi.useRealTimers()
  }
}

const enFile = () => db.outbox.where('entity').equals('dossier').count()

describe('syncDossiers — push (drainage multi-org + rejet permanent)', () => {
  beforeEach(async () => {
    await db.dossiers.clear()
    await db.outbox.clear()
    localStorage.clear()
    vi.clearAllMocks()
    upsertCalls.length = 0
    upsertResult = { error: null }
  })

  it('pousse et draine un dossier de l’org active (nominal)', async () => {
    await db.dossiers.add(rec)
    await enqueueOutbox('dossier', 'd1', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.table).toBe('dossiers')
    expect(await enFile()).toBe(0)
  })

  it("ne draine PAS l'op d'une AUTRE org (régression : le dossier ne remontait JAMAIS)", async () => {
    // Membre multi-orgs (CS1) : écritures hors-ligne dans l'org B, puis bascule vers l'org A
    // (switchActiveOrg ne purge pas l'outbox — même utilisateur). Le cycle d'A supprimait l'op
    // de B sans l'avoir poussée : le dossier restait local pour toujours.
    await db.dossiers.add({ ...rec, id: 'd2', orgId: 'org-2' })
    await enqueueOutbox('dossier', 'd2', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it('draine un item orphelin (dossier local disparu) sans rien pousser', async () => {
    await enqueueOutbox('dossier', 'fantome', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(0)
  })

  it('rejet permanent (RLS/contrainte) : draine (anti-boucle) + trace Sentry, dossier local intact', async () => {
    await db.dossiers.add(rec)
    await enqueueOutbox('dossier', 'd1', 'create', {})
    upsertResult = { error: { code: '42501', message: 'row-level security' } }

    await runSync('org-1')

    // Anti-boucle : l'item ne reste pas en file à rééchouer à l'identique…
    expect(await enFile()).toBe(0)
    // …le dossier local n'est JAMAIS perdu…
    expect(await db.dossiers.get('d1')).toBeDefined()
    // …et la non-propagation laisse une trace (divergence local/serveur à investiguer).
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: '42501' }),
      expect.objectContaining({ entity: 'dossiers', id: 'd1', permanent: true }),
    )
  })
})
