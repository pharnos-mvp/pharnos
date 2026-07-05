// Edge Function `retention-purge` (LOT 9) — purge de rétention des brouillons supprimés.
// Déclenchée chaque nuit par pg_cron → pg_net (migration 0054), JAMAIS par un navigateur.
//
// Politique (docs/RETENTION-POLICY.md) : un brouillon supprimé (corbeille) au-delà de la fenêtre
// de grâce est purgé DÉFINITIVEMENT :
//   1. fichiers Storage du dossier effacés via l'API Storage (préfixe `{org}/dossiers/{id}/` —
//      pièces jointes + pièces du cycle de vie ; JAMAIS de DELETE SQL sur storage.objects) ;
//   2. lignes enfants effacées (dossier_attachments, generated_docs, lifecycle_events) ;
//   3. ligne `dossiers` réduite en SQUELETTE TOMBSTONE : contenu vidé, `purged_at` posé,
//      `updated_at` bumpé → la sync incrémentale propage la purge aux appareils retardataires
//      (le client miroir-purge ses enfants locaux au pull), et le squelette reste la preuve ALCOA ;
//   4. entrée `audit_log` org-scopée (actor 'system') — la purge est un acte tracé.
//
// Garde-fou GxP re-vérifié ICI (pas seulement l'UI) : un dossier SOUMIS n'est JAMAIS purgé —
// `archived_at` posé OU toute correspondance (même soft-supprimée) ⇒ exclu et compté `anomalies`.
//
// Contrat sécurité : identique à `lifecycle-reminders` (0050/0051) — verify_jwt=false, barrière =
// secret partagé `x-cron-secret` comparé à temps constant au HASH Vault via la RPC service-role
// `lifecycle_cron_secret_hash` (secret partagé par les crons internes : une seule rotation).
//
// Idempotence / crash-safety : l'ordre Storage → enfants → tombstone fait qu'un run interrompu
// se rejoue sans effet de bord (remove de fichiers absents = no-op, deletes idempotents,
// `purged_at is null` re-sélectionne le dossier la nuit suivante). Un échec unitaire n'arrête
// pas la flotte (compté `failed`, retenté la nuit suivante).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { sha256Hex, timingSafeEqual } from '../_shared/share-auth.ts'

/** Fenêtre de grâce (jours) — DOIT rester alignée avec TRASH_RETENTION_DAYS côté front. */
const RETENTION_DAYS = 30
const BUCKET = 'documents'
const PAGE_SIZE = 500
/** Borne du run nocturne (rattrapage la nuit suivante) — garde le run court et prévisible. */
const MAX_PER_RUN = 200
const ID_CHUNK = 100
const REMOVE_CHUNK = 100
/** Profondeur max du walk Storage sous le préfixe dossier (réel : 2 niveaux, marge ×2). */
const MAX_LIST_DEPTH = 4

