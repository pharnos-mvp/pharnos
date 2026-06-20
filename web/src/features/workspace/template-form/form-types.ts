// Types du moteur de FORMULAIRES de templates officiels (RCP, Notice, Étiquetage) — portés
// des gabarits HTML du CEO (RCP_formulaire_interactif.html, Notice_patient_interactive.html)
// et du template PDF ABMed Étiquetage 2026. Un formulaire = un MODEL déclaratif de blocs ;
// le rendu écran, la persistance TipTap et les exports DOCX/PDF itèrent le même MODEL.
import type { ProductRecord } from '@/lib/db'
import type { Lang } from '@/lib/i18n-context'

/**
 * Résolution bilingue ADDITIVE des libellés de template (jalon Bibliothèque) : le FR reste la
 * source verbatim (champs `text`/`ph`/… inchangés → rendu/export FR intacts) ; l'anglais est porté
 * en champs jumeaux optionnels (`textEn`/`phEn`/…). On résout EN si demandé ET disponible, sinon
 * repli FR (jamais de trou). EN aligné SmPC/MedDRA, porté verbatim des gabarits `RA-source/`.
 */
export function fieldText(fr: string, en: string | undefined, lang: Lang): string {
  return lang === 'en' && en ? en : fr
}
export function fieldList(fr: string[], en: string[] | undefined, lang: Lang): string[] {
  return lang === 'en' && en && en.length === fr.length ? en : fr
}

/** Réglages GLOBAUX du document (gabarit Notice) : appliqués à tous les textes dynamiques. */
export interface FormGlobals {
  /** Verbe employé dans toute la notice : « prendre » ou « utiliser ». */
  verb: 'prendre' | 'utiliser'
  /** Professionnels de santé mentionnés (« votre médecin, votre pharmacien ou votre infirmier/ère »). */
  hcp: { medecin: boolean; pharmacien: boolean; infirmier: boolean }
}

export const DEFAULT_GLOBALS: FormGlobals = {
  verb: 'prendre',
  hcp: { medecin: true, pharmacien: true, infirmier: false },
}

/** Texte fixe ou résolu depuis les réglages globaux. */
export type DynText = string | ((g: FormGlobals) => string)

export function resolveText(t: DynText | undefined, g: FormGlobals): string {
  return typeof t === 'function' ? t(g) : (t ?? '')
}

/**
 * Résolution bilingue d'un texte DYNAMIQUE (gabarit Notice) : EN résolu si demandé ET disponible,
 * sinon repli FR (jamais de trou). Mirror de `fieldText` pour les blocs à `DynText`/fonctions.
 */
export function fieldDyn(fr: DynText, en: DynText | undefined, lang: Lang, g: FormGlobals): string {
  // `en` truthy (cohérent avec `fieldText`) : une fonction est toujours truthy ; un `''` retombe en FR.
  return resolveText(lang === 'en' && en ? en : fr, g)
}

/** Idem pour une LISTE dynamique (puces) : EN seulement si même longueur, sinon repli FR. */
export function fieldDynList(
  fr: DynText[],
  en: DynText[] | undefined,
  lang: Lang,
  g: FormGlobals,
): string[] {
  const src = lang === 'en' && en && en.length === fr.length ? en : fr
  return src.map((t) => resolveText(t, g))
}

/* ----------------------------- Blocs de structure (jamais saisissables) ----------------------------- */

/** Titres et mentions officiels — texte fixe. `banner` : bandeau gris du template Étiquetage. */
export interface StaticBlock {
  type: 'title' | 'sec' | 'sub' | 'subsub' | 'static' | 'banner'
  text: string
  /** Équivalent EN (SmPC/MedDRA), porté verbatim — repli sur `text` si absent. */
  textEn?: string
}

export interface RuleBlock {
  type: 'rule'
}

/** Titre/paragraphe DYNAMIQUE : résolu depuis les réglages globaux (verbe, professionnels). */
export interface DynBlock {
  type: 'dyn' | 'secDyn' | 'subDyn'
  dynText: (g: FormGlobals) => string
  /** Équivalent EN (EMA QRD/MedDRA) — repli sur `dynText` si absent. */
  dynTextEn?: (g: FormGlobals) => string
}

