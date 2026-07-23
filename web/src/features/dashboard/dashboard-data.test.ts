import { describe, expect, it } from 'vitest'

import type { RegafyFinding } from '@/features/workspace/regafy'
import type {
  AuditLogRecord,
  CorrespondenceMessageRecord,
  CorrespondenceRecord,
  DocAnalysisRecord,
  DocumentRecord,
  DossierRecord,
  ProductRecord,
} from '@/lib/db'

import {
  buildActions,
  complianceRate,
  conformityPct,
  conformitySummary,
  conformityTone,
  countryStats,
  expiringDocs,
  expiryStatus,
  expiryTone,
  isNonConform,
  openCorrespondences,
  pipelineCounts,
  portfolio,
  recentActivity,
  renewalLeadDays,
  type DashboardInput,
} from './dashboard-data'

const NOW = new Date('2026-06-14T00:00:00Z')
const plus = (days: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const product = (over: Partial<ProductRecord> = {}): ProductRecord => ({
  id: 'p1',
  orgId: 'o1',
  nomCommercial: 'Gynoril',
  dci: '',
  dosage: '',
  forme: '',
  presentation: '',
  classeTherapeutique: '',
  codeAtc: '',
  titulaire: '',
  fabricant: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...over,
})

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'd1',
  orgId: 'o1',
  productId: 'p1',
  category: 'admin',
  docType: 'gmp',
  fileName: 'gmp.pdf',
  mimeType: 'application/pdf',
  size: 1,
  language: 'fr',
  expiryDate: null,
  status: 'ok',
  filePath: null,
  uploaded: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...over,
})

const dossier = (over: Partial<DossierRecord> = {}): DossierRecord => ({
  id: 'dos1',
  orgId: 'o1',
  productId: 'p1',
  productName: 'Gynoril',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [],
  excludedDocIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...over,
})

const corr = (over: Partial<CorrespondenceRecord> = {}): CorrespondenceRecord => ({
  id: 'c1',
  orgId: 'o1',
  dossierId: 'dos1',
  productName: 'Gynoril',
  country: 'CI',
  activity: 'new_ma',
  senderEmail: 's@lab.com',
  recipientEmail: 'a@agence.ci',
  note: null,
  pdfPath: 'o1/shares/c1/m1.pdf',
  pdfSize: 1,
  tokenHash: 'h',
  passwordHash: null,
  status: 'in_review',
  decidedAt: null,
  revokedAt: null,
  expiresAt: null,
  autoRevokeOnDecision: true,
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-01T10:00:00Z',
  deletedAt: null,
  ...over,
})

const msg = (over: Partial<CorrespondenceMessageRecord> = {}): CorrespondenceMessageRecord => ({
  id: 'm1',
  orgId: 'o1',
  correspondenceId: 'c1',
  author: 'recipient',
  authorLabel: 'a@agence.ci',
  kind: 'comment',
  decision: null,
  body: 'Bonjour',
  attachments: [],
  createdAt: '2026-06-10T10:00:00Z',
  ...over,
})

const analysis = (over: Partial<DocAnalysisRecord> = {}): DocAnalysisRecord => ({
  docId: 'd1',
  sig: '2026-01-01',
  findings: [],
  analyzedAt: '2026-06-01',
  ...over,
})

const finding = (over: Partial<RegafyFinding> = {}): RegafyFinding => ({
  id: 'f1',
  nodeNumber: '1.3.1',
  nodeLabel: 'RCP',
  severity: 'warning',
  message: 'msg',
  ...over,
})

const audit = (over: Partial<AuditLogRecord> = {}): AuditLogRecord => ({
  id: 'a1',
  orgId: 'o1',
  actorId: 'u1',
  actorEmail: 'u@lab.com',
  entity: 'dossier',
  entityId: 'dos1',
  action: 'update',
  label: 'Gynoril',
  at: '2026-06-01',
  ...over,
})

const emptyInput = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  products: [],
  documents: [],
  dossiers: [],
  correspondences: [],
  messages: [],
  reads: [],
  docAnalysis: [],
  ...over,
})

