import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  deleteParty,
  getParty,
  listParties,
  normalizePartyName,
  partyId,
  updateParty,
  upsertParty,
} from './parties-repository'

const ORG = 'org-1'

beforeEach(async () => {
  await db.parties.clear()
  await db.outbox.clear()
})

describe('parties repository (offline-first)', () => {
  it('normalise le nom (casse/espaces) pour la clé de dédup', () => {
    expect(normalizePartyName('  Synthia   Labs  ')).toBe('synthia labs')
  })

  it('id déterministe : même (org, nom normalisé) → même id', () => {
    const a = partyId(ORG, 'Synthia Labs')
    const b = partyId(ORG, '  synthia   labs ')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    // Tenant différent → id différent (isolation).
    expect(partyId('org-2', 'Synthia Labs')).not.toBe(a)
  })

  it('upsert crée une organisation, la persiste et enregistre une op outbox', async () => {
    const id = await upsertParty(ORG, { nom: 'Synthia Labs', roles: ['titulaire'] })
    expect(id).toBeTruthy()

    const list = await listParties(ORG)
    expect(list).toHaveLength(1)
    expect(list[0]?.roles).toEqual(['titulaire'])

    const outbox = await db.outbox.where('entity').equals('party').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('create')
  })

  it('upsert idempotent : même nom → un seul enregistrement, rôles fusionnés (cumul)', async () => {
    const id1 = await upsertParty(ORG, { nom: 'Synthia Labs', roles: ['titulaire'] })
    const id2 = await upsertParty(ORG, { nom: 'synthia labs', roles: ['fabricant'] })

    expect(id2).toBe(id1)
    const list = await listParties(ORG)
    expect(list).toHaveLength(1)
    expect(list[0]?.roles).toEqual(['fabricant', 'titulaire']) // unionRoles trie
  })

  it("n'enregistre aucune op outbox si rien ne change (pas de churn de synchro)", async () => {
    await upsertParty(ORG, { nom: 'Synthia Labs', roles: ['titulaire'] })
    await db.outbox.clear()
    await upsertParty(ORG, { nom: 'Synthia Labs', roles: ['titulaire'] })
    expect(await db.outbox.count()).toBe(0)
  })

  it('nom vide → null, aucun enregistrement', async () => {
    expect(await upsertParty(ORG, { nom: '   ' })).toBeNull()
    expect(await listParties(ORG)).toHaveLength(0)
  })

  it('complète les champs vides sans écraser une donnée déjà saisie', async () => {
    const id = await upsertParty(ORG, { nom: 'Synthia', pays: 'DE' })
    await upsertParty(ORG, { nom: 'Synthia', pays: 'FR', adresse: 'Berlin' })
    const p = await getParty(id!)
    expect(p?.pays).toBe('DE') // existant préservé
    expect(p?.adresse).toBe('Berlin') // vide complété
  })

  it('updateParty modifie les détails de la fiche', async () => {
    const id = await upsertParty(ORG, { nom: 'Synthia', roles: ['fabricant'] })
    const updated = await updateParty(id!, { pays: 'CI', gmpCertificat: 'GMP-9' })
    expect(updated.pays).toBe('CI')
    expect(updated.gmpCertificat).toBe('GMP-9')
  })

  it('supprime logiquement : exclu de la liste, getParty vide, outbox delete', async () => {
    const id = await upsertParty(ORG, { nom: 'Synthia' })
    await deleteParty(id!)
    expect(await listParties(ORG)).toHaveLength(0)
    expect(await getParty(id!)).toBeUndefined()
    expect((await db.outbox.toArray()).map((o) => o.op)).toContain('delete')
  })

  it('isole les organisations par tenant', async () => {
    await upsertParty('org-1', { nom: 'A' })
    await upsertParty('org-2', { nom: 'B' })
    expect(await listParties('org-1')).toHaveLength(1)
    expect(await listParties('org-2')).toHaveLength(1)
  })
})
