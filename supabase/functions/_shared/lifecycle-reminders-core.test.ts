import { assertEquals } from 'jsr:@std/assert@1'

import {
  DEFAULT_THRESHOLDS,
  MAX_CONSECUTIVE_SYSTEM_REMINDERS,
  planReminder,
  thresholdsFor,
  type ReminderCorrRow,
  type ReminderDecisionMsgRow,
  type ReminderDossierRow,
  type ReminderEventRow,
} from './lifecycle-reminders-core.ts'

// Horloge FIGÉE (fonction pure) — les scénarios miroir de lifecycle-waiting.test.ts (web).
const NOW = new Date('2026-07-04T12:00:00.000Z')
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const dossier = (over: Partial<ReminderDossierRow> = {}): ReminderDossierRow => ({
  id: 'd1',
  org_id: 'org1',
  product_name: 'Amoxicilline 500 mg',
  country: 'BJ',
  created_at: daysAgo(60),
  ...over,
})

const corr = (over: Partial<ReminderCorrRow> = {}): ReminderCorrRow => ({
  id: 'c1',
  dossier_id: 'd1',
  status: 'in_review',
  created_at: daysAgo(20),
  updated_at: daysAgo(20),
  decided_at: null,
  revoked_at: null,
  deleted_at: null,
  sender_email: 'ra@labo.example',
  ...over,
})

const ev = (over: Partial<ReminderEventRow> = {}): ReminderEventRow => ({
  dossier_id: 'd1',
  type: 'deposited',
  actor_id: 'u1',
  occurred_at: daysAgo(20),
  ...over,
})

const plan = (input: {
  dossier?: ReminderDossierRow
  correspondences?: ReminderCorrRow[]
  events?: ReminderEventRow[]
  decisionMessages?: ReminderDecisionMsgRow[]
}) =>
  planReminder({
    dossier: input.dossier ?? dossier(),
    correspondences: input.correspondences ?? [],
    events: input.events ?? [],
    decisionMessages: input.decisionMessages ?? [],
    now: NOW,
  })

Deno.test('en revue depuis 20 j (seuil agent 14) → relance stage revue, e-mail expéditeur', () => {
  const p = plan({ correspondences: [corr()] })
  assertEquals(p?.status, 'in_review')
  assertEquals(p?.stage, 'revue')
  assertEquals(p?.waitingOn, 'agent')
  assertEquals(p?.waitingDays, 20)
  assertEquals(p?.thresholdDays, DEFAULT_THRESHOLDS.agentDays)
  assertEquals(p?.senderEmail, 'ra@labo.example')
  assertEquals(p?.orgId, 'org1')
})

Deno.test('sous le seuil (13 j < 14) → pas de relance', () => {
  const p = plan({ correspondences: [corr({ created_at: daysAgo(13), updated_at: daysAgo(13) })] })
  assertEquals(p, null)
})

Deno.test('accepté (attente Dépôt) → stage depot, compteur = décision', () => {
  const p = plan({
    correspondences: [corr({ status: 'accepted', decided_at: daysAgo(15) })],
  })
  assertEquals(p?.status, 'accepted')
  assertEquals(p?.stage, 'depot')
  assertEquals(p?.waitingDays, 15)
})

Deno.test('deposited → stage soumission (attente dépôt agence)', () => {
  const p = plan({
    correspondences: [corr({ status: 'accepted', decided_at: daysAgo(30) })],
    events: [ev({ occurred_at: daysAgo(16) })],
  })
  assertEquals(p?.status, 'submitting')
  assertEquals(p?.stage, 'soumission')
  assertEquals(p?.waitingDays, 16)
})

Deno.test('monotonie : complément requis MAIS deposited existe → soumission (pas de skip)', () => {
  const p = plan({
    correspondences: [corr({ status: 'suspended', decided_at: daysAgo(30) })],
    events: [ev({ occurred_at: daysAgo(16) })],
  })
  assertEquals(p?.status, 'submitting')
})

