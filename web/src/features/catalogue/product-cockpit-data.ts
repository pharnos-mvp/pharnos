import { expiringDocs, type ExpiryItem } from '@/features/dashboard/dashboard-data'
import type { DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'

export interface ProductCockpitVm {
  /** Codes pays distincts couverts (depuis les dossiers actifs). */
  countries: string[]
  /** Pièces dans leur fenêtre de renouvellement (échéance par type). */
  expiring: ExpiryItem[]
  /** Le produit a au moins une pièce AMM. */
  hasAmm: boolean
  /** AMM active = au moins une AMM non expirée (sans date d'expiration = considérée active). */
  ammActive: boolean
}

/**
 * Vue de la fiche produit-cockpit — dérivée PURE des enregistrements (attendus actifs).
 * Aucune dépendance React : unit-testable. Réutilise le sélecteur d'expirations du dashboard.
 */
export function productCockpitVm(
  product: ProductRecord,
  documents: DocumentRecord[],
  dossiers: DossierRecord[],
  now: Date,
): ProductCockpitVm {
  const countries = [...new Set(dossiers.map((d) => d.country).filter(Boolean))]
  const expiring = expiringDocs(documents, [product], now)
  const ammDocs = documents.filter((d) => d.docType === 'amm')
  const ammActive =
    ammDocs.length > 0 && ammDocs.some((d) => !d.expiryDate || new Date(d.expiryDate) >= now)
  return { countries, expiring, hasAmm: ammDocs.length > 0, ammActive }
}
