import { db, type ProductRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { productSchema, type ProductInput } from './types'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

/** Produits actifs d'une organisation, du plus récemment modifié au plus ancien. */
export async function listProducts(orgId: string): Promise<ProductRecord[]> {
  const items = await db.products.where('orgId').equals(orgId).toArray()
  return items
    .filter((p) => p.deletedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getProduct(id: string): Promise<ProductRecord | undefined> {
  const p = await db.products.get(id)
  return p && p.deletedAt === null ? p : undefined
}

export async function createProduct(orgId: string, input: ProductInput): Promise<ProductRecord> {
  const values = productSchema.parse(input)
  const ts = now()
  const record: ProductRecord = {
    id: newId(),
    orgId,
    ...values,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.products, db.outbox, async () => {
    await db.products.add(record)
    await enqueueOutbox('product', record.id, 'create', record)
  })
  return record
}

export async function updateProduct(id: string, input: ProductInput): Promise<ProductRecord> {
  const existing = await db.products.get(id)
  if (!existing || existing.deletedAt !== null) {
    throw new Error('Produit introuvable')
  }
  const values = productSchema.parse(input)
  const updated: ProductRecord = { ...existing, ...values, updatedAt: now() }
  await db.transaction('rw', db.products, db.outbox, async () => {
    await db.products.put(updated)
    await enqueueOutbox('product', id, 'update', updated)
  })
  return updated
}

/** Suppression logique (soft delete) — l'objet reste pour la réconciliation de synchro. */
export async function deleteProduct(id: string): Promise<void> {
  const existing = await db.products.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.products, db.outbox, async () => {
    await db.products.update(id, { deletedAt: ts, updatedAt: ts })
    await enqueueOutbox('product', id, 'delete', { id })
  })
}
