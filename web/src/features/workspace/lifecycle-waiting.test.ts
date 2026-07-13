import { describe, expect, it } from 'vitest'

import type { CorrespondenceRecord, LifecycleEventRecord } from '@/lib/db'
import {
  deriveLifecycle,
  journalDetail,
  journalLabel,
  type DeriveLifecycleInput,
  type LifecycleState,
} from './lifecycle-constants'
import { deriveStageWaiting } from './lifecycle-waiting'

// ── Fabriques (calquées sur lifecycle-constants.test.ts) ─────────────────────────────────────────
const corr = (over: Partial<CorrespondenceRecord>): CorrespondenceRecord => ({
  id: 'c1',
  orgId: 'org-1',
  dossierId: 'd1',
  productName: 'KV-Metro 250 mg',
  country: 'BJ',
  activity: 'new_ma',
  senderEmail: 'labo@ex.com',
  recipientEmail: 'agent@ex.com',
  note: null,
  pdfPath: 'org/shares/c1/module1.pdf',
  pdfSize: 1000,
  tokenHash: 'h',
  passwordHash: null,
  status: 'in_review',
  decidedAt: null,
  revokedAt: null,
  expiresAt: null,
  autoRevokeOnDecision: false,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const ev = (over: Partial<LifecycleEventRecord>): LifecycleEventRecord => ({
  id: 'e1',
  orgId: 'org-1',
  dossierId: 'd1',
  type: 'deposited',
  actorId: 'u1',
  actorEmail: 'labo@ex.com',
  occurredAt: '2026-06-10T00:00:00.000Z',
  payload: {},
  docRefs: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  ...over,
})

const derive = (over: Partial<DeriveLifecycleInput> = {}): LifecycleState =>
  deriveLifecycle({
    dossierId: 'd1',
    dossierCreatedAt: '2026-06-01T00:00:00.000Z',
    events: [],
    correspondences: [],
    ...over,
  })

const NOW = new Date('2026-06-15T00:00:00.000Z')

describe('deriveStageWaiting — « en attente depuis N jours » (M5)', () => {
  it('montage (travail propre au labo) → null, pas de relance', () => {
    expect(deriveStageWaiting(derive(), NOW)).toBeNull()
  })

  it('en revue → attend l’AGENT LOCAL depuis l’envoi en revue', () => {
    const w = deriveStageWaiting(derive({ correspondences: [corr({})] }), NOW)
    expect(w).not.toBeNull()
    expect(w!.since).toBe('2026-06-02T00:00:00.000Z')
    expect(w!.days).toBe(13)
    expect(w!.lastIsReminder).toBe(false)
    // Forme FLÉCHIE pour la phrase du badge (« En attente de … ») — revue M5.
    expect(w!.actor.fr).toBe('l’agent local')
  })

  it('complément requis (le labo doit répondre) → null', () => {
    const st = derive({
      correspondences: [corr({ status: 'suspended', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    expect(st.status).toBe('suspended')
    expect(deriveStageWaiting(st, NOW)).toBeNull()
  })

  it('rejeté → null (terminal, rien à relancer)', () => {
    const st = derive({
      correspondences: [corr({ status: 'rejected', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    expect(deriveStageWaiting(st, NOW)).toBeNull()
  })

  it('accepté (Finalisation attendue) → compteur depuis la DERNIÈRE activité (la décision)', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    const w = deriveStageWaiting(st, NOW)
    expect(w).not.toBeNull()
    expect(w!.since).toBe('2026-06-05T00:00:00.000Z')
    expect(w!.days).toBe(10)
  })

  it('soumis, en instruction → attend l’AGENCE ; un sous-événement (frais) repart le compteur', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [
        ev({ id: 'e1', type: 'deposited', occurredAt: '2026-06-06T00:00:00.000Z' }),
        ev({ id: 'e2', type: 'submitted', occurredAt: '2026-06-08T00:00:00.000Z' }),
        ev({ id: 'e3', type: 'fees_invoiced', occurredAt: '2026-06-12T00:00:00.000Z' }),
      ],
    })
    expect(st.status).toBe('in_notification')
    const w = deriveStageWaiting(st, NOW)
    expect(w!.since).toBe('2026-06-12T00:00:00.000Z')
    expect(w!.days).toBe(3)
    expect(w!.actor.fr).toBe('l’agence nationale')
  })

  it('relance journalisée → le compteur repart et lastIsReminder = true', () => {
    const st = derive({
      correspondences: [corr({})],
      events: [
        ev({
          id: 'r1',
          type: 'reminder_sent',
          occurredAt: '2026-06-14T00:00:00.000Z',
          payload: { stage: 'revue', waiting_days: 12 },
        }),
      ],
    })
    // La relance est un SOUS-événement : l'étape courante ne bouge pas (toujours Revue).
    expect(st.currentStageId).toBe('revue')
    const w = deriveStageWaiting(st, NOW)
    expect(w!.since).toBe('2026-06-14T00:00:00.000Z')
    expect(w!.days).toBe(1)
    expect(w!.lastIsReminder).toBe(true)
  })

  it('événement futur-daté (saisie tolérante) → 0 jour, jamais négatif', () => {
    const st = derive({
      correspondences: [corr({ createdAt: '2026-06-20T00:00:00.000Z' })],
    })
    expect(deriveStageWaiting(st, NOW)!.days).toBe(0)
  })

  it('AMM rendue → null (parcours clôturé)', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [
        ev({ id: 'e1', type: 'submitted', occurredAt: '2026-06-08T00:00:00.000Z' }),
        ev({
          id: 'e2',
          type: 'amm_granted',
          occurredAt: '2026-06-10T00:00:00.000Z',
          payload: { amm_number: 'AMM-1' },
        }),
      ],
    })
    expect(deriveStageWaiting(st, NOW)).toBeNull()
  })
})

describe('journal — rendu d’une relance (M5)', () => {
  it('libellé « Relance envoyée » + détail étape · jours', () => {
    expect(journalLabel({ key: 'reminder_sent' })).toBe('Relance envoyée')
    expect(
      journalDetail({ key: 'reminder_sent', payload: { stage: 'revue', waiting_days: 12 } }),
    ).toBe('Étape Revue · 12 j sans activité')
    expect(
      journalDetail(
        { key: 'reminder_sent', payload: { stage: 'soumission', waiting_days: 3 } },
        'en',
      ),
    ).toBe('Submission stage · 3 day(s) without activity')
    // Payload sans contexte (ou corrompu) → rien à afficher, jamais de plantage.
    expect(journalDetail({ key: 'reminder_sent', payload: {} })).toBeNull()
    expect(
      journalDetail({ key: 'reminder_sent', payload: { stage: 'xx', waiting_days: -2 } }),
    ).toBeNull()
  })

  it('relance AUTO (LOT 10) : le seuil déclencheur du payload est affiché', () => {
    expect(
      journalDetail({
        key: 'reminder_sent',
        payload: { stage: 'notifications', waiting_days: 31, threshold_days: 30 },
      }),
    ).toBe('Étape Notifications · 31 j sans activité · seuil 30 j')
    expect(
      journalDetail(
        { key: 'reminder_sent', payload: { stage: 'revue', waiting_days: 14, threshold_days: 14 } },
        'en',
      ),
    ).toBe('Review stage · 14 day(s) without activity · threshold 14 d')
    // Seuil corrompu → ignoré, le reste s'affiche.
    expect(
      journalDetail({
        key: 'reminder_sent',
        payload: { stage: 'revue', waiting_days: 14, threshold_days: 'x' },
      }),
    ).toBe('Étape Revue · 14 j sans activité')
  })

  it('acteur : relance manuelle = Labo ; relance système (LOT 10) = Système', () => {
    const st = derive({
      correspondences: [corr({})],
      events: [
        ev({ id: 'r1', type: 'reminder_sent', occurredAt: '2026-06-13T00:00:00.000Z' }),
        ev({
          id: 'r2',
          type: 'reminder_sent',
          actorId: 'system',
          occurredAt: '2026-06-14T00:00:00.000Z',
        }),
      ],
    })
    const reminders = st.journal.filter((j) => j.key === 'reminder_sent')
    expect(reminders.map((r) => r.actor.fr)).toEqual(['Labo', 'Système'])
  })
})