Deno.test('soumis à l’agence : seuil AGENCE (30 j) — 20 j → rien, 31 j → relance notifications', () => {
  const base = {
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(45), updated_at: daysAgo(45), decided_at: daysAgo(45) }),
    ],
  }
  const at20 = plan({ ...base, events: [ev({ type: 'submitted', occurred_at: daysAgo(20) })] })
  assertEquals(at20, null)
  const at31 = plan({ ...base, events: [ev({ type: 'submitted', occurred_at: daysAgo(31) })] })
  assertEquals(at31?.status, 'in_notification')
  assertEquals(at31?.stage, 'notifications')
  assertEquals(at31?.waitingOn, 'agency')
  assertEquals(at31?.thresholdDays, DEFAULT_THRESHOLDS.agencyDays)
})

Deno.test('réponse au complément transmise → l’attente repart côté agence', () => {
  const p = plan({
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(90), updated_at: daysAgo(90), decided_at: daysAgo(90) }),
    ],
    events: [
      ev({ type: 'submitted', occurred_at: daysAgo(80) }),
      ev({ type: 'authority_query', occurred_at: daysAgo(60) }),
      ev({ type: 'authority_response', occurred_at: daysAgo(35) }),
    ],
  })
  assertEquals(p?.status, 'in_notification')
  assertEquals(p?.waitingDays, 35)
})

Deno.test('terminaux et étapes côté labo → jamais de relance', () => {
  // AMM rendue.
  assertEquals(
    plan({
      correspondences: [corr({ status: 'accepted', decided_at: daysAgo(50) })],
      events: [ev({ type: 'amm_granted', occurred_at: daysAgo(40) })],
    }),
    null,
  )
  // Complément requis (balle côté labo).
  assertEquals(plan({ correspondences: [corr({ status: 'suspended', decided_at: daysAgo(20) })] }), null)
  // Rejeté (terminal).
  assertEquals(plan({ correspondences: [corr({ status: 'rejected', decided_at: daysAgo(20) })] }), null)
  // Montage (aucune correspondance).
  assertEquals(plan({}), null)
})

Deno.test('correspondance in_review RÉVOQUÉE = inactive (ADR-0003) → montage, pas de relance', () => {
  const p = plan({ correspondences: [corr({ revoked_at: daysAgo(18) })] })
  assertEquals(p, null)
})

Deno.test('une relance (système ou manuelle) REPART le compteur — auto-idempotence', () => {
  // Relance système il y a 1 j : 1 j < 14 → rien (le cron peut rejouer sans double tir).
  const p = plan({
    correspondences: [corr({ created_at: daysAgo(40), updated_at: daysAgo(40) })],
    events: [ev({ type: 'reminder_sent', actor_id: 'system', occurred_at: daysAgo(1) })],
  })
  assertEquals(p, null)
  // Relance MANUELLE il y a 15 j : le compteur repart d'elle → 15 j ≥ 14 → nouvelle relance.
  const p2 = plan({
    correspondences: [corr({ created_at: daysAgo(40), updated_at: daysAgo(40) })],
    events: [ev({ type: 'reminder_sent', actor_id: 'u1', occurred_at: daysAgo(15) })],
  })
  assertEquals(p2?.waitingDays, 15)
})

Deno.test(`cap : ${MAX_CONSECUTIVE_SYSTEM_REMINDERS} relances système consécutives → pause ; activité humaine ré-arme`, () => {
  const systemReminders = [
    ev({ type: 'reminder_sent', actor_id: 'system', occurred_at: daysAgo(50) }),
    ev({ type: 'reminder_sent', actor_id: 'system', occurred_at: daysAgo(35) }),
    ev({ type: 'reminder_sent', actor_id: 'system', occurred_at: daysAgo(20) }),
  ]
  // 3 relances système depuis la dernière activité humaine (l'envoi en revue) → pause.
  const paused = plan({
    correspondences: [corr({ created_at: daysAgo(70), updated_at: daysAgo(70) })],
    events: systemReminders,
  })
  assertEquals(paused, null)
  // Une relance MANUELLE (humaine) postérieure ré-arme le mécanisme.
  const rearmed = plan({
    correspondences: [corr({ created_at: daysAgo(70), updated_at: daysAgo(70) })],
    events: [...systemReminders, ev({ type: 'reminder_sent', actor_id: 'u1', occurred_at: daysAgo(15) })],
  })
  assertEquals(rearmed?.waitingDays, 15)
})