describe('expiryStatus', () => {
  it('classe expiré / bientôt (≤90 j) / valide', () => {
    expect(expiryStatus(plus(-1), NOW)).toBe('expired')
    expect(expiryStatus(plus(30), NOW)).toBe('soon')
    expect(expiryStatus(plus(89), NOW)).toBe('soon')
    expect(expiryStatus(plus(200), NOW)).toBe('ok')
  })
})

describe('isNonConform', () => {
  it('upgrade ou error = non conforme ; ok / warning seul / info = non', () => {
    expect(isNonConform(finding({ upgrade: true }))).toBe(true)
    expect(isNonConform(finding({ severity: 'error' }))).toBe(true)
    expect(isNonConform(finding({ severity: 'error', ok: true }))).toBe(false)
    expect(isNonConform(finding({ severity: 'warning' }))).toBe(false)
    expect(isNonConform(finding({ severity: 'info' }))).toBe(false)
  })
})

describe('buildActions', () => {
  it('aucune donnée → aucune action', () => {
    expect(buildActions(emptyInput(), NOW)).toEqual([])
  })

  it('pièce expirée et pièce expirante = actions ; pièce valide = aucune', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [
          doc({ id: 'd1', expiryDate: plus(-5) }),
          doc({ id: 'd2', expiryDate: plus(40) }),
          doc({ id: 'd3', expiryDate: plus(300) }),
          doc({ id: 'd4', expiryDate: null }),
        ],
      }),
      NOW,
    )
    expect(items.map((i) => i.kind)).toEqual(['doc_expired', 'doc_expiring'])
    expect(items[0]?.label).toBe('Gynoril')
    expect(items[0]?.href).toBe('/catalogue/p1')
  })

  it('dossier en suspens (état dérivé) = action ; dossier sans correspondance = aucune', () => {
    const items = buildActions(
      emptyInput({
        dossiers: [dossier({ id: 'dos1' }), dossier({ id: 'dos2' })],
        correspondences: [corr({ id: 'c1', dossierId: 'dos1', status: 'suspended' })],
      }),
      NOW,
    )
    const suspended = items.filter((i) => i.kind === 'dossier_suspended')
    expect(suspended).toHaveLength(1)
    expect(suspended[0]?.href).toBe('/workspace/dos1')
    expect(suspended[0]?.country).toBe('CI')
    // Date de l'événement portée (decidedAt null → repli createdAt de la corr) : tri chrono cloche.
    expect(suspended[0]?.date).toBe('2026-06-01T10:00:00Z')
  })

  it('dossier en suspens : la date = decidedAt de la décision quand elle existe', () => {
    const items = buildActions(
      emptyInput({
        dossiers: [dossier({ id: 'dos1' })],
        correspondences: [
          corr({
            id: 'c1',
            dossierId: 'dos1',
            status: 'suspended',
            decidedAt: '2026-06-12T08:00:00Z',
          }),
        ],
      }),
      NOW,
    )
    expect(items.find((i) => i.kind === 'dossier_suspended')?.date).toBe('2026-06-12T08:00:00Z')
  })

  it('message agence non lu = unread_reply (avec compteur) ; lu = agency_pending', () => {
    const base = emptyInput({
      correspondences: [corr({ id: 'c1', status: 'in_review' })],
      messages: [msg({ id: 'm1', createdAt: '2026-06-10T10:00:00Z' })],
    })
    const unread = buildActions(base, NOW)
    expect(unread.find((i) => i.kind === 'unread_reply')?.count).toBe(1)

    const seen = buildActions(
      { ...base, reads: [{ id: 'c1', lastSeenAt: '2026-06-11T00:00:00Z' }] },
      NOW,
    )
    expect(seen.some((i) => i.kind === 'unread_reply')).toBe(false)
    expect(seen.some((i) => i.kind === 'agency_pending')).toBe(true)
  })

  it('document non conforme (cache Regafy) = action non_conform', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [doc({ id: 'd1', productId: 'p1' })],
        docAnalysis: [analysis({ docId: 'd1', findings: [finding({ upgrade: true })] })],
      }),
      NOW,
    )
    const nc = items.find((i) => i.kind === 'non_conform')
    expect(nc).toBeTruthy()
    expect(nc?.count).toBe(1)
    expect(nc?.date).toBe('2026-06-01') // analyzedAt → tri chrono cloche (ne coule plus en bas)
    expect(nc?.href).toBe('/catalogue/p1')
  })

  it('tri par priorité : expiré avant en-suspens avant expirant', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [
          doc({ id: 'd1', expiryDate: plus(-2) }),
          doc({ id: 'd2', expiryDate: plus(10) }),
        ],
        dossiers: [dossier({ id: 'dos1' })],
        correspondences: [corr({ id: 'c1', dossierId: 'dos1', status: 'suspended' })],
      }),
      NOW,
    )
    expect(items.map((i) => i.kind)).toEqual(['doc_expired', 'dossier_suspended', 'doc_expiring'])
  })

  it('exclut les enregistrements supprimés (soft-delete)', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [doc({ id: 'd1', expiryDate: plus(-2), deletedAt: '2026-06-01' })],
      }),
      NOW,
    )
    expect(items).toEqual([])
  })
})

