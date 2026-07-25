import {
  agencyFor,
  officialLanguage,
  regulatoryProfileFor,
} from '@/features/workspace/roadmap-data'
import type { Lang, Translatable } from '@/lib/i18n-context'
import {
  AdminApiError,
  type RefCurrentEntry,
  type RefDraftEntryInput,
  type RefEntryFull,
  type RefVersionRow,
} from './admin-api'

/**
 * Logique PURE de l'éditeur de brouillon du référentiel (onglet god « Référentiel », P4.4) :
 * état plat de formulaire ↔ payloads jsonb (miroir EXACT du seed 0071), validation locale,
 * préremplissage depuis le contenu résolu courant. Séparée du composant pour les tests —
 * toute asymétrie sérialisation/désérialisation corromprait une entrée au simple rechargement.
 */

export type SectionKey = RefDraftEntryInput['section']

export const SECTION_LABEL: Record<SectionKey, Translatable> = {
  agency: { fr: 'Agence (destinataire)', en: 'Agency (recipient)' },
  fees: { fr: 'Redevances', en: 'Fees' },
  submission: { fr: 'Modalités de dépôt', en: 'Filing procedure' },
  samples: { fr: 'Échantillons', en: 'Samples' },
}

/** Codes d'erreur Edge → message actionnable (le générique cache la cause, revue #417 m4). */
const REF_ERROR_LABEL: Record<string, Translatable> = {
  label_taken: {
    fr: 'Ce libellé de version existe déjà.',
    en: 'This version label already exists.',
  },
  not_a_draft: {
    fr: 'Cette version n’est plus un brouillon (publiée entre-temps ?) — rechargez.',
    en: 'This version is no longer a draft (published meanwhile?) — reload.',
  },
  not_found: {
    fr: 'Ce brouillon n’existe plus — rechargez.',
    en: 'This draft no longer exists — reload.',
  },
  provenance_required: {
    fr: 'Provenance obligatoire : citez le texte officiel de chaque entrée.',
    en: 'Provenance required: cite the official text for every entry.',
  },
  payload_ineffective: {
    fr: 'Une entrée est vide (aucun contenu ne serait rendu) — complétez-la ou retirez-la.',
    en: 'An entry is empty (nothing would render) — fill it in or remove it.',
  },
  empty_version: {
    fr: 'Version vide : ajoutez au moins une entrée.',
    en: 'Empty version: add at least one entry.',
  },
  effective_date_backdated: {
    fr: 'La date d’effet ne peut pas précéder la version déjà applicable — la date du décret se cite dans la provenance, pas ici.',
    en: 'The effective date cannot precede the currently applicable version — the decree date belongs in the provenance, not here.',
  },
  actor_without_org: {
    fr: 'Votre compte n’appartient à aucune organisation : trace d’audit impossible.',
    en: 'Your account belongs to no organisation: no audit trail possible.',
  },
  too_large: {
    fr: 'Contenu trop volumineux pour une entrée.',
    en: 'Content too large for an entry.',
  },
}
export const refErrorLabel = (err: unknown, fallback: Translatable): Translatable =>
  (err instanceof AdminApiError ? REF_ERROR_LABEL[err.code] : undefined) ?? fallback

/** Brouillon d'entrée — état PLAT de formulaire, sérialisé en payload jsonb à l'enregistrement. */
export interface DraftEntry {
  country: string
  section: SectionKey
  // fees
  feeNewMa: string
  feeRenewal: string
  feeVarMin: string
  feeVarMaj: string
  currency: string
  processingDays: string
  noteNewMaFr: string
  noteNewMaEn: string
  noteRenewalFr: string
  noteRenewalEn: string
  noteVariationFr: string
  noteVariationEn: string
  // agency
  agName: string
  agFull: string
  agDirecteur: string
  agSexe: 'M' | 'F'
  agAdresse: string
  agTel: string
  agEmail: string
  agLang: string
  // submission
  subFr: string
  subEn: string
  // samples — « une exigence par ligne », FR/EN appariés par index
  samplesNewMaFr: string
  samplesNewMaEn: string
  samplesRenewFr: string
  samplesRenewEn: string
  reserveFr: string
  reserveEn: string
  // provenance (OBLIGATOIRE : texte)
  provTexte: string
  provJo: string
  provComplements: string
}

