import { assertEquals } from 'jsr:@std/assert@1'

import {
  MONITOR_ADMIN_LEAD_DAYS,
  MONITOR_COA_LEAD_DAYS,
  MONITOR_DEFAULT_LEAD_DAYS,
  monitorLeadDays,
  planManufacturerReminders,
  type MonitorDocRow,
  type MonitorPartyRow,
  type MonitorProductRow,
  type MonitorSentRow,
} from './monitoring-reminders-core.ts'

// Horloge FIGÉE à MINUIT UTC → dateIn(n) donne exactement daysLeft = n (pas de demi-jour).
const NOW = new Date('2026-07-08T00:00:00.000Z')
const dateIn = (days: number): string =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10)

const doc = (over: Partial<MonitorDocRow> = {}): MonitorDocRow => ({
  id: 'doc1',
  org_id: 'org1',
  product_id: 'prod1',
  doc_type: 'gmp',
  expiry_date: dateIn(100),
  ...over,
})
const product = (over: Partial<MonitorProductRow> = {}): MonitorProductRow => ({
  id: 'prod1',
  nom_commercial: 'Amoxicilline 500 mg',
  fabricant_id: 'fab1',
  ...over,
})
const party = (over: Partial<MonitorPartyRow> = {}): MonitorPartyRow => ({
  id: 'fab1',
  nom: 'Synthia Labs',
  contact_email: 'qa@synthia.example',
  ...over,
})

const plan = (input: {
  documents?: MonitorDocRow[]
  products?: MonitorProductRow[]
  parties?: MonitorPartyRow[]
  leadCfg?: Record<string, number>
  alreadySent?: MonitorSentRow[]
}) =>
  planManufacturerReminders({
    documents: input.documents ?? [doc()],
    products: input.products ?? [product()],
    parties: input.parties ?? [party()],
    leadCfg: input.leadCfg,
    alreadySent: input.alreadySent ?? [],
    now: NOW,
  })

Deno.test('monitorLeadDays : défauts par type (COA 547, admin 180) + override org valide', () => {
  assertEquals(monitorLeadDays('gmp'), MONITOR_ADMIN_LEAD_DAYS)
  assertEquals(monitorLeadDays('coa'), MONITOR_COA_LEAD_DAYS)
  assertEquals(monitorLeadDays('amm'), MONITOR_ADMIN_LEAD_DAYS)
  assertEquals(monitorLeadDays('gmp', { gmp: 30 }), 30) // override org
  // Type hors vocabulaire admin → 90 j (miroir EXACT de renewalLeadDays « else »).
  assertEquals(monitorLeadDays('xyz'), MONITOR_DEFAULT_LEAD_DAYS)
  assertEquals(monitorLeadDays('contract'), MONITOR_ADMIN_LEAD_DAYS) // code admin connu → 180
  // Overrides invalides (0, négatif, NaN, non-nombre) → repli défaut par type.
  assertEquals(monitorLeadDays('gmp', { gmp: 0 }), MONITOR_ADMIN_LEAD_DAYS)
  assertEquals(monitorLeadDays('gmp', { gmp: -5 }), MONITOR_ADMIN_LEAD_DAYS)
  assertEquals(monitorLeadDays('coa', { coa: Number.NaN }), MONITOR_COA_LEAD_DAYS)
})

Deno.test('pièce GMP dans la fenêtre (100 j ≤ 180) → relance planifiée au contact fabricant', () => {
  const p = plan({})
  assertEquals(p.length, 1)
  assertEquals(p[0]?.documentId, 'doc1')
  assertEquals(p[0]?.contactEmail, 'qa@synthia.example')
  assertEquals(p[0]?.productName, 'Amoxicilline 500 mg')
  assertEquals(p[0]?.manufacturerName, 'Synthia Labs')
  assertEquals(p[0]?.daysLeft, 100)
})

Deno.test('pièce hors fenêtre (300 j > 180) → aucune relance', () => {
  assertEquals(plan({ documents: [doc({ expiry_date: dateIn(300) })] }).length, 0)
})

Deno.test('COA : fenêtre plus longue (400 j ≤ 547) → planifiée', () => {
  const p = plan({ documents: [doc({ doc_type: 'coa', expiry_date: dateIn(400) })] })
  assertEquals(p.length, 1)
  assertEquals(p[0]?.docType, 'coa')
})

Deno.test('périmée RÉCEMMENT (≤ grace 30) → relance ; périmée DEPUIS LONGTEMPS (> 30) → ignorée', () => {
  // -10 j (dans la grace) → nudge tardif légitime.
  const recent = plan({ documents: [doc({ expiry_date: dateIn(-10) })] })
  assertEquals(recent.length, 1)
  assertEquals(recent[0]?.daysLeft, -10)
  // -40 j (au-delà de la grace) → chronique, déjà en rouge dans l'app → aucun e-mail.
  assertEquals(plan({ documents: [doc({ expiry_date: dateIn(-40) })] }).length, 0)
})

Deno.test('idempotence : couple (pièce, échéance) déjà relancé → ignoré', () => {
  const d = doc()
  const p = plan({
    documents: [d],
    alreadySent: [{ document_id: 'doc1', expiry_date: d.expiry_date as string }],
  })
  assertEquals(p.length, 0)
  // Une AUTRE échéance (renouvellement) du même document → de nouveau éligible.
  const p2 = plan({
    documents: [doc({ expiry_date: dateIn(50) })],
    alreadySent: [{ document_id: 'doc1', expiry_date: dateIn(100) }],
  })
  assertEquals(p2.length, 1)
})

Deno.test('override org RÉTRÉCIT la fenêtre : gmp 100 j avec préavis 30 → hors fenêtre', () => {
  assertEquals(plan({ leadCfg: { gmp: 30 } }).length, 0)
  // Préavis 120 → 100 ≤ 120 → planifiée.
  assertEquals(plan({ leadCfg: { gmp: 120 } }).length, 1)
})

Deno.test('produit sans fabricant lié → personne à relancer', () => {
  assertEquals(plan({ products: [product({ fabricant_id: null })] }).length, 0)
})

Deno.test('fabricant SANS e-mail de contact → aucun envoi possible', () => {
  assertEquals(plan({ parties: [party({ contact_email: null })] }).length, 0)
  assertEquals(plan({ parties: [party({ contact_email: '   ' })] }).length, 0) // vide après trim
})

Deno.test('pièce sans échéance ou date illisible → ignorée', () => {
  assertEquals(plan({ documents: [doc({ expiry_date: null })] }).length, 0)
  assertEquals(plan({ documents: [doc({ expiry_date: 'n/a' })] }).length, 0)
})

Deno.test('produit introuvable (product_id orphelin) → ignoré, pas de crash', () => {
  assertEquals(plan({ documents: [doc({ product_id: 'ghost' })] }).length, 0)
  assertEquals(plan({ documents: [doc({ product_id: null })] }).length, 0)
})