describe('pipelineCounts', () => {
  it('compte par état dérivé, ordre canonique (draft si pas de correspondance)', () => {
    const counts = pipelineCounts(
      [dossier({ id: 'dos1' }), dossier({ id: 'dos2' }), dossier({ id: 'dos3' })],
      [
        corr({ id: 'c1', dossierId: 'dos1', status: 'accepted' }),
        corr({ id: 'c2', dossierId: 'dos2', status: 'suspended' }),
      ],
    )
    expect(counts.map((c) => c.status)).toEqual([
      'draft',
      'in_review',
      'accepted',
      'suspended',
      'rejected',
    ])
    const m = Object.fromEntries(counts.map((c) => [c.status, c.count]))
    expect(m.draft).toBe(1)
    expect(m.accepted).toBe(1)
    expect(m.suspended).toBe(1)
  })
})

describe('openCorrespondences', () => {
  it('sous-état non lu > en attente > décidé, non lus en tête', () => {
    const items = openCorrespondences(
      [
        corr({ id: 'c1', status: 'in_review' }),
        corr({ id: 'c2', status: 'accepted', dossierId: 'dos2' }),
      ],
      [msg({ id: 'm1', correspondenceId: 'c1', author: 'recipient' })],
      [],
    )
    expect(items[0]?.id).toBe('c1')
    expect(items.find((i) => i.id === 'c1')?.state).toBe('unread')
    expect(items.find((i) => i.id === 'c1')?.unread).toBe(1)
    expect(items.find((i) => i.id === 'c2')?.state).toBe('decided')
  })

  it('in_review lu = en attente agence', () => {
    const items = openCorrespondences(
      [corr({ id: 'c1', status: 'in_review' })],
      [
        msg({
          id: 'm1',
          correspondenceId: 'c1',
          author: 'recipient',
          createdAt: '2026-06-10T10:00:00Z',
        }),
      ],
      [{ id: 'c1', lastSeenAt: '2026-06-11T00:00:00Z' }],
    )
    expect(items[0]?.state).toBe('awaiting_agency')
  })
})

describe('recentActivity', () => {
  it('plus récent d’abord, limité', () => {
    const log = [
      audit({ id: 'a1', at: '2026-06-01' }),
      audit({ id: 'a2', at: '2026-06-10' }),
      audit({ id: 'a3', at: '2026-06-05' }),
    ]
    expect(recentActivity(log, 2).map((a) => a.id)).toEqual(['a2', 'a3'])
  })
})

describe('expiringDocs', () => {
  it('≤90 j ou expiré, trié par jours restants', () => {
    const items = expiringDocs(
      [
        doc({ id: 'd1', expiryDate: plus(-3) }),
        doc({ id: 'd2', expiryDate: plus(20) }),
        doc({ id: 'd3', expiryDate: plus(300) }),
      ],
      [product()],
      NOW,
    )
    expect(items.map((i) => i.id)).toEqual(['d1', 'd2'])
    expect(items[0]?.daysLeft).toBeLessThan(0)
    expect(items[0]?.productName).toBe('Gynoril')
  })
})

