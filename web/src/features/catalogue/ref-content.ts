import {
  agencyCivilite,
  type AgencyInfo,
  type RegulatoryProfile,
} from '@/features/workspace/roadmap-data'
import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
import type { Translatable } from '@/lib/i18n-context'
import { authorityDetail, type AuthorityDetail } from './authorities-data'

/** Provenance d'une entrée du référentiel — la source officielle citée. Seuls `texte`,
 *  `complements` et `jo` sont rendus ; `note`/`pdf_path` restent internes (curation). */
export interface RefProvenance {
  texte?: string
  complements?: string
  jo?: string
  note?: string
  pdf_path?: string
}

type SectionKey = 'agency' | 'fees' | 'submission' | 'samples'
// Liste blanche : une section future (`ctd_structure`, P4.5) ne doit ni déplacer le badge de
// version ni polluer la provenance d'une fiche qui ne la rend pas.
const SECTIONS: readonly SectionKey[] = ['agency', 'fees', 'submission', 'samples']

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

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
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

const FEE_KEYS = ['new_ma', 'renewal', 'variation_minor', 'variation_major'] as const
const FEE_NOTE_KEYS = ['new_ma', 'renewal', 'variation'] as const

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

// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Résout la fiche Autorité d'un pays : contenu de la dernière version PUBLIÉE **et à date
 * d'effet atteinte** du référentiel (réplique locale de 0071), section par section, repli sur
 * le socle code (`authorityDetail`). Un décret publié en avance (effet au 01/01) ne s'applique
 * qu'à sa date — modèle MedDRA du plan §6. P4.1 : pas encore d'adoption par org ni d'overrides
 * (P4.2/P4.3), résolution « dernière publiée applicable > code ».
 *
 * `null` = pays inconnu des deux sources (l'appelant affiche « introuvable » ; distinct du
 * `undefined` de chargement renvoyé par `useLiveQuery`).
 */
export async function resolvedAuthorityDetail(code: string): Promise<ResolvedAuthority | null> {
  const fallback = authorityDetail(code)
  const today = new Date().toISOString().slice(0, 10)
  const [allVersions, allEntries] = await Promise.all([
    db.refVersions.toArray(),
    db.refEntries.where('[country+section]').between([code, ''], [code, '￿']).toArray(),
  ])
  // La RLS ne sert que du publié, mais la réplique locale peut en contenir d'autres (P4.4 :
  // l'admin god lira SES brouillons) — le statut et la date d'effet se re-filtrent ICI.
  const versions = allVersions.filter(
    (v) => v.status === 'published' && (!v.effectiveDate || v.effectiveDate <= today),
  )

  // Rang d'applicabilité : date d'effet (repli publication, repli création), départage par
  // label — déterministe même pour deux versions publiées dans la même transaction. La section
  // d'une version plus récente MASQUE celle d'une version antérieure (packs cumulatifs).
  const applicability = (v: RefVersionRecord) => v.effectiveDate ?? v.publishedAt ?? v.createdAt
  const rank = new Map(
    [...versions]
      .sort((a, b) => {
        const ka = applicability(a)
        const kb = applicability(b)
        if (ka !== kb) return ka < kb ? -1 : 1
        return a.label < b.label ? -1 : 1
      })
      .map((v, i) => [v.id, i] as const),
  )

  const picked = new Map<SectionKey, { entry: RefEntryRecord; version: RefVersionRecord }>()
  const byId = new Map(versions.map((v) => [v.id, v]))
  for (const entry of allEntries) {
    if (!SECTIONS.includes(entry.section as SectionKey)) continue // section non rendue (P4.5…)
    const version = byId.get(entry.versionId)
    if (!version) continue // brouillon/orpheline/date d'effet future → jamais servie
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

  const latest = used.sort((a, b) => rank.get(b.id)! - rank.get(a.id)!)[0]

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
