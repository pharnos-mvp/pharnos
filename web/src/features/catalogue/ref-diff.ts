import { db, type RefVersionRecord } from '@/lib/db'
import type { Lang, Translatable } from '@/lib/i18n-context'
import {
  FEE_KEYS,
  FEE_LABEL,
  FEE_NOTE_KEYS,
  FEE_NOTE_LABEL,
  resolveAuthority,
  type RefProvenance,
  type ResolvedAuthority,
} from './ref-content'
import { overridesByCountry } from './ref-overrides'
import {
  entriesForCountry,
  isPlainObject as isObj,
  loadRefState,
  upTo,
  type SectionKey,
} from './ref-state'

/**
 * Diff d'adoption — ce qu'une version du référentiel CHANGERAIT, champ par champ (P4.2).
 *
 * Module SÉPARÉ de `ref-content` À DESSEIN : le résolveur est chargé par l'entrée de l'app (cloche
 * + Dashboard lisent `pendingRefUpdate`), alors que ce diff ne sert qu'à l'ouverture d'un dialog
 * (fiche Autorité, Roadmap) — le garder ici le laisse dans les chunks de route et préserve le
 * budget du bundle d'entrée (`npm run budget`).
 */

export interface RefDiffRow {
  country: string
  section: SectionKey
  field: Translatable
  /** Valeur sous la version actuellement appliquée à l'org ('' = champ absent avant). */
  before: string
  /** Valeur sous la version candidate ('' = champ retiré). */
  after: string
}

/**
 * Champ que la version candidate MODIFIE mais que l'org a ADAPTÉ (0077) : il ne changera pas à
 * l'adoption. Annoncé à part — le mettre dans `rows` ferait croire à l'admin que ses courriers
 * vont changer de destinataire, alors que sa valeur locale gagne (et c'est le contrat P4.3).
 */
export interface RefKeptRow {
  country: string
  field: Translatable
  /** Ce que la nouvelle version propose officiellement. */
  official: string
  /** Ce que l'org continuera d'utiliser. */
  local: string
}

export interface RefUpdatePreview {
  target: RefVersionRecord
  /** Version actuellement appliquée à l'org (libellé), null si aucune. */
  ceilingLabel: string | null
  rows: RefDiffRow[]
  /** Champs adaptés localement que cette version NE changera PAS (P4.3). */
  kept: RefKeptRow[]
  /** Sources citées par les entrées entrantes, dédupliquées (bloc « Source officielle »). */
  sources: RefProvenance[]
}

const money = (n: number | undefined, currency: string, lang: Lang): string =>
  n === undefined ? '' : `${n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} ${currency}`

/** Aplatit une fiche résolue en champs comparables (clé stable → libellé + valeur affichable). */
function fieldsOf(
  r: ResolvedAuthority | null,
  lang: Lang,
): Map<string, { section: SectionKey; field: Translatable; value: string }> {
  const out = new Map<string, { section: SectionKey; field: Translatable; value: string }>()
  if (!r) return out
  const t = (v: Translatable) => (lang === 'en' ? v.en : v.fr)
  const { agency, profile } = r.detail
  const put = (key: string, section: SectionKey, field: Translatable, value: string) => {
    if (value) out.set(key, { section, field, value })
  }

  put('agency.name', 'agency', { fr: 'Agence', en: 'Agency' }, agency.name)
  put('agency.full', 'agency', { fr: 'Dénomination', en: 'Full name' }, agency.full)
  put(
    'agency.directeur',
    'agency',
    { fr: 'Destinataire des lettres', en: 'Letter recipient' },
    [r.detail.civilite, agency.directeur].filter(Boolean).join(' — '),
  )
  put('agency.adresse', 'agency', { fr: 'Adresse', en: 'Address' }, agency.adresse)
  put('agency.telephone', 'agency', { fr: 'Téléphone', en: 'Phone' }, agency.telephone ?? '')
  put('agency.email', 'agency', { fr: 'E-mail', en: 'Email' }, agency.email ?? '')

  if (profile) {
    const cur = profile.currency
    for (const k of FEE_KEYS)
      put(`fees.${k}`, 'fees', FEE_LABEL[k], money(profile.fees[k], cur, lang))
    for (const k of FEE_NOTE_KEYS) {
      const note = profile.fees.notes?.[k]
      if (note) {
        put(
          `fees.notes.${k}`,
          'fees',
          { fr: `Précisions — ${FEE_NOTE_LABEL[k].fr}`, en: `Notes — ${FEE_NOTE_LABEL[k].en}` },
          t(note),
        )
      }
    }
    put(
      'fees.processingDays',
      'fees',
      { fr: 'Délai indicatif', en: 'Indicative timeline' },
      profile.processingDays === undefined
        ? ''
        : `${profile.processingDays} ${lang === 'en' ? 'days' : 'jours'}`,
    )
    if (profile.submissionNote) {
      put(
        'submission.note',
        'submission',
        { fr: 'Modalités de dépôt', en: 'Filing procedure' },
        t(profile.submissionNote),
      )
    }
    const lines = [
      ...(profile.samples.new_ma ?? []),
      ...(profile.samples.renewal_variation ?? []),
    ].map(t)
    put('samples.lines', 'samples', { fr: 'Échantillons', en: 'Samples' }, lines.join(' · '))
    if (profile.samples.reserve) {
      put(
        'samples.reserve',
        'samples',
        { fr: 'Réserve (échantillons)', en: 'Reservation (samples)' },
        t(profile.samples.reserve),
      )
    }
  }
  return out
}

