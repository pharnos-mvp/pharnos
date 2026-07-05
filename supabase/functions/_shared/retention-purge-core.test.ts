import { assertEquals } from 'jsr:@std/assert@1'

import { BUCKET, PAGE_SIZE, purgeDossier, removeStoragePrefix } from './retention-purge-core.ts'

// ─── Mock SupabaseClient minimal (Storage + PostgREST chaînés) ────────────────────────────────
// Le cœur de purge est consommé par DEUX Edges (cron nocturne + purge immédiate) : on fige ici
// son contrat exact — walk récursif paginé, remove par lots de 100, squelette tombstone champ à
// champ, forme de la ligne d'audit. Une régression silencieuse casserait la rétention des DEUX.

interface Entry {
  name: string
  id: string | null
}

function mockClient(tree: Record<string, Entry[]>) {
  const calls = {
    removed: [] as string[][],
    deletes: [] as { table: string; col: string; val: string }[],
    update: null as { table: string; payload: Record<string, unknown>; id: string } | null,
    inserts: [] as { table: string; row: Record<string, unknown> }[],
  }
  const client = {
    storage: {
      from(bucket: string) {
        assertEquals(bucket, BUCKET)
        return {
          // deno-lint-ignore require-await
          async list(dir: string, opts: { limit: number; offset: number }) {
            const entries = tree[dir] ?? []
            return { data: entries.slice(opts.offset, opts.offset + opts.limit), error: null }
          },
          // deno-lint-ignore require-await
          async remove(paths: string[]) {
            calls.removed.push(paths)
            return { data: null, error: null }
          },
        }
      },
    },
    from(table: string) {
      return {
        delete() {
          return {
            // deno-lint-ignore require-await
            async eq(col: string, val: string) {
              calls.deletes.push({ table, col, val })
              return { error: null }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            // deno-lint-ignore require-await
            async eq(_col: string, val: string) {
              calls.update = { table, payload, id: val }
              return { error: null }
            },
          }
        },
        // deno-lint-ignore require-await
        async insert(row: Record<string, unknown>) {
          calls.inserts.push({ table, row })
          return { error: null }
        },
      }
    },
  }
  // deno-lint-ignore no-explicit-any
  return { client: client as any, calls }
}

Deno.test('removeStoragePrefix — walk récursif (pièces + lifecycle), remove par lots de 100', async () => {
  const prefix = 'org1/dossiers/d1'
  // 2 niveaux réels : {attachmentId}/{fichier} et lifecycle/{uuid}/{fichier} + pagination (503
  // fichiers dans un sous-dossier → 2 pages de list, 6 lots de remove au total avec les 2 autres).
  const many = Array.from({ length: 503 }, (_, i) => ({ name: `f${i}.pdf`, id: `id${i}` }))
  const { client, calls } = mockClient({
    [prefix]: [
      { name: 'att-1', id: null },
      { name: 'lifecycle', id: null },
    ],
    [`${prefix}/att-1`]: many,
    [`${prefix}/lifecycle`]: [{ name: 'ev-1', id: null }],
    [`${prefix}/lifecycle/ev-1`]: [{ name: 'preuve.pdf', id: 'p1' }],
  })

  const n = await removeStoragePrefix(client, prefix)

  assertEquals(n, 504)
  assertEquals(
    calls.removed.map((batch) => batch.length),
    [100, 100, 100, 100, 100, 4], // chunks de 100 — le dernier lot porte 3 restants + la preuve
  )
  assertEquals(calls.removed[0][0], `${prefix}/att-1/f0.pdf`)
  assertEquals(calls.removed[5].at(-1), `${prefix}/lifecycle/ev-1/preuve.pdf`)
  // Garde-fou : la pagination a bien retraversé la page pleine (PAGE_SIZE) puis la suivante.
  assertEquals(many.length > PAGE_SIZE, true)
})

Deno.test('purgeDossier — enfants effacés, squelette tombstone champ à champ, audit attribué', async () => {
  const { client, calls } = mockClient({ 'org1/dossiers/d1': [] })

  const n = await purgeDossier(
    client,
    { id: 'd1', org_id: 'org1', product_name: 'Produit X' },
    { actorId: 'user-9', actorEmail: 'ra@labo.test', label: 'Produit X · suppression définitive' },
  )

  assertEquals(n, 0) // préfixe vide = idempotent
  assertEquals(
    calls.deletes,
    ['dossier_attachments', 'generated_docs', 'lifecycle_events'].map((table) => ({
      table,
      col: 'dossier_id',
      val: 'd1',
    })),
  )
  // Squelette tombstone : EXACTEMENT ces champs (contenu vidé, purge posée, sync propagée).
  assertEquals(calls.update?.table, 'dossiers')
  assertEquals(calls.update?.id, 'd1')
  const p = calls.update!.payload
  assertEquals(Object.keys(p).sort(), [
    'excluded_doc_ids',
    'purged_at',
    'tree',
    'updated_at',
    'variation_items',
    'variations',
  ])
  assertEquals(p.tree, [])
  assertEquals(p.variations, null)
  assertEquals(typeof p.purged_at, 'string')
  // Audit ALCOA : org-scopé, attribué, action purge, libellé fourni.
  assertEquals(calls.inserts.length, 1)
  const audit = calls.inserts[0]
  assertEquals(audit.table, 'audit_log')
  assertEquals(audit.row.org_id, 'org1')
  assertEquals(audit.row.actor_id, 'user-9')
  assertEquals(audit.row.action, 'purge')
  assertEquals(audit.row.label, 'Produit X · suppression définitive')
})