describe('portfolio', () => {
  it('compte produits/dossiers + couverture pays/activité', () => {
    const p = portfolio(
      [product({ id: 'p1' }), product({ id: 'p2' })],
      [
        dossier({ id: 'dos1', country: 'CI', activity: 'new_ma' }),
        dossier({ id: 'dos2', country: 'CI', activity: 'renewal' }),
        dossier({ id: 'dos3', country: 'SN', activity: 'new_ma' }),
      ],
    )
    expect(p.productCount).toBe(2)
    expect(p.dossierCount).toBe(3)
    expect(p.byCountry[0]).toEqual({ code: 'CI', count: 2 })
    expect(p.byActivity.find((a) => a.code === 'new_ma')?.count).toBe(2)
  })
})

describe('conformitySummary', () => {
  it('compte non conformes / analysés / non analysés', () => {
    const s = conformitySummary(
      [doc({ id: 'd1' }), doc({ id: 'd2' }), doc({ id: 'd3' })],
      [
        analysis({ docId: 'd1', findings: [finding({ upgrade: true })] }),
        analysis({ docId: 'd2', findings: [finding({ ok: true, severity: 'info' })] }),
      ],
    )
    expect(s.nonConformDocs).toBe(1)
    expect(s.analyzedDocs).toBe(2)
    expect(s.notAnalyzed).toBe(1)
  })

  it("ignore les analyses dont le doc n'est pas dans l'org (docAnalysis sans orgId)", () => {
    const s = conformitySummary(
      [doc({ id: 'd1' })],
      [
        analysis({ docId: 'd1', findings: [finding({ upgrade: true })] }),
        // Analyse orpheline : autre org ou doc supprimé — ne doit PAS être comptée.
        analysis({ docId: 'foreign', findings: [finding({ upgrade: true })] }),
      ],
    )
    expect(s.nonConformDocs).toBe(1)
    expect(s.analyzedDocs).toBe(1)
  })
})

describe('renewalLeadDays', () => {
  it('applique les délais RA (toute pièce admin 6 mois, COA 18 mois, défaut 3 mois)', () => {
    expect(renewalLeadDays('amm')).toBe(180)
    expect(renewalLeadDays('gmp')).toBe(180)
    expect(renewalLeadDays('copp')).toBe(180)
    expect(renewalLeadDays('coa')).toBe(547)
    expect(renewalLeadDays('rcp')).toBe(90) // info non-COA → défaut 3 mois
    expect(renewalLeadDays('inconnu')).toBe(90)
  })
})

describe('expiringDocs — fenêtre par type', () => {
  it('inclut une pièce admin à 150 j (≤ 180) et un COA à 400 j (≤ 547) ; exclut un info à 150 j (> 90) et un admin à 200 j (> 180)', () => {
    const items = expiringDocs(
      [
        doc({ id: 'gmp150', docType: 'gmp', expiryDate: plus(150) }),
        doc({ id: 'coa400', docType: 'coa', category: 'info', expiryDate: plus(400) }),
        doc({ id: 'rcp150', docType: 'rcp', category: 'info', expiryDate: plus(150) }),
        doc({ id: 'gmp200', docType: 'gmp', expiryDate: plus(200) }),
      ],
      [product()],
      NOW,
    )
    const ids = items.map((i) => i.id)
    expect(ids).toContain('gmp150')
    expect(ids).toContain('coa400')
    expect(ids).not.toContain('rcp150')
    expect(ids).not.toContain('gmp200')
  })
})

describe('conformityPct', () => {
  it('taux borné, null si rien analysé', () => {
    expect(conformityPct({ analyzedDocs: 0, nonConformDocs: 0, notAnalyzed: 3 })).toBeNull()
    expect(conformityPct({ analyzedDocs: 4, nonConformDocs: 1, notAnalyzed: 0 })).toBe(75)
    expect(conformityPct({ analyzedDocs: 2, nonConformDocs: 2, notAnalyzed: 0 })).toBe(0)
    // garde-fou : jamais < 0 même si les non-conformes dépassent (données incohérentes)
    expect(conformityPct({ analyzedDocs: 2, nonConformDocs: 5, notAnalyzed: 0 })).toBe(0)
  })
})

