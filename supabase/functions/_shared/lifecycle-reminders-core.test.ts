import { assertEquals } from 'jsr:@std/assert@1'

import {
  asMsgLang,
  DEFAULT_ORG_CFG,
  DEFAULT_THRESHOLDS,
  MAX_CONSECUTIVE_SYSTEM_REMINDERS,
  officialLang,
  orgReminderCfg,
  planReminder,
  recipientAction,
  senderDisplayName,
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
  recipient_email: 'agent@agence.example',
  recipient_lang: null,
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

Deno.test('soumis à l’agence : seuil AGENCE (60 j) — 45 j → rien, 61 j → relance notifications', () => {
  const base = {
    dossier: dossier({ created_at: daysAgo(130) }),
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(75), updated_at: daysAgo(75), decided_at: daysAgo(75) }),
    ],
  }
  const at45 = plan({ ...base, events: [ev({ type: 'submitted', occurred_at: daysAgo(45) })] })
  assertEquals(at45, null)
  const at61 = plan({ ...base, events: [ev({ type: 'submitted', occurred_at: daysAgo(61) })] })
  assertEquals(at61?.status, 'in_notification')
  assertEquals(at61?.stage, 'notifications')
  assertEquals(at61?.waitingOn, 'agency')
  assertEquals(at61?.thresholdDays, DEFAULT_THRESHOLDS.agencyDays)
})

Deno.test('réponse au complément transmise → l’attente repart côté agence', () => {
  const p = plan({
    dossier: dossier({ created_at: daysAgo(150) }),
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(120), updated_at: daysAgo(120), decided_at: daysAgo(120) }),
    ],
    events: [
      ev({ type: 'submitted', occurred_at: daysAgo(110) }),
      ev({ type: 'authority_query', occurred_at: daysAgo(90) }),
      ev({ type: 'authority_response', occurred_at: daysAgo(65) }),
    ],
  })
  assertEquals(p?.status, 'in_notification')
  assertEquals(p?.waitingDays, 65)
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
      corr({
        id: 'c2',
        created_at: daysAgo(20),
        updated_at: daysAgo(20),
        sender_email: 'new@labo.example',
        recipient_email: 'newagent@agence.example',
      }),
    ],
  })
  assertEquals(p?.senderEmail, 'new@labo.example')
  assertEquals(p?.recipientEmail, 'newagent@agence.example')
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

Deno.test('recipientLang (Slice 1b) : langue stockée reprise dans le plan ; défaut/invalide → null', () => {
  // Pays FR (BJ) mais langue stockée EN → le plan porte 'en' (le cron n'appliquera pas le défaut pays).
  assertEquals(plan({ correspondences: [corr({ recipient_lang: 'en' })] })?.recipientLang, 'en')
  // Aucune langue stockée → null : le cron retombe sur officialLang(pays) = défaut Slice 1a.
  assertEquals(plan({ correspondences: [corr({ recipient_lang: null })] })?.recipientLang, null)
  // Valeur invalide en base (appelant direct de l'API) → null (repli pays), jamais propagée telle quelle.
  assertEquals(plan({ correspondences: [corr({ recipient_lang: 'pt' })] })?.recipientLang, null)
})

Deno.test('recipientLang : la langue de la DERNIÈRE correspondance active fait foi', () => {
  const p = plan({
    correspondences: [
      corr({ id: 'c1', created_at: daysAgo(50), updated_at: daysAgo(50), recipient_lang: 'fr' }),
      corr({ id: 'c2', created_at: daysAgo(20), updated_at: daysAgo(20), recipient_lang: 'en' }),
    ],
  })
  assertEquals(p?.recipientLang, 'en')
})

Deno.test('asMsgLang : valide fr/en, sinon null (repli langue pays)', () => {
  assertEquals(asMsgLang('fr'), 'fr')
  assertEquals(asMsgLang('en'), 'en')
  assertEquals(asMsgLang('pt'), null)
  assertEquals(asMsgLang(''), null)
  assertEquals(asMsgLang(null), null)
  assertEquals(asMsgLang(undefined), null)
})

Deno.test('officialLang : langue par défaut du destinataire selon le pays (repli FR)', () => {
  assertEquals(officialLang('BJ'), 'fr')
  assertEquals(officialLang('NG'), 'en')
  assertEquals(officialLang('GH'), 'en')
  assertEquals(officialLang('GW'), 'fr') // portugais → repli FR (app FR/EN)
  assertEquals(officialLang('??'), 'fr') // pays inconnu → FR
})

Deno.test('recipientAction : phrase « action attendue » par étape et par langue', () => {
  assertEquals(recipientAction('revue', 'fr'), 'nous transmettre votre décision')
  assertEquals(recipientAction('soumission', 'fr'), 'confirmer le dépôt auprès de l’agence')
  assertEquals(recipientAction('notifications', 'en'), 'update us on the review status')
})

