import { describe, expect, it } from 'vitest'

import type { CorrespondenceRecord, LifecycleEventRecord } from '@/lib/db'
import {
  type DeriveLifecycleInput,
  type LifecycleStageId,
  type LifecycleState,
  deriveLifecycle,
  journalLabel,
  lifecycleStatusLabel,
  stageOutcomeLabel,
} from './lifecycle-constants'

// ── Fabriques ────────────────────────────────────────────────────────────────────────────────────
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

const stage = (st: LifecycleState, id: LifecycleStageId) => st.stages.find((s) => s.id === id)!

describe('deriveLifecycle — la spine (étape courante + avancement)', () => {
  it('dossier neuf (ni correspondance ni événement) → Montage, 0/7', () => {
    const st = derive()
    expect(st.currentStageId).toBe('montage')
    expect(st.status).toBe('montage')
    expect(st.progress).toEqual({ done: 0, total: 7 })
    expect(st.journal.map((j) => j.key)).toEqual(['montage'])
  })

  it('correspondance en revue → Revue (montage franchi), 1/7', () => {
    const st = derive({ correspondences: [corr({})] })
    expect(st.currentStageId).toBe('revue')
    expect(st.status).toBe('in_review')
    expect(st.progress.done).toBe(1)
    expect(stage(st, 'montage').status).toBe('done')
    expect(stage(st, 'revue').status).toBe('current')
    expect(st.journal.map((j) => j.key)).toEqual(['montage', 'review_sent'])
  })

  it('décision acceptée, sans dépôt → Dépôt courant, 3/7', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    expect(st.currentStageId).toBe('depot')
    expect(st.status).toBe('accepted')
    expect(st.progress.done).toBe(3)
    expect(stage(st, 'decision').status).toBe('done')
    expect(stage(st, 'decision').outcome).toBe('accepted')
  })

  it('accepté + déposé → Soumission courante, 4/7 (parité avec le mockup validé)', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [ev({ type: 'deposited' })],
    })
    expect(st.currentStageId).toBe('soumission')
    expect(st.status).toBe('submitting')
    expect(st.progress.done).toBe(4)
  })

  it('accepté + déposé + soumis → Notifications, 5/7', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [
        ev({ id: 'e1', type: 'deposited', occurredAt: '2026-06-08T00:00:00.000Z' }),
        ev({ id: 'e2', type: 'submitted', occurredAt: '2026-06-12T00:00:00.000Z' }),
      ],
    })
    expect(st.currentStageId).toBe('notifications')
    expect(st.status).toBe('in_notification')
    expect(st.progress.done).toBe(5)
  })

  it('décision suspendue → bloqué à Décision (2/7), badge En suspens', () => {
    const st = derive({
      correspondences: [corr({ status: 'suspended', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    expect(st.currentStageId).toBe('decision')
    expect(st.status).toBe('suspended')
    expect(st.progress.done).toBe(2)
    expect(stage(st, 'decision').status).toBe('current')
    expect(stage(st, 'decision').outcome).toBe('suspended')
  })

  it('décision rejetée → bloqué à Décision, badge Rejeté', () => {
    const st = derive({
      correspondences: [corr({ status: 'rejected', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    expect(st.currentStageId).toBe('decision')
    expect(st.status).toBe('rejected')
    expect(stage(st, 'decision').outcome).toBe('rejected')
  })

  it('AMM accordée (chaîne complète) → 7/7, toutes les étapes franchies', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [
        ev({ id: 'e1', type: 'deposited', occurredAt: '2026-06-08T00:00:00.000Z' }),
        ev({ id: 'e2', type: 'submitted', occurredAt: '2026-06-12T00:00:00.000Z' }),
        ev({ id: 'e3', type: 'amm_granted', occurredAt: '2026-09-01T00:00:00.000Z' }),
      ],
    })
    expect(st.status).toBe('amm_granted')
    expect(st.progress).toEqual({ done: 7, total: 7 })
    expect(st.stages.every((s) => s.status === 'done')).toBe(true)
    expect(stage(st, 'amm').outcome).toBe('granted')
  })

  it('AMM refusée → badge AMM refusée, issue refused', () => {
    const st = derive({
      events: [ev({ type: 'amm_refused', occurredAt: '2026-09-01T00:00:00.000Z' })],
    })
    expect(st.status).toBe('amm_refused')
    expect(stage(st, 'amm').outcome).toBe('refused')
  })
})

describe('deriveLifecycle — robustesse (personas + règles ADR-0003)', () => {
  it('persona Agence locale : dépôt sans correspondance → amont franchi par monotonie (Soumission, 4/7)', () => {
    const st = derive({ events: [ev({ type: 'deposited' })] })
    expect(st.currentStageId).toBe('soumission')
    expect(st.progress.done).toBe(4)
    // Pas de correspondance → le journal ne synthétise ni revue ni décision.
    expect(st.journal.map((j) => j.key)).toEqual(['montage', 'deposited'])
  })

  it('notification agence sans « submitted » explicite → implique la soumission (Notifications, 5/7)', () => {
    const st = derive({
      events: [ev({ type: 'authority_query', occurredAt: '2026-06-15T00:00:00.000Z' })],
    })
    expect(st.currentStageId).toBe('notifications')
    expect(st.status).toBe('in_notification')
    expect(st.progress.done).toBe(5)
  })

  it('la correspondance la plus récente l’emporte (renvoi après rejet) → retour en Revue', () => {
    const oldRejected = corr({
      id: 'c1',
      status: 'rejected',
      createdAt: '2026-06-02T00:00:00.000Z',
    })
    const renvoi = corr({ id: 'c2', status: 'in_review', createdAt: '2026-06-09T00:00:00.000Z' })
    const st = derive({ correspondences: [oldRejected, renvoi] })
    expect(st.currentStageId).toBe('revue')
    expect(st.status).toBe('in_review')
  })

  it('correspondance révoquée SANS décision → ignorée (retour Montage)', () => {
    const st = derive({ correspondences: [corr({ revokedAt: '2026-06-03T00:00:00.000Z' })] })
    expect(st.currentStageId).toBe('montage')
  })

  it('ignore les événements et correspondances d’autres dossiers', () => {
    const st = derive({
      events: [ev({ dossierId: 'autre', type: 'submitted' })],
      correspondences: [corr({ dossierId: 'autre', status: 'accepted' })],
    })
    expect(st.currentStageId).toBe('montage')
    expect(st.progress.done).toBe(0)
  })

  it('journal trié par occurrence réelle, toutes sources fusionnées', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [
        ev({ id: 'e2', type: 'submitted', occurredAt: '2026-06-12T00:00:00.000Z' }),
        ev({ id: 'e1', type: 'deposited', occurredAt: '2026-06-08T00:00:00.000Z' }),
      ],
    })
    expect(st.journal.map((j) => j.key)).toEqual([
      'montage',
      'review_sent',
      'decision',
      'deposited',
      'submitted',
    ])
    const dates = st.journal.map((j) => j.at)
    expect([...dates]).toEqual([...dates].sort())
  })
})

describe('journal — acteur « qui a fait quoi » (restauré du mockup)', () => {
  it('chaque entrée porte un acteur (Labo / Agent local → Agence / Agence nat.)', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [
        ev({ id: 'e1', type: 'deposited', occurredAt: '2026-06-08T00:00:00.000Z' }),
        ev({ id: 'e2', type: 'amm_granted', occurredAt: '2026-09-01T00:00:00.000Z' }),
      ],
    })
    const actorOf = (key: string) => st.journal.find((j) => j.key === key)?.actor.fr
    expect(actorOf('montage')).toBe('Labo')
    expect(actorOf('review_sent')).toBe('Labo → Agent local')
    expect(actorOf('decision')).toBe('Agent local')
    expect(actorOf('deposited')).toBe('Agent local → Agence')
    expect(actorOf('amm_granted')).toBe('Agence nat.')
  })

  it('un événement acteur=system (relance auto) → « Système » quel que soit le type', () => {
    const st = derive({
      events: [
        ev({ type: 'reminder_sent', actorId: 'system', occurredAt: '2026-06-20T00:00:00.000Z' }),
      ],
    })
    expect(st.journal.find((j) => j.key === 'reminder_sent')?.actor.fr).toBe('Système')
  })
})

describe('libellés', () => {
  it('journalLabel — décision selon l’issue + repli', () => {
    expect(journalLabel({ key: 'decision', outcome: 'accepted' })).toBe('Dossier accepté')
    expect(journalLabel({ key: 'decision', outcome: 'suspended' }, 'en')).toBe('Dossier suspended')
    expect(journalLabel({ key: 'deposited' })).toBe('Déposé à l’agence nationale')
    expect(journalLabel({ key: 'reminder_sent' }, 'en')).toBe('Automatic reminder')
  })

  it('lifecycleStatusLabel — couvre les statuts + repli', () => {
    expect(lifecycleStatusLabel('submitting')).toBe('En soumission')
    expect(lifecycleStatusLabel('amm_granted', 'en')).toBe('MA granted')
    expect(lifecycleStatusLabel('montage')).toBe('En montage')
  })

  it('stageOutcomeLabel — issues courtes (décision + AMM)', () => {
    expect(stageOutcomeLabel('accepted')).toBe('Accepté')
    expect(stageOutcomeLabel('suspended')).toBe('Suspendu')
    expect(stageOutcomeLabel('granted', 'en')).toBe('Granted')
    expect(stageOutcomeLabel('refused')).toBe('Refusée')
  })
})
