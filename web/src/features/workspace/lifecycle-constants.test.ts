import { describe, expect, it } from 'vitest'

import type {
  CorrespondenceMessageRecord,
  CorrespondenceRecord,
  LifecycleEventRecord,
} from '@/lib/db'
import {
  type DeriveLifecycleInput,
  type LifecycleStageId,
  type LifecycleState,
  deriveLifecycle,
  journalDetail,
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

  it('décision suspendue → bloqué à Décision (2/7), badge Complément requis', () => {
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
    expect(actorOf('deposited')).toBe('Agent local')
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
  it('journalLabel — décision selon l’issue + repli (réalignement M4 : Dépôt = réception agent)', () => {
    expect(journalLabel({ key: 'decision', outcome: 'accepted' })).toBe('Dossier accepté')
    expect(journalLabel({ key: 'decision', outcome: 'suspended' })).toBe('Complément requis')
    expect(journalLabel({ key: 'decision', outcome: 'suspended' }, 'en')).toBe(
      'Additional info required',
    )
    expect(journalLabel({ key: 'deposited' })).toBe('Réception confirmée par l’agent local')
    expect(journalLabel({ key: 'submitted' })).toBe('Déposé à l’agence nationale')
    // M5 : la relance peut être manuelle (Labo) ou auto (Système) — libellé neutre commun.
    expect(journalLabel({ key: 'reminder_sent' }, 'en')).toBe('Reminder sent')
  })

  it('lifecycleStatusLabel — couvre les statuts + repli', () => {
    expect(lifecycleStatusLabel('submitting')).toBe('En soumission')
    expect(lifecycleStatusLabel('amm_granted', 'en')).toBe('MA granted')
    expect(lifecycleStatusLabel('montage')).toBe('En montage')
    expect(lifecycleStatusLabel('suspended')).toBe('Complément requis')
  })

  it('stageOutcomeLabel — issues courtes (décision + AMM)', () => {
    expect(stageOutcomeLabel('accepted')).toBe('Accepté')
    expect(stageOutcomeLabel('suspended')).toBe('Complément')
    expect(stageOutcomeLabel('granted', 'en')).toBe('Granted')
    expect(stageOutcomeLabel('refused')).toBe('Refusée')
  })

  it('journalDetail — canal de la notification (via agent|direct, T4)', () => {
    expect(journalDetail({ key: 'authority_query', payload: { via: 'direct' } })).toBe(
      'En direct de l’agence',
    )
    expect(journalDetail({ key: 'authority_query', payload: { via: 'agent' } }, 'en')).toBe(
      'Via the local agent',
    )
    // Événements M2 antérieurs (sans via) : aucun détail — pas de rétro-interprétation.
    expect(journalDetail({ key: 'authority_query', payload: { note: 'x' } })).toBeNull()
  })
})

describe('buildJournal — boucle Décision multi-cycles (M4-T2)', () => {
  const msg = (over: Partial<CorrespondenceMessageRecord>): CorrespondenceMessageRecord => ({
    id: 'm1',
    orgId: 'org-1',
    correspondenceId: 'c1',
    author: 'recipient',
    authorLabel: 'agent@ex.com',
    kind: 'decision',
    decision: 'suspended',
    body: '',
    attachments: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    ...over,
  })

  it('après « Renvoyer en revue » : la décision précédente reste TRACÉE, l’étape revient à Revue', () => {
    // Correspondance rouverte (status muté à in_review) MAIS la décision vit dans le fil (immuable).
    const st = derive({
      correspondences: [corr({ status: 'in_review', decidedAt: null })],
      messages: [msg({ decision: 'suspended', createdAt: '2026-06-05T00:00:00.000Z' })],
    })
    expect(st.currentStageId).toBe('revue')
    expect(st.status).toBe('in_review')
    const decisions = st.journal.filter((j) => j.key === 'decision')
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.outcome).toBe('suspended')
  })

  it('deux décisions successives sur la même correspondance → deux entrées, zéro doublon synthétique', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-20T00:00:00.000Z' })],
      messages: [
        msg({ id: 'm1', decision: 'suspended', createdAt: '2026-06-05T00:00:00.000Z' }),
        msg({ id: 'm2', decision: 'accepted', createdAt: '2026-06-20T00:00:00.000Z' }),
      ],
    })
    const decisions = st.journal.filter((j) => j.key === 'decision')
    expect(decisions.map((d) => d.outcome)).toEqual(['suspended', 'accepted'])
    expect(decisions.map((d) => d.id)).toEqual(['m1', 'm2'])
    // L'étape Décision est bien franchie (statut courant = accepted).
    expect(st.currentStageId).toBe('depot')
  })

  it('repli sans messages (pas encore pullés) : une entrée synthétique par correspondance décidée', () => {
    const st = derive({
      correspondences: [corr({ status: 'suspended', decidedAt: '2026-06-05T00:00:00.000Z' })],
    })
    const decisions = st.journal.filter((j) => j.key === 'decision')
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.id).toBe('decision-c1')
    expect(decisions[0]?.outcome).toBe('suspended')
  })

  it('décision in-app (author sender) → acteur « Labo » ; tokenisée (recipient) → « Agent local »', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-20T00:00:00.000Z' })],
      messages: [
        msg({ id: 'm1', author: 'recipient', decision: 'suspended' }),
        msg({
          id: 'm2',
          author: 'sender',
          decision: 'accepted',
          createdAt: '2026-06-20T00:00:00.000Z',
        }),
      ],
    })
    const decisions = st.journal.filter((j) => j.key === 'decision')
    expect(decisions[0]?.actor.fr).toBe('Agent local')
    expect(decisions[1]?.actor.fr).toBe('Labo')
  })

  it('les messages d’une correspondance révoquée-sans-décision (inactive) sont ignorés', () => {
    const st = derive({
      correspondences: [corr({ status: 'in_review', revokedAt: '2026-06-03T00:00:00.000Z' })],
      messages: [msg({ decision: 'suspended' })],
    })
    expect(st.journal.filter((j) => j.key === 'decision')).toHaveLength(0)
    expect(st.journal.filter((j) => j.key === 'review_sent')).toHaveLength(0)
  })
})

