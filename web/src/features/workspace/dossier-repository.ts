import { recordAudit } from '@/lib/audit'
import { db, type DossierRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { requestPersistentStorage } from '@/lib/persist'
import { loadRefState } from '@/features/catalogue/ref-state'
import type { VariationItem } from '@/features/variations/variation-request'
import { getModule1Tree, type DossierFormat } from './module1-tree'
import { assignIds } from './tree-utils'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export interface CreateDossierInput {
  productId: string
  productName: string
  format: DossierFormat
  activity: string
  country: string
  /** Variations cochées (n° Annexe N°2) — opération « variation » uniquement. */
  variations?: number[]
  /** N° de l'AMM existante — opérations renouvellement / variation (réf. lettre + RCP §8). */
  ammNumero?: string
  /** Date d'octroi de l'AMM existante — renouvellement / variation (réf. lettre + RCP §9). */
  ammDate?: string
  /** Tableau comparatif rempli à la création (popup après le choix des natures) — variation. */
  variationItems?: VariationItem[]
}

// `purgedAt` est TERMINAL (défense en profondeur, LOT 9) : un squelette tombstone purgé ne
// réapparaît dans AUCUNE vue, même si une écriture retardataire a remis deletedAt à null
// (course restaurer/purger au jour 30 — le serveur la rejette aussi, trigger 0054).
export async function listDossiers(orgId: string): Promise<DossierRecord[]> {
  const items = await db.dossiers.where('orgId').equals(orgId).toArray()
  return items
    .filter((d) => d.deletedAt === null && !d.archivedAt && !d.purgedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Dossiers ARCHIVÉS (soumis, conservés pour la rétention réglementaire) d'une org. */
export async function listArchivedDossiers(orgId: string): Promise<DossierRecord[]> {
  const items = await db.dossiers.where('orgId').equals(orgId).toArray()
  return items
    .filter((d) => d.deletedAt === null && !!d.archivedAt && !d.purgedAt)
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
}

/**
 * Politique de rétention (docs/RETENTION-POLICY.md) : un brouillon supprimé reste restaurable
 * en corbeille pendant cette fenêtre de grâce, puis est purgé définitivement (cron serveur,
 * migration 0054). La même constante pilote l'affichage (« purge dans N j ») et la purge locale —
 * le seuil serveur (Edge retention-purge) DOIT rester aligné.
 */
export const TRASH_RETENTION_DAYS = 30

/** Date de purge prévue d'un élément de corbeille (ISO) — deletedAt + fenêtre de grâce. */
export function trashPurgeAt(deletedAt: string): string {
  const t = new Date(deletedAt)
  t.setUTCDate(t.getUTCDate() + TRASH_RETENTION_DAYS)
  return t.toISOString()
}

/**
 * Jours restants (entier, arrondi supérieur) avant la purge d'un élément de corbeille — borné à
 * [0, fenêtre] : l'horloge d'affichage (`now` figé au montage) peut précéder `deletedAt` de
 * quelques secondes, qui arrondiraient à « 31 j » juste après la suppression.
 */
export function trashDaysLeft(deletedAt: string, now: Date): number {
  const ms = new Date(trashPurgeAt(deletedAt)).getTime() - now.getTime()
  return Math.min(TRASH_RETENTION_DAYS, Math.max(0, Math.ceil(ms / 86_400_000)))
}

/**
 * CORBEILLE : brouillons supprimés (soft delete) encore dans la fenêtre de grâce — restaurables.
 * Les éléments purgés (squelettes tombstone serveur) n'y figurent plus.
 */
export async function listTrashedDossiers(orgId: string): Promise<DossierRecord[]> {
  const items = await db.dossiers.where('orgId').equals(orgId).toArray()
  return items
    .filter((d) => d.deletedAt !== null && !d.purgedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

export async function getDossier(id: string): Promise<DossierRecord | undefined> {
  const d = await db.dossiers.get(id)
  return d && d.deletedAt === null && !d.purgedAt ? d : undefined
}

export async function createDossier(
  orgId: string,
  input: CreateDossierInput,
): Promise<DossierRecord> {
  const ts = now()
  // Épinglage du référentiel (P4.2b) : le dossier est monté sous la version que l'org APPLIQUE au
  // moment de sa création, et la garde même si l'org adopte plus récent ensuite. Best-effort :
  // une réplique vide (1re session, hors-ligne) laisse `null` = « résolution sur l'org » — jamais
  // un échec de création de dossier pour un attribut de traçabilité.
  const refVersionId = await loadRefState(orgId)
    .then((s) => s.ceiling?.id ?? null)
    .catch(() => null)
  const record: DossierRecord = {
    id: newId(),
    orgId,
    productId: input.productId,
    productName: input.productName,
    format: input.format,
    activity: input.activity,
    country: input.country,
    status: 'draft',
    // Copie indépendante de l'arborescence par défaut, avec id stables → éditable par dossier.
    // L'opération « variation » reçoit un arbre dédié, taillé par les variations cochées.
    tree: assignIds(
      structuredClone(getModule1Tree(input.format, input.activity, input.variations)),
    ),
    excludedDocIds: [],
    ...(input.variations?.length ? { variations: input.variations } : {}),
    ...(input.ammNumero ? { ammNumero: input.ammNumero } : {}),
    ...(input.ammDate ? { ammDate: input.ammDate } : {}),
    ...(input.variationItems?.length ? { variationItems: input.variationItems } : {}),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    archivedAt: null,
    refVersionId,
  }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.add(record)
    await enqueueOutbox('dossier', record.id, 'create', record)
  })
  // Sauvegarde de données critiques (geste utilisateur) → moment recommandé pour rendre le stockage persistant.
  void requestPersistentStorage()
  await recordAudit(orgId, 'dossier', record.id, 'create', record.productName)
  return record
}

/** Met à jour l'arborescence éditée du dossier (renommage / repositionnement / ajout). */
export async function updateDossierTree(
  id: string,
  tree: DossierRecord['tree'],
): Promise<DossierRecord | undefined> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null) return undefined
  const updated: DossierRecord = { ...existing, tree, updatedAt: now() }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
  await recordAudit(updated.orgId, 'dossier', id, 'update', updated.productName)
  return updated
}

/** Persiste les items du tableau comparatif (nœud 1.4.1) + le n° d'AMM d'un dossier de variation. */
export async function updateDossierVariation(
  id: string,
  data: { variationItems: VariationItem[]; ammNumero: string },
): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null) return
  const updated: DossierRecord = {
    ...existing,
    variationItems: data.variationItems,
    ammNumero: data.ammNumero,
    updatedAt: now(),
  }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
  await recordAudit(existing.orgId, 'dossier', id, 'update', existing.productName)
}

