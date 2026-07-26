import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'

/**
 * Applicabilité du référentiel réglementaire versionné — quelles versions s'appliquent à une org,
 * et jusqu'où (P4.1/P4.2).
 *
 * Module VOLONTAIREMENT sans contenu : il ne lit ni `roadmap-data` (socle bilingue : agences,
 * barèmes, échantillons) ni `authorities-data`. La cloche et le Dashboard n'ont besoin QUE de
 * `pendingRefUpdate` — les faire passer par le résolveur tirerait tout le contenu réglementaire
 * dans le bundle d'ENTRÉE (mesuré : +5 Ko gzip). Le contenu vit dans `ref-content`, le diff des
 * dialogs dans `ref-diff` : trois modules, trois portées de chargement.
 */

export type SectionKey = 'agency' | 'fees' | 'submission' | 'samples' | 'ctd_structure'
/** Liste blanche : une section hors de cette liste ne doit ni déplacer le badge de version ni
 *  polluer la provenance d'une fiche qui ne la rend pas. `ctd_structure` = P4.5 (deltas d'arbre). */
export const SECTIONS: readonly SectionKey[] = [
  'agency',
  'fees',
  'submission',
  'samples',
  'ctd_structure',
]

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** Rang d'applicabilité : date d'effet (repli publication, repli création). */
const applicability = (v: RefVersionRecord) => v.effectiveDate ?? v.publishedAt ?? v.createdAt

/**
 * Ordre d'applicabilité, DÉTERMINISTE : date d'effet, puis publication, puis création. Jamais le
 * libellé en clé de tri (`v2026.10 < v2026.9` en lexicographique — l'ordre s'inverserait à la
 * 10ᵉ version, et `effective_date` étant une DATE, deux textes du même jour sont fréquents).
 */
function byApplicability(a: RefVersionRecord, b: RefVersionRecord): number {
  const keys: [string, string][] = [
    [applicability(a), applicability(b)],
    [a.publishedAt ?? '', b.publishedAt ?? ''],
    [a.createdAt, b.createdAt],
    [a.id, b.id], // départage ultime stable (ids opaques) — jamais le libellé
  ]
  for (const [ka, kb] of keys) if (ka !== kb) return ka < kb ? -1 : 1
  return 0
}

/**
 * État du référentiel POUR UNE ORG (P4.2) : versions applicables, plafond adopté, et ce qui
 * reste à adopter. Le contenu publié se PROPOSE, il ne s'impose pas — tant qu'une version n'est
 * pas adoptée par l'org (RPC `adopt_ref_version`, admin), elle ne change rien à ses écrans.
 */
export interface RefState {
  /** Versions publiées ET à date d'effet atteinte, triées par applicabilité croissante. */
  versions: RefVersionRecord[]
  /** Rang de chaque version applicable (index dans `versions`). */
  rank: Map<string, number>
  /**
   * Plafond de résolution de l'org : version adoptée la plus applicable. Sans AUCUNE adoption =
   * version SOCLE (la plus ancienne) → une org existante ne voit jamais son contenu changer
   * sans consentement, et une publication future exige une adoption explicite.
   */
  ceiling: RefVersionRecord | null
  /** Versions applicables au-dessus du plafond = en attente d'adoption (bannière, cloche). */
  pending: RefVersionRecord[]
}

export async function loadRefState(orgId: string): Promise<RefState> {
  const today = new Date().toISOString().slice(0, 10)
  const [all, adoptions] = await Promise.all([
    db.refVersions.toArray(),
    db.orgRefAdoptions.where('orgId').equals(orgId).toArray(),
  ])
  // La RLS ne sert que du publié, mais la réplique locale peut en contenir d'autres (P4.4 :
  // l'admin god lira SES brouillons) — statut et date d'effet se re-filtrent ICI.
  const versions = all
    .filter((v) => v.status === 'published' && (!v.effectiveDate || v.effectiveDate <= today))
    .sort(byApplicability)
  const rank = new Map(versions.map((v, i) => [v.id, i] as const))

  const adopted = new Set(adoptions.map((a) => a.versionId))
  // Plancher = le SOCLE DÉCLARÉ (`is_baseline`, 0074), jamais « la plus ancienne version présente
  // dans la réplique » : cette inférence faisait glisser le plafond sur une version JAMAIS adoptée
  // dès que le socle était archivé ou absent (cap de pull) — du contenu réglementaire appliqué
  // sans consentement, et sans signal puisque `pending` devenait vide. Aucun socle lisible ⇒
  // plafond null ⇒ le résolveur retombe sur le socle CODE (comportement P4.1), jamais sur un tiers.
  let ceiling: RefVersionRecord | null = versions.find((v) => v.isBaseline) ?? null
  for (const v of versions) {
    if (adopted.has(v.id)) ceiling = v // `versions` est trié → le dernier adopté gagne
  }
  const ceilingRank = ceiling ? rank.get(ceiling.id)! : -1
  return { versions, rank, ceiling, pending: versions.filter((v) => rank.get(v.id)! > ceilingRank) }
}

