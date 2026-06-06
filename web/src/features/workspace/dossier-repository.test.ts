import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { createDossier, deleteDossier, getDossier, listDossiers } from './dossier-repository'

const ORG = 'org-1'

beforeEach(async () => {
  await db.dossiers.clear()
  await db.outbox.clear()
})

describe('dossier repository (offline-first)', () => {
  it('crée un dossier CTD avec une copie indépendante de l’arborescence UEMOA', async () => {
    const d = await createDossier(ORG, {
      productId: 'p1',
      productName: 'Doliprane',
      format: 'ctd',
      activity: 'new_ma',
      country: 'CI',
    })

    expect(d.id).toBeTruthy()
    expect(d.format).toBe('ctd')
    expect(d.tree.length).toBeGreaterThan(0)
    // 1.1.2 = Lettre de PGHT (personnalisation UEMOA)
    const corr = d.tree.find((n) => n.number === '1.1')
    expect(corr?.children?.find((c) => c.number === '1.1.2')?.label).toContain('PGHT')

    expect(await listDossiers(ORG)).toHaveLength(1)
    const outbox = await db.outbox.where('entity').equals('dossier').toArray()
    expect(outbox[0]?.op).toBe('create')
  })

  it('crée un dossier eCTD avec l’arborescence ECOWAS (1.0 Correspondance)', async () => {
    const d = await createDossier(ORG, {
      productId: 'p1',
      productName: 'Doliprane',
      format: 'ectd',
      activity: 'new_ma',
      country: 'NG',
    })
    expect(d.tree.find((n) => n.number === '1.0')?.label).toBe('Correspondance')
  })

  it('supprime (soft delete) un dossier', async () => {
    const d = await createDossier(ORG, {
      productId: 'p1',
      productName: 'X',
      format: 'ctd',
      activity: 'new_ma',
      country: 'SN',
    })
    await deleteDossier(d.id)
    expect(await listDossiers(ORG)).toHaveLength(0)
    expect(await getDossier(d.id)).toBeUndefined()
  })
})
