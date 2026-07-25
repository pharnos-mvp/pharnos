import {
  agencyCivilite,
  agencyFor,
  officialLanguage,
  type AgencyInfo,
  type RegulatoryProfile,
} from '@/features/workspace/roadmap-data'
import {
  db,
  type DocumentRecord,
  type DossierRecord,
  type RefEntryRecord,
  type RefVersionRecord,
} from '@/lib/db'
import type { Translatable } from '@/lib/i18n-context'
import {
  authorityDetail,
  buildAuthorityRows,
  type AuthorityDetail,
  type AuthorityRow,
} from './authorities-data'
import {
  entriesForCountry,
  isPlainObject,
  loadRefState,
  SECTIONS,
  upTo,
  type SectionKey,
} from './ref-state'

/** Provenance d'une entrée du référentiel — la source officielle citée. Seuls `texte`,
 *  `complements` et `jo` sont rendus ; `note`/`pdf_path` restent internes (curation). */
export interface RefProvenance {
  texte?: string
  complements?: string
  jo?: string
  note?: string
  pdf_path?: string
}

type FeeKey = 'new_ma' | 'renewal' | 'variation_minor' | 'variation_major'

/** Libellés des redevances — source unique (fiche Autorité + diff d'adoption). */
export const FEE_LABEL: Record<FeeKey, Translatable> = {
  new_ma: { fr: 'Nouvelle AMM', en: 'New MA' },
  renewal: { fr: 'Renouvellement', en: 'Renewal' },
  variation_minor: { fr: 'Variation mineure', en: 'Minor variation' },
  variation_major: { fr: 'Variation majeure', en: 'Major variation' },
}
/** Libellés des notes de barème (cas particuliers), clés alignées sur `fees.notes`. */
export const FEE_NOTE_LABEL: Record<'new_ma' | 'renewal' | 'variation', Translatable> = {
  new_ma: FEE_LABEL.new_ma,
  renewal: FEE_LABEL.renewal,
  variation: { fr: 'Variations', en: 'Variations' },
}

export interface ResolvedAuthority {
  detail: AuthorityDetail
  /** Provenance par section, renseignée quand la valeur vient du référentiel publié. */
  provenance: Partial<Record<SectionKey, RefProvenance>>
  /** Version du référentiel qui fournit le contenu ; null = socle code seul (hors-ligne, vide). */
  versionLabel: string | null
}

// ─── Normalisation défensive des payloads jsonb ───────────────────────────────────────────────
// Le contenu est publié par le God dashboard (humain) : un payload malformé ne doit JAMAIS
// casser la fiche (TypeError → ErrorBoundary = fiche inutilisable pour TOUS les clients jusqu'à
// republication) ni rendre un objet brut. Toute valeur non conforme retombe sur le socle code.

const isObj = isPlainObject
const strOr = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const strOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const isTranslatable = (v: unknown): v is Translatable =>
  isObj(v) && typeof v.fr === 'string' && typeof v.en === 'string'
const translatableList = (v: unknown): Translatable[] | undefined =>
  Array.isArray(v) ? v.filter(isTranslatable) : undefined

function agencyFromPayload(payload: unknown): (AgencyInfo & { officialLang?: string }) | undefined {
  if (!isObj(payload)) return undefined
  const name = strOr(payload.name)
  const full = strOr(payload.full)
  if (!name && !full) return undefined // entrée vide/malformée → socle code
  return {
    name,
    full,
    directeur: strOr(payload.directeur),
    sexe: payload.sexe === 'F' ? 'F' : 'M',
    adresse: strOr(payload.adresse),
    telephone: strOrUndef(payload.telephone),
    email: strOrUndef(payload.email),
    officialLang: strOrUndef(payload.officialLang),
  }
}

export const FEE_KEYS = ['new_ma', 'renewal', 'variation_minor', 'variation_major'] as const
export const FEE_NOTE_KEYS = ['new_ma', 'renewal', 'variation'] as const