// `\s` couvre déjà les espaces insécables (fine incluse) des montants collés depuis un texte.
const num = (s: string): number | undefined => {
  const n = Number(s.replace(/\s/g, ''))
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}
const lines = (s: string): string[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const pair = (fr: string, en: string): Translatable[] | undefined => {
  const f = lines(fr)
  const e = lines(en)
  if (f.length === 0) return undefined
  return f.map((t, i) => ({ fr: t, en: e[i] ?? t }))
}
const tOpt = (fr: string, en: string): Translatable | undefined =>
  fr.trim() && en.trim() ? { fr: fr.trim(), en: en.trim() } : undefined

/** Clé de la carte du contenu résolu courant (`admin_ref_overview.current`). */
export const currentKey = (country: string, section: string) => `${country}|${section}`
export type CurrentMap = Map<string, RefCurrentEntry>

/** Entrée préremplie depuis le SOCLE code — repli quand rien n'est publié pour ce couple. */
function soclePrefill(country: string, section: SectionKey): DraftEntry {
  const ag = agencyFor(country)
  const p = regulatoryProfileFor(country)
  const t = (v: Translatable | undefined) => ({ fr: v?.fr ?? '', en: v?.en ?? '' })
  const joinT = (v: Translatable[] | undefined, l: Lang) => (v ?? []).map((x) => x[l]).join('\n')
  return {
    country,
    section,
    feeNewMa: p?.fees.new_ma != null ? String(p.fees.new_ma) : '',
    feeRenewal: p?.fees.renewal != null ? String(p.fees.renewal) : '',
    feeVarMin: p?.fees.variation_minor != null ? String(p.fees.variation_minor) : '',
    feeVarMaj: p?.fees.variation_major != null ? String(p.fees.variation_major) : '',
    currency: p?.currency ?? 'FCFA',
    processingDays: p?.processingDays != null ? String(p.processingDays) : '',
    noteNewMaFr: t(p?.fees.notes?.new_ma).fr,
    noteNewMaEn: t(p?.fees.notes?.new_ma).en,
    noteRenewalFr: t(p?.fees.notes?.renewal).fr,
    noteRenewalEn: t(p?.fees.notes?.renewal).en,
    noteVariationFr: t(p?.fees.notes?.variation).fr,
    noteVariationEn: t(p?.fees.notes?.variation).en,
    agName: ag.name,
    agFull: ag.full,
    agDirecteur: ag.directeur,
    agSexe: ag.sexe,
    agAdresse: ag.adresse,
    agTel: ag.telephone ?? '',
    agEmail: ag.email ?? '',
    agLang: officialLanguage(country),
    subFr: p?.submissionNote?.fr ?? '',
    subEn: p?.submissionNote?.en ?? '',
    samplesNewMaFr: joinT(p?.samples.new_ma, 'fr'),
    samplesNewMaEn: joinT(p?.samples.new_ma, 'en'),
    samplesRenewFr: joinT(p?.samples.renewal_variation, 'fr'),
    samplesRenewEn: joinT(p?.samples.renewal_variation, 'en'),
    reserveFr: p?.samples.reserve?.fr ?? '',
    reserveEn: p?.samples.reserve?.en ?? '',
    provTexte: '',
    provJo: '',
    provComplements: '',
  }
}

/** Superpose un payload jsonb (entrée serveur OU contenu résolu courant) sur un état plat. */
function applyPayload(base: DraftEntry, section: SectionKey, payload: unknown): DraftEntry {
  const p = (payload ?? {}) as Record<string, unknown>
  const s = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
  const n = (v: unknown) => (typeof v === 'number' ? String(v) : '')
  const tr = (v: unknown): { fr: string; en: string } => {
    const o = (v ?? {}) as Record<string, unknown>
    return { fr: s(o.fr), en: s(o.en) }
  }
  const list = (v: unknown, l: 'fr' | 'en') =>
    Array.isArray(v) ? v.map((x) => tr(x)[l]).join('\n') : ''
  const out: DraftEntry = { ...base }
  if (section === 'agency') {
    out.agName = s(p.name)
    out.agFull = s(p.full)
    out.agDirecteur = s(p.directeur)
    // Une valeur inattendue ne s'invente pas une civilité : repli sur le socle (revue #417 m6).
    out.agSexe = p.sexe === 'F' ? 'F' : p.sexe === 'M' ? 'M' : base.agSexe
    out.agAdresse = s(p.adresse)
    out.agTel = s(p.telephone)
    out.agEmail = s(p.email)
    out.agLang = s(p.officialLang, 'fr')
  } else if (section === 'fees') {
    const fees = (p.fees ?? {}) as Record<string, unknown>
    const notes = (fees.notes ?? {}) as Record<string, unknown>
    out.feeNewMa = n(fees.new_ma)
    out.feeRenewal = n(fees.renewal)
    out.feeVarMin = n(fees.variation_minor)
    out.feeVarMaj = n(fees.variation_major)
    out.currency = s(p.currency, 'FCFA')
    out.processingDays = n(p.processingDays)
    out.noteNewMaFr = tr(notes.new_ma).fr
    out.noteNewMaEn = tr(notes.new_ma).en
    out.noteRenewalFr = tr(notes.renewal).fr
    out.noteRenewalEn = tr(notes.renewal).en
    out.noteVariationFr = tr(notes.variation).fr
    out.noteVariationEn = tr(notes.variation).en
  } else if (section === 'submission') {
    out.subFr = tr(p.note).fr
    out.subEn = tr(p.note).en
  } else if (section === 'samples') {
    const sm = (p.samples ?? {}) as Record<string, unknown>
    out.samplesNewMaFr = list(sm.new_ma, 'fr')
    out.samplesNewMaEn = list(sm.new_ma, 'en')
    out.samplesRenewFr = list(sm.renewal_variation, 'fr')
    out.samplesRenewEn = list(sm.renewal_variation, 'en')
    out.reserveFr = tr(sm.reserve).fr
    out.reserveEn = tr(sm.reserve).en
  }
  return out
}

/**
 * Entrée préremplie depuis le CONTENU RÉSOLU COURANT (dernière version publiée applicable),
 * repli socle : préremplir du socle quand une v2 est publiée reviendrait à ANNULER v2 en
 * silence à la publication suivante (revue #417 M2). La provenance reste VIDE à dessein :
 * une nouvelle version cite SA source, jamais celle de la précédente par inertie.
 */
export function prefillEntry(
  country: string,
  section: SectionKey,
  current?: CurrentMap,
): DraftEntry {
  const base = soclePrefill(country, section)
  const cur = current?.get(currentKey(country, section))
  return cur ? applyPayload(base, section, cur.payload) : base
}

/** Sérialise l'état plat → payload jsonb par section (miroir EXACT des payloads du seed 0071). */
export function toPayload(e: DraftEntry): unknown {
  switch (e.section) {
    case 'agency':
      return {
        name: e.agName.trim(),
        full: e.agFull.trim(),
        directeur: e.agDirecteur.trim(),
        sexe: e.agSexe,
        adresse: e.agAdresse.trim(),
        ...(e.agTel.trim() ? { telephone: e.agTel.trim() } : {}),
        ...(e.agEmail.trim() ? { email: e.agEmail.trim() } : {}),
        officialLang: e.agLang,
      }
    case 'fees': {
      const fees: Record<string, unknown> = {}
      const put = (k: string, v: number | undefined) => {
        if (v !== undefined) fees[k] = v
      }
      put('new_ma', num(e.feeNewMa))
      put('renewal', num(e.feeRenewal))
      put('variation_minor', num(e.feeVarMin))
      put('variation_major', num(e.feeVarMaj))
      const notes: Record<string, Translatable> = {}
      const n1 = tOpt(e.noteNewMaFr, e.noteNewMaEn)
      const n2 = tOpt(e.noteRenewalFr, e.noteRenewalEn)
      const n3 = tOpt(e.noteVariationFr, e.noteVariationEn)
      if (n1) notes.new_ma = n1
      if (n2) notes.renewal = n2
      if (n3) notes.variation = n3
      if (Object.keys(notes).length > 0) fees.notes = notes
      return {
        currency: e.currency.trim() || 'FCFA',
        fees,
        ...(num(e.processingDays) !== undefined ? { processingDays: num(e.processingDays) } : {}),
      }
    }
    case 'submission':
      return { note: { fr: e.subFr.trim(), en: e.subEn.trim() } }
    case 'samples':
      return {
        samples: {
          ...(pair(e.samplesNewMaFr, e.samplesNewMaEn)
            ? { new_ma: pair(e.samplesNewMaFr, e.samplesNewMaEn) }
            : {}),
          ...(pair(e.samplesRenewFr, e.samplesRenewEn)
            ? { renewal_variation: pair(e.samplesRenewFr, e.samplesRenewEn) }
            : {}),
          ...(tOpt(e.reserveFr, e.reserveEn) ? { reserve: tOpt(e.reserveFr, e.reserveEn) } : {}),
        },
      }
  }
}

/** Erreur de validation LOCALE d'une entrée (l'Edge re-vérifie tout) — null si publiable. */
export function entryError(e: DraftEntry): Translatable | null {
  if (e.provTexte.trim().length < 3)
    return {
      fr: 'Provenance obligatoire : citez le texte officiel (n° de décret/arrêté, date).',
      en: 'Provenance required: cite the official text (decree/order number, date).',
    }
  // Un montant SAISI mais illisible serait silencieusement OMIS du payload — refuser vaut
  // mieux que publier « 1,2 million » comme absence de montant (revue #417 m9).
  if (
    e.section === 'fees' &&
    [e.feeNewMa, e.feeRenewal, e.feeVarMin, e.feeVarMaj, e.processingDays].some(
      (v) => v.trim() !== '' && num(v) === undefined,
    )
  )
    return {
      fr: 'Montant illisible : chiffres uniquement (espaces admis).',
      en: 'Unreadable amount: digits only (spaces allowed).',
    }
  if (e.section === 'fees' && num(e.feeNewMa) === undefined && num(e.feeRenewal) === undefined)
    return { fr: 'Redevances : au moins un montant.', en: 'Fees: at least one amount.' }
  if (e.section === 'agency' && !e.agName.trim() && !e.agFull.trim())
    return { fr: 'Agence : sigle ou dénomination requis.', en: 'Agency: name required.' }
  if (e.section === 'submission' && (!e.subFr.trim() || !e.subEn.trim()))
    return { fr: 'Dépôt : note FR et EN requises.', en: 'Filing: FR and EN notes required.' }
  if (e.section === 'samples' && lines(e.samplesNewMaFr).length !== lines(e.samplesNewMaEn).length)
    return {
      fr: 'Échantillons : FR et EN doivent avoir le même nombre de lignes.',
      en: 'Samples: FR and EN must have the same number of lines.',
    }
  return null
}

/** Désérialise une entrée serveur → état plat (rechargement d'un brouillon existant). */
export function fromServerEntry(row: RefEntryFull): DraftEntry {
  const prov = (row.provenance ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const section = row.section as SectionKey
  const out = applyPayload(soclePrefill(row.country, section), section, row.payload)
  out.provTexte = s(prov.texte)
  out.provJo = s(prov.jo)
  out.provComplements = s(prov.complements)
  return out
}

/** Prochain libellé proposé : « vAAAA.N » → « vAAAA.N+1 » (année courante, plafond 999 = regex). */
export function nextLabel(versions: RefVersionRow[]): string {
  const year = new Date().getFullYear()
  const nums = versions
    .map((v) => /^v(\d{4})\.(\d{1,3})$/.exec(v.label))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) === year)
    .map((m) => Number(m[2]))
  return `v${year}.${nums.length > 0 ? Math.min(999, Math.max(...nums) + 1) : 1}`
}
