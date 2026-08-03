/**
 * Synchronisation des ADAPTATIONS LOCALES du référentiel (`org_ref_overrides`) — push de la file
 * puis pull de remplacement.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, séparé de `ref-overrides.ts` : c est la seule partie du module qui
 * parle au serveur. Tant qu elle y vivait, la chaîne
 *
 *     dossier-repository -> ref-content -> ref-overrides -> @supabase/*
 *
 * embarquait le client Supabase dans TOUT ce qui touche un dossier — y compris le CTD Builder
 * autonome, qui se vend sur l absence de sortie réseau. Le garde-fou d isolation l a refusé au
 * build ; ce découpage est la réponse.
 *
 * Le nom en `-sync.ts` n est pas décoratif : `src/builder/isolation.ts` refuse cette convention
 * par une règle générique. Ne pas renommer sans mettre le garde-fou à jour.
 *
 * ⚠️ Les écritures locales (`setOverride`/`removeOverride`) ne peuvent PAS importer ce module — ce
 * serait rétablir la chaîne qu on vient de couper. Elles appellent un crochet injecté
 * (`setOverrideSyncHook`), que la PLATEFORME branche sur `syncRefOverrides` au démarrage
 * (`src/main.tsx`). Sans enregistrement — cas du builder — la pose reste purement locale.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { db, type OrgRefOverrideRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'
import { isSyncEnabled } from '@/lib/sync-prefs'

import { normCountry, nowIso, overrideKey } from './ref-overrides'

/** Ligne Postgres (snake_case) de `org_ref_overrides`. */
export interface RefOverrideRow {
  org_id: string
  country: string
  field_path: string
  value: unknown
  updated_by_email: string
  created_at: string
  updated_at: string
}

/**
 * Colonnes POUSSÉES. Ni `id` (l'uuid serveur est interne — l'envoyer ferait basculer la clé
 * primaire serveur à chaque appareil et multiplierait les répliques), ni `updated_by_email`
 * (estampillé par le trigger 0077 : l'envoyer serait signer au nom d'un autre).
 */
function overrideToRow(o: OrgRefOverrideRecord) {
  return {
    org_id: o.orgId,
    country: normCountry(o.country),
    field_path: o.fieldPath,
    value: o.value,
  }
}

