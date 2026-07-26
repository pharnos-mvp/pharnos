import {
  CTD_ACTIVITY_CODES,
  deltaFromPayload,
  deltasFor,
  findByNumber,
  structureDeltaIssues,
  isStructureReset,
  structureFromPayload,
  structureIsInert,
  type CtdDelta,
  type CtdDeltaIssue,
  type CtdDeltaKind,
} from '@/features/catalogue/ref-structure'
import { getModule1Tree } from '@/features/workspace/module1-tree'
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
  ctd_structure: { fr: 'Structure du Module 1', en: 'Module 1 structure' },
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
  /** Identité de LIGNE (jamais publiée) — clé React stable : `key={index}` recyclait le nœud DOM
   *  d'une entrée supprimée et déplaçait la saisie en cours sur une autre entrée. */
  id: string
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
  // ctd_structure — deltas d'arborescence du Module 1 (P4.5)
  deltas: DraftDelta[]
  /** ABROGATION : ce pays revient à l'arborescence de référence (aucun écart national). */
  structureReset: boolean
  // provenance (OBLIGATOIRE : texte)
  provTexte: string
  provJo: string
  provComplements: string
}

/**
 * Un delta de structure en cours de saisie. `format: ''` = les deux formats ; `activities: []` =
 * toutes les activités SAUF la variation (l'arbre de variation est opt-in — sa numérotation est
 * homonyme sans être synonyme, cf. `deltasFor`).
 */
export interface DraftDelta {
  /** Identité de LIGNE (jamais publiée) : `key={index}` réutilisait le nœud DOM d'une ligne
   *  supprimée, déplaçant le curseur du god sur une autre valeur en pleine saisie. */
  id: string
  kind: CtdDeltaKind
  number: string
  label: string
  note: string
  format: '' | 'ctd' | 'ectd'
  activities: string[]
}

export const newDelta = (): DraftDelta => ({
  id: crypto.randomUUID(),
  kind: 'remove',
  number: '',
  label: '',
  note: '',
  format: '',
  activities: [],
})

/** État de saisie → delta canonique (`undefined` si le contrat le refuserait). */
export function draftToDelta(d: DraftDelta): CtdDelta | undefined {
  const activities = [...new Set(d.activities)]
  return deltaFromPayload({
    kind: d.kind,
    number: d.number,
    ...(d.label.trim() ? { label: d.label } : {}),
    ...(d.note.trim() ? { note: d.note } : {}),
    ...(d.format ? { format: d.format } : {}),
    ...(activities.length > 0 ? { activities } : {}),
  })
}

/**
 * Activités RÉELLEMENT touchées par un delta, **format par format** — ce que l'éditeur affiche au
 * god pour qu'il le voie au lieu de le deviner.
 *
 * Le détail par format n'est pas du zèle : l'exception M4 vise l'ARBRE de variation (CTD UEMOA),
 * pas l'étiquette d'activité. En eCTD, une variation est montée sur l'arbre standard — un delta
 * non scopé l'atteint donc bel et bien. Une portée agrégée (« variation exclue ») serait fausse
 * pour la moitié des dossiers.
 */
export function deltaScopeByFormat(
  d: CtdDelta,
): { format: 'ctd' | 'ectd'; activities: string[] }[] {
  const formats: ('ctd' | 'ectd')[] = d.format ? [d.format] : ['ctd', 'ectd']
  return formats
    .map((format) => ({
      format,
      activities: CTD_ACTIVITY_CODES.filter((a) => deltasFor([d], format, a).length > 0),
    }))
    .filter((s) => s.activities.length > 0)
}

/** `malformed` = le contrat partagé refuserait ce delta ; sinon, le verdict d'effet réel. */
export type DraftDeltaIssue = CtdDeltaIssue | 'malformed'

/**
 * Problème BLOQUANT ? Tout ce qui est inerte ne se vaut pas :
 * - `no_change` (redondance, doublon) : même arbre sans la ligne — un AVIS. Bloquer interdirait
 *   au god un geste légitime (revenir au libellé du socle = retirer la ligne) et ferait échouer
 *   l'enregistrement du brouillon ENTIER, tous pays confondus (B1, revue P4.5b).
 * - `masked` : le nœud a déjà été emporté par une autre ligne. Pour un `remove`, c'est le décret
 *   qui cite le chapitre ET sa sous-section — inoffensif, donc un avis. Pour un `add`, c'est une
 *   contradiction dans l'entrée (on ajoute sous ce qu'on retire) : le god doit trancher.
 * - `unknown_node` / `orphan` / `malformed` : coquille de saisie — bloquant.
 */
export const isBlockingDeltaIssue = (
  i: DraftDeltaIssue | null | undefined,
  kind?: CtdDeltaKind,
): boolean => {
  if (i == null || i === 'no_change') return false
  if (i === 'masked') return kind === 'add'
  return true
}

