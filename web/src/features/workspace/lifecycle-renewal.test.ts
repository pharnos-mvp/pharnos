import { describe, expect, it } from 'vitest'

import type { LifecycleEventRecord } from '@/lib/db'
import { deriveRenewalAlert } from './lifecycle-renewal'

const ev = (over: Partial<LifecycleEventRecord>): LifecycleEventRecord => ({
  id: 'e1',
  orgId: 'org-1',
  dossierId: 'd1',
  type: 'amm_granted',
  actorId: 'u1',
  actorEmail: 'labo@ex.com',
  occurredAt: '2026-01-10T12:00:00.000Z',
  payload: { amm_number: 'AMM-2026-1', valid_until: '2031-01-10T12:00:00.000Z' },
  docRefs: [],
  createdAt: '2026-01-10T12:00:00.000Z',
  ...over,
})

describe('deriveRenewalAlert — fenêtre J−6 mois (M6)', () => {
  it('pas d’AMM accordée → null (un refus ne se renouvelle pas)', () => {
    expect(deriveRenewalAlert([], 'd1', new Date('2026-06-01T00:00:00.000Z'))).toBeNull()
    expect(
      deriveRenewalAlert(
        [ev({ type: 'amm_refused', payload: {} })],
        'd1',
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    ).toBeNull()
  })

  it('AMM d’un AUTRE dossier → null (filtrage par dossierId)', () => {
    expect(
      deriveRenewalAlert([ev({ dossierId: 'd2' })], 'd1', new Date('2026-06-01T00:00:00.000Z')),
    ).toBeNull()
  })

  it('AMM valide, hors fenêtre → phase ok + jours restants', () => {
    const a = deriveRenewalAlert([ev({})], 'd1', new Date('2030-01-10T12:00:00.000Z'))!
    expect(a.phase).toBe('ok')
    expect(a.ammNumber).toBe('AMM-2026-1')
    expect(a.validUntil).toBe('2031-01-10T12:00:00.000Z')
    expect(a.alertFrom).toBe('2030-07-10T12:00:00.000Z')
    expect(a.daysLeft).toBe(365)
  })

  it('dans la fenêtre J−6 mois → phase due', () => {
    const a = deriveRenewalAlert([ev({})], 'd1', new Date('2030-08-01T00:00:00.000Z'))!
    expect(a.phase).toBe('due')
    expect(a.daysLeft).toBe(163)
  })

  it('à l’ouverture EXACTE de la fenêtre → due (borne incluse)', () => {
    const a = deriveRenewalAlert([ev({})], 'd1', new Date('2030-07-10T12:00:00.000Z'))!
    expect(a.phase).toBe('due')
  })

  it('échéance dépassée → expired, daysLeft 0 (jamais négatif)', () => {
    const a = deriveRenewalAlert([ev({})], 'd1', new Date('2031-02-01T00:00:00.000Z'))!
    expect(a.phase).toBe('expired')
    expect(a.daysLeft).toBe(0)
  })

  it('AMM sans valid_until (ou corrompu) → phase unknown, pas d’échéance calculée', () => {
    const a = deriveRenewalAlert(
      [ev({ payload: { amm_number: 'AMM-X' } })],
      'd1',
      new Date('2026-06-01T00:00:00.000Z'),
    )!
    expect(a.phase).toBe('unknown')
    expect(a.validUntil).toBeNull()
    expect(a.alertFrom).toBeNull()
    expect(a.daysLeft).toBeNull()
    expect(a.ammNumber).toBe('AMM-X')
    const b = deriveRenewalAlert(
      [ev({ payload: { valid_until: 'pas-une-date' } })],
      'd1',
      new Date('2026-06-01T00:00:00.000Z'),
    )!
    expect(b.phase).toBe('unknown')
    expect(b.ammNumber).toBeNull()
  })

  it('plusieurs AMM journalisées → la DERNIÈRE l’emporte (correction append-only)', () => {
    const a = deriveRenewalAlert(
      [
        ev({
          id: 'e1',
          payload: { amm_number: 'AMM-ANCIENNE', valid_until: '2029-01-01T12:00:00.000Z' },
        }),
        ev({
          id: 'e2',
          occurredAt: '2026-02-01T12:00:00.000Z',
          createdAt: '2026-02-01T12:00:00.000Z',
          payload: { amm_number: 'AMM-CORRIGÉE', valid_until: '2031-02-01T12:00:00.000Z' },
        }),
      ],
      'd1',
      new Date('2026-06-01T00:00:00.000Z'),
    )!
    expect(a.ammNumber).toBe('AMM-CORRIGÉE')
    expect(a.validUntil).toBe('2031-02-01T12:00:00.000Z')
  })

  it('fin de mois : l’overflow du −6 mois reste déterministe (31 août → « 31 février » → 3 mars)', () => {
    const a = deriveRenewalAlert(
      [ev({ payload: { amm_number: 'A', valid_until: '2031-08-31T12:00:00.000Z' } })],
      'd1',
      new Date('2026-06-01T00:00:00.000Z'),
    )!
    expect(a.alertFrom).toBe('2031-03-03T12:00:00.000Z')
  })
})