/**
 * Prépare le dialog de consentement : ce que l'adoption de `targetVersionId` CHANGERAIT pour
 * l'org, champ par champ (avant/après), avec les sources officielles citées. Compare la fiche
 * résolue au plafond actuel à la fiche résolue au plafond candidat, pour chaque pays touché par
 * les versions entrantes. `null` si la version est inconnue/déjà appliquée.
 */
export async function refUpdatePreview(
  orgId: string,
  targetVersionId: string,
  lang: Lang,
  opts?: {
    /** Point de départ du diff (défaut : version appliquée par l'org). Un dossier ÉPINGLÉ compare
     *  depuis SA version — c'est le dialog de bascule de la Roadmap (P4.2b). */
    fromVersionId?: string | null
    /** Restreint le diff à un pays (fiche/dossier d'un seul pays). */
    country?: string
  },
): Promise<RefUpdatePreview | null> {
  const state = await loadRefState(orgId)
  const targetRank = state.rank.get(targetVersionId)
  const target = state.versions.find((v) => v.id === targetVersionId)
  if (targetRank === undefined || !target) return null
  const fromId = opts?.fromVersionId ?? state.ceiling?.id ?? null
  const fromRank = fromId ? (state.rank.get(fromId) ?? -1) : -1
  if (targetRank <= fromRank) return null // déjà appliquée

  const incoming = state.versions.filter((v) => {
    const r = state.rank.get(v.id)!
    return r > fromRank && r <= targetRank
  })
  const incomingEntries = (
    await db.refEntries
      .where('versionId')
      .anyOf(incoming.map((v) => v.id))
      .toArray()
  ).filter((e) => !opts?.country || e.country === opts.country)

  const before = upTo(state, fromRank)
  const after = upTo(state, targetRank)
  const overridesAll = await overridesByCountry(orgId)
  const rows: RefDiffRow[] = []
  const kept: RefKeptRow[] = []
  for (const country of [...new Set(incomingEntries.map((e) => e.country))].sort()) {
    const entries = await entriesForCountry(country)
    // Le diff se lit sur le contenu OFFICIEL des deux côtés (c'est bien lui qui change), mais un
    // champ ADAPTÉ par l'org ne bougera PAS à l'adoption : l'annoncer comme « avant → après »
    // serait un mensonge actif (l'admin croirait ses lettres redirigées). On le sort du diff et on
    // l'annonce explicitement comme CONSERVÉ.
    const adaptedPaths = new Set([...(overridesAll.get(country) ?? new Map()).keys()])
    const a = fieldsOf(resolveAuthority(country, entries, before, state.rank), lang)
    const b = fieldsOf(resolveAuthority(country, entries, after, state.rank), lang)
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const av = a.get(key)
      const bv = b.get(key)
      if (av?.value === bv?.value) continue
      const meta = bv ?? av!
      if (adaptedPaths.has(key)) {
        kept.push({
          country,
          field: meta.field,
          official: bv?.value ?? '',
          local: (overridesAll.get(country)?.get(key)?.value ?? '') as string,
        })
        continue
      }
      rows.push({
        country,
        section: meta.section,
        field: meta.field,
        before: av?.value ?? '',
        after: bv?.value ?? '',
      })
    }
  }

  // Sources dédupliquées sur le texte cité (une même source couvre plusieurs sections).
  const seen = new Set<string>()
  const sources: RefProvenance[] = []
  for (const e of incomingEntries) {
    if (!isObj(e.provenance)) continue
    const p = e.provenance as RefProvenance
    if (!p.texte || seen.has(p.texte)) continue
    seen.add(p.texte)
    sources.push(p)
  }

  return {
    target,
    ceilingLabel: state.versions.find((v) => v.id === fromId)?.label ?? null,
    rows,
    kept,
    sources,
  }
}
