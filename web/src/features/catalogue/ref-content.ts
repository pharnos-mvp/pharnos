import {
  agencyCivilite,
  type AgencyInfo,
  type RegulatoryProfile,
} from '@/features/workspace/roadmap-data'
import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
import { authorityDetail, type AuthorityDetail } from './authorities-data'

/** Provenance d'une entrée du référentiel — la source officielle citée (texte, JO…). */
export interface RefProvenance {
  texte?: string
  complements?: string
  jo?: string
  note?: string
}

type SectionKey = 'agency' | 'fees' | 'submission' | 'samples'

/** Payloads par section — écrits par le seed 0071 / le God dashboard (service role) uniquement :
 * la forme est contrôlée côté publication, le client se contente de casts défensifs. */
interface AgencyPayload extends AgencyInfo {
  officialLang?: string
}
interface FeesPayload {
  currency?: string
  fees?: RegulatoryProfile['fees']
  processingDays?: number
}
interface SubmissionPayload {
  note?: RegulatoryProfile['submissionNote']
}
interface SamplesPayload {
  samples?: RegulatoryProfile['samples']
}

export interface ResolvedAuthority {
  detail: AuthorityDetail
  /** Provenance par section, renseignée quand la valeur vient du référentiel publié. */
  provenance: Partial<Record<SectionKey, RefProvenance>>
  /** Version du référentiel qui fournit le contenu ; null = socle code seul (hors-ligne, vide). */
  versionLabel: string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Résout la fiche Autorité d'un pays : contenu de la DERNIÈRE version PUBLIÉE du référentiel
 * (réplique locale de 0071, section par section), repli sur le socle code (`authorityDetail`).
 * P4.1 — pas encore d'adoption par org ni d'overrides (P4.2/P4.3) : résolution
 * « dernière publiée > code ». `undefined` = pays inconnu des deux sources.
 */
export async function resolvedAuthorityDetail(
  code: string,
): Promise<ResolvedAuthority | undefined> {
  const fallback = authorityDetail(code)
  const [versions, entries] = await Promise.all([
    db.refVersions.toArray(),
    db.refEntries.where('[country+section]').between([code, ''], [code, '￿']).toArray(),
  ])

  // Rang de fraîcheur d'une version : date de publication (repli création). La section d'une
  // version plus récente MASQUE celle d'une version antérieure — modèle « packs » cumulatifs.
  const rank = new Map(
    [...versions]
      .sort((a, b) => (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt))
      .map((v, i) => [v.id, i] as const),
  )
  const byId = new Map(versions.map((v) => [v.id, v]))

  const picked = new Map<SectionKey, { entry: RefEntryRecord; version: RefVersionRecord }>()
  for (const entry of entries) {
    const version = byId.get(entry.versionId)
    if (!version || !rank.has(entry.versionId)) continue // entrée orpheline (réplique partielle)
    const key = entry.section as SectionKey
    const current = picked.get(key)
    if (!current || rank.get(entry.versionId)! > rank.get(current.entry.versionId)!) {
      picked.set(key, { entry, version })
    }
  }

  if (picked.size === 0) {
    return fallback ? { detail: fallback, provenance: {}, versionLabel: null } : undefined
  }

  const agencyPayload = picked.get('agency')?.entry.payload as AgencyPayload | undefined
  const agency: AgencyInfo | undefined = isObj(agencyPayload)
    ? {
        name: agencyPayload.name ?? '',
        full: agencyPayload.full ?? '',
        directeur: agencyPayload.directeur ?? '',
        sexe: agencyPayload.sexe === 'F' ? 'F' : 'M',
        adresse: agencyPayload.adresse ?? '',
        telephone: agencyPayload.telephone,
        email: agencyPayload.email,
      }
    : fallback?.agency
  if (!agency)
    return fallback ? { detail: fallback, provenance: {}, versionLabel: null } : undefined

  const feesPayload = picked.get('fees')?.entry.payload as FeesPayload | undefined
  const submissionPayload = picked.get('submission')?.entry.payload as SubmissionPayload | undefined
  const samplesPayload = picked.get('samples')?.entry.payload as SamplesPayload | undefined

  // Le profil réglementaire se reconstruit dès qu'UNE section « exigences » vient du référentiel ;
  // chaque morceau manquant retombe sur le socle code du pays (profil partiel possible).
  let profile = fallback?.profile
  if (feesPayload || submissionPayload || samplesPayload) {
    profile = {
      currency: feesPayload?.currency ?? fallback?.profile?.currency ?? 'FCFA',
      fees: feesPayload?.fees ?? fallback?.profile?.fees ?? {},
      processingDays: feesPayload?.processingDays ?? fallback?.profile?.processingDays,
      submissionNote: submissionPayload?.note ?? fallback?.profile?.submissionNote,
      samples: samplesPayload?.samples ?? fallback?.profile?.samples ?? {},
    }
  }

  const provenance: Partial<Record<SectionKey, RefProvenance>> = {}
  for (const [key, { entry }] of picked) {
    if (isObj(entry.provenance)) provenance[key] = entry.provenance as RefProvenance
  }

  // La version affichée = la plus récente parmi les sections réellement utilisées.
  const used = [...picked.values()].map(({ version }) => version)
  const latest = used.sort((a, b) => rank.get(b.id)! - rank.get(a.id)!)[0]

  return {
    detail: {
      code,
      agency,
      civilite: agencyCivilite(agency),
      officialLang: agencyPayload?.officialLang ?? fallback?.officialLang ?? 'fr',
      profile,
    },
    provenance,
    versionLabel: latest?.label ?? null,
  }
}