Deno.test('événement futur-daté (saisie tolérante) → compteur clampé à 0, pas de relance', () => {
  const p = plan({
    correspondences: [corr({ status: 'accepted', decided_at: daysAgo(30) })],
    events: [ev({ occurred_at: daysAgo(-2) })], // « déposé » daté après-demain
  })
  assertEquals(p, null)
})

Deno.test('boucle M4 : corr renvoyée en revue — l’horloge tient compte des messages de décision', () => {
  // Renvoyée en revue (status in_review, decided_at null) mais décision « complément » tracée
  // il y a 15 j dans les messages immuables → attente = 15 j, pas 40 (création de la corr).
  const p = plan({
    correspondences: [corr({ created_at: daysAgo(40), updated_at: daysAgo(40) })],
    decisionMessages: [{ correspondence_id: 'c1', created_at: daysAgo(15) }],
  })
  assertEquals(p?.status, 'in_review')
  assertEquals(p?.waitingDays, 15)
})

Deno.test('repli parité web : corr décidée SANS message de décision → decided_at fait foi', () => {
  const p = plan({
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(40), updated_at: daysAgo(40), decided_at: daysAgo(16) }),
    ],
  })
  assertEquals(p?.waitingDays, 16)
})

Deno.test('e-mail = expéditeur de la DERNIÈRE correspondance active', () => {
  const p = plan({
    correspondences: [
      corr({ id: 'c1', created_at: daysAgo(50), updated_at: daysAgo(50), sender_email: 'old@labo.example' }),
      corr({ id: 'c2', created_at: daysAgo(20), updated_at: daysAgo(20), sender_email: 'new@labo.example' }),
    ],
  })
  assertEquals(p?.senderEmail, 'new@labo.example')
})

Deno.test('horodatages illisibles ignorés ; aucun temps datable → pas de relance aveugle', () => {
  const p = plan({
    dossier: dossier({ created_at: 'n/a' }),
    correspondences: [corr({ created_at: 'garbage', updated_at: 'garbage' })],
  })
  assertEquals(p, null)
})

Deno.test('thresholdsFor : défauts + override partiel par pays (référentiel gelé)', () => {
  assertEquals(thresholdsFor('BJ'), DEFAULT_THRESHOLDS)
  assertEquals(thresholdsFor('??'), DEFAULT_THRESHOLDS)
  assertEquals(thresholdsFor('TG', { TG: { agentDays: 7 } }), {
    agentDays: 7,
    agencyDays: DEFAULT_THRESHOLDS.agencyDays,
  })
})

Deno.test('persona « notification directe » : authority_query SANS submitted → in_notification (parité monotonie web)', () => {
  // Cas CI (via: 'direct') : l'agence notifie sans que `submitted` ait été journalisé — la
  // monotonie web (own.soumission = submitted || authority) place l'étape à Notifications ;
  // le cron doit relancer côté AGENCE avec le même statut, jamais désynchroniser du badge.
  const p = plan({
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(60), updated_at: daysAgo(60), decided_at: daysAgo(60) }),
    ],
    events: [ev({ type: 'authority_query', occurred_at: daysAgo(31) })],
  })
  assertEquals(p?.status, 'in_notification')
  assertEquals(p?.stage, 'notifications')
  assertEquals(p?.waitingOn, 'agency')
  assertEquals(p?.waitingDays, 31)
})

Deno.test('les événements d’un AUTRE dossier sont ignorés', () => {
  const p = plan({
    correspondences: [corr()],
    events: [ev({ dossier_id: 'other', type: 'amm_granted', occurred_at: daysAgo(1) })],
  })
  // L'AMM de l'autre dossier ne « termine » pas d1 : toujours en revue à 20 j → relance.
  assertEquals(p?.status, 'in_review')
  assertEquals(p?.waitingDays, 20)
})
