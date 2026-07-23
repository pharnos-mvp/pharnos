import { expiringDocs, expiryTone, type KpiTone } from '@/features/dashboard/dashboard-data'
import type { DocumentRecord, PartyRecord, PartyRole, ProductRecord } from '@/lib/db'

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

/** Produits liés + leurs documents actifs (périmètre RA d'une organisation). */
function orgScope(
  partyId: string,
  products: ProductRecord[],
  documents: DocumentRecord[],
): { linked: ProductRecord[]; docs: DocumentRecord[] } {
  const linked = productsForParty(partyId, products)
  const ids = new Set(linked.map((p) => p.id))
  const docs = documents.filter((d) => isActive(d) && ids.has(d.productId))
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

/** Validité agrégée d'un type de pièce dans le périmètre d'une organisation. */
export interface PieceTypeValidity {
  docType: string
  /** Pièces de ce type dans le périmètre (datées OU NON — une pièce sans date n'est pas en défaut). */
  total: number
  valid: number
  expiring: number
  expired: number
  tone: KpiTone
  /** Pièce la plus urgente (datée) du type ; négatif = périmée. */
  next?: { expiryDate: string; daysLeft: number; productName: string }
}

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
  /** Validité par type de pièce, des plus urgentes aux plus saines. */
  pieces: PieceTypeValidity[]
}

// Ordre d'urgence (plus petit = plus urgent). `expiryTone` ne renvoie que good/passable/poor ;
// les autres valeurs de KpiTone complètent le type.
const toneRank: Record<KpiTone, number> = { poor: 0, fair: 1, passable: 2, neutral: 3, good: 4 }

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
  const expByType = groupBy(exp, (i) => i.docType)

  // Validité par type sur TOUS les documents du type — pas seulement les datés : une pièce sans
  // date n'est pas en défaut (même règle que le taux de conformité), et surtout le total doit
  // correspondre à la page dédiée, sinon la ligne « 2/3 à jour » ouvre une page de 5 pièces.
  const byType = groupBy(docs, (d) => d.docType)
  const pieces: PieceTypeValidity[] = [...byType.entries()]
    .map(([docType, ds]) => {
      const items = expByType.get(docType) ?? []
      const expired = items.filter((i) => i.daysLeft <= 0).length
      const next = items[0]
      return {
        docType,
        total: ds.length,
        valid: ds.length - items.length,
        expiring: items.length - expired,
        expired,
        tone: expiryTone(items),
        next: next
          ? { expiryDate: next.expiryDate, daysLeft: next.daysLeft, productName: next.productName }
          : undefined,
      }
    })
    .sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || b.total - a.total)

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
    pieces,
  }
}

/** Une pièce de l'organisation, telle qu'affichée en carte sur la page dédiée à un type. */
export interface OrgPieceCard {
  id: string
  fileName: string
  filePath: string | null
  size: number
  productName: string
  expiryDate: string | null
  /** Jours restants (négatif = périmé) ; `null` si la pièce n'est pas datée. */
  daysLeft: number | null
  state: 'valid' | 'expiring' | 'expired'
}

const STATE_RANK: Record<OrgPieceCard['state'], number> = { expired: 0, expiring: 1, valid: 2 }

/**
 * Pièces d'un TYPE donné pour une organisation → cartes de la page dédiée.
 *
 * L'état vient de la **même** source que le panneau de validité (`expiringDocs`, politique Monitor
 * unique) : la page ne peut donc pas contredire la carte sur laquelle on vient de cliquer. Tri par
 * urgence (périmées, puis à renouveler, puis valides), les plus pressées d'abord.
 */
export function orgPieceCards(
  party: PartyRecord,
  products: ProductRecord[],
  documents: DocumentRecord[],
  docType: string,
  now: Date,
): OrgPieceCard[] {
  const { linked, docs } = orgScope(party.id, products, documents)
  const nameById = new Map(linked.map((p) => [p.id, p.nomCommercial]))
  const inWindow = new Set(expiringDocs(docs, linked, now).map((i) => i.id))
  return docs
    .filter((d) => d.docType === docType)
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

/** Ordre d'affichage canonique des rôles (titulaire d'abord). */
export const ROLE_ORDER: PartyRole[] = ['titulaire', 'fabricant', 'distributeur']

export function sortRoles(roles: PartyRole[]): PartyRole[] {
  return [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
}
