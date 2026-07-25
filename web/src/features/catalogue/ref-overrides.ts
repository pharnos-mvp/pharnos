import type { SupabaseClient } from '@supabase/supabase-js'

import { recordAudit } from '@/lib/audit'
import { db, type OrgRefOverrideRecord } from '@/lib/db'
import type { Translatable } from '@/lib/i18n-context'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'
import { isSyncEnabled } from '@/lib/sync-prefs'

/**
 * Adaptations LOCALES du référentiel (P4.3, migration 0077) — la seconde moitié de la promesse :
 * « la donnée officielle SE PROPOSE, la donnée locale SE RESPECTE ». Une publication ultérieure
 * n'écrase jamais ces valeurs ; le dialog d'adoption les annonce comme CONSERVÉES.
 *
 * Écriture CLIENT (offline-first, outbox → upsert), contrairement aux versions (pull-only) et aux
 * adoptions (RPC serveur). Les gardes sont serveur : RLS admin d'org, whitelist de `fieldPath` en
 * CHECK, estampille de l'auteur par trigger. La whitelist est re-déclarée ici pour l'UI — elle
 * doit rester le MIROIR EXACT de `org_ref_overrides_path_chk` (0077), sinon l'écriture est
 * rejetée en 23514 (rejet PERMANENT : la valeur locale est ANNULÉE, cf. `pushOutbox`).
 *
 * ⚠ IDENTITÉ : la clé locale est la clé MÉTIER `orgId|COUNTRY|fieldPath`, pas l'uuid serveur. Deux
 * appareils hors ligne qui adaptent le même champ convergent donc sur UNE ligne (un uuid tiré au
 * hasard de chaque côté produisait deux lignes locales pour la même donnée, et le vainqueur de la
 * résolution se jouait à la loterie de l'ordre de clé primaire). L'uuid serveur reste interne à
 * Postgres : on ne le pousse pas, `gen_random_uuid()` le fournit.
 */

export const OVERRIDE_PATHS = [
  'agency.directeur',
  'agency.sexe',
  'agency.adresse',
  'agency.telephone',
  'agency.email',
  'notes.internal',
] as const
export type OverridePath = (typeof OVERRIDE_PATHS)[number]

export function isOverridePath(v: string): v is OverridePath {
  return (OVERRIDE_PATHS as readonly string[]).includes(v)
}

/** Libellés des champs adaptables (fiche Autorité + signalement de conflit à l'adoption). */
export const OVERRIDE_LABEL: Record<OverridePath, Translatable> = {
  'agency.directeur': { fr: 'Destinataire (nom)', en: 'Recipient (name)' },
  'agency.sexe': { fr: 'Civilité', en: 'Salutation' },
  'agency.adresse': { fr: 'Adresse', en: 'Address' },
  'agency.telephone': { fr: 'Téléphone', en: 'Phone' },
  'agency.email': { fr: 'E-mail', en: 'Email' },
  'notes.internal': { fr: 'Note interne', en: 'Internal note' },
}

/**
 * Code pays NORMALISÉ (ISO-2 majuscule) — le serveur l'impose (`org_ref_overrides_country_chk`).
 * Sans normalisation à l'écriture, un « sn » partait en rejet permanent 23514 ET créait une
 * asymétrie : la fiche détail ne voyait pas l'adaptation, la liste si.
 */
const norm = (country: string): string => country.trim().toUpperCase()

/** Clé locale = clé MÉTIER. Deux appareils convergent ainsi sur la même ligne. */
export const overrideKey = (orgId: string, country: string, fieldPath: string): string =>
  `${orgId}|${norm(country)}|${fieldPath}`

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
    country: norm(o.country),
    field_path: o.fieldPath,
    value: o.value,
  }
}