describe('conformityTone', () => {
  it('mappe les seuils 95 / 85 / 70', () => {
    expect(conformityTone(96)).toBe('good')
    expect(conformityTone(88)).toBe('fair')
    expect(conformityTone(76)).toBe('passable')
    expect(conformityTone(61)).toBe('poor')
    expect(conformityTone(null)).toBe('neutral')
  })
})

describe('expiryTone', () => {
  it('vert si rien, jaune dans la fenêtre, rouge à mi-fenêtre ou expiré', () => {
    expect(expiryTone([])).toBe('good')
    // GMP à 120 j (ratio 120/180 = 0,67 > 0,5) → dans la fenêtre = jaune
    expect(
      expiryTone(expiringDocs([doc({ docType: 'gmp', expiryDate: plus(120) })], [product()], NOW)),
    ).toBe('passable')
    // GMP à 60 j (ratio 0,33 ≤ 0,5) → urgent = rouge
    expect(
      expiryTone(expiringDocs([doc({ docType: 'gmp', expiryDate: plus(60) })], [product()], NOW)),
    ).toBe('poor')
    // expiré → rouge
    expect(
      expiryTone(expiringDocs([doc({ docType: 'gmp', expiryDate: plus(-5) })], [product()], NOW)),
    ).toBe('poor')
  })
})

