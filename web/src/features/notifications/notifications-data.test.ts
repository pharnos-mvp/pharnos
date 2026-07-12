import { describe, expect, it } from 'vitest'

import type { ActionItem } from '@/features/dashboard/dashboard-data'
import type { LifecycleEventRecord } from '@/lib/db'
import { buildEnvoye, formatRelative, sortRecuByRecency, unreadCount } from './notifications-data'

const ev = (over: Partial<LifecycleEventRecord>): LifecycleEventRecord => ({
  id: 'e1',
  orgId: 'o1',
  dossierId: 'd1',
  type: 'reminder_sent',
  actorId: 'u1',
  actorEmail: '',
  occurredAt: '2026-07-01T00:00:00.000Z',
  payload: {},
  docRefs: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
})

describe('buildEnvoye', () => {
  it('ne garde que les événements SORTANTS, plus récents d’abord, avec nom + lien résolus', () => {
    const events = [
      ev({ id: 'a', type: 'deposited', occurredAt: '2026-06-01T00:00:00.000Z' }),
      ev({
        id: 'b',
        type: 'reminder_sent',
        actorId: 'system',
        occurredAt: '2026-07-05T00:00:00.000Z',
      }),
      ev({ id: 'c', type: 'authority_query', occurredAt: '2026-07-10T00:00:00.000Z' }), // ENTRANT → exclu
      ev({ id: 'd', type: 'amm_granted', occurredAt: '2026-07-09T00:00:00.000Z' }), // terminal → exclu
    ]
    const names = new Map([['d1', 'Amoxi 500']])
    const out = buildEnvoye(events, names)
    expect(out.map((i) => i.id)).toEqual(['b', 'a']) // entrant/terminal exclus ; b (récent) avant a
    expect(out[0]?.kind).toBe('reminder_auto') // actor 'system' → auto
    expect(out[0]?.label).toBe('Amoxi 500')
    expect(out[0]?.href).toBe('/workspace/d1/roadmap')
  })

  it('distingue relance AUTO (system) vs MANUELLE (utilisateur)', () => {
    expect(buildEnvoye([ev({ actorId: 'system' })], new Map())[0]?.kind).toBe('reminder_auto')
    expect(buildEnvoye([ev({ actorId: 'u9' })], new Map())[0]?.kind).toBe('reminder_manual')
  })

  it('nom inconnu → repli « — » ; respecte la limite', () => {
    expect(buildEnvoye([ev({})], new Map())[0]?.label).toBe('—')
    const many = Array.from({ length: 30 }, (_, i) =>
      ev({ id: `e${i}`, occurredAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString() }),
    )
    expect(buildEnvoye(many, new Map(), 5)).toHaveLength(5)
  })
})

describe('formatRelative', () => {
  const NOW = new Date('2026-07-06T12:00:00.000Z')
  const d = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

  it('passé / présent / futur (FR) — les échéances (futur) donnent « dans N j »', () => {
    expect(formatRelative(d(0), NOW, 'fr')).toBe("aujourd'hui")
    expect(formatRelative(d(-1), NOW, 'fr')).toBe('hier')
    expect(formatRelative(d(1), NOW, 'fr')).toBe('demain')
    expect(formatRelative(d(-24), NOW, 'fr')).toBe('il y a 24 j')
    expect(formatRelative(d(45), NOW, 'fr')).toBe('dans 45 j')
  })

  it('variantes EN', () => {
    expect(formatRelative(d(-3), NOW, 'en')).toBe('3 d ago')
    expect(formatRelative(d(10), NOW, 'en')).toBe('in 10 d')
  })

  it('au-delà de 60 j → date absolue ; date illisible → chaîne vide', () => {
    expect(formatRelative(d(-400), NOW, 'fr')).toMatch(/\d{4}/) // année → date absolue
    expect(formatRelative('n/a', NOW, 'fr')).toBe('')
  })
})

describe('unreadCount', () => {
  const item = (id: string): ActionItem => ({
    id,
    kind: 'doc_expired',
    priority: 1,
    href: '/x',
    label: 'X',
  })

  it('compte les items Reçu dont l’id n’a pas été acquitté', () => {
    const recu = [item('a'), item('b'), item('c')]
    expect(unreadCount(recu, [])).toBe(3)
    expect(unreadCount(recu, ['a', 'b'])).toBe(1)
    expect(unreadCount(recu, ['a', 'b', 'c'])).toBe(0)
    expect(unreadCount(recu, ['a', 'zzz'])).toBe(2) // id acquitté disparu → ignoré
  })
})

describe('sortRecuByRecency (ordre de la cloche)', () => {
  const item = (id: string, date?: string, priority = 1): ActionItem => ({
    id,
    kind: 'doc_expired',
    priority,
    href: '/x',
    label: id,
    date,
  })

  it('classe les items datés du plus récent au plus ancien', () => {
    const recu = [
      item('old', '2026-07-01T00:00:00.000Z'),
      item('new', '2026-07-10T00:00:00.000Z'),
      item('mid', '2026-07-05T00:00:00.000Z'),
    ]
    expect(sortRecuByRecency(recu).map((i) => i.id)).toEqual(['new', 'mid', 'old'])
  })

  it('place les items NON datés après les datés, dans leur ordre d’origine (tri stable)', () => {
    const recu = [
      item('undated-p1', undefined, 1), // suspended/non_conform : sans échéance
      item('dated', '2026-07-05T00:00:00.000Z'),
      item('undated-p2', undefined, 2),
    ]
    // Le daté passe devant ; les non datés suivent dans l’ordre d’entrée (priorité conservée).
    expect(sortRecuByRecency(recu).map((i) => i.id)).toEqual(['dated', 'undated-p1', 'undated-p2'])
  })

  it('ne mute pas le tableau d’entrée (fonction pure)', () => {
    const recu = [item('a', '2026-07-01T00:00:00.000Z'), item('b', '2026-07-10T00:00:00.000Z')]
    const snapshot = recu.map((i) => i.id)
    sortRecuByRecency(recu)
    expect(recu.map((i) => i.id)).toEqual(snapshot)
  })
})