describe('buildJournal — déterminisme (minors M2 soldés en M4-T1)', () => {
  it('tie-break à horodatage égal : amont (dossier < correspondance < événement) avant aval', () => {
    const AT = '2026-06-05T12:00:00.000Z'
    const st = derive({
      dossierCreatedAt: AT,
      correspondences: [corr({ createdAt: AT, status: 'accepted', decidedAt: AT })],
      events: [ev({ id: 'e1', type: 'deposited', occurredAt: AT })],
    })
    expect(st.journal.map((j) => j.key)).toEqual([
      'montage',
      'review_sent',
      'decision',
      'deposited',
    ])
  })

  it('à source ET horodatage égaux : l’envoi (review_sent) précède la décision', () => {
    const AT = '2026-06-05T12:00:00.000Z'
    // decidedAt null → l'entrée synthétique replie sur updatedAt = createdAt : même horodatage.
    const st = derive({
      correspondences: [
        corr({ status: 'suspended', decidedAt: null, createdAt: AT, updatedAt: AT }),
      ],
    })
    const keys = st.journal.map((j) => j.key)
    expect(keys.indexOf('review_sent')).toBeLessThan(keys.indexOf('decision'))
  })

  it('chaque entrée porte une identité stable (id) — clés React sans index', () => {
    const st = derive({
      correspondences: [corr({ status: 'accepted', decidedAt: '2026-06-05T00:00:00.000Z' })],
      events: [ev({ id: 'e1', type: 'deposited', occurredAt: '2026-06-08T00:00:00.000Z' })],
    })
    const ids = st.journal.map((j) => j.id)
    expect(ids).toContain('montage')
    expect(ids).toContain('e1')
    expect(new Set(ids).size).toBe(ids.length)
  })
})
