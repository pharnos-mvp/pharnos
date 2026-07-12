import { describe, expect, it } from 'vitest'

import type { DossierDisplayStatus } from '@/features/correspondence/correspondence-constants'
import type { DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'
import {
  buildOpsRows,
  dossierRef,
  isDeadlineUrgent,
  matchesDossierQuery,
  normalizeSearch,
  opsPipeline,
  opsProcedureCounts,
  type OpsRow,
} from './operations-data'

const NOW = new Date('2026-06-28T00:00:00.000Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)

const dossier = (id: string, over: Partial<DossierRecord> = {}): DossierRecord =>
  ({
    id,
    orgId: 'org-1',
    productId: over.productId ?? 'p1',
    productName: over.productName ?? 'Produit',
    format: 'ctd',
    activity: over.activity ?? 'new_ma',
    country: over.country ?? 'BJ',
    status: 'draft',
    tree: [],
    excludedDocIds: [],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  }) as DossierRecord

const product = (id: string): ProductRecord =>
  ({
    id,
    orgId: 'org-1',
    nomCommercial: id,
    dci: 'x',
    dosage: '',
    forme: '',
    presentation: '',
    classeTherapeutique: '',
    codeAtc: '',
    titulaire: '',
    fabricant: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  }) as ProductRecord

const ammDoc = (
  id: string,
  productId: string,
  expiryDate: string,
  docType = 'amm',
): DocumentRecord =>
  ({
    id,
    orgId: 'org-1',
    productId,
    category: 'admin',
    docType,
    fileName: 'f',
    mimeType: '',
    size: 0,
    language: null,
    expiryDate,
    status: 'active',
    filePath: null,
    uploaded: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  }) as DocumentRecord

describe('operations-data', () => {
  it('dossierRef : n° canonique serveur OP-AAAA-NNNN, ou null si non synchronisé', () => {
    // Numéroté (op_year/op_number attribués au serveur) → format OP-AAAA-NNNN (4 chiffres).
    expect(dossierRef(dossier('d', { opYear: 2026, opNumber: 142 }))).toBe('OP-2026-0142')
    // Brouillon local non encore synchronisé → null (l'UI affiche « n° en attente »).
    expect(dossierRef(dossier('d'))).toBeNull()
  })

  it('isDeadlineUrgent : <= 7 j (ou dépassée)', () => {
    expect(isDeadlineUrgent(5)).toBe(true)
    expect(isDeadlineUrgent(-2)).toBe(true)
    expect(isDeadlineUrgent(20)).toBe(false)
    expect(isDeadlineUrgent(null)).toBe(false)
  })

  it('buildOpsRows : tri du plus récent au plus ancien (date de création), complétude (arbre vide=0)', () => {
    const statusById = new Map<string, DossierDisplayStatus>([
      ['d1', 'in_review'],
      ['d2', 'accepted'],
    ])
    const rows = buildOpsRows(
      [
        dossier('d1', { productId: 'p1', createdAt: '2026-03-01T00:00:00.000Z' }),
        dossier('d2', { productId: 'p2', createdAt: '2026-05-10T00:00:00.000Z' }),
      ],
      statusById,
      [product('p1'), product('p2')],
      [ammDoc('a1', 'p1', inDays(30)), ammDoc('a2', 'p2', inDays(3))],
      new Map(),
      NOW,
    )
    expect(rows.map((r) => r.dossier.id)).toEqual(['d2', 'd1']) // d2 (créé en mai) avant d1 (créé en mars)
    expect(rows[0]?.deadlineDays).toBe(3) // d2 : pièce à J-3
    expect(rows[0]?.completionPct).toBe(0) // arbre vide
    expect(rows[0]?.ref).toBeNull() // pas de n° serveur sur ces dossiers de test → « en attente »
  })

  it("buildOpsRows : échéance = pièce la plus proche en JOURS BRUTS (pas l'urgence relative)", () => {
    // amm (fenêtre 180 j) à J-60 = ratio 0,33 ; coa (fenêtre 547 j) à J-70 = ratio 0,13.
    // `expiringDocs` trierait la coa en tête (plus urgente relativement) ; la colonne « Échéance »
    // doit afficher la plus proche en absolu = l'amm (60 j).
    const rows = buildOpsRows(
      [dossier('d1', { productId: 'p1' })],
      new Map(),
      [product('p1')],
      [ammDoc('amm', 'p1', inDays(60), 'amm'), ammDoc('coa', 'p1', inDays(70), 'coa')],
      new Map(),
      NOW,
    )
    expect(rows[0]?.deadlineDays).toBe(60)
  })

  it('opsPipeline : répartition par statut en ordre canonique', () => {
    const rows = buildOpsRows(
      [dossier('d1'), dossier('d2'), dossier('d3')],
      new Map<string, DossierDisplayStatus>([
        ['d1', 'draft'],
        ['d2', 'draft'],
        ['d3', 'rejected'],
      ]),
      [product('p1')],
      [],
      new Map(),
      NOW,
    )
    const pipe = opsPipeline(rows)
    expect(pipe.find((p) => p.status === 'draft')?.count).toBe(2)
    expect(pipe.find((p) => p.status === 'rejected')?.count).toBe(1)
    expect(pipe.map((p) => p.status)).toEqual([
      'draft',
      'in_review',
      'suspended',
      'accepted',
      'rejected',
    ])
  })

  it('opsProcedureCounts : compte par procédure, Transfert masqué si vide', () => {
    const rows = buildOpsRows(
      [dossier('d1', { activity: 'new_ma' }), dossier('d2', { activity: 'renewal' })],
      new Map(),
      [product('p1')],
      [],
      new Map(),
      NOW,
    )
    const pc = opsProcedureCounts(rows)
    expect(pc.find((x) => x.activity === 'new_ma')?.count).toBe(1)
    expect(pc.find((x) => x.activity === 'renewal')?.count).toBe(1)
    expect(pc.find((x) => x.activity === 'transfer')).toBeUndefined() // 0 → masqué
  })
})

describe('recherche du board (normalizeSearch / matchesDossierQuery)', () => {
  const row = (over: Partial<DossierRecord>, ref: string | null = null): OpsRow => ({
    dossier: dossier('d', over),
    ref,
    status: 'draft',
    completionPct: 0,
    deadlineDays: null,
    lastActivityAt: null,
  })

  it('normalizeSearch : plie accents + casse', () => {
    expect(normalizeSearch('CÔTE')).toBe('cote')
    expect(normalizeSearch('Renouvèlement')).toBe('renouvelement')
  })

  it('matche nom / n° / pays / procédure, insensible aux accents', () => {
    const r = row(
      { productName: 'Amoxicilline', country: 'CI', activity: 'renewal' },
      'OP-2026-0042',
    )
    const m = (q: string) => matchesDossierQuery(r, normalizeSearch(q), 'fr')
    expect(m('amoxi')).toBe(true) // nom produit
    expect(m('0042')).toBe(true) // n° d'opération
    expect(m('cote')).toBe(true) // pays « Côte d’Ivoire » recherché sans accent
    expect(m('renouv')).toBe(true) // procédure (Renouvellement)
    expect(m('zzz')).toBe(false)
  })

  it('ref null (brouillon non synchronisé) ne casse pas la recherche', () => {
    const r = row({ productName: 'Doliprane' }, null)
    expect(matchesDossierQuery(r, normalizeSearch('doli'), 'fr')).toBe(true)
    expect(matchesDossierQuery(r, normalizeSearch('op-2026'), 'fr')).toBe(false)
  })
})
