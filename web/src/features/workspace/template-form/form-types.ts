// Types du moteur de FORMULAIRES de templates officiels (RCP, Notice, Étiquetage) — portés
// des gabarits HTML du CEO (RCP_formulaire_interactif.html, Notice_patient_interactive.html)
// et du template PDF ABMed Étiquetage 2026. Un formulaire = un MODEL déclaratif de blocs ;
// le rendu écran, la persistance TipTap et les exports DOCX/PDF itèrent le même MODEL.
import type { ProductRecord } from '@/lib/db'

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

/* ----------------------------- Blocs de structure (jamais saisissables) ----------------------------- */

/** Titres et mentions officiels — texte fixe. `banner` : bandeau gris du template Étiquetage. */
export interface StaticBlock {
  type: 'title' | 'sec' | 'sub' | 'subsub' | 'static' | 'banner'
  text: string
}

export interface RuleBlock {
  type: 'rule'
}

/** Titre/paragraphe DYNAMIQUE : résolu depuis les réglages globaux (verbe, professionnels). */
export interface DynBlock {
  type: 'dyn' | 'secDyn' | 'subDyn'
  dynText: (g: FormGlobals) => string
}

/** Liste à puces de mentions officielles (toujours exportée — gabarit Notice : l'encadré). */
export interface BulletsBlock {
  type: 'bullets'
  items: DynText[]
}

/* ----------------------------- Blocs saisissables ----------------------------- */

/** Champ d'une ligne. `label`/`suffix` inline (« Tél. : », « °C… ») ; `narrow` : champ court. */
export interface LineBlock {
  type: 'line'
  key: string
  ph: string
  label?: string
  suffix?: string
  narrow?: boolean
  /** Rendu/export seulement si la case `dependsOn` est cochée. */
  dependsOn?: string
}

/** Zone de texte multiligne. */
export interface ParaBlock {
  type: 'para'
  key: string
  ph: string
  dependsOn?: string
}

/** Durée de conservation RCP : nombre + « mois » (rubrique 6.3). */
export interface DureeBlock {
  type: 'duree'
  key: string
  ph: string
}

/** Code ATC RCP : input + case « non encore attribué » (rubrique 5.1). */
export interface AtcBlock {
  type: 'atc'
  key: string
  chkKey: string
  label: string
  ph: string
  chkLabel: string
}

/** Groupe de mentions à cocher (RCP/Étiquetage — seules les cochées sont exportées). */
export interface ChecksBlock {
  type: 'checks'
  key: string
  options: string[]
}

/** Case UNIQUE (gabarit Notice) : mention optionnelle d'une ligne, parfois rendue en sous-titre. */
export interface CheckBlock {
  type: 'check'
  key: string
  text?: DynText
  /** Exportée comme sous-titre (« Enfants et adolescents »…) plutôt que comme paragraphe. */
  asHeading?: boolean
  /** Texte exporté composé depuis l'état (cas « amélioration après N jours » du gabarit). */
  exportText?: (state: TemplateFormState, g: FormGlobals) => string
}

/** Sous-titre à CHOIX (gabarit Notice : « Grossesse et allaitement »…). */
export interface SubSelectBlock {
  type: 'subSelect'
  key: string
  before: string
  options: string[]
  /** Titre exporté (défaut : before + choix ; « Grossesse » remplace entièrement — règle gabarit). */
  headingText?: (chosen: string) => string
}

/** Sous-titre avec saisie inline (« Ce médicament contient [excipients]… »). */
export interface SubLineBlock {
  type: 'subLine'
  key: string
  before: string
  ph: string
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
