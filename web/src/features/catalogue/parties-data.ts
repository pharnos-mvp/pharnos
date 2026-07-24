import { expiringDocs, expiryTone, type KpiTone } from '@/features/dashboard/dashboard-data'
import type {
  CorrespondenceMessageRecord,
  CorrespondenceRecord,
  DocumentRecord,
  DossierRecord,
  PartyRecord,
  PartyRole,
  ProductRecord,
} from '@/lib/db'

const isActive = <T extends { deletedAt?: string | null }>(r: T): boolean => r.deletedAt == null

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

/** Produits actifs liés à une organisation (titulaire ou fabricant). */
export function productsForParty(partyId: string, products: ProductRecord[]): ProductRecord[] {
  return products.filter(
    (p) => p.deletedAt === null && (p.titulaireId === partyId || p.fabricantId === partyId),
  )
}

/**
 * Produits liés + documents actifs du périmètre RA d'une organisation : les docs de ses PRODUITS
 * liés ∪ ses docs PROPRES (org-scopés, `partyId` — fiche d'ajout org, migration 0069).
 */
function orgScope(
  partyId: string,
  products: ProductRecord[],
  documents: DocumentRecord[],
): { linked: ProductRecord[]; docs: DocumentRecord[] } {
  const linked = productsForParty(partyId, products)
  const ids = new Set(linked.map((p) => p.id))
  const docs = documents.filter(
    (d) => isActive(d) && (ids.has(d.productId) || d.partyId === partyId),
  )
  return { linked, docs }
}

const distinctCountries = (docs: DocumentRecord[]): string[] =>
  [...new Set(docs.map((d) => d.country?.trim()).filter((c): c is string => !!c))].sort()

/**
 * Vue agrégée d'une organisation (`parties`) pour la liste/fiche : combien de produits et de
 * documents en dépendent, dans quels pays, et la **santé de validité** des pièces (réutilise la
 * politique unique du dashboard/Monitor : `expiringDocs`/`expiryTone`). Pur → testable.
 */
export interface OrgRow {
  party: PartyRecord
  /** Produits actifs liés (rôle titulaire OU fabricant). */
  productCount: number
  /** Documents actifs rattachés aux produits liés. */
  docCount: number
  /** Pays (AMM) distincts des produits liés. */
  countries: string[]
  /** Tonalité de la pièce la plus urgente du périmètre (vert/jaune/rouge). */
  tone: KpiTone
  /** Pièces dans leur fenêtre de renouvellement (pas encore périmées). */
  expiringCount: number
  /** Pièces périmées. */
  expiredCount: number
}

/** Agrège produits + documents + santé de validité par organisation active, triées par nom. */
export function buildOrgRows(
  parties: PartyRecord[],
  products: ProductRecord[],
  documents: DocumentRecord[],
  now: Date,
): OrgRow[] {
  return parties
    .filter(isActive)
    .map((party) => {
      const { linked, docs } = orgScope(party.id, products, documents)
      const exp = expiringDocs(docs, linked, now)
      const expired = exp.filter((i) => i.daysLeft <= 0).length
      return {
        party,
        productCount: linked.length,
        docCount: docs.length,
        countries: distinctCountries(docs),
        tone: expiryTone(exp),
        expiringCount: exp.length - expired,
        expiredCount: expired,
      }
    })
    .sort((a, b) => a.party.nom.localeCompare(b.party.nom))
}

/** Filtre plein-texte (nom / pays / rôle) — `q` est rapproché sans tenir compte de la casse. */
export function filterOrgRows(rows: OrgRow[], q: string): OrgRow[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((r) => {
    const hay = [r.party.nom, r.party.pays, ...r.party.roles].join(' ').toLowerCase()
    return hay.includes(needle)
  })
}

// ───────────────────────── Fiche organisation (cockpit RA) ─────────────────────────

/** Statut AMM par pays (rôle titulaire). */
export interface AmmCountryStat {
  code: string
  total: number
  active: number
  expiring: number
  expired: number
}

/** Portefeuille d'AMM d'une organisation (rôle titulaire d'AMM). */
export interface AmmPortfolio {
  total: number
  /** Non périmées (sans date = considérée active, cohérent avec `productCockpitVm`). */
  active: number
  expiring: number
  expired: number
  byCountry: AmmCountryStat[]
}

