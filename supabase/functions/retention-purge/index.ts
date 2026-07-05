// Edge Function `retention-purge` (LOT 9) — purge de rétention des brouillons supprimés.
// Déclenchée chaque nuit par pg_cron → pg_net (migration 0054), JAMAIS par un navigateur.
//
// Politique (docs/RETENTION-POLICY.md) : un brouillon supprimé (corbeille) au-delà de la fenêtre
// de grâce est purgé DÉFINITIVEMENT. La mécanique de purge (Storage → enfants → squelette
// tombstone → audit) vit dans `_shared/retention-purge-core.ts`, PARTAGÉE avec la purge
// immédiate à la demande (`purge-dossier`).
//
// Garde-fou GxP re-vérifié ICI (pas seulement l'UI) : un dossier SOUMIS n'est JAMAIS purgé —
// `archived_at` posé OU toute correspondance (même soft-supprimée) ⇒ exclu et compté `anomalies`.
//
// Contrat sécurité : identique à `lifecycle-reminders` (0050/0051) — verify_jwt=false, barrière =
// secret partagé `x-cron-secret` comparé à temps constant au HASH Vault via la RPC service-role
// `lifecycle_cron_secret_hash` (secret partagé par les crons internes : une seule rotation).
//
// Idempotence : `purged_at is null` re-sélectionne un dossier dont le run a été interrompu ;
// un échec unitaire n'arrête pas la flotte (compté `failed`, retenté la nuit suivante).
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { sha256Hex, timingSafeEqual } from '../_shared/share-auth.ts'
import { PAGE_SIZE, purgeDossier, RETENTION_DAYS } from '../_shared/retention-purge-core.ts'

/** Borne du run nocturne (rattrapage la nuit suivante) — garde le run court et prévisible. */
const MAX_PER_RUN = 200
const ID_CHUNK = 100

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
        filesRemoved += await purgeDossier(supabase, dossier, {
          actorId: 'system',
          actorEmail: '',
          label: `${dossier.product_name} · purge automatique de rétention (corbeille > ${RETENTION_DAYS} j)`,
        })
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