function feesFromPayload(
  payload: unknown,
): { currency?: string; fees: RegulatoryProfile['fees']; processingDays?: number } | undefined {
  if (!isObj(payload) || !isObj(payload.fees)) return undefined
  const fees: RegulatoryProfile['fees'] = {}
  for (const k of FEE_KEYS) {
    const n = numOrUndef(payload.fees[k])
    if (n !== undefined) fees[k] = n
  }
  if (isObj(payload.fees.notes)) {
    const notes: NonNullable<RegulatoryProfile['fees']['notes']> = {}
    for (const k of FEE_NOTE_KEYS) {
      const note = payload.fees.notes[k]
      if (isTranslatable(note)) notes[k] = note
    }
    if (Object.keys(notes).length > 0) fees.notes = notes
  }
  if (Object.keys(fees).length === 0) return undefined // aucun montant valide → socle code
  return {
    currency: strOrUndef(payload.currency),
    fees,
    processingDays: numOrUndef(payload.processingDays),
  }
}

function submissionFromPayload(payload: unknown): Translatable | undefined {
  return isObj(payload) && isTranslatable(payload.note) ? payload.note : undefined
}

function samplesFromPayload(payload: unknown): RegulatoryProfile['samples'] | undefined {
  if (!isObj(payload) || !isObj(payload.samples)) return undefined
  const s = payload.samples
  const out: RegulatoryProfile['samples'] = {
    new_ma: translatableList(s.new_ma),
    renewal_variation: translatableList(s.renewal_variation),
    reserve: isTranslatable(s.reserve) ? s.reserve : undefined,
  }
  if (!out.new_ma?.length && !out.renewal_variation?.length && !out.reserve) return undefined
  return out
}

/**
 * Résolution PURE d'une fiche Autorité à partir d'un ensemble de versions AUTORISÉES : la
 * section d'une version plus applicable masque celle d'une version antérieure (packs
 * cumulatifs), et tout ce qui manque retombe sur le socle code (`authorityDetail`).
 * `null` = pays inconnu des deux sources.
 */
export function resolveAuthority(
  code: string,
  entries: RefEntryRecord[],
  allowed: RefVersionRecord[],
  rank: Map<string, number>,
): ResolvedAuthority | null {
  const fallback = authorityDetail(code)
  const byId = new Map(allowed.map((v) => [v.id, v]))

  const picked = new Map<SectionKey, { entry: RefEntryRecord; version: RefVersionRecord }>()
  for (const entry of entries) {
    if (!SECTIONS.includes(entry.section as SectionKey)) continue // section non rendue (P4.5…)
    const version = byId.get(entry.versionId)
    if (!version) continue // brouillon / orpheline / effet futur / au-dessus du plafond adopté
    const key = entry.section as SectionKey
    const current = picked.get(key)
    if (!current || rank.get(entry.versionId)! > rank.get(current.entry.versionId)!) {
      picked.set(key, { entry, version })
    }
  }

  const asFallback = (): ResolvedAuthority | null =>
    fallback ? { detail: fallback, provenance: {}, versionLabel: null } : null

  if (picked.size === 0) return asFallback()

  const provenance: Partial<Record<SectionKey, RefProvenance>> = {}
  const used: RefVersionRecord[] = []
  const take = <T>(key: SectionKey, value: T | undefined): T | undefined => {
    // Une section ne compte (badge, provenance) que si son payload a produit une valeur valide.
    if (value === undefined) return undefined
    const p = picked.get(key)!
    if (isObj(p.entry.provenance)) provenance[key] = p.entry.provenance as RefProvenance
    used.push(p.version)
    return value
  }

  const agency = take('agency', agencyFromPayload(picked.get('agency')?.entry.payload))
  const feesPart = take('fees', feesFromPayload(picked.get('fees')?.entry.payload))
  const submissionNote = take(
    'submission',
    submissionFromPayload(picked.get('submission')?.entry.payload),
  )
  const samples = take('samples', samplesFromPayload(picked.get('samples')?.entry.payload))

  const mergedAgency: AgencyInfo | undefined = agency ?? fallback?.agency
  if (!mergedAgency || used.length === 0) return asFallback()

  // Le profil réglementaire se reconstruit dès qu'UNE section « exigences » vient du référentiel ;
  // chaque morceau manquant retombe sur le socle code du pays (profil partiel possible).
  let profile = fallback?.profile
  if (feesPart || submissionNote || samples) {
    profile = {
      currency: feesPart?.currency ?? fallback?.profile?.currency ?? 'FCFA',
      fees: feesPart?.fees ?? fallback?.profile?.fees ?? {},
      processingDays: feesPart?.processingDays ?? fallback?.profile?.processingDays,
      submissionNote: submissionNote ?? fallback?.profile?.submissionNote,
      samples: samples ?? fallback?.profile?.samples ?? {},
    }
  }

  const latest = [...used].sort((a, b) => rank.get(b.id)! - rank.get(a.id)!)[0]

  return {
    detail: {
      code,
      agency: mergedAgency,
      civilite: agencyCivilite(mergedAgency),
      officialLang: agency?.officialLang ?? fallback?.officialLang ?? 'fr',
      profile,
    },
    provenance,
    versionLabel: latest?.label ?? null,
  }
}

