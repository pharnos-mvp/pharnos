import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reportError } from '@/lib/sentry'
import { syncCatalogue } from './catalogue-sync'

const { trace, panne } = vi.hoisted(() => ({
  trace: [] as string[],
  panne: { auProchainAppel: false },
}))
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Les parties prennent du temps : si l'ordre n'était pas tenu, les produits s'intercaleraient.
vi.mock('./parties-sync', () => ({
  syncParties: vi.fn(async () => {
    if (panne.auProchainAppel) {
      panne.auProchainAppel = false
      throw new Error('getSupabase a cassé')
    }
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
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

const cycle = ['parties:début', 'parties:fin', 'produits', 'documents']

beforeEach(() => {
  trace.length = 0
  panne.auProchainAppel = false
  vi.clearAllMocks()
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

  it('remonte ce qui s’échappe d’un maillon, et la chaîne SURVIT (pas de cycles morts)', async () => {
    panne.auProchainAppel = true

    await syncCatalogue('org-1')

    // Une erreur hors des `try` internes (ex. `getSupabase()` sur un chunk lazy manquant) ne doit
    // pas être avalée par le `catch` de survie : sans ça, elle n'atteint plus Sentry du tout.
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'getSupabase a cassé' }),
      expect.objectContaining({ entity: 'catalogue' }),
    )
    expect(trace).toEqual([])

    // …et le cycle suivant repart : une chaîne laissée REJETÉE les sauterait tous, en silence.
    await syncCatalogue('org-1')

    expect(trace).toEqual(cycle)
  })
})
