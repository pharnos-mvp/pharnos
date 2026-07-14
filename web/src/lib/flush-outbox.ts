import { db } from './db'

/**
 * Pousse au mieux (best-effort) l'outbox AVANT une purge du cache local (déconnexion) — pour ne
 * pas perdre silencieusement des écritures faites hors-ligne, sur un outil offline-first (intégrité
 * des données, ALCOA++). À n'appeler QUE tant que l'utilisateur est encore authentifié (avant
 * `supabase.auth.signOut()`), sinon les pushs 401.
 *
 * No-op instantané dans le cas courant (outbox vide — l'outbox est déjà drainé après chaque
 * mutation) ou hors-ligne (rien à tenter). Chaque `sync<Entité>` gère son propre push + retry ;
 * on avale les erreurs (best-effort). Import DYNAMIQUE : garde le bundle d'auth léger et évite de
 * coupler le cœur (AuthProvider) aux modules de fonctionnalités.
 *
 * NB : sur un CHANGEMENT de compte (login d'un autre utilisateur sans déconnexion propre), on NE
 * peut PAS flusher — la session courante est celle du NOUVEL utilisateur, pousser les écritures de
 * l'ancien sous son JWT les mésattribuerait. Ce cas de perte est inhérent au partage de machine.
 */
export async function flushOutbox(orgId: string | null): Promise<void> {
  if (!orgId) return
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if ((await db.outbox.count()) === 0) return
  } catch {
    return
  }

  const modules = await Promise.all([
    import('@/features/workspace/dossier-sync'),
    import('@/features/workspace/dossier-attachments-sync'),
    import('@/features/workspace/generated-docs-sync'),
    import('@/features/workspace/lifecycle-sync'),
    import('@/features/catalogue/catalogue-sync'),
    import('@/features/profile/pro-settings-sync'),
    import('@/features/correspondence/correspondence-sync'),
    import('@/features/audit/audit-sync'),
  ])
  const [dossier, attach, gendocs, lifecycle, catalogue, pro, corr, audit] = modules

  await Promise.allSettled([
    dossier.syncDossiers(orgId),
    attach.syncDossierAttachments(orgId),
    gendocs.syncGeneratedDocs(orgId),
    lifecycle.syncLifecycle(orgId),
    // Catalogue : chaîne ORDONNÉE (FK parties → products → documents). Poussés en parallèle,
    // l'enfant partait avant son parent (23503) — et ici la purge du cache suit immédiatement,
    // donc l'écriture rejetée était perdue POUR DE BON. Les autres entités n'ont aucune FK
    // croisée (vérifié en base), leur parallélisme est sans risque.
    catalogue.syncCatalogue(orgId),
    pro.syncProSettings(orgId),
    corr.syncCorrespondences(orgId),
    audit.syncAudit(orgId),
  ])
}