/**
 * Fiche Autorité telle qu'elle s'applique à l'ORG : contenu résolu au PLAFOND ADOPTÉ (P4.2).
 * `null` = pays inconnu des deux sources (distinct du `undefined` de chargement d'`useLiveQuery`).
 */
export async function resolvedAuthorityDetail(
  code: string,
  orgId: string,
): Promise<ResolvedAuthority | null> {
  const [state, entries] = await Promise.all([loadRefState(orgId), entriesForCountry(code)])
  const allowed = state.ceiling ? upTo(state, state.rank.get(state.ceiling.id)!) : []
  return resolveAuthority(code, entries, allowed, state.rank)
}

/**
 * Bloc « agence destinataire » résolu — LE point d'entrée des consommateurs non-fiche (lettres,
 * aperçus, wizard, P4.4-pré) : agence + civilité + langue de soumission, au plafond adopté de
 * l'org, ou sous la version ÉPINGLÉE d'un dossier quand `refVersionId` est fourni. Ne renvoie
 * jamais null : pays inconnu des deux sources → générique du socle code (comportement historique
 * d'`agencyFor`).
 */
export interface ResolvedAgencyBlock {
  agency: AgencyInfo
  civilite: string
  officialLang: string
}

export async function resolvedAgencyBlock(
  country: string,
  orgId: string,
  refVersionId?: string | null,
): Promise<ResolvedAgencyBlock> {
  const r =
    refVersionId !== undefined
      ? await resolvedAuthorityDetailAtVersion(country, orgId, refVersionId)
      : await resolvedAuthorityDetail(country, orgId)
  if (r) {
    return {
      agency: r.detail.agency,
      civilite: r.detail.civilite,
      officialLang: r.detail.officialLang,
    }
  }
  const agency = agencyFor(country)
  return { agency, civilite: agencyCivilite(agency), officialLang: officialLanguage(country) }
}

/**
 * Lookup pays → { agence, langue } résolu au PLAFOND de l'org, construit UNE fois par live-query —
 * pour les surfaces LISTE (boîte de réception, recherche) où un hook par ligne est impossible.
 * Repli code pour tout pays sans contenu publié.
 */
export async function loadRefCountryLookup(
  orgId: string,
): Promise<(country: string) => { agency: AgencyInfo; officialLang: string }> {
  const state = await loadRefState(orgId)
  const ceilingRank = state.ceiling ? state.rank.get(state.ceiling.id)! : -1
  const allowed = new Set(upTo(state, ceilingRank).map((v) => v.id))
  const best = new Map<string, { rank: number; agency: AgencyInfo & { officialLang?: string } }>()
  for (const e of await db.refEntries.toArray()) {
    if (e.section !== 'agency' || !allowed.has(e.versionId)) continue
    const agency = agencyFromPayload(e.payload)
    if (!agency) continue
    const rank = state.rank.get(e.versionId)!
    const cur = best.get(e.country)
    if (!cur || rank > cur.rank) best.set(e.country, { rank, agency })
  }
  return (country) => {
    const hit = best.get(country)
    return hit
      ? { agency: hit.agency, officialLang: hit.agency.officialLang ?? officialLanguage(country) }
      : { agency: agencyFor(country), officialLang: officialLanguage(country) }
  }
}