/**
 * Problème de chaque delta d'une entrée, **index par index** (`null` = produit un effet quelque
 * part). Les malformés sont écartés du calcul d'effet mais gardent leur place : un tableau
 * décalé rattacherait le message d'erreur à la mauvaise ligne de l'éditeur.
 */
export function draftDeltaIssues(entry: DraftEntry): (DraftDeltaIssue | null)[] {
  const canonical = entry.deltas.map(draftToDelta)
  const valid = canonical.filter((d): d is CtdDelta => d !== undefined)
  const issues = structureDeltaIssues(valid, getModule1Tree)
  let i = 0
  return canonical.map((d) => (d === undefined ? 'malformed' : (issues[i++] ?? null)))
}

/** Deltas ACTUELLEMENT publiés pour ce pays (base de comparaison de l'inertie d'une entrée). */
const publishedDeltas = (country: string, current?: CurrentMap): CtdDelta[] =>
  structureFromPayload(current?.get(currentKey(country, 'ctd_structure'))?.payload) ?? []

/**
 * Nombre de SOUS-SECTIONS emportées par un retrait (0 pour une feuille).
 *
 * Le contrat interdit de retirer une branche de 1er niveau, mais « retirer 1.2.6 » emporte quand
 * même ses deux nœuds AMM. Aucun document n'est perdu (l'auto-classement remonte sur l'ancêtre
 * survivant) — reste que le god doit le voir AVANT de publier, pas le découvrir chez un client.
 */
