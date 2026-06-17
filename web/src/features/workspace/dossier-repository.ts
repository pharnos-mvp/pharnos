import { recordAudit } from '@/lib/audit'
import { db, type DossierRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { requestPersistentStorage } from '@/lib/persist'
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
}

export async function listDossiers(orgId: string): Promise<DossierRecord[]> {
  const items = await db.dossiers.where('orgId').equals(orgId).toArray()
  return items
    .filter((d) => d.deletedAt === null && !d.archivedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Dossiers ARCHIVÉS (soumis, conservés pour la rétention réglementaire) d'une org. */
export async function listArchivedDossiers(orgId: string): Promise<DossierRecord[]> {
  const items = await db.dossiers.where('orgId').equals(orgId).toArray()
  return items
    .filter((d) => d.deletedAt === null && !!d.archivedAt)
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
}

export async function getDossier(id: string): Promise<DossierRecord | undefined> {
  const d = await db.dossiers.get(id)
  return d && d.deletedAt === null ? d : undefined
}

export async function createDossier(
  orgId: string,
  input: CreateDossierInput,
): Promise<DossierRecord> {
  const ts = now()
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
    tree: assignIds(structuredClone(getModule1Tree(input.format))),
    excludedDocIds: [],
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    archivedAt: null,
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