interface TrashRow {
  id: string
  org_id: string
  product_name: string
  deleted_at: string
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

Deno.serve(async (req: Request) => {
  const reqId = newReqId()
  const log = { fn: 'retention-purge', reqId }
  const started = Date.now()
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'x-request-id': reqId },
    })

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Barrière d'accès : garde de FORME (64 hex, aucun appel DB pour du spam), puis comparaison à
  // temps constant contre le HASH du secret Vault (RPC 0051, service-role only).
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!/^[0-9a-f]{64}$/.test(given)) {
    logJson({ ...log, status: 'unauthorized' })
    return json({ error: 'unauthorized' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data: expectedHash, error: hashErr } = await supabase.rpc('lifecycle_cron_secret_hash')
  if (hashErr || typeof expectedHash !== 'string' || expectedHash.length !== 64) {
    logJson({ ...log, status: 'config_missing' })
    return json({ error: 'unavailable' }, 503)
  }
  const enc = new TextEncoder()
  if (!timingSafeEqual(enc.encode(await sha256Hex(given)), enc.encode(expectedHash))) {
    logJson({ ...log, status: 'unauthorized' })
    return json({ error: 'unauthorized' }, 401)
  }

  let dryRun = false
  try {
    const body = await req.json().catch(() => ({}))
    dryRun = (body as { dryRun?: unknown })?.dryRun === true
  } catch {
    // corps vide/illisible : exécution normale
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()

    // 1) Scan borné de la corbeille échue (index partiel 0054 → ne touche que la corbeille).
    const candidates: TrashRow[] = []
    for (let from = 0; candidates.length < MAX_PER_RUN; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('dossiers')
        .select('id, org_id, product_name, deleted_at')
        .not('deleted_at', 'is', null)
        .is('purged_at', null)
        .is('archived_at', null)
        .lt('deleted_at', cutoff)
        .order('deleted_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = (data ?? []) as TrashRow[]
      candidates.push(...page)
      if (page.length < PAGE_SIZE) break
    }
    const scanned = candidates.length
    const batch = candidates.slice(0, MAX_PER_RUN)

    // 2) Garde-fou GxP : TOUTE correspondance (même soft-supprimée) = dossier soumis un jour →
    //    jamais purgé. Un tel élément en corbeille est une anomalie (comptée, jamais traitée).
    const submitted = new Set<string>()
    for (const part of chunk(batch.map((d) => d.id), ID_CHUNK)) {
      const { data, error } = await supabase
        .from('correspondences')
        .select('dossier_id')
        .in('dossier_id', part)
      if (error) throw error
      for (const row of (data ?? []) as { dossier_id: string }[]) submitted.add(row.dossier_id)
    }
    const eligible = batch.filter((d) => !submitted.has(d.id))
    const anomalies = batch.length - eligible.length
    if (anomalies > 0) logJson({ ...log, status: 'submitted_in_trash', anomalies })

    if (dryRun) {
      const out = { scanned, planned: eligible.length, anomalies, dryRun }
      logJson({ ...log, ...out, ms: Date.now() - started, status: 'ok' })
      return json(out)
    }

    // 3) Purge dossier par dossier — échec unitaire non bloquant (retenté la nuit suivante).
    let purged = 0
    let failed = 0
    let filesRemoved = 0
    for (const dossier of eligible) {
      try {
        filesRemoved += await removeStoragePrefix(
          supabase,
          `${dossier.org_id}/dossiers/${dossier.id}`,
        )

        for (const table of ['dossier_attachments', 'generated_docs', 'lifecycle_events']) {
          const { error } = await supabase.from(table).delete().eq('dossier_id', dossier.id)
          if (error) throw error
        }

        // Squelette tombstone EN DERNIER (marqueur d'achèvement) : contenu vidé, identité
        // conservée (product_name = trace lisible), updated_at bumpé → propagation sync.
        const nowIso = new Date().toISOString()
        const { error: updErr } = await supabase
          .from('dossiers')
          .update({
            tree: [],
            excluded_doc_ids: [],
            variations: null,
            variation_items: null,
            purged_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', dossier.id)
        if (updErr) throw updErr

        const { error: auditErr } = await supabase.from('audit_log').insert({
          id: crypto.randomUUID(),
          org_id: dossier.org_id,
          actor_id: 'system',
          actor_email: '',
          entity: 'dossier',
          entity_id: dossier.id,
          action: 'purge',
          label: `${dossier.product_name} · purge automatique de rétention (corbeille > ${RETENTION_DAYS} j)`,
        })
        if (auditErr) throw auditErr

        purged++
      } catch (e) {
        failed++
        logJson({
          ...log,
          status: 'purge_failed',
          dossier: dossier.id,
          err: String(e instanceof Error ? e.message : e).slice(0, 200),
        })
      }
    }

    const out = { scanned, planned: eligible.length, purged, failed, filesRemoved, anomalies, dryRun }
    logJson({ ...log, ...out, ms: Date.now() - started, status: 'ok' })
    return json(out)
  } catch (e) {
    logJson({
      ...log,
      ms: Date.now() - started,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500)
  }
})

/**
 * Efface récursivement tous les objets Storage sous un préfixe (l'API `list` n'est pas récursive :
 * les « dossiers » sont des entrées sans `id`). Profondeur bornée (réel : attachments à 2 niveaux,
 * lifecycle à 3). Retourne le nombre de fichiers supprimés ; préfixe absent = 0 (idempotent).
 */
async function removeStoragePrefix(supabase: SupabaseClient, prefix: string): Promise<number> {
  const files: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_LIST_DEPTH) return
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(dir, { limit: PAGE_SIZE, offset })
      if (error) throw error
      const entries = data ?? []
      for (const entry of entries) {
        if (entry.id === null) await walk(`${dir}/${entry.name}`, depth + 1)
        else files.push(`${dir}/${entry.name}`)
      }
      if (entries.length < PAGE_SIZE) break
    }
  }
  await walk(prefix, 0)
  for (const part of chunk(files, REMOVE_CHUNK)) {
    const { error } = await supabase.storage.from(BUCKET).remove(part)
    if (error) throw error
  }
  return files.length
}