export function removedSubtreeCount(d: CtdDelta): number {
  if (d.kind !== 'remove') return 0
  const count = (n: { children?: { children?: unknown[] }[] }): number =>
    (n.children ?? []).reduce((acc, c) => acc + 1 + count(c as never), 0)
  let max = 0
  for (const format of ['ctd', 'ectd'] as const) {
    for (const activity of CTD_ACTIVITY_CODES) {
      if (deltasFor([d], format, activity).length === 0) continue
      const node = findByNumber(getModule1Tree(format, activity), d.number)
      if (node) max = Math.max(max, count(node))
    }
  }
  return max
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

/**
 * Carte du contenu courant, mémoïsée sur l'IDENTITÉ du tableau source.
 *
 * Elle ne peut pas vivre dans un `useMemo` : le composant retourne tôt (chargement, erreur) et un
 * hook après un `return` conditionnel est interdit. Or la validation de structure fait des calculs
 * d'arbre à chaque frappe — une carte reconstruite à chaque rendu invaliderait tout en aval.
 */
const CURRENT_MAP_CACHE = new WeakMap<RefCurrentEntry[], CurrentMap>()
export function currentMapOf(rows: RefCurrentEntry[]): CurrentMap {
  const hit = CURRENT_MAP_CACHE.get(rows)
  if (hit) return hit
  const map: CurrentMap = new Map(rows.map((c) => [currentKey(c.country, c.section), c]))
  CURRENT_MAP_CACHE.set(rows, map)
  return map
}

/** Entrée préremplie depuis le SOCLE code — repli quand rien n'est publié pour ce couple. */
function soclePrefill(country: string, section: SectionKey): DraftEntry {
  const ag = agencyFor(country)
  const p = regulatoryProfileFor(country)
  const t = (v: Translatable | undefined) => ({ fr: v?.fr ?? '', en: v?.en ?? '' })
  const joinT = (v: Translatable[] | undefined, l: Lang) => (v ?? []).map((x) => x[l]).join('\n')
  return {
    id: crypto.randomUUID(),
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
    // Le socle n'a PAS de deltas : il EST l'arborescence de référence. Une entrée neuve part donc
    // d'une liste vide ; le contenu déjà publié, lui, arrive par `prefillEntry` (contenu courant).
    deltas: [],
    structureReset: false,
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
  } else if (section === 'ctd_structure') {
    out.structureReset = isStructureReset(payload)
    // Deltas NORMALISÉS (ce que le client applique vraiment), jamais le jsonb brut : un delta que
    // le résolveur ignore ne doit pas se rouvrir dans l'éditeur comme s'il était en vigueur.
    out.deltas = (structureFromPayload(payload) ?? []).map((d) => ({
      id: crypto.randomUUID(),
      kind: d.kind,
      number: d.number,
      label: d.label ?? '',
      note: d.note ?? '',
      format: d.format ?? '',
      activities: d.activities ?? [],
    }))
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
    case 'ctd_structure':
      // Abrogation : marqueur EXPLICITE + liste vide. Une liste vide seule serait indistinguable
      // d'un oubli (et refusée comme telle des deux côtés).
      if (e.structureReset) return { reset: true, deltas: [] }
      // Sérialisation via le NORMALISEUR partagé : le payload publié est, à l'octet près, ce que
      // le résolveur relira (champs vides omis, numéro trimé) — aucun aller-retour ne dérive.
      return {
        deltas: e.deltas.map(draftToDelta).filter((d): d is CtdDelta => d !== undefined),
      }
  }
}

/**
 * Erreur de validation LOCALE d'une entrée (l'Edge re-vérifie tout) — null si publiable.
 *
 * `current` (contenu résolu en vigueur) sert la section `ctd_structure` : sans lui, impossible de
 * savoir qu'une entrée re-déclare simplement ce qui est déjà publié. Absent = « rien n'est publié ».
 */
export function entryError(e: DraftEntry, current?: CurrentMap): Translatable | null {
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
  if (e.section === 'ctd_structure') {
    if (e.structureReset) {
      // Abroger ce qui n'existe pas = publier du néant. Le test d'inertie ci-dessous le dirait
      // aussi, mais le message serait obscur pour un god qui vient de cocher la case.
      if (publishedDeltas(e.country, current).length === 0)
        return {
          fr: 'Aucun écart national n’est publié pour ce pays : il n’y a rien à abroger.',
          en: 'No national deviation is published for this country: there is nothing to repeal.',
        }
      return null
    }
    if (e.deltas.length === 0)
      return {
        fr: 'Structure : ajoutez au moins un changement de nœud (ou cochez « revenir à l’arborescence de référence »).',
        en: 'Structure: add at least one node change (or tick “return to the reference tree”).',
      }
    // Le contrat serveur ne peut PAS vérifier qu'un numéro existe (l'arborescence vit dans le
    // bundle web). C'est donc ICI, avant l'enregistrement, qu'un delta fautif est arrêté —
    // sinon il se publie, se fait adopter, et ne change rien nulle part (règle ⑤ du mockup).
    const issues = draftDeltaIssues(e)
    for (const [i, issue] of issues.entries()) {
      if (!isBlockingDeltaIssue(issue, e.deltas[i]?.kind)) continue
      // Repère de la ligne fautive : les deltas n'ont pas d'autre nom que leur rang et leur numéro.
      return DELTA_ISSUE_LABEL[issue!](`#${i + 1} ${e.deltas[i]?.number.trim() || '—'}`)
    }
    // Inertie de l'ENTRÉE : le payload REMPLACE celui de la version précédente. Une entrée qui
    // re-déclare l'existant est bien formée, ligne à ligne effective… et ne change rien pour
    // personne. Sans ce test, la cloche sonne chez tous les clients pour du néant.
    const next = e.deltas.map(draftToDelta).filter((d): d is CtdDelta => d !== undefined)
    if (structureIsInert(next, publishedDeltas(e.country, current), getModule1Tree))
      return {
        fr: 'Cette entrée produirait exactement l’arborescence déjà en vigueur pour ce pays : publier annoncerait une mise à jour sans effet.',
        en: 'This entry would produce exactly the tree already in force for this country: publishing would announce an update with no effect.',
      }
  }
  return null
}

/** Message actionnable par problème de delta — partagé entre la validation et l'éditeur. */
export const DELTA_ISSUE_LABEL: Record<DraftDeltaIssue, (at: string) => Translatable> = {
  malformed: (at) => ({
    fr: `Delta ${at} : incomplet (numéro CTD attendu ; libellé requis pour un ajout/renommage ; un retrait vise un nœud de 3 niveaux minimum).`,
    en: `Delta ${at}: incomplete (CTD number expected; label required for add/rename; a removal targets a 3-level node at minimum).`,
  }),
  unknown_node: (at) => ({
    fr: `Delta ${at} : ce numéro n’existe dans aucune arborescence visée — il ne changerait rien. Vérifiez le numéro ou la portée.`,
    en: `Delta ${at}: this number exists in none of the targeted trees — it would change nothing. Check the number or the scope.`,
  }),
  orphan: (at) => ({
    fr: `Delta ${at} : le nœud parent n’existe pas, l’ajout serait ignoré. Publiez d’abord le parent.`,
    en: `Delta ${at}: the parent node does not exist, the addition would be ignored. Publish the parent first.`,
  }),
  masked: (at) => ({
    fr: `Delta ${at} : ce nœud est déjà emporté par une autre ligne de cette entrée — cette ligne n’ajoute rien (un ajout sous un nœud retiré, lui, ne montera jamais).`,
    en: `Delta ${at}: this node is already carried away by another line in this entry — this line adds nothing (an addition under a removed node will never mount).`,
  }),
  // AVIS, pas faute : la retirer donne le même arbre. Le « pourquoi » compte — un god qui veut
  // revenir au libellé du socle doit comprendre que le geste est de SUPPRIMER la ligne, parce que
  // le payload remplace la version précédente au lieu de s'y ajouter.
  no_change: (at) => ({
    fr: `Delta ${at} : sans effet sur l’arborescence (valeur déjà en vigueur, ligne en double, ou annulée par une autre ligne). Vous pouvez la retirer : ce contenu REMPLACE la version précédente, il ne s’y ajoute pas.`,
    en: `Delta ${at}: no effect on the tree (value already in force, duplicate line, or cancelled by another line). You may remove it: this content REPLACES the previous version, it does not add to it.`,
  }),
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