/** Cockpit RA d'une organisation : périmètre + portefeuille AMM + validité des pièces. */
export interface OrgCockpitVm {
  productCount: number
  docCount: number
  countries: string[]
  tone: KpiTone
  expiringCount: number
  expiredCount: number
  amm: AmmPortfolio
}

export function buildOrgCockpitVm(
  party: PartyRecord,
  products: ProductRecord[],
  documents: DocumentRecord[],
  now: Date,
): OrgCockpitVm {
  const { linked, docs } = orgScope(party.id, products, documents)
  const exp = expiringDocs(docs, linked, now) // périmées ∪ dans la fenêtre (politique unique)
  const expById = new Set(exp.map((i) => i.id))
  const expiredIds = new Set(exp.filter((i) => i.daysLeft <= 0).map((i) => i.id))

  // Portefeuille AMM (par pays).
  const ammDocs = docs.filter((d) => d.docType === 'amm')
  const ammStat = (ds: DocumentRecord[]): Omit<AmmCountryStat, 'code'> => {
    const expired = ds.filter((d) => expiredIds.has(d.id)).length
    const expiring = ds.filter((d) => expById.has(d.id) && !expiredIds.has(d.id)).length
    return { total: ds.length, active: ds.length - expired, expiring, expired }
  }
  const byCountry: AmmCountryStat[] = [
    ...groupBy(ammDocs, (d) => d.country?.trim() || '—').entries(),
  ]
    .map(([code, ds]) => ({ code, ...ammStat(ds) }))
    .sort((a, b) => a.code.localeCompare(b.code))
  const amm: AmmPortfolio = { ...ammStat(ammDocs), byCountry }

  const expiredCount = exp.filter((i) => i.daysLeft <= 0).length
  return {
    productCount: linked.length,
    docCount: docs.length,
    countries: distinctCountries(docs),
    tone: expiryTone(exp),
    expiringCount: exp.length - expiredCount,
    expiredCount,
    amm,
  }
}

/** Une pièce de l'organisation, telle qu'affichée en carte (onglets de la fiche Organisation). */
export interface OrgPieceCard {
  id: string
  fileName: string
  filePath: string | null
  size: number
  productName: string
  docType: string
  /** Date de dépôt (tri « par date ») — ISO. */
  createdAt: string
  expiryDate: string | null
  /** Jours restants (négatif = périmé) ; `null` si la pièce n'est pas datée. */
  daysLeft: number | null
  state: 'valid' | 'expiring' | 'expired'
}

const STATE_RANK: Record<OrgPieceCard['state'], number> = { expired: 0, expiring: 1, valid: 2 }

/**
 * Documents d'une organisation → cartes, filtrés par `keep` (un onglet = un prédicat : AMM, pièces
 * admin hors AMM, documents d'info…).
 *
 * L'état vient de la **même** source que le panneau/monitoring (`expiringDocs`, politique unique) :
 * un onglet ne peut pas contredire l'état affiché ailleurs. Tri par urgence (périmées, puis à
 * renouveler, puis valides), les plus pressées d'abord.
 */
export function orgDocCards(
  party: PartyRecord,
  products: ProductRecord[],
  documents: DocumentRecord[],
  now: Date,
  keep: (d: DocumentRecord) => boolean,
): OrgPieceCard[] {
  const { linked, docs } = orgScope(party.id, products, documents)
  const nameById = new Map(linked.map((p) => [p.id, p.nomCommercial]))
  const inWindow = new Set(expiringDocs(docs, linked, now).map((i) => i.id))
  return docs
    .filter(keep)
    .map((d): OrgPieceCard => {
      const daysLeft = d.expiryDate
        ? Math.round((new Date(d.expiryDate).getTime() - now.getTime()) / 86_400_000)
        : null
      return {
        id: d.id,
        fileName: d.fileName,
        filePath: d.filePath,
        size: d.size,
        productName: nameById.get(d.productId) ?? '—',
        docType: d.docType,
        createdAt: d.createdAt,
        expiryDate: d.expiryDate ?? null,
        daysLeft,
        // Périmée / à renouveler = appartenance à la fenêtre Monitor ; sinon valide.
        state: inWindow.has(d.id)
          ? daysLeft !== null && daysLeft <= 0
            ? 'expired'
            : 'expiring'
          : 'valid',
      }
    })
    .sort(
      (a, b) =>
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
        a.fileName.localeCompare(b.fileName),
    )
}

