import { recordAudit } from '@/lib/audit'
import { db, type OrgRefOverrideRecord } from '@/lib/db'
import type { Translatable } from '@/lib/i18n-context'

/**
 * ⚠️ CE MODULE NE DOIT IMPORTER AUCUNE CAPACITÉ RÉSEAU. Il est tiré, via `ref-content`, par
 * `dossier-repository` — c'est-à-dire par tout ce qui touche un dossier, y compris le CTD Builder
 * autonome, qui se vend sur l'absence de sortie réseau. La partie serveur vit dans
 * `ref-overrides-sync.ts` ; le garde-fou `src/builder/isolation.ts` fait ÉCHOUER le build si elle
 * revient ici, fût-ce transitivement.
 */

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
export const normCountry = (country: string): string => country.trim().toUpperCase()

/** Clé locale = clé MÉTIER. Deux appareils convergent ainsi sur la même ligne. */
export const overrideKey = (orgId: string, country: string, fieldPath: string): string =>
  `${orgId}|${normCountry(country)}|${fieldPath}`

// ─── Lecture ──────────────────────────────────────────────────────────────────────────────────

/** Adaptations d'un pays, indexées par chemin (entrée du résolveur). */
export async function overridesForCountry(
  orgId: string,
  country: string,
): Promise<Map<string, OrgRefOverrideRecord>> {
  const rows = await db.orgRefOverrides
    .where('[orgId+country]')
    .equals([orgId, normCountry(country)])
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
    const code = normCountry(r.country)
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

/**
 * Crochet appelé après chaque écriture locale, pour que la plateforme déclenche sa synchronisation.
 *
 * ⚠️ POURQUOI UN CROCHET ET NON UN IMPORT. Ces deux écritures appelaient directement
 * `void syncRefOverrides(orgId)`. C'est ce seul appel qui faisait entrer `@supabase/*` dans
 * `dossier-repository` — donc dans tout ce qui touche un dossier, y compris une édition autonome
 * qui se vend sur l'absence de sortie réseau. Inverser la dépendance était la seule façon de
 * couper la chaîne sans changer le comportement de la plateforme.
 *
 * Défaut = ne rien faire. C'est le comportement VOULU hors plateforme : la pose reste locale.
 * `src/main.tsx` branche `syncRefOverrides` au démarrage — enregistrement EXPLICITE et non un
 * import à effet de bord, qui serait invisible en revue et dépendrait du `sideEffects` du
 * paquet (non déclaré ici).
 */
type OverrideChanged = (orgId: string) => void

let notifyOverrideChanged: OverrideChanged = () => {}

export function setOverrideSyncHook(fn: OverrideChanged): void {
  notifyOverrideChanged = fn
}

export const nowIso = () => new Date().toISOString()

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
  const code = normCountry(country)
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
  notifyOverrideChanged(orgId)
}

/** Retire une adaptation = RETOUR à la valeur officielle (le résolveur reprend la version adoptée). */
export async function removeOverride(
  orgId: string,
  country: string,
  fieldPath: OverridePath,
): Promise<void> {
  const code = normCountry(country)
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
  notifyOverrideChanged(orgId)
}
