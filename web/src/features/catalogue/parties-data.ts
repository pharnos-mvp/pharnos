import type { DocumentRecord, PartyRecord, ProductRecord, PartyRole } from '@/lib/db'

/**
 * Vue agrégée d'une organisation (`parties`) pour la liste/fiche : combien de produits et de
 * documents en dépendent, et dans quels pays. Répond à la consigne CEO « dire exactement le nombre
 * de produits / activités / docs par org ». Pur (aucune dépendance UI) → testable et réutilisable.
 */
export interface OrgRow {
  party: PartyRecord
  /** Produits actifs liés (rôle titulaire OU fabricant). */
  productCount: number
  /** Documents actifs rattachés aux produits liés. */
  docCount: number
  /** Pays (AMM) distincts des produits liés. */
  countries: string[]
}

/** Produits actifs liés à une organisation (titulaire ou fabricant). */
export function productsForParty(partyId: string, products: ProductRecord[]): ProductRecord[] {
  return products.filter(
    (p) => p.deletedAt === null && (p.titulaireId === partyId || p.fabricantId === partyId),
  )
}

/** Agrège produits + documents par organisation active, triées par nom (ordre stable). */
export function buildOrgRows(
  parties: PartyRecord[],
  products: ProductRecord[],
  documents: DocumentRecord[],
): OrgRow[] {
  const activeDocs = documents.filter((d) => d.deletedAt === null)
  return parties
    .filter((p) => p.deletedAt === null)
    .map((party) => {
      const linked = productsForParty(party.id, products)
      const linkedIds = new Set(linked.map((p) => p.id))
      const docs = activeDocs.filter((d) => linkedIds.has(d.productId))
      const countries = [
        ...new Set(docs.map((d) => d.country?.trim()).filter((c): c is string => !!c)),
      ].sort()
      return { party, productCount: linked.length, docCount: docs.length, countries }
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

/** Ordre d'affichage canonique des rôles (titulaire d'abord). */
export const ROLE_ORDER: PartyRole[] = ['titulaire', 'fabricant', 'distributeur']

export function sortRoles(roles: PartyRole[]): PartyRole[] {
  return [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
}