describe('countryStats (tuiles de couverture)', () => {
  it('un produit déposé dans 2 pays fait compter ses pièces pour CHACUN des pays', () => {
    const stats = countryStats(
      emptyInput({
        products: [product({ id: 'p1' })],
        dossiers: [
          dossier({ id: 'dos1', productId: 'p1', country: 'CI' }),
          dossier({ id: 'dos2', productId: 'p1', country: 'SN' }),
        ],
        // Pièce EXPIRÉE du produit p1 → urgente dans les deux pays où il est déposé.
        documents: [doc({ id: 'd1', productId: 'p1', expiryDate: plus(-5) })],
      }),
      NOW,
    )
    // Le GMP expiré rend le dossier NON à jour dans chacun des deux pays (0/1 → 0 %).
    const expected = {
      dossiers: 1,
      urgent: 1,
      messages: 0,
      upToDate: 0,
      conformity: 0,
      urgency: 'warning' as const,
    }
    expect(stats.get('CI')).toEqual(expected)
    expect(stats.get('SN')).toEqual(expected)
  })

  it('taux pays = dossiers À JOUR / dossiers du pays', () => {
    const stats = countryStats(
      emptyInput({
        products: ['p1', 'p2', 'p3', 'p4'].map((id) => product({ id })),
        dossiers: ['p1', 'p2', 'p3', 'p4'].map((pid, i) =>
          dossier({ id: `dos${i}`, productId: pid, country: 'CI' }),
        ),
        documents: [
          doc({ id: 'ok', productId: 'p1', expiryDate: plus(400) }), // valide, hors préavis
          doc({ id: 'ko', productId: 'p4', expiryDate: plus(-1) }), // GMP expiré
          // p2 et p3 : AUCUNE pièce à validité → à jour (décision CEO : rien n'est en défaut).
        ],
      }),
      NOW,
    )
    expect(stats.get('CI')?.upToDate).toBe(3)
    expect(stats.get('CI')?.conformity).toBe(75)
  })

  it('taux pays : pool PAR DOSSIER, jamais par produit', () => {
    const stats = countryStats(
      emptyInput({
        products: [product({ id: 'p1' }), product({ id: 'p2' })],
        dossiers: [
          dossier({ id: 'a', productId: 'p1', country: 'CI' }),
          dossier({ id: 'b', productId: 'p1', country: 'CI' }),
          dossier({ id: 'c', productId: 'p2', country: 'CI' }),
        ],
        documents: [doc({ id: 'ko', productId: 'p2', expiryDate: plus(-1) })],
      }),
      NOW,
    )
    // Par DOSSIER : 2/3 = 67 %. Par PRODUIT (dédoublonné) on obtiendrait 1/2 = 50 % → faux.
    expect(stats.get('CI')).toMatchObject({ dossiers: 3, upToDate: 2, conformity: 67 })
  })

  it('sévérité du panneau : AMM expirée > pièce admin expirée > sous préavis > rien', () => {
    const urgency = (documents: DocumentRecord[]) =>
      countryStats(
        emptyInput({
          products: [product({ id: 'p1' })],
          dossiers: [dossier({ productId: 'p1', country: 'CI' })],
          documents,
        }),
        NOW,
      ).get('CI')?.urgency

    expect(urgency([])).toBe('none')
    expect(urgency([doc({ productId: 'p1', expiryDate: plus(400) })])).toBe('none')
    expect(urgency([doc({ productId: 'p1', expiryDate: plus(30) })])).toBe('caution')
    expect(urgency([doc({ productId: 'p1', expiryDate: plus(-1) })])).toBe('warning')
    expect(urgency([doc({ productId: 'p1', docType: 'amm', expiryDate: plus(-1) })])).toBe('danger')
    // Une AMM expirée l'emporte sur une pièce admin expirée (sortie de marché > dette documentaire).
    expect(
      urgency([
        doc({ id: 'x', productId: 'p1', expiryDate: plus(-1) }),
        doc({ id: 'y', productId: 'p1', docType: 'amm', expiryDate: plus(-1) }),
      ]),
    ).toBe('danger')
    // Une pièce sous préavis ne doit PAS masquer une pièce expirée (ordre strict).
    expect(
      urgency([
        doc({ id: 'soon', productId: 'p1', expiryDate: plus(30) }),
        doc({ id: 'gone', productId: 'p1', expiryDate: plus(-1) }),
      ]),
    ).toBe('warning')
  })

  it('dossier en suspens = urgent ; réponse agence non lue = message', () => {
    const stats = countryStats(
      emptyInput({
        dossiers: [dossier({ id: 'dos1', country: 'CI' })],
        correspondences: [
          corr({ id: 'c1', dossierId: 'dos1', country: 'CI', status: 'suspended' }),
        ],
        messages: [msg({ id: 'm1', correspondenceId: 'c1', author: 'recipient' })],
      }),
      NOW,
    )
    expect(stats.get('CI')).toMatchObject({ dossiers: 1, urgent: 1, messages: 1 })
    // Un compteur urgent non nul ne doit JAMAIS s'afficher neutre (« 1 urgent — aucune échéance »).
    expect(stats.get('CI')?.urgency).not.toBe('none')
  })

  it('2 dossiers du MÊME produit dans le MÊME pays : pièces comptées UNE fois (dédoublonnage)', () => {
    const stats = countryStats(
      emptyInput({
        dossiers: [
          dossier({ id: 'dos1', productId: 'p1', country: 'CI' }),
          dossier({ id: 'dos2', productId: 'p1', country: 'CI' }),
        ],
        documents: [doc({ id: 'd1', productId: 'p1', expiryDate: plus(-5) })],
      }),
      NOW,
    )
    // 2 dossiers, mais la pièce expirée du produit ne compte qu'une seule fois.
    expect(stats.get('CI')).toMatchObject({ dossiers: 2, urgent: 1 })
    // Le taux se compte PAR DOSSIER : les 2 dossiers du produit expiré sont non à jour (0/2).
    expect(stats.get('CI')).toMatchObject({ upToDate: 0, conformity: 0 })
  })

  it('ignore les enregistrements supprimés (deletedAt)', () => {
    const stats = countryStats(
      emptyInput({
        dossiers: [
          dossier({ id: 'dos1', productId: 'p1', country: 'CI' }),
          dossier({ id: 'dos2', productId: 'p1', country: 'SN', deletedAt: '2026-06-01' }),
        ],
        documents: [
          doc({ id: 'd1', productId: 'p1', expiryDate: plus(-5), deletedAt: '2026-06-01' }),
        ],
      }),
      NOW,
    )
    expect(stats.has('SN')).toBe(false)
    expect(stats.get('CI')?.urgent).toBe(0)
    // La pièce expirée est SUPPRIMÉE : elle ne doit ni déclasser le taux ni colorer le panneau.
    expect(stats.get('CI')).toMatchObject({ upToDate: 1, conformity: 100, urgency: 'none' })
  })

  it('un pays SANS dossier actif reste absent, même s’il a une correspondance non lue', () => {
    const stats = countryStats(
      emptyInput({
        dossiers: [dossier({ id: 'dos1', country: 'CI' })],
        // SN : correspondance + message non lu mais AUCUN dossier → pas de tuile chiffrée.
        correspondences: [corr({ id: 'c2', dossierId: 'dosX', country: 'SN' })],
        messages: [msg({ id: 'm2', correspondenceId: 'c2', author: 'recipient' })],
      }),
      NOW,
    )
    expect(stats.has('CI')).toBe(true)
    expect(stats.has('SN')).toBe(false)
  })
})

