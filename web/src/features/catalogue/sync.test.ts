import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import { productToRow, rowToProduct } from './sync'

const rec: ProductRecord = {
  id: 'p1',
  orgId: 'org-1',
  nomCommercial: 'Doliprane',
  dci: 'Paracétamol',
  dosage: '500 mg',
  forme: 'Comprimé',
  presentation: 'Boîte de 16',
  classeTherapeutique: 'Antalgique',
  codeAtc: 'N02BE01',
  titulaire: 'Laboratoire X',
  titulaireAdresse: '12 rue de la Santé, Cotonou',
  fabricant: 'Usine Y',
  fabricantAdresse: 'Zone industrielle, Casablanca',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
}

describe('sync mapping produits', () => {
  it('round-trip ProductRecord <-> ProductRow', () => {
    expect(rowToProduct(productToRow(rec))).toEqual(rec)
  })

  it('mappe correctement les colonnes snake_case', () => {
    const row = productToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.nom_commercial).toBe('Doliprane')
    expect(row.classe_therapeutique).toBe('Antalgique')
    expect(row.code_atc).toBe('N02BE01')
  })
})
