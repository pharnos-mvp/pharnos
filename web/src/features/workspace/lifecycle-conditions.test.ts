import { describe, expect, it } from 'vitest'

import type { LifecycleEventRecord } from '@/lib/db'
import {
  CONDITION_STEP_ACTIONS,
  deriveSubmissionConditions,
  type DeriveConditionsInput,
  type SubmissionCondition,
  type SubmissionConditionsState,
} from './lifecycle-conditions'
import { journalDetail } from './lifecycle-constants'

// ── Fabriques ────────────────────────────────────────────────────────────────────────────────────
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

const derive = (over: Partial<DeriveConditionsInput> = {}): SubmissionConditionsState =>
  deriveSubmissionConditions({
    dossierId: 'd1',
    events: [],
    sampleImportAuthRequired: true,
    ...over,
  })

const cond = (st: SubmissionConditionsState, id: SubmissionCondition['id']) =>
  st.conditions.find((c) => c.id === id)!

describe('deriveSubmissionConditions — les 3 conditions (M3)', () => {
  it('dossier vierge → 3 conditions à suivre, 0/3', () => {
    const st = derive()
    expect(st.total).toBe(3)
    expect(st.done).toBe(0)
    expect(st.conditions.map((c) => c.id)).toEqual(['ctd', 'samples', 'fees'])
    for (const c of st.conditions) {
      expect(c.status).toBe('todo')
      expect(c.reachedType).toBeNull()
    }
    expect(cond(st, 'samples').nextType).toBe('samples_requested')
    expect(cond(st, 'fees').nextType).toBe('fees_invoiced')
    expect(cond(st, 'ctd').nextType).toBe('deposited')
  })

  it('CTD : dérivée du jalon Finalisation (M2) — `deposited` la remplit', () => {
    const st = derive({ events: [ev({ type: 'deposited' })] })
    expect(cond(st, 'ctd').status).toBe('done')
    expect(cond(st, 'ctd').steps[0]?.at).toBe('2026-06-10T00:00:00.000Z')
    expect(st.done).toBe(1)
  })

  it('échantillons : chaîne complète 4 étapes quand l’autorisation d’import est exigée', () => {
    const st = derive({
      events: [
        ev({ id: 'a', type: 'samples_requested', occurredAt: '2026-06-11T00:00:00.000Z' }),
        ev({ id: 'b', type: 'samples_import_authorized', occurredAt: '2026-06-12T00:00:00.000Z' }),
      ],
    })
    const samples = cond(st, 'samples')
    expect(samples.steps.map((s) => s.type)).toEqual([
      'samples_requested',
      'samples_import_authorized',
      'samples_shipped',
      'samples_delivered',
    ])
    expect(samples.status).toBe('in_progress')
    expect(samples.reachedType).toBe('samples_import_authorized')
    expect(samples.nextType).toBe('samples_shipped')
  })

  it('échantillons : l’étape « Import autorisé » disparaît si le pays ne l’exige pas', () => {
    const st = derive({ sampleImportAuthRequired: false })
    expect(cond(st, 'samples').steps.map((s) => s.type)).toEqual([
      'samples_requested',
      'samples_shipped',
      'samples_delivered',
    ])
  })

  it('saisie TOLÉRANTE : un événement aval marque les amonts franchies (sans date pour les sauts)', () => {
    const st = derive({
      events: [ev({ type: 'samples_delivered', occurredAt: '2026-06-15T00:00:00.000Z' })],
    })
    const samples = cond(st, 'samples')
    expect(samples.status).toBe('done')
    expect(samples.nextType).toBeNull()
    expect(samples.steps.map((s) => s.done)).toEqual([true, true, true, true])
    // Les étapes sautées sont franchies mais SANS date (on ne fabrique pas d'horodatage).
    expect(samples.steps.map((s) => s.at)).toEqual([null, null, null, '2026-06-15T00:00:00.000Z'])
  })

  it('frais : montant du DERNIER `fees_invoiced` (une correction = un nouvel événement)', () => {
    const st = derive({
      events: [
        ev({
          id: 'a',
          type: 'fees_invoiced',
          occurredAt: '2026-06-11T00:00:00.000Z',
          payload: { amount: 500000, currency: 'FCFA' },
        }),
        ev({
          id: 'b',
          type: 'fees_invoiced',
          occurredAt: '2026-06-12T00:00:00.000Z',
          payload: { amount: 850000, currency: 'FCFA' },
        }),
      ],
    })
    const fees = cond(st, 'fees')
    expect(fees.amount).toEqual({ value: 850000, currency: 'FCFA' })
    expect(fees.status).toBe('in_progress')
    expect(fees.nextType).toBe('payment_submitted')
  })

  it('frais : payload sans montant (ou invalide) → pas de montant affiché', () => {
    const st = derive({
      events: [ev({ type: 'fees_invoiced', payload: { amount: Number.NaN } })],
    })
    expect(cond(st, 'fees').amount).toBeUndefined()
  })

  it('pièces : agrégées depuis TOUS les événements d’un même type', () => {
    const doc = (n: string) => ({ path: `org/d/${n}`, name: n, size: 10, mime: 'application/pdf' })
    const st = derive({
      events: [
        ev({ id: 'a', type: 'samples_shipped', docRefs: [doc('lta-1.pdf')] }),
        ev({
          id: 'b',
          type: 'samples_shipped',
          occurredAt: '2026-06-11T00:00:00.000Z',
          docRefs: [doc('lta-2.pdf')],
        }),
      ],
    })
    const shipped = cond(st, 'samples').steps.find((s) => s.type === 'samples_shipped')!
    expect(shipped.docs.map((d) => d.name)).toEqual(['lta-1.pdf', 'lta-2.pdf'])
  })

  it('isolation : les événements d’un autre dossier sont ignorés', () => {
    const st = derive({ events: [ev({ dossierId: 'AUTRE', type: 'payment_confirmed' })] })
    expect(cond(st, 'fees').status).toBe('todo')
  })

  it('chaque prochaine étape actionnable a une action de modale définie (sauf `deposited` = M2)', () => {
    // Toutes les sous-étapes des chaînes échantillons/frais doivent être couvertes.
    for (const type of [
      'samples_requested',
      'samples_import_authorized',
      'samples_shipped',
      'samples_delivered',
      'fees_invoiced',
      'payment_submitted',
      'payment_confirmed',
    ] as const) {
      expect(CONDITION_STEP_ACTIONS[type], type).toBeDefined()
    }
    expect(CONDITION_STEP_ACTIONS.deposited).toBeUndefined()
  })
})