describe('complianceRate (taux de conformité global)', () => {
  it('exemple CEO : 6 dossiers à jour sur 10 → 60 %', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`)
    const dossiers = ids.map((pid, i) => dossier({ id: `dos${i}`, productId: pid, country: 'CI' }))
    const documents = [
      // 4 dossiers hors conformité : 2 AMM expirées + 2 pièces admin expirées.
      doc({ id: 'e0', productId: 'p0', docType: 'amm', expiryDate: plus(-1) }),
      doc({ id: 'e1', productId: 'p1', docType: 'amm', expiryDate: plus(-30) }),
      doc({ id: 'e2', productId: 'p2', expiryDate: plus(-1) }),
      doc({ id: 'e3', productId: 'p3', expiryDate: plus(-1) }),
      // Sous préavis mais NON expirée → le dossier reste à jour (le taux dit la vérité légale).
      doc({ id: 'soon', productId: 'p4', expiryDate: plus(30) }),
    ]
    expect(complianceRate(dossiers, documents, NOW)).toEqual({ upToDate: 6, total: 10, pct: 60 })
  })

  it('produit sans aucune pièce à validité = à jour (décision CEO)', () => {
    const rate = complianceRate([dossier({ productId: 'p1', country: 'CI' })], [], NOW)
    expect(rate).toEqual({ upToDate: 1, total: 1, pct: 100 })
  })

  it('pièce expirée SUPPRIMÉE : ne déclasse pas le dossier', () => {
    const rate = complianceRate(
      [dossier({ productId: 'p1', country: 'CI' })],
      [doc({ productId: 'p1', expiryDate: plus(-5), deletedAt: '2026-06-01' })],
      NOW,
    )
    expect(rate).toEqual({ upToDate: 1, total: 1, pct: 100 })
  })

  it('dossier SUPPRIMÉ exclu du dénominateur', () => {
    const rate = complianceRate(
      [
        dossier({ id: 'a', productId: 'p1', country: 'CI' }),
        dossier({ id: 'b', productId: 'p2', country: 'CI', deletedAt: '2026-06-01' }),
      ],
      [doc({ productId: 'p2', expiryDate: plus(-5) })],
      NOW,
    )
    expect(rate).toEqual({ upToDate: 1, total: 1, pct: 100 })
  })

  it('2 dossiers du MÊME produit expiré comptent DEUX fois (pool par dossier)', () => {
    const rate = complianceRate(
      [
        dossier({ id: 'a', productId: 'p1', country: 'CI' }),
        dossier({ id: 'b', productId: 'p1', country: 'SN' }),
      ],
      [doc({ productId: 'p1', expiryDate: plus(-5) })],
      NOW,
    )
    expect(rate).toEqual({ upToDate: 0, total: 2, pct: 0 })
  })

  it('aucun dossier → pct null (pas de division par zéro)', () => {
    expect(complianceRate([], [], NOW).pct).toBeNull()
  })

  it('global = POOL de tous les dossiers, jamais la moyenne des taux pays', () => {
    // CI : 1 dossier à jour (100 %). SN : 3 dossiers dont 0 à jour (0 %).
    // Moyenne des pays = 50 % ; pool = 1/4 = 25 % → c'est le pool qui fait foi.
    const dossiers = [
      dossier({ id: 'a', productId: 'ok', country: 'CI' }),
      ...['x', 'y', 'z'].map((pid, i) => dossier({ id: `s${i}`, productId: pid, country: 'SN' })),
    ]
    const documents = ['x', 'y', 'z'].map((pid) =>
      doc({ id: `ko-${pid}`, productId: pid, expiryDate: plus(-1) }),
    )
    expect(complianceRate(dossiers, documents, NOW).pct).toBe(25)
  })
})