export function rowToOverride(r: RefOverrideRow): OrgRefOverrideRecord {
  const country = norm(r.country)
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

// ─── Lecture ──────────────────────────────────────────────────────────────────────────────────

/** Adaptations d'un pays, indexées par chemin (entrée du résolveur). */
export async function overridesForCountry(
  orgId: string,
  country: string,
): Promise<Map<string, OrgRefOverrideRecord>> {
  const rows = await db.orgRefOverrides
    .where('[orgId+country]')
    .equals([orgId, norm(country)])
    .toArray()
  return new Map(rows.map((r) => [r.fieldPath, r]))
}

/**
 * TOUTES les adaptations de l'org, indexées `pays → (chemin → adaptation)` — pour les surfaces
 * LISTE (Autorités, boîte de réception) : une requête, pas une par ligne (anti N+1).
 */
export async function overridesByCountry(
  orgId: string,
): Promise<Map<string, Map<string, OrgRefOverrideRecord>>> {
  const rows = await db.orgRefOverrides.where('orgId').equals(orgId).toArray()
  const out = new Map<string, Map<string, OrgRefOverrideRecord>>()
  for (const r of rows) {
    const code = norm(r.country)
    const inner = out.get(code) ?? new Map<string, OrgRefOverrideRecord>()
    inner.set(r.fieldPath, r)
    out.set(code, inner)
  }
  return out
}

// NB fraîcheur des blocs résolus : la clé `pays|version` (revue #416, M1) reste une clé
// d'IDENTITÉ — c'est tout ce que le hook peut vérifier sans relire l'IDB. Y ajouter une
// « révision d'adaptations » serait invérifiable côté hook et donc trompeur. La fraîcheur est
// assurée autrement : le résolveur LIT `orgRefOverrides` À L'INTÉRIEUR de la live-query, donc
// Dexie ré-exécute la requête dès qu'une adaptation change. Ne pas sortir cette lecture du
// résolveur (un cache hors live-query rendrait les adaptations invisibles jusqu'au rechargement).

// ─── Écriture (admin d'org ; le serveur re-vérifie) ───────────────────────────────────────────

const nowIso = () => new Date().toISOString()

/**
 * Pose ou remplace une adaptation. Écriture LOCALE D'ABORD (offline-first) puis push best-effort :
 * l'utilisateur voit sa valeur immédiatement, la synchro suit. `updatedByEmail` reste vide tant
 * que le serveur n'a pas estampillé — le pull le renseigne (jamais d'auteur inventé côté client).
 *
 * AUDITÉ comme toute écriture de configuration opposable (parité avec `adopt_ref_version`, qui
 * journalise dans sa propre transaction) : sans trace, un retrait effacerait jusqu'au souvenir
 * qu'un destinataire avait été changé — indéfendable sur un produit qui vend l'ALCOA++.
 */
export async function setOverride(
  orgId: string,
  country: string,
  fieldPath: OverridePath,
  value: unknown,
): Promise<void> {
  const code = norm(country)
  const id = overrideKey(orgId, code, fieldPath)
  const existing = await db.orgRefOverrides.get(id)
  const ts = nowIso()
  await db.orgRefOverrides.put({
    id,
    orgId,
    country: code,
    fieldPath,
    value,
    updatedByEmail: existing?.updatedByEmail ?? '',
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  })
  await db.outbox.add({
    id: crypto.randomUUID(),
    entity: 'refOverride',
    entityId: id,
    op: existing ? 'update' : 'create',
    // L'org voyage avec l'op : au retrait, la ligne locale n'existe plus et c'est le SEUL moyen de
    // savoir si l'op relève du cycle en cours (membre multi-orgs).
    payload: { orgId, country: code, fieldPath },
    createdAt: ts,
  })
  await recordAudit(
    orgId,
    'ref_override',
    id,
    existing ? 'update' : 'create',
    `${code} · ${fieldPath} adapté`,
  )
  void syncRefOverrides(orgId)
}

/** Retire une adaptation = RETOUR à la valeur officielle (le résolveur reprend la version adoptée). */
export async function removeOverride(
  orgId: string,
  country: string,
  fieldPath: OverridePath,
): Promise<void> {
  const code = norm(country)
  const id = overrideKey(orgId, code, fieldPath)
  if (!(await db.orgRefOverrides.get(id))) return
  await db.orgRefOverrides.delete(id)
  await db.outbox.add({
    id: crypto.randomUUID(),
    entity: 'refOverride',
    entityId: id,
    op: 'delete',
    payload: { orgId, country: code, fieldPath },
    createdAt: nowIso(),
  })
  await recordAudit(
    orgId,
    'ref_override',
    id,
    'delete',
    `${code} · ${fieldPath} — retour à l'officiel`,
  )
  void syncRefOverrides(orgId)
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