export function rowToOverride(r: RefOverrideRow): OrgRefOverrideRecord {
  const country = normCountry(r.country)
  return {
    id: overrideKey(r.org_id, country, r.field_path),
    orgId: r.org_id,
    country,
    fieldPath: r.field_path,
    value: r.value,
    updatedByEmail: r.updated_by_email ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ─── Synchro (push outbox puis pull de remplacement) ──────────────────────────────────────────

/** Garde-fou de volume : 6 chemins × pays ⇒ quelques dizaines de lignes. Au-delà, on TRACE. */
const PULL_CAP = 2000
let inFlight: Promise<void> | null = null

/**
 * Un seul cycle à la fois, mais un appelant concurrent ATTEND le cycle en vol au lieu de repartir
 * les mains vides : le flush de déconnexion (`flushOutbox`) doit vraiment attendre que les
 * adaptations soient parties, sinon `clearLocalData` purge une outbox non poussée.
 */
export function syncRefOverrides(orgId: string): Promise<void> {
  if (inFlight) return inFlight
  const run = (async () => {
    if (!navigator.onLine || !isSyncEnabled(orgId)) return
    const supabase = await getSupabase()
    if (!supabase) return
    try {
      await withRetry(() => pushOutbox(supabase, orgId))
      await withRetry(() => pullOverrides(supabase, orgId))
    } catch (error) {
      console.warn('[sync] adaptations du référentiel :', error)
      reportError(error, { op: 'sync', entity: 'refOverrides' })
    }
  })().finally(() => {
    inFlight = null
  })
  inFlight = run
  return run
}

/**
 * Push IDEMPOTENT et INDÉPENDANT DE L'ORDRE. `db.outbox.where('entity')` rend les items dans
 * l'ordre de la clé primaire (uuid ALÉATOIRE), jamais d'insertion : un `delete` pouvait donc
 * partir AVANT son `create` et laisser une ligne serveur orpheline.
 *
 * D'où la reformulation : on ne rejoue pas des OPÉRATIONS, on réconcilie un ÉTAT par ligne — la
 * réplique locale est la vérité. Présente localement → upsert ; absente → delete.
 */
async function pushOutbox(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('refOverride').toArray()
  if (items.length === 0) return

  const drain = new Set<string>()
  // Une entrée par ligne visée : deux ops sur la même ligne = UN aller-retour, dans le bon sens.
  const byEntity = new Map<string, { itemIds: string[]; op: OutboxOwner }>()
  for (const item of items) {
    const cur = byEntity.get(item.entityId)
    const owner = (item.payload ?? null) as OutboxOwner
    byEntity.set(item.entityId, {
      itemIds: [...(cur?.itemIds ?? []), item.id],
      op: cur?.op ?? owner,
    })
  }

  for (const [entityId, { itemIds, op }] of byEntity) {
    if (op && op.orgId !== orgId) continue // op d'un AUTRE org → reste en file pour son cycle
    const rec = await db.orgRefOverrides.get(entityId)
    if (rec && rec.orgId !== orgId) continue

    const query = rec
      ? supabase.from('org_ref_overrides').upsert(overrideToRow(rec), {
          // La ligne s'identifie par sa clé MÉTIER : un rejeu (autre appareil déjà passé) met à
          // jour au lieu de heurter l'unique en 23505, qui bloquerait la file pour toujours.
          onConflict: 'org_id,country,field_path',
        })
      : op
        ? supabase
            .from('org_ref_overrides')
            .delete()
            .eq('org_id', orgId)
            .eq('country', op.country)
            .eq('field_path', op.fieldPath)
        : null
    if (!query) {
      // Ni ligne locale ni op tracée : rien à pousser (ne pas laisser l'item en file à vie).
      itemIds.forEach((i) => drain.add(i))
      continue
    }
    const { error } = await query
    if (!error) {
      itemIds.forEach((i) => drain.add(i))
      continue
    }
    if (!isPermanentSyncError(error)) throw error // transitoire → conservé, retenté
    // Rejet DÉFINITIF (whitelist violée, admin rétrogradé, RLS) : la valeur locale ne doit PAS
    // rester active — cet appareil enverrait des courriers avec un destinataire que le serveur
    // refuse, en affichant « Adapté ». On ANNULE localement (retour à l'officiel = état sûr et
    // VISIBLE dans la fiche) et on trace.
    reportError(error, { op: 'sync', entity: 'refOverrides', id: entityId, permanent: true })
    if (rec) await db.orgRefOverrides.delete(entityId)
    itemIds.forEach((i) => drain.add(i))
  }
  await db.outbox.bulkDelete([...drain])
}

/** Org portée par une op de la file (indispensable pour un retrait : plus de ligne locale). */
type OutboxOwner = { orgId: string; country: string; fieldPath: string } | null

/**
 * Pull de REMPLACEMENT (pas incrémental). Un curseur `updated_at` ne peut pas propager un
 * RETRAIT : une ligne supprimée depuis un autre appareil n'a plus de `updated_at` à rapporter, la
 * réplique la garderait indéfiniment et les lettres partiraient à un destinataire retiré — en
 * affichant « valeurs adaptées par votre organisation ». Le volume (quelques dizaines de lignes)
 * rend le remplacement complet moins cher que la gestion de tombstones.
 *
 * Les lignes ayant une op EN ATTENTE sont préservées. Dans le cycle normal le push précède le
 * pull, donc une valeur serveur différente est légitimement celle d'un collègue (dernier écrivain
 * = vérité) ; la garde couvre les ops qui SURVIVENT au push — celles d'un autre org (membre
 * multi-orgs) et tout futur appel de pull hors cycle. Sans elle, une saisie non poussée
 * disparaîtrait après un toast de succès.
 */
async function pullOverrides(supabase: SupabaseClient, orgId: string): Promise<void> {
  // Instantané pris AVANT la requête : tout ce qui est écrit localement après cette borne est plus
  // récent que ce que le serveur peut renvoyer, et doit donc survivre au remplacement.
  const startedAt = nowIso()
  const { data, error } = await supabase
    .from('org_ref_overrides')
    .select('org_id,country,field_path,value,updated_by_email,created_at,updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: true })
    .limit(PULL_CAP)
  if (error) throw error
  const rows = (data ?? []) as RefOverrideRow[]
  if (rows.length >= PULL_CAP) {
    // Jamais de troncature MUETTE : un plafond atteint sans bruit ferait passer une réplique
    // incomplète pour la vérité de l'org.
    reportError(new Error(`pull org_ref_overrides plafonné à ${PULL_CAP}`), {
      op: 'sync',
      entity: 'refOverrides',
      orgId,
    })
  }

  const pending = new Set(
    (await db.outbox.where('entity').equals('refOverride').toArray()).map((i) => i.entityId),
  )
  const incoming = rows.map(rowToOverride).filter((r) => !pending.has(r.id))
  const arrived = new Set(incoming.map((r) => r.id))

  await db.transaction('rw', db.orgRefOverrides, async () => {
    const local = await db.orgRefOverrides.where('orgId').equals(orgId).toArray()
    const localById = new Map(local.map((r) => [r.id, r]))

    // Retrait propagé : une ligne absente du serveur disparaît. MAIS pas une ligne écrite
    // localement PLUS RÉCEMMENT que l'instantané du pull — sinon une saisie faite pendant le
    // cycle serait effacée par un serveur qui ne la connaît pas encore.
    const toDelete = local
      .filter((r) => !pending.has(r.id) && !arrived.has(r.id) && r.updatedAt <= startedAt)
      .map((r) => r.id)
    await db.orgRefOverrides.bulkDelete(toDelete)

    // Arbitrage par horodatage (même règle que `pro-settings-sync`) : le serveur ne réécrit pas
    // par-dessus une saisie locale PLUS RÉCENTE. Sans ça, une pose survenue pendant le cycle
    // repartait à la valeur précédente — perte silencieuse juste après un toast de succès.
    const winners = incoming.filter((r) => {
      const cur = localById.get(r.id)
      return !cur || r.updatedAt >= cur.updatedAt
    })
    // Écriture IDEMPOTENTE (`bulkPut`, jamais check-then-add) : l'IDB est partagée par origine et
    // un changement de compte peut faire coexister deux répliques (leçon audit-sync #369).
    await db.orgRefOverrides.bulkPut(winners)
  })
}