Deno.test('senderDisplayName : quoted + assaini (anti-injection d’en-tête From, revue B1)', () => {
  assertEquals(senderDisplayName('Cellchem'), '"Cellchem (via Pharnos)"')
  assertEquals(senderDisplayName('Labo, Inc.'), '"Labo, Inc. (via Pharnos)"') // virgule littérale (quotée)
  assertEquals(senderDisplayName('Bad"Name'), '"Bad Name (via Pharnos)"') // guillemet → espace
  assertEquals(senderDisplayName('x\r\ny'), '"x y (via Pharnos)"') // CR/LF → espace
  assertEquals(senderDisplayName('   '), '"Pharnos (via Pharnos)"') // vide → repli
})

Deno.test('persona « notification directe » : authority_query SANS submitted → in_notification (parité monotonie web)', () => {
  // Cas CI (via: 'direct') : l'agence notifie sans que `submitted` ait été journalisé — la
  // monotonie web (own.soumission = submitted || authority) place l'étape à Notifications ;
  // le cron doit relancer côté AGENCE avec le même statut, jamais désynchroniser du badge.
  const p = plan({
    dossier: dossier({ created_at: daysAgo(150) }),
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(120), updated_at: daysAgo(120), decided_at: daysAgo(120) }),
    ],
    events: [ev({ type: 'authority_query', occurred_at: daysAgo(65) })],
  })
  assertEquals(p?.status, 'in_notification')
  assertEquals(p?.stage, 'notifications')
  assertEquals(p?.waitingOn, 'agency')
  assertEquals(p?.waitingDays, 65)
})

Deno.test('override de seuils (config org 0055) : les seuils personnalisés priment sur les défauts', () => {
  const base = {
    dossier: dossier(),
    correspondences: [
      corr({ status: 'accepted', created_at: daysAgo(80), updated_at: daysAgo(80), decided_at: daysAgo(80) }),
    ],
    events: [ev({ type: 'submitted', occurred_at: daysAgo(40) })],
    decisionMessages: [] as ReminderDecisionMsgRow[],
    now: NOW,
  }
  // 40 j d'attente agence < défaut 60 → aucune relance.
  assertEquals(planReminder(base), null)
  // Org ayant abaissé le seuil agence à 30 j → 40 ≥ 30 → relance, seuil journalisé = 30.
  const p = planReminder({ ...base, thresholds: { agentDays: 14, agencyDays: 30 } })
  assertEquals(p?.status, 'in_notification')
  assertEquals(p?.thresholdDays, 30)
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

Deno.test('orgReminderCfg : absence de ligne (org non configurée) → défauts 14/60, auto + e-mail ON', () => {
  assertEquals(orgReminderCfg(undefined), DEFAULT_ORG_CFG)
  assertEquals(orgReminderCfg(null), DEFAULT_ORG_CFG)
  assertEquals(orgReminderCfg(undefined).thresholds, DEFAULT_THRESHOLDS)
})

Deno.test('orgReminderCfg : seuils/flags personnalisés d’une org (Roadmap + Monitoring)', () => {
  const cfg = orgReminderCfg({
    org_id: 'o1',
    roadmap_auto_enabled: false,
    roadmap_agent_days: 7,
    roadmap_agency_days: 90,
    roadmap_email_enabled: false,
    monitoring_auto_enabled: false,
    monitoring_lead_days: { gmp: 90 },
  })
  assertEquals(cfg.roadmapAutoEnabled, false) // le cron sautera cette org (Roadmap)
  assertEquals(cfg.emailEnabled, false) // journalisation in-app conservée, e-mail coupé
  assertEquals(cfg.thresholds, { agentDays: 7, agencyDays: 90 })
  assertEquals(cfg.monitoringEnabled, false) // relance fabricant coupée (domaine B)
  assertEquals(cfg.monitoringLeadDays, { gmp: 90 })
})

Deno.test('orgReminderCfg : colonnes NULL retombent sur les défauts de la table', () => {
  const cfg = orgReminderCfg({
    org_id: 'o1',
    roadmap_auto_enabled: null,
    roadmap_agent_days: null,
    roadmap_agency_days: null,
    roadmap_email_enabled: null,
    monitoring_auto_enabled: null,
    monitoring_lead_days: null,
  })
  assertEquals(cfg.roadmapAutoEnabled, true)
  assertEquals(cfg.emailEnabled, true)
  assertEquals(cfg.thresholds, DEFAULT_THRESHOLDS)
  assertEquals(cfg.monitoringEnabled, true) // NULL → activé (défaut table)
  assertEquals(cfg.monitoringLeadDays, {}) // NULL → vide → défauts par type côté core monitoring
})