/**
 * Lignes du référentiel « Autorités » RÉSOLUES au plafond de l'org (P4.4-pré) : le socle code
 * (liste curée + empreinte RA) OVERLAYÉ par le contenu publié — noms/langue à jour, badge
 * « Barème » reflétant le contenu résolu, et pays servis par le SEUL référentiel (future
 * publication god) ajoutés en fin de liste.
 */
export async function resolvedAuthorityRows(
  orgId: string,
  dossiers: DossierRecord[],
  documents: DocumentRecord[],
): Promise<AuthorityRow[]> {
  const rows = buildAuthorityRows(dossiers, documents)
  const known = new Set(rows.map((r) => r.code))
  const lookup = await loadRefCountryLookup(orgId)
  const state = await loadRefState(orgId)
  const ceilingRank = state.ceiling ? state.rank.get(state.ceiling.id)! : -1
  const allowed = new Set(upTo(state, ceilingRank).map((v) => v.id))

  // Pays « en propre » du référentiel + sections barème valides (badge « Barème » honnête).
  const dbCountries = new Set<string>()
  const dbFees = new Set<string>()
  for (const e of await db.refEntries.toArray()) {
    if (!allowed.has(e.versionId)) continue
    if (e.section === 'agency' && agencyFromPayload(e.payload)) dbCountries.add(e.country)
    if (e.section === 'fees' && feesFromPayload(e.payload)) dbFees.add(e.country)
  }

  const overlaid = rows.map((r) => {
    const { agency, officialLang } = lookup(r.code)
    return { ...r, agency, officialLang, hasProfile: r.hasProfile || dbFees.has(r.code) }
  })
  const activeDossiers = dossiers.filter((d) => d.deletedAt == null)
  const activeAmm = documents.filter((d) => d.deletedAt == null && d.docType === 'amm')
  const added = [...dbCountries]
    .filter((code) => !known.has(code))
    .sort()
    .map((code) => ({
      code,
      agency: lookup(code).agency,
      officialLang: lookup(code).officialLang,
      hasProfile: dbFees.has(code),
      dossierCount: activeDossiers.filter((d) => d.country === code).length,
      ammCount: activeAmm.filter((d) => d.country?.trim() === code).length,
    }))
  return [...overlaid, ...added]
}

/**
 * Fiche Autorité telle qu'elle s'appliquait SOUS UNE VERSION DONNÉE — pour un dossier ÉPINGLÉ
 * (P4.2b) : un dossier déposé est une photographie opposable, il garde le barème de la version
 * avec laquelle il a été monté. Version inconnue localement → socle code (repli sûr).
 */
export async function resolvedAuthorityDetailAtVersion(
  code: string,
  orgId: string,
  versionId: string | null,
): Promise<ResolvedAuthority | null> {
  if (!versionId) return resolvedAuthorityDetail(code, orgId)
  const [state, entries] = await Promise.all([loadRefState(orgId), entriesForCountry(code)])
  // BORNÉ AU PLAFOND ADOPTÉ : `dossiers.ref_version_id` est une colonne cliente (RLS = rôles
  // éditeurs). Sans ce min, un éditeur non-admin pouvait y écrire l'id d'une version que son org
  // n'a PAS consentie et s'en servir le barème — contournement du gate « admin seul ». Le trigger
  // serveur `dossiers_ref_version_guard` (0074) est la ceinture ; ceci est la bretelle.
  const ceilingRank = state.ceiling ? state.rank.get(state.ceiling.id)! : -1
  const pinnedRank = state.rank.get(versionId)
  const maxRank = pinnedRank === undefined ? -1 : Math.min(pinnedRank, ceilingRank)
  return resolveAuthority(code, entries, maxRank < 0 ? [] : upTo(state, maxRank), state.rank)
}