/** Versions applicables jusqu'à un rang donné (inclus) — l'ensemble « autorisé » du résolveur. */
export const upTo = (state: RefState, maxRank: number): RefVersionRecord[] =>
  state.versions.filter((v) => state.rank.get(v.id)! <= maxRank)

/** Entrées locales d'un pays, toutes sections et toutes versions confondues. */
export function entriesForCountry(code: string): Promise<RefEntryRecord[]> {
  return db.refEntries.where('[country+section]').between([code, ''], [code, '￿']).toArray()
}

/** Mise à jour du référentiel en attente d'adoption par l'org (bannière, cloche). */
export interface PendingRefUpdate {
  /** Version candidate = la plus applicable en attente (adopter revient à tout prendre). */
  target: RefVersionRecord
  /** Pays touchés par les versions en attente — cible la bannière sur les fiches concernées. */
  countries: string[]
}

/**
 * Y a-t-il une mise à jour publiée que l'org n'a pas encore adoptée ? `country` restreint au
 * périmètre d'une fiche (une mise à jour Togo ne doit pas alerter sur la fiche Sénégal).
 */
export async function pendingRefUpdate(
  orgId: string,
  country?: string,
): Promise<PendingRefUpdate | null> {
  const state = await loadRefState(orgId)
  // Cible = la plus applicable en attente : l'adopter prend aussi les intermédiaires (plafond).
  const target = state.pending.at(-1)
  if (!target) return null
  const entries = await db.refEntries
    .where('versionId')
    .anyOf(state.pending.map((v) => v.id))
    .toArray()
  const countries = [
    ...new Set(
      entries.filter((e) => SECTIONS.includes(e.section as SectionKey)).map((e) => e.country),
    ),
  ].sort()
  if (countries.length === 0) return null // versions en attente sans section rendue (P4.5)
  if (country && !countries.includes(country)) return null
  return { target, countries }
}

/** Où en est un dossier épinglé par rapport à la version appliquée par son org (P4.2b) ? */
export interface DossierRefStatus {
  /** Libellé de la version épinglée sur le dossier (null = non épinglé, ou version introuvable). */
  pinnedLabel: string | null
  /** Version que l'org applique aujourd'hui (plafond adopté). */
  applied: RefVersionRecord | null
  /** L'org applique une version PLUS RÉCENTE → bascule volontaire possible. */
  behind: boolean
  /**
   * Le dossier est épinglé sur une version INTROUVABLE localement (hors-ligne avant le 1er pull,
   * version retirée côté serveur, cap de pull) : la Roadmap sert alors les valeurs de référence
   * par défaut. On l'affiche au lieu de rester muet — un chiffre réglementaire silencieusement
   * différent de celui du dossier est le pire des deux maux.
   */
  pinnedMissing: boolean
}

export async function dossierRefStatus(
  orgId: string,
  pinnedId: string | null,
): Promise<DossierRefStatus> {
  const state = await loadRefState(orgId)
  const applied = state.ceiling
  const pinnedRank = pinnedId ? state.rank.get(pinnedId) : undefined
  const appliedRank = applied ? state.rank.get(applied.id)! : -1
  return {
    pinnedLabel: state.versions.find((v) => v.id === pinnedId)?.label ?? null,
    applied,
    // Un dossier NON épinglé (antérieur à P4.2b) suit déjà l'org : rien à basculer.
    behind: pinnedRank !== undefined && appliedRank > pinnedRank,
    pinnedMissing: !!pinnedId && pinnedRank === undefined,
  }
}
