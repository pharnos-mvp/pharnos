import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runRegafyConformityTexts, UPGRADE_DOC_TYPES } from './regafy-ai'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => Promise.resolve({ functions: { invoke } }),
}))

beforeEach(() => invoke.mockReset())

describe('runRegafyConformityTexts (contrat client ↔ Edge)', () => {
  it('mappe upgrade/missing/pieceId du constat de conformité', async () => {
    invoke.mockResolvedValue({
      data: {
        findings: [
          {
            pieceId: 'gen-1',
            nodeNumber: '1.3.1',
            nodeLabel: 'RCP',
            severity: 'warning',
            message: 'RCP : non conforme au template en vigueur — 2 rubrique(s) à corriger : …',
            upgrade: true,
            missing: ['4.8. Effets indésirables — absente', '10. DATE DE MISE À JOUR — absente'],
          },
        ],
      },
      error: null,
    })
    const out = await runRegafyConformityTexts(
      [{ id: 'gen-1', nodeNumber: '1.3.1', nodeLabel: 'RCP', docType: 'rcp', text: 'contenu…' }],
      'BJ',
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      pieceId: 'gen-1',
      severity: 'warning',
      source: 'ai',
      upgrade: true,
    })
    expect(out[0]!.missing).toHaveLength(2)
    // Le payload envoyé porte bien les textes et le code pays (filtre des mentions BJ).
    expect(invoke).toHaveBeenCalledWith('regafy-ai', {
      body: expect.objectContaining({
        countryCode: 'BJ',
        conformityTexts: [expect.objectContaining({ id: 'gen-1', docType: 'rcp' })],
      }),
    })
  })

  it('liste vide → aucun appel réseau', async () => {
    const out = await runRegafyConformityTexts([], 'BJ')
    expect(out).toEqual([])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('les 5 types couverts incluent artwork (alias étiquetage)', () => {
    for (const t of ['cover', 'pght', 'rcp', 'notice', 'labeling', 'artwork']) {
      expect(UPGRADE_DOC_TYPES.has(t)).toBe(true)
    }
    expect(UPGRADE_DOC_TYPES.has('gmp')).toBe(false)
  })
})