describe('journalDetail — détail court dérivé du payload (M3)', () => {
  it('frais / preuve de paiement → montant localisé + devise', () => {
    expect(
      journalDetail({ key: 'fees_invoiced', payload: { amount: 850000, currency: 'FCFA' } }),
    ).toBe(`${(850000).toLocaleString('fr-FR')} FCFA`)
    expect(journalDetail({ key: 'payment_submitted', payload: { amount: 1000 } }, 'en')).toBe(
      '1,000',
    )
  })

  it('expédition → n° de LTA ; soumission → référence ; AMM → numéro', () => {
    expect(journalDetail({ key: 'samples_shipped', payload: { awb: 'DHL-4523' } })).toBe(
      'LTA DHL-4523',
    )
    expect(journalDetail({ key: 'submitted', payload: { reference: 'REC-12' } })).toBe('REC-12')
    expect(journalDetail({ key: 'amm_granted', payload: { amm_number: 'AMM-2026-01' } })).toBe(
      'AMM-2026-01',
    )
  })

  it('payload absent, vide ou non pertinent → null (rien à afficher)', () => {
    expect(journalDetail({ key: 'montage' })).toBeNull()
    expect(journalDetail({ key: 'fees_invoiced', payload: {} })).toBeNull()
    expect(journalDetail({ key: 'samples_shipped', payload: { awb: '  ' } })).toBeNull()
    expect(journalDetail({ key: 'authority_query', payload: { note: 'x' } })).toBeNull()
  })
})