/** Liste à puces de mentions officielles (toujours exportée — gabarit Notice : l'encadré). */
export interface BulletsBlock {
  type: 'bullets'
  items: DynText[]
  /** Équivalents EN (même longueur/ordre que `items`) — repli FR si absent/incohérent. */
  itemsEn?: DynText[]
}

/* ----------------------------- Blocs saisissables ----------------------------- */

/** Champ d'une ligne. `label`/`suffix` inline (« Tél. : », « °C… ») ; `narrow` : champ court. */
export interface LineBlock {
  type: 'line'
  key: string
  ph: string
  phEn?: string
  label?: string
  labelEn?: string
  suffix?: string
  suffixEn?: string
  narrow?: boolean
  /** Rendu/export seulement si la case `dependsOn` est cochée. */
  dependsOn?: string
}

/** Zone de texte multiligne. */
export interface ParaBlock {
  type: 'para'
  key: string
  ph: string
  phEn?: string
  dependsOn?: string
}

/** Durée de conservation RCP : nombre + « mois » (rubrique 6.3). */
export interface DureeBlock {
  type: 'duree'
  key: string
  ph: string
  phEn?: string
}

/** Code ATC RCP : input + case « non encore attribué » (rubrique 5.1). */
export interface AtcBlock {
  type: 'atc'
  key: string
  chkKey: string
  label: string
  labelEn?: string
  ph: string
  phEn?: string
  chkLabel: string
  chkLabelEn?: string
}

/** Groupe de mentions à cocher (RCP/Étiquetage — seules les cochées sont exportées). */
export interface ChecksBlock {
  type: 'checks'
  key: string
  options: string[]
  /** Équivalents EN (même longueur/ordre que `options`) — repli FR si absent/incohérent. */
  optionsEn?: string[]
}

/** Case UNIQUE (gabarit Notice) : mention optionnelle d'une ligne, parfois rendue en sous-titre. */
export interface CheckBlock {
  type: 'check'
  key: string
  text?: DynText
  /** Équivalent EN du texte de la case (EMA QRD) — repli sur `text` si absent. */
  textEn?: DynText
  /** Exportée comme sous-titre (« Enfants et adolescents »…) plutôt que comme paragraphe. */
  asHeading?: boolean
  /** Texte exporté composé depuis l'état (cas « amélioration après N jours » du gabarit). */
  exportText?: (state: TemplateFormState, g: FormGlobals) => string
  /** Équivalent EN du texte exporté composé — repli sur `textEn`/`text` si absent. */
  exportTextEn?: (state: TemplateFormState, g: FormGlobals) => string
}

/** Sous-titre à CHOIX (gabarit Notice : « Grossesse et allaitement »…). */
export interface SubSelectBlock {
  type: 'subSelect'
  key: string
  before: string
  beforeEn?: string
  options: string[]
  /**
   * Équivalents EN (même longueur/ordre que `options`). Le choix reste stocké en FR (clé indépendante
   * de la langue) → on mappe FR→EN par index à l'affichage (repli FR si absent/incohérent).
   */
  optionsEn?: string[]
  /** Titre exporté (défaut : before + choix ; « Grossesse » remplace entièrement — règle gabarit). */
  headingText?: (chosen: string) => string
}

/** Sous-titre avec saisie inline (« Ce médicament contient [excipients]… »). */
export interface SubLineBlock {
  type: 'subLine'
  key: string
  before: string
  beforeEn?: string
  ph: string
  phEn?: string
}

export type FormBlock =
  | StaticBlock
  | RuleBlock
  | DynBlock
  | BulletsBlock
  | LineBlock
  | ParaBlock
  | DureeBlock
  | AtcBlock
  | ChecksBlock
  | CheckBlock
  | SubSelectBlock
  | SubLineBlock

/* ----------------------------- État + définition d'un formulaire ----------------------------- */

/** Saisies : valeurs texte, indices cochés par groupe (case unique = [0]), choix des sous-titres. */
export interface TemplateFormState {
  values: Record<string, string>
  checks: Record<string, number[]>
  selects: Record<string, string>
  globals: FormGlobals
}

