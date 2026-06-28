import type { DocumentRecord, DossierRecord } from '@/lib/db'
import {
  agencyCivilite,
  listAgencies,
  officialLanguage,
  regulatoryProfileFor,
  type AgencyInfo,
  type RegulatoryProfile,
} from '@/features/workspace/roadmap-data'

/**
 * Ligne du référentiel « Autorités » (agences nationales du médicament). Données de RÉFÉRENCE
 * (curées, non-tenant, zéro migration) — réutilise `listAgencies`/`officialLanguage`/`regulatoryProfileFor`
 * du Workspace (source unique, déjà en prod pour les lettres) + l'empreinte RA de l'org (dossiers/AMM).
 */
export interface AuthorityRow {
  code: string
  agency: AgencyInfo
  /** Langue officielle de soumission ('fr' | 'en' | 'pt'). */
  officialLang: string
  /** Barème national (redevances/échantillons/délais) renseigné ? */
  hasProfile: boolean
  /** Mes dossiers (montages CTD) actifs ciblant ce pays. */
  dossierCount: number
  /** Mes AMM ENREGISTRÉES (non supprimées) dans ce pays — pas de filtre d'expiration ici. */
  ammCount: number
}

const isActive = <T extends { deletedAt?: string | null }>(r: T): boolean => r.deletedAt == null

/** Construit le référentiel des autorités + l'empreinte RA de l'org (dossiers + AMM par pays). */
export function buildAuthorityRows(
  dossiers: DossierRecord[],
  documents: DocumentRecord[],
): AuthorityRow[] {
  const activeDossiers = dossiers.filter(isActive)
  const activeAmm = documents.filter((d) => isActive(d) && d.docType === 'amm')
  return listAgencies().map(({ code, agency }) => ({
    code,
    agency,
    officialLang: officialLanguage(code),
    hasProfile: !!regulatoryProfileFor(code),
    dossierCount: activeDossiers.filter((d) => d.country === code).length,
    ammCount: activeAmm.filter((d) => d.country?.trim() === code).length,
  }))
}

/** Filtre plein-texte (sigle / nom complet / code) — insensible à la casse. */
export function filterAuthorityRows(rows: AuthorityRow[], q: string): AuthorityRow[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((r) =>
    [r.agency.name, r.agency.full, r.code].join(' ').toLowerCase().includes(needle),
  )
}

/** Détail d'une autorité : agence + civilité destinataire + langue + barème national éventuel. */
export interface AuthorityDetail {
  code: string
  agency: AgencyInfo
  civilite: string
  officialLang: string
  profile?: RegulatoryProfile
}

export function authorityDetail(code: string): AuthorityDetail | undefined {
  const found = listAgencies().find((a) => a.code === code)
  if (!found) return undefined
  return {
    code,
    agency: found.agency,
    civilite: agencyCivilite(found.agency),
    officialLang: officialLanguage(code),
    profile: regulatoryProfileFor(code),
  }
}
