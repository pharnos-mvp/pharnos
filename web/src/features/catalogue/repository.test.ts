import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from './repository'

const ORG = 'org-1'

beforeEach(async () => {
  await db.products.clear()
  await db.outbox.clear()
})

describe('catalogue repository (offline-first)', () => {
  it('crée un produit, le persiste et enregistre une opération outbox', async () => {
    const p = await createProduct(ORG, { nomCommercial: 'Doliprane', dci: 'Paracétamol' })

    expect(p.id).toBeTruthy()
    expect(p.deletedAt).toBeNull()
    expect(p.dosage).toBe('') // défaut appliqué

    expect(await listProducts(ORG)).toHaveLength(1)

    const outbox = await db.outbox.where('entity').equals('product').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('create')
  })

  it('rejette un produit sans champ requis', async () => {
    await expect(createProduct(ORG, { nomCommercial: '', dci: '' })).rejects.toThrow()
  })

  it('met à jour un produit existant', async () => {
    const p = await createProduct(ORG, { nomCommercial: 'A', dci: 'x' })
    const u = await updateProduct(p.id, { nomCommercial: 'B', dci: 'x', dosage: '500 mg' })

    expect(u.nomCommercial).toBe('B')
    expect(u.dosage).toBe('500 mg')
    expect(u.updatedAt >= p.updatedAt).toBe(true)

    const ops = (await db.outbox.toArray()).map((o) => o.op)
    expect(ops).toContain('update')
  })

  it('supprime logiquement : exclu de la liste, getProduct vide, outbox delete', async () => {
    const p = await createProduct(ORG, { nomCommercial: 'A', dci: 'x' })
    await deleteProduct(p.id)

    expect(await listProducts(ORG)).toHaveLength(0)
    expect(await getProduct(p.id)).toBeUndefined()
    expect((await db.outbox.toArray()).map((o) => o.op)).toContain('delete')
  })

  it('isole les produits par organisation (tenant)', async () => {
    await createProduct('org-1', { nomCommercial: 'A', dci: 'x' })
    await createProduct('org-2', { nomCommercial: 'B', dci: 'y' })

    expect(await listProducts('org-1')).toHaveLength(1)
    expect(await listProducts('org-2')).toHaveLength(1)
  })
})
