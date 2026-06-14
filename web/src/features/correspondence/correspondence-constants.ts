import type { CorrespondenceRecord, CorrespondenceStatus } from '@/lib/db'
import type { Lang, Translatable } from '@/lib/i18n-context'

/**
 * Statuts du flux Correspondance (jalon H) — libellés métier validés par le brief CEO :
 * Draft / En review / Accepté / En suspens / Rejeté.
 */

export type DossierDisplayStatus = 'draft' | CorrespondenceStatus

export const DOSSIER_STATUS_ORDER: DossierDisplayStatus[] = [
  'draft',
  'in_review',
  'accepted',
  'suspended',
  'rejected',
]

const STATUS_LABELS: Record<DossierDisplayStatus, Translatable> = {
  draft: { fr: 'Draft', en: 'Draft' },
  in_review: { fr: 'En review', en: 'In review' },
  accepted: { fr: 'Accepté', en: 'Accepted' },
  suspended: { fr: 'En suspens', en: 'Suspended' },
  rejected: { fr: 'Rejeté', en: 'Rejected' },
}

/** Classes Tailwind du badge d'état (fond doux + texte contrasté, lisible clair/sombre). */
export const STATUS_BADGE_CLASSES: Record<DossierDisplayStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-transparent',
  in_review: 'bg-blue-100 text-blue-800 border-transparent dark:bg-blue-950 dark:text-blue-300',
  accepted:
    'bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300',
  suspended: 'bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300',
  rejected: 'bg-red-100 text-red-800 border-transparent dark:bg-red-950 dark:text-red-300',
}

export const statusLabel = (s: string, lang: Lang = 'fr'): string =>
  (STATUS_LABELS[s as DossierDisplayStatus] ?? STATUS_LABELS.draft)[lang]

/** Classes du badge pour une valeur RUNTIME (payload réseau) — fallback sobre si inconnue. */
export const statusBadgeClass = (s: string): string =>
  STATUS_BADGE_CLASSES[s as DossierDisplayStatus] ?? STATUS_BADGE_CLASSES.draft

/** Libellés des décisions du reviewer (page publique + fil). */
export const DECISION_LABELS: Record<Exclude<CorrespondenceStatus, 'in_review'>, string> = {
  accepted: 'Dossier accepté',
  suspended: 'Dossier mis en suspens',
  rejected: 'Dossier rejeté',
}

/**
 * État affiché d'un dossier, DÉRIVÉ de ses correspondances (source de vérité :
 * `correspondences.status`, écrit par l'Edge à la décision). Aucune écriture dans
 * `dossiers` par le serveur → zéro conflit avec la sync offline-first des dossiers.
 *
 * Règles : la correspondance la plus récente l'emporte ; une correspondance révoquée
 * SANS décision ne compte plus (l'accès reviewer est coupé) ; révoquée APRÈS décision,
 * la décision reste acquise.
 */
export function dossierDisplayStatus(
  dossierId: string,
  correspondences: CorrespondenceRecord[],
): DossierDisplayStatus {
  let latest: CorrespondenceRecord | undefined
  for (const c of correspondences) {
    if (c.dossierId !== dossierId || c.deletedAt !== null) continue
    if (c.status === 'in_review' && c.revokedAt !== null) continue
    if (!latest || c.createdAt > latest.createdAt) latest = c
  }
  return latest ? latest.status : 'draft'
}
