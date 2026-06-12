// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentRecord, DossierRecord } from '@/lib/db'
import type { RegafyFinding } from './regafy'
import { useRegafyCopilot } from './use-regafy-copilot'

vi.mock('@/lib/env', () => ({
  env: { isSupabaseConfigured: true, supabaseUrl: 'http://x', supabaseAnonKey: 'k' },
}))
vi.mock('./regafy-ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./regafy-ai')>()),
  runRegafyValidity: vi.fn(),
}))
vi.mock('./regafy-cache', () => ({
  getCachedAnalysis: vi.fn(async () => null),
  cacheAnalysis: vi.fn(async () => {}),
}))

import { runRegafyValidity } from './regafy-ai'
import { cacheAnalysis, getCachedAnalysis } from './regafy-cache'

const dossier = {
  id: 'd1',
  country: 'BJ',
  format: 'ctd',
  productName: 'Paracétamol 500',
  activity: 'new',
} as unknown as DossierRecord

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord =>
  ({
    id: 'p1',
    docType: 'gmp',
    category: 'admin',
    fileName: 'gmp.pdf',
    filePath: 'org/x/gmp.pdf',
    updatedAt: '2026-06-01T00:00:00Z',
    ...over,
  }) as DocumentRecord

function setup(d: DocumentRecord) {
  return renderHook(
    ({ docs }: { docs: DocumentRecord[] }) =>
      useRegafyCopilot({
        dossier,
        product: undefined,
        genDocs: [],
        docsByNode: new Map([['1.2', docs]]),
        attachByNode: new Map(),
        flatNodes: [{ number: '1.2', label: 'Informations administratives', depth: 1 }] as never,
        orgId: 'org1',
        onOpenTranslation: () => {},
      }),
    { initialProps: { docs: [d] } },
  )
}

beforeEach(() => {
  vi.mocked(runRegafyValidity).mockReset()
  vi.mocked(getCachedAnalysis).mockReset().mockResolvedValue(null)
  vi.mocked(cacheAnalysis).mockReset().mockResolvedValue(undefined)
})

describe('useRegafyCopilot — analyse à la demande (recette n°6)', () => {
  it('aucune analyse automatique : remarques vides au montage', () => {
    const { result } = setup(doc())
    expect(result.current.aiFindings).toEqual([])
    expect(runRegafyValidity).not.toHaveBeenCalled()
  })

  it('pièce admin sans constat → remarque POSITIVE consignée (validité vérifiée)', async () => {
    vi.mocked(runRegafyValidity).mockResolvedValue([])
    const { result } = setup(doc())
    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    const f = result.current.aiFindings[0]!
    expect(f.ok).toBe(true)
    expect(f.message).toBe('gmp.pdf : validité vérifiée — conforme.')
    expect(cacheAnalysis).toHaveBeenCalledWith('p1', '2026-06-01T00:00:00Z', [])
  })

  it('template non conforme ET non-FR → UN constat fusionné (Remplir/Traduire/Remplacer)', async () => {
    const fromEdge: RegafyFinding[] = [
      {
        id: 'a',
        nodeNumber: '1.2',
        nodeLabel: 'x',
        severity: 'warning',
        message: 'Non conforme au template.',
        source: 'ai',
        pieceId: 'p1',
        upgrade: true,
      },
      {
        id: 'b',
        nodeNumber: '1.2',
        nodeLabel: 'x',
        severity: 'warning',
        message: 'Rédigé en anglais.',
        source: 'ai',
        pieceId: 'p1',
        translate: true,
        language: 'en',
      },
    ]
    vi.mocked(runRegafyValidity).mockResolvedValue(fromEdge)
    const { result } = setup(doc({ docType: 'rcp', category: 'info', fileName: 'rcp_en.pdf' }))
    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    const f = result.current.aiFindings[0]!
    expect(f.message).toBe(
      'RCP : non conforme au template en vigueur et rédigé en EN — langue officielle du Bénin : français.',
    )
    expect(f.upgrade).toBe(true)
    expect(f.translate).toBe(true)
  })

  it('cache hit (pièce inchangée) → zéro appel IA, résultat consigné', async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue([])
    const { result } = setup(doc())
    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    expect(runRegafyValidity).not.toHaveBeenCalled()
  })

  it('ré-analyser REMPLACE les remarques de la pièce (jamais deux remarques du même genre)', async () => {
    vi.mocked(runRegafyValidity).mockResolvedValue([
      {
        id: 'v1',
        nodeNumber: '1.2',
        nodeLabel: 'x',
        severity: 'error',
        message: 'GMP expiré.',
        source: 'ai',
        pieceId: 'p1',
      },
    ])
    const { result } = setup(doc())
    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    expect(result.current.aiFindings[0]!.message).toBe('GMP expiré.')
  })

  it('runGlobalAudit : pièces auditées (cache traversé), remarques consignées, données du rapport', async () => {
    vi.mocked(runRegafyValidity).mockResolvedValue([
      {
        id: 'v1',
        nodeNumber: '1.2',
        nodeLabel: 'x',
        severity: 'error',
        message: 'GMP expiré.',
        source: 'ai',
        pieceId: 'p1',
      },
    ])
    const { result } = setup(doc())
    let data: Awaited<ReturnType<typeof result.current.runGlobalAudit>> = null
    await act(async () => {
      data = await result.current.runGlobalAudit({ tree: [], genByNode: new Map() })
    })
    expect(data).not.toBeNull()
    expect(data!.pieces).toHaveLength(1)
    expect(data!.pieces[0]).toMatchObject({
      name: 'gmp.pdf',
      kind: 'admin',
      nodeNumber: '1.2',
    })
    expect(data!.pieces[0]!.findings[0]!.message).toBe('GMP expiré.')
    expect(data!.countryName).toBe('Bénin')
    expect(Array.isArray(data!.structural)).toBe(true)
    // Le panneau Remarques est rempli par l'audit (résultats consignés).
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    expect(cacheAnalysis).toHaveBeenCalledOnce()
  })

  it('clearPieceAnalysis (Remplacer) et retrait de la pièce purgent ses remarques', async () => {
    vi.mocked(runRegafyValidity).mockResolvedValue([])
    const { result, rerender } = setup(doc())
    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    act(() => result.current.clearPieceAnalysis('p1'))
    expect(result.current.aiFindings).toEqual([])

    await act(() => result.current.analyzeActive('p1'))
    await waitFor(() => expect(result.current.aiFindings).toHaveLength(1))
    rerender({ docs: [] }) // pièce retirée du dossier → la remarque disparaît du panneau
    expect(result.current.aiFindings).toEqual([])
  })
})