/** Exclut un document produit (catalogue) de ce dossier — il reste présent sous le produit. */
export async function excludeProductDoc(id: string, docId: string): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null) return
  if ((existing.excludedDocIds ?? []).includes(docId)) return
  const updated: DossierRecord = {
    ...existing,
    excludedDocIds: [...(existing.excludedDocIds ?? []), docId],
    updatedAt: now(),
  }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
}

/**
 * Bascule VOLONTAIRE d'un dossier vers une autre version du référentiel (P4.2b) : recalcule ses
 * redevances/exigences sous la nouvelle version. Jamais automatique — un dossier déposé est une
 * photographie opposable. Tracée à l'audit (« vX → vY »), avec les libellés lisibles : la trace
 * doit rester compréhensible même si la version est purgée plus tard.
 */
export async function switchDossierRefVersion(
  id: string,
  versionId: string,
  labels: { from: string | null; to: string },
): Promise<boolean> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null) return false
  if (existing.refVersionId === versionId) return false // idempotent (double clic, deux onglets)
  const updated: DossierRecord = { ...existing, refVersionId: versionId, updatedAt: now() }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
  // Action `update` (le vocabulaire d'audit est CLOS côté serveur) — c'est le libellé qui porte
  // le sens : « référentiel vX → vY », lisible même si la version est purgée plus tard.
  await recordAudit(
    existing.orgId,
    'dossier',
    id,
    'update',
    `${existing.productName} · référentiel ${labels.from ?? '—'} → ${labels.to}`,
  )
  return true
}

/** Motif d'audit (ALCOA : « reason for change ») accolé au libellé. */
function withReason(label: string, reason?: string): string {
  const r = reason?.trim()
  return r ? `${label} · motif : ${r}` : label
}

/**
 * Suppression DOUCE d'un BROUILLON (jamais soumis). Conserve la ligne (tombstone + backups),
 * tracée à l'audit avec un motif. À RÉSERVER aux brouillons — un dossier soumis s'ARCHIVE.
 */
export async function deleteDossier(id: string, reason?: string): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put({ ...existing, deletedAt: ts, updatedAt: ts })
    await enqueueOutbox('dossier', id, 'delete', { id })
  })
  await recordAudit(
    existing.orgId,
    'dossier',
    id,
    'delete',
    withReason(existing.productName, reason),
  )
}

/**
 * ARCHIVE un dossier SOUMIS (enregistrement réglementaire) : retiré de l'actif mais CONSERVÉ
 * (rétention, jamais purgé), restaurable. Tracé à l'audit avec motif.
 */
export async function archiveDossier(id: string, reason?: string): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null || existing.archivedAt) return
  const ts = now()
  const updated: DossierRecord = { ...existing, archivedAt: ts, updatedAt: ts }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
  await recordAudit(
    existing.orgId,
    'dossier',
    id,
    'archive',
    withReason(existing.productName, reason),
  )
}

/** Restaure un dossier archivé dans l'actif. Tracé à l'audit. */
export async function restoreDossier(id: string): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt !== null || !existing.archivedAt) return
  const ts = now()
  const updated: DossierRecord = { ...existing, archivedAt: null, updatedAt: ts }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
  await recordAudit(existing.orgId, 'dossier', id, 'restore', existing.productName)
}

/**
 * Restaure un BROUILLON depuis la corbeille (annule la suppression douce, dans la fenêtre de
 * grâce). Refusé si l'élément a déjà été purgé (squelette tombstone serveur). Tracé à l'audit.
 */
export async function restoreTrashedDossier(id: string): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt === null || existing.purgedAt) return
  const ts = now()
  const updated: DossierRecord = { ...existing, deletedAt: null, updatedAt: ts }
  await db.transaction('rw', db.dossiers, db.outbox, async () => {
    await db.dossiers.put(updated)
    await enqueueOutbox('dossier', id, 'update', updated)
  })
  await recordAudit(existing.orgId, 'dossier', id, 'restore', existing.productName)
}
