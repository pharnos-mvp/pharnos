import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncCatalogue } from './catalogue-sync'

const { trace } = vi.hoisted(() => ({ trace: [] as string[] }))
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Les parties prennent du temps : si l'ordre n'était pas tenu, les produits s'intercaleraient.
vi.mock('./parties-sync', () => ({
  syncParties: vi.fn(async () => {
    trace.push('parties:début')
    await tick(10)
    trace.push('parties:fin')
  }),
}))
vi.mock('./sync', () => ({
  syncProducts: vi.fn(async () => {
    trace.push('produits')
  }),
}))
vi.mock('./documents-sync', () => ({
  syncDocuments: vi.fn(async () => {
    trace.push('documents')
  }),
}))

const cycle = ['parties:début', 'parties:fin', 'produits', 'documents']

beforeEach(() => {
  trace.length = 0
})

describe('syncCatalogue', () => {
  it('respecte l’ordre imposé par les clés étrangères : parties → produits → documents', async () => {
    await syncCatalogue('org-1')

    expect(trace).toEqual(cycle)
  })

  it('sérialise deux cycles concurrents (régression 23503 : l’enfant partait avant son parent)', async () => {
    // Cas réel : synchro de montage encore en vol quand une mutation en déclenche une seconde.
    await Promise.all([syncCatalogue('org-1'), syncCatalogue('org-1')])

    // Aucun entrelacement : le 2ᵉ cycle attend la fin du 1er.
    expect(trace).toEqual([...cycle, ...cycle])
  })
})
