import { describe, expect, it } from 'vitest'

import type {
  CorrespondenceMessageRecord,
  CorrespondenceRecord,
  DocumentRecord,
  DossierRecord,
  PartyRecord,
  ProductRecord,
} from '@/lib/db'
import {
  buildOrgCockpitVm,
  buildOrgRows,
  filterOrgRows,
  orgDocCards,
  orgJustificatifCards,
  orgTypeCards,
  productsForParty,
  sortRoles,
} from './parties-data'

const NOW = new Date('2026-06-28T00:00:00.000Z')
/** Date d'expiration relative à NOW (jours). */
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)

const party = (id: string, over: Partial<PartyRecord> = {}): PartyRecord => ({
  id,
  orgId: 'org-1',
  nom: id,
  roles: ['titulaire'],
  pays: '',
  adresse: '',
  gmpCertificat: '',
  gmpExpiry: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const product = (id: string, over: Partial<ProductRecord> = {}): ProductRecord => ({
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
  ...over,
})

const doc = (id: string, over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id,
  orgId: 'org-1',
  productId: 'p1',
  category: 'admin',
  docType: 'amm',
  fileName: 'f',
  mimeType: '',
  size: 0,
  language: null,
  expiryDate: null,
  status: 'active',
  filePath: null,
  uploaded: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const dossier = (over: Partial<DossierRecord> = {}): DossierRecord => ({
  id: 'dos1',
  orgId: 'org-1',
  productId: 'p1',
  productName: 'Alpha',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [],
  excludedDocIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const corr = (over: Partial<CorrespondenceRecord> = {}): CorrespondenceRecord => ({
  id: 'c1',
  orgId: 'org-1',
  dossierId: 'dos1',
  productName: 'Alpha',
  country: 'CI',
  activity: 'new_ma',
  senderEmail: 's@lab.com',
  recipientEmail: 'a@agence.ci',
  note: null,
  pdfPath: 'o/shares/c1/m.pdf',
  pdfSize: 1,
  tokenHash: 'h',
  passwordHash: null,
  status: 'in_review',
  decidedAt: null,
  revokedAt: null,
  expiresAt: null,
  autoRevokeOnDecision: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const msg = (over: Partial<CorrespondenceMessageRecord> = {}): CorrespondenceMessageRecord => ({
  id: 'm1',
  orgId: 'org-1',
  correspondenceId: 'c1',
  author: 'recipient',
  authorLabel: 'a@agence.ci',
  kind: 'comment',
  decision: null,
  body: '',
  attachments: [],
  createdAt: '2026-06-02T00:00:00.000Z',
  ...over,
})

describe('parties-data (agrégations par organisation)', () => {
  it('compte les produits liés par titulaire OU fabricant, sans doublon', () => {
    const holder = party('holder', { nom: 'Holder' })
    const maker = party('maker', { nom: 'Maker', roles: ['fabricant'] })
    const products = [
      product('p1', { titulaireId: 'holder', fabricantId: 'maker' }),
      product('p2', { titulaireId: 'holder' }),
      product('p3', { deletedAt: '2026-02-01T00:00:00.000Z', titulaireId: 'holder' }), // supprimé
    ]
    const rows = buildOrgRows([holder, maker], products, [], NOW)
    expect(rows.find((r) => r.party.id === 'holder')?.productCount).toBe(2)
    expect(rows.find((r) => r.party.id === 'maker')?.productCount).toBe(1)
  })

  it('compte les documents des produits liés et agrège les pays (AMM), distincts', () => {
    const holder = party('holder')
    const products = [product('p1', { titulaireId: 'holder' })]
    const docs = [
      doc('d1', { productId: 'p1', country: 'BEN' }),
      doc('d2', { productId: 'p1', country: 'BEN' }),
      doc('d3', { productId: 'p1', country: 'CIV' }),
      doc('d4', { productId: 'p1', deletedAt: '2026-02-01T00:00:00.000Z' }), // supprimé → exclu
      doc('d5', { productId: 'other' }), // produit non lié → exclu
    ]
    const row = buildOrgRows([holder], products, docs, NOW)[0]
    expect(row?.docCount).toBe(3)
    expect(row?.countries).toEqual(['BEN', 'CIV'])
  })

  it('agrège la santé de validité (périmée / à renouveler) au niveau organisation', () => {
    const holder = party('holder')
    const products = [product('p1', { titulaireId: 'holder' })]
    const docs = [
      doc('expired', { productId: 'p1', docType: 'gmp', expiryDate: inDays(-5) }), // périmée
      doc('soon', { productId: 'p1', docType: 'amm', expiryDate: inDays(30) }), // fenêtre admin 180j
      doc('ok', { productId: 'p1', docType: 'amm', expiryDate: inDays(400) }), // hors fenêtre
    ]
    const row = buildOrgRows([holder], products, docs, NOW)[0]
    expect(row?.expiredCount).toBe(1)
    expect(row?.expiringCount).toBe(1)
    expect(row?.tone).toBe('poor') // une pièce périmée → rouge
  })

  it('exclut les organisations supprimées et trie par nom', () => {
    const rows = buildOrgRows(
      [
        party('b', { nom: 'Beta' }),
        party('a', { nom: 'Alpha' }),
        party('z', { nom: 'Zeta', deletedAt: '2026-02-01T00:00:00.000Z' }),
      ],
      [],
      [],
      NOW,
    )
    expect(rows.map((r) => r.party.nom)).toEqual(['Alpha', 'Beta'])
  })

  it('productsForParty ignore les produits supprimés', () => {
    const products = [
      product('p1', { titulaireId: 'h' }),
      product('p2', { fabricantId: 'h' }),
      product('p3', { titulaireId: 'h', deletedAt: '2026-02-01T00:00:00.000Z' }),
    ]
    expect(productsForParty('h', products).map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('filtre par nom / pays / rôle', () => {
    const rows = buildOrgRows(
      [
        party('h', { nom: 'Synthia Labs', pays: 'DE', roles: ['titulaire'] }),
        party('m', { nom: 'Aura Lifecare', pays: 'IN', roles: ['fabricant'] }),
      ],
      [],
      [],
      NOW,
    )
    expect(filterOrgRows(rows, 'synthia').map((r) => r.party.id)).toEqual(['h'])
    expect(filterOrgRows(rows, 'fabricant').map((r) => r.party.id)).toEqual(['m'])
    expect(filterOrgRows(rows, 'IN').map((r) => r.party.id)).toEqual(['m'])
    expect(filterOrgRows(rows, '')).toHaveLength(2)
  })

  it('sortRoles : titulaire avant fabricant avant distributeur', () => {
    expect(sortRoles(['distributeur', 'fabricant', 'titulaire'])).toEqual([
      'titulaire',
      'fabricant',
      'distributeur',
    ])
  })
})

describe('buildOrgCockpitVm (cockpit RA)', () => {
  it('portefeuille AMM par pays : total / active / à renouveler / périmée', () => {
    const holder = party('holder', { roles: ['titulaire'] })
    const products = [
      product('p1', { titulaireId: 'holder' }),
      product('p2', { titulaireId: 'holder' }),
    ]
    const docs = [
      doc('a1', { productId: 'p1', docType: 'amm', country: 'BEN', expiryDate: inDays(400) }), // active
      doc('a2', { productId: 'p1', docType: 'amm', country: 'BEN', expiryDate: inDays(30) }), // à renouveler
      doc('a3', { productId: 'p2', docType: 'amm', country: 'CIV', expiryDate: inDays(-10) }), // périmée
      doc('a4', { productId: 'p2', docType: 'amm', country: 'TGO' }), // sans date → active
    ]
    const vm = buildOrgCockpitVm(holder, products, docs, NOW)
    expect(vm.amm.total).toBe(4)
    expect(vm.amm.expired).toBe(1)
    expect(vm.amm.expiring).toBe(1)
    expect(vm.amm.active).toBe(3) // total - périmées (sans date = active)
    expect(vm.amm.byCountry.map((c) => c.code)).toEqual(['BEN', 'CIV', 'TGO'])
    expect(vm.amm.byCountry.find((c) => c.code === 'BEN')).toMatchObject({
      total: 2,
      active: 2,
      expiring: 1,
    })
  })
})

describe('orgDocCards (cartes d’un onglet, par prédicat)', () => {
  const holder = party('holder')
  const products = [product('p1', { titulaireId: 'holder', nomCommercial: 'Alpha' })]

  it('ne garde que le TYPE demandé, avec nom de produit et taille', () => {
    const cards = orgDocCards(
      holder,
      products,
      [
        doc('a', { docType: 'amm', fileName: 'amm.pdf', size: 1234, expiryDate: inDays(400) }),
        doc('g', { docType: 'gmp', fileName: 'gmp.pdf', expiryDate: inDays(400) }),
      ],
      NOW,
      (d) => d.docType === 'amm',
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'a',
      fileName: 'amm.pdf',
      size: 1234,
      productName: 'Alpha',
    })
  })

  it('classe l’état : périmée / à renouveler / valide (fenêtre Monitor du type)', () => {
    const cards = orgDocCards(
      holder,
      products,
      [
        doc('ok', { expiryDate: inDays(400) }), // hors fenêtre (préavis admin = 180 j)
        doc('soon', { expiryDate: inDays(30) }), // dans la fenêtre
        doc('gone', { expiryDate: inDays(-10) }), // périmée
      ],
      NOW,
      (d) => d.docType === 'amm',
    )
    // Tri par urgence : périmée, puis à renouveler, puis valide.
    expect(cards.map((c) => [c.id, c.state])).toEqual([
      ['gone', 'expired'],
      ['soon', 'expiring'],
      ['ok', 'valid'],
    ])
    expect(cards[0]?.daysLeft).toBe(-10)
  })

  it('à état égal, la plus urgente d’abord — et J-0 est PÉRIMÉE (comme le panneau)', () => {
    const cards = orgDocCards(
      holder,
      products,
      [
        doc('later', { expiryDate: inDays(120) }),
        doc('today', { expiryDate: inDays(0) }),
        doc('soon', { expiryDate: inDays(30) }),
      ],
      NOW,
      (d) => d.docType === 'amm',
    )
    expect(cards.map((c) => [c.id, c.state])).toEqual([
      ['today', 'expired'],
      ['soon', 'expiring'],
      ['later', 'expiring'],
    ])
  })

  it('pièce SANS date = valide, daysLeft null (rien n’est en défaut)', () => {
    const cards = orgDocCards(
      holder,
      products,
      [doc('nd', { expiryDate: null })],
      NOW,
      (d) => d.docType === 'amm',
    )
    expect(cards[0]).toMatchObject({ state: 'valid', daysLeft: null, expiryDate: null })
  })

  it('inclut les documents ORG-scopés de la partie (0069) — pas ceux d’une AUTRE partie', () => {
    const cards = orgDocCards(
      holder,
      products,
      [
        doc('own', { productId: '', partyId: 'holder', expiryDate: inDays(400) }), // doc PROPRE
        doc('other', { productId: '', partyId: 'autre-org', expiryDate: inDays(400) }), // autre partie
      ],
      NOW,
      (d) => d.docType === 'amm',
    )
    expect(cards.map((c) => c.id)).toEqual(['own'])
  })

  it('exclut les pièces supprimées et celles d’un produit NON lié à l’organisation', () => {
    const cards = orgDocCards(
      holder,
      [...products, product('p9', { titulaireId: 'autre' })],
      [
        doc('del', { expiryDate: inDays(-1), deletedAt: '2026-02-01T00:00:00.000Z' }),
        doc('foreign', { productId: 'p9', expiryDate: inDays(-1) }),
        doc('keep', { expiryDate: inDays(400) }),
      ],
      NOW,
      (d) => d.docType === 'amm',
    )
    expect(cards.map((c) => c.id)).toEqual(['keep'])
  })
})

describe('orgTypeCards (agrégation par type — onglets Pièces admin / Documents d’info)', () => {
  const holder = party('holder')
  const products = [
    product('p1', { titulaireId: 'holder', nomCommercial: 'Alpha' }),
    product('p2', { titulaireId: 'holder', nomCommercial: 'Beta' }),
  ]

  it('une carte par type : total + pire état + pièce la plus urgente, type en défaut en tête', () => {
    const cards = orgTypeCards(
      holder,
      products,
      [
        doc('g1', { docType: 'gmp', productId: 'p1', expiryDate: inDays(-5) }), // périmée
        doc('g2', { docType: 'gmp', productId: 'p2', expiryDate: inDays(400) }), // valide (préavis 180 j)
        doc('c1', { docType: 'coa', expiryDate: inDays(900) }), // valide (fenêtre CoA 547 j)
      ],
      NOW,
      (d) => d.docType !== 'amm',
    )
    const gmp = cards.find((c) => c.docType === 'gmp')!
    expect(gmp).toMatchObject({
      total: 2,
      expired: 1,
      valid: 1,
      state: 'expired',
      nextProductName: 'Alpha',
    })
    expect(gmp.nextDaysLeft).toBe(-5)
    expect(cards.find((c) => c.docType === 'coa')).toMatchObject({ total: 1, state: 'valid' })
    // Le type en défaut passe avant le type sain (tri par urgence).
    expect(cards[0]?.docType).toBe('gmp')
  })

  it('documents d’INFO (sans date de validité) → carte « valide », total exact', () => {
    const cards = orgTypeCards(
      holder,
      products,
      [
        doc('r1', { docType: 'rcp', category: 'info' }),
        doc('r2', { docType: 'rcp', category: 'info' }),
        doc('n1', { docType: 'notice', category: 'info' }),
      ],
      NOW,
      (d) => d.category === 'info',
    )
    expect(cards.map((c) => [c.docType, c.total, c.state])).toEqual(
      expect.arrayContaining([
        ['rcp', 2, 'valid'],
        ['notice', 1, 'valid'],
      ]),
    )
  })

  it('respecte le prédicat (n’agrège que les types demandés)', () => {
    const cards = orgTypeCards(
      holder,
      products,
      [
        doc('a', { docType: 'amm', expiryDate: inDays(100) }),
        doc('g', { docType: 'gmp', expiryDate: inDays(100) }),
      ],
      NOW,
      (d) => d.docType === 'amm',
    )
    expect(cards.map((c) => c.docType)).toEqual(['amm'])
  })
})

describe('orgJustificatifCards (pièces jointes des correspondances de l’org)', () => {
  const holder = party('holder')
  const products = [product('p1', { titulaireId: 'holder', nomCommercial: 'Alpha' })]
  const dossiers = [dossier({ id: 'dos1', productId: 'p1' })]

  const withAttach = (over = {}) =>
    msg({
      correspondenceId: 'c1',
      attachments: [{ path: 'o/x.pdf', name: 'x.pdf', size: 9, mime: 'application/pdf' }],
      ...over,
    })

  it('collecte les PJ des corresp. des dossiers liés, avec produit + id synthétique corr:PATH', () => {
    const cards = orgJustificatifCards(
      holder,
      products,
      dossiers,
      [corr({ id: 'c1', dossierId: 'dos1' })],
      [withAttach()],
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'corr:o/x.pdf',
      filePath: 'o/x.pdf',
      fileName: 'x.pdf',
      productName: 'Alpha',
      state: 'valid',
    })
  })

  it('dédoublonne une même PJ renvoyée dans plusieurs messages', () => {
    const cards = orgJustificatifCards(
      holder,
      products,
      dossiers,
      [corr({ id: 'c1', dossierId: 'dos1' })],
      [withAttach({ id: 'm1' }), withAttach({ id: 'm2' })],
    )
    expect(cards).toHaveLength(1)
  })

  it('exclut : produit non lié · dossier SUPPRIMÉ · correspondance SUPPRIMÉE', () => {
    const at = (path: string) => [{ path, name: path, size: 1, mime: '' }]
    const cards = orgJustificatifCards(
      holder,
      products,
      [
        dossier({ id: 'dosForeign', productId: 'p9' }), // produit non lié à l'org
        dossier({ id: 'dosDeleted', productId: 'p1', deletedAt: '2026-06-01T00:00:00.000Z' }), // supprimé
        dossier({ id: 'dosOk', productId: 'p1' }), // lié + actif → sert de témoin
      ],
      [
        corr({ id: 'cForeign', dossierId: 'dosForeign' }),
        corr({ id: 'cOnDeletedDossier', dossierId: 'dosDeleted' }),
        corr({ id: 'cDeleted', dossierId: 'dosOk', deletedAt: '2026-06-01T00:00:00.000Z' }), // corresp. supprimée
      ],
      [
        msg({ id: 'm1', correspondenceId: 'cForeign', attachments: at('foreign') }),
        msg({ id: 'm2', correspondenceId: 'cOnDeletedDossier', attachments: at('ondel') }),
        msg({ id: 'm3', correspondenceId: 'cDeleted', attachments: at('deletedcorr') }),
      ],
    )
    // Chaque garde (produit lié · dossier actif · correspondance active) exclut sa PJ.
    expect(cards).toHaveLength(0)
  })
})