/**
 * Carte d'AGRÉGATION par TYPE de pièce (onglets « Pièces admin » / « Documents d'information » de la
 * fiche Organisation) : une carte = un type présent → total + pire état + pièce la plus urgente,
 * cliquable vers la page dédiée du type. Réutilise `orgDocCards` (source UNIQUE de l'état par pièce,
 * politique Monitor) → une carte ne peut pas contredire sa page dédiée. Tri par urgence.
 */
export interface OrgTypeCard {
  docType: string
  total: number
  valid: number
  expiring: number
  expired: number
  /** Pire état du type (badge de la carte). */
  state: OrgPieceCard['state']
  /** Pièce datée la plus urgente : produit porteur + jours restants (négatif = périmée). */
  nextProductName?: string
  nextDaysLeft?: number
}

export function orgTypeCards(
  party: PartyRecord,
  products: ProductRecord[],
  documents: DocumentRecord[],
  now: Date,
  keep: (d: DocumentRecord) => boolean,
): OrgTypeCard[] {
  const byType = groupBy(orgDocCards(party, products, documents, now, keep), (c) => c.docType)
  return [...byType.entries()]
    .map(([docType, cs]): OrgTypeCard => {
      const expired = cs.filter((c) => c.state === 'expired').length
      const expiring = cs.filter((c) => c.state === 'expiring').length
      // `cs` est déjà trié par urgence (orgDocCards) → la 1re pièce datée est la plus pressée du type.
      const next = cs.find((c) => c.daysLeft != null)
      return {
        docType,
        total: cs.length,
        valid: cs.length - expired - expiring,
        expiring,
        expired,
        state: expired ? 'expired' : expiring ? 'expiring' : 'valid',
        nextProductName: next?.productName,
        nextDaysLeft: next?.daysLeft ?? undefined,
      }
    })
    .sort(
      (a, b) =>
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        b.total - a.total ||
        a.docType.localeCompare(b.docType),
    )
}

/**
 * **Justificatifs** = toutes les pièces jointes échangées dans les correspondances des dossiers
 * liés à l'organisation (factures, quittances, décharges de dépôt…). Dédoublonnées par chemin
 * Storage (une même pièce peut être renvoyée dans plusieurs messages). `id` synthétique `corr:PATH`
 * → réutilise la vignette/aperçu des documents (bucket `documents` unique, download par chemin).
 */
export function orgJustificatifCards(
  party: PartyRecord,
  products: ProductRecord[],
  dossiers: DossierRecord[],
  correspondences: CorrespondenceRecord[],
  messages: CorrespondenceMessageRecord[],
): OrgPieceCard[] {
  const productIds = new Set(productsForParty(party.id, products).map((p) => p.id))
  const nameById = new Map(products.map((p) => [p.id, p.nomCommercial]))
  // Dossiers actifs des produits liés → produit ; puis correspondances actives de ces dossiers.
  const dossierProduct = new Map(
    dossiers
      .filter((d) => isActive(d) && productIds.has(d.productId))
      .map((d) => [d.id, d.productId]),
  )
  const corrProduct = new Map<string, string>()
  for (const c of correspondences) {
    if (isActive(c) && dossierProduct.has(c.dossierId)) {
      corrProduct.set(c.id, dossierProduct.get(c.dossierId)!)
    }
  }
  const seen = new Set<string>()
  const cards: OrgPieceCard[] = []
  for (const m of messages) {
    const pid = corrProduct.get(m.correspondenceId)
    if (!pid) continue
    for (const a of m.attachments ?? []) {
      if (seen.has(a.path)) continue
      seen.add(a.path)
      cards.push({
        id: `corr:${a.path}`,
        fileName: a.name,
        filePath: a.path,
        size: a.size,
        productName: nameById.get(pid) ?? '—',
        docType: 'justificatif',
        createdAt: m.createdAt,
        expiryDate: null,
        daysLeft: null,
        state: 'valid',
      })
    }
  }
  return cards.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.fileName.localeCompare(b.fileName),
  )
}

/** Ordre d'affichage canonique des rôles (titulaire d'abord). */
export const ROLE_ORDER: PartyRole[] = ['titulaire', 'fabricant', 'distributeur', 'agent']

export function sortRoles(roles: PartyRole[]): PartyRole[] {
  return [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
}
