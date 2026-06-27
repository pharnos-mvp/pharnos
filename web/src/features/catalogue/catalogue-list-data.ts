import { expiryTone, type KpiTone } from '@/features/dashboard/dashboard-data'
import type { DocAnalysisRecord, DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'
import { productCockpitVm, productConformity } from './product-cockpit-data'

const active = <T extends { deletedAt?: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt == null)

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

export type AmmStatus = 'active' | 'expired' | 'none'

/**
 * Ligne de la liste Catalogue — agrégat de SANTÉ réglementaire par produit, dérivé PUR des
 * enregistrements locaux (zéro IA, zéro hallucination). Réutilise les sélecteurs de la fiche
 * cockpit (`productCockpitVm`, `productConformity`) → une seule source par métrique.
 */
export interface CatalogueRow {
  product: ProductRecord
  /** Codes pays distincts couverts (depuis les dossiers actifs du produit). */
  countries: string[]
  ammStatus: AmmStatus
  /** Pièces dans leur fenêtre de renouvellement. */
  expiringCount: number
  expiringTone: KpiTone
  /** Taux de conformité (% des documents analysés conformes) ; null si 0 analysé. */
  conformityPct: number | null
  nonConformCount: number
  hasExpiring: boolean
  hasNonConform: boolean
}

/** Construit les lignes de la liste (triées du plus récemment modifié au plus ancien). */
export function buildCatalogueRows(
  products: ProductRecord[],
  documents: DocumentRecord[],
  dossiers: DossierRecord[],
  docAnalysis: DocAnalysisRecord[],
  now: Date,
): CatalogueRow[] {
  const docsByProduct = groupBy(active(documents), (d) => d.productId)
  const dossiersByProduct = groupBy(active(dossiers), (d) => d.productId)
  return active(products)
    .map((p) => {
      const docs = docsByProduct.get(p.id) ?? []
      const dos = dossiersByProduct.get(p.id) ?? []
      const vm = productCockpitVm(p, docs, dos, now)
      const conf = productConformity(docs, docAnalysis)
      return {
        product: p,
        countries: vm.countries,
        ammStatus: vm.hasAmm ? (vm.ammActive ? 'active' : 'expired') : 'none',
        expiringCount: vm.expiring.length,
        expiringTone: vm.expiring.length > 0 ? expiryTone(vm.expiring) : 'good',
        conformityPct: conf.pct,
        nonConformCount: conf.nonConform,
        hasExpiring: vm.expiring.length > 0,
        hasNonConform: conf.nonConform > 0,
      } satisfies CatalogueRow
    })
    .sort((a, b) => b.product.updatedAt.localeCompare(a.product.updatedAt))
}

export type StatusFilter = 'all' | 'expiring' | 'nonconform'

export interface CatalogueFilters {
  /** Recherche plein-texte (nom / DCI / ATC / titulaire / fabricant / forme / classe). */
  q: string
  /** Code pays ISO ; '' = tous. */
  country: string
  status: StatusFilter
}

/** Applique recherche + filtre pays + filtre statut. Pur, ordre des lignes préservé. */
export function filterCatalogueRows(rows: CatalogueRow[], f: CatalogueFilters): CatalogueRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.country && !r.countries.includes(f.country)) return false
    if (f.status === 'expiring' && !r.hasExpiring) return false
    if (f.status === 'nonconform' && !r.hasNonConform) return false
    if (q) {
      const p = r.product
      const hay = [
        p.nomCommercial,
        p.dci,
        p.codeAtc,
        p.titulaire,
        p.fabricant,
        p.forme,
        p.classeTherapeutique,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Codes pays distincts présents dans les lignes (pour peupler le filtre pays). */
export function catalogueCountries(rows: CatalogueRow[]): string[] {
  return [...new Set(rows.flatMap((r) => r.countries))]
}