/** Définition complète d'un formulaire de template officiel (un par type de document). */
export interface TemplateFormDefinition {
  docType: 'rcp' | 'notice' | 'labeling'
  model: FormBlock[]
  /** Titre de la barre d'actions (« Résumé des Caractéristiques du Produit »…). */
  topbarTitle: string
  /** Préfixe du nom de fichier exporté (« RCP », « Notice », « Etiquetage »). */
  slugPrefix: string
  /** Clé de la dénomination (slug du nom d'export). */
  slugKey: string
  /** Barre de réglages globaux (gabarit Notice : verbe + professionnels). */
  hasGlobalsBar?: boolean
  /**
   * Pré-remplissage à la création — STRICTEMENT la session Identification de la fiche
   * produit (exigence CEO) : l'utilisateur complète tout le reste lui-même.
   */
  prefill: (product: ProductRecord) => Record<string, string>
}

/** État vide du formulaire : toutes les clés du MODEL présentes, réglages globaux par défaut. */
export function emptyFormState(model: FormBlock[]): TemplateFormState {
  const state: TemplateFormState = {
    values: {},
    checks: {},
    selects: {},
    globals: { ...DEFAULT_GLOBALS, hcp: { ...DEFAULT_GLOBALS.hcp } },
  }
  for (const b of model) {
    switch (b.type) {
      case 'line':
      case 'para':
      case 'duree':
      case 'subLine':
        state.values[b.key] = ''
        break
      case 'atc':
        state.values[b.key] = ''
        state.checks[b.chkKey] = []
        break
      case 'checks':
      case 'check':
        state.checks[b.key] = []
        break
      case 'subSelect':
        state.selects[b.key] = ''
        break
      default:
        break
    }
  }
  return state
}

/** État initial à la création : état vide + Identification de la fiche produit. */
export function initialFormState(
  def: TemplateFormDefinition,
  product?: ProductRecord,
): TemplateFormState {
  const state = emptyFormState(def.model)
  if (product) Object.assign(state.values, def.prefill(product))
  return state
}

/** Nom de fichier d'export : « <Préfixe>_<dénomination> » (slug des gabarits CEO, 40 car. max). */
export function formExportName(def: TemplateFormDefinition, state: TemplateFormState): string {
  const d = (state.values[def.slugKey] ?? '').trim()
  if (!d) return def.slugPrefix
  return (
    `${def.slugPrefix}_` +
    d
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
  )
}

/** Nombre de champs texte encore vides (bannière de revue — cases et choix sont optionnels). */
export function countEmptyFields(state: TemplateFormState): number {
  return Object.values(state.values).filter((v) => !v.trim()).length
}

/** Titre d'un bloc structurel, tabulation officielle remplacée par 2 espaces (rendu écran). */
export function blockHeadingText(text: string): string {
  return text.replace('\t', '  ')
}

/**
 * Titre rendu d'un `subSelect` (exports/print) : le choix stocké en FR est mappé EN par INDEX
 * (repli FR si absent), puis `headingText` appliqué (« Grossesse » remplace) ou `before` + choix.
 * `headingText` doit être agnostique de langue (identité ou structurel) — on lui passe le label résolu.
 */
export function subSelectHeading(b: SubSelectBlock, chosen: string, lang: Lang): string {
  const idx = b.options.indexOf(chosen)
  const label =
    lang === 'en' && b.optionsEn && idx >= 0 && b.optionsEn[idx] ? b.optionsEn[idx]! : chosen
  if (b.headingText) return b.headingText(label)
  return `${fieldText(b.before, b.beforeEn, lang)}${label}`
}

/**
 * Texte d'un bloc `check` pour les EXPORTS (print/docx) : en EN, privilégie `exportTextEn` puis
 * `textEn`/`text` ; en FR, `exportText` (texte composé) puis `text`. Le rendu écran (aperçu) reste
 * sur `fieldDyn(text, textEn)` car il n'utilise jamais le texte composé.
 */
export function checkText(
  b: CheckBlock,
  state: TemplateFormState,
  g: FormGlobals,
  lang: Lang,
): string {
  if (lang === 'en') {
    return b.exportTextEn ? b.exportTextEn(state, g) : fieldDyn(b.text ?? '', b.textEn, lang, g)
  }
  return b.exportText ? b.exportText(state, g) : resolveText(b.text, g)
}
