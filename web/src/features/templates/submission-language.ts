import type { Lang, Translatable } from '@/lib/i18n-context'
import { officialLanguage } from '@/features/workspace/roadmap-data'

/**
 * Langue de soumission d'un pays — sur-ensemble de `Lang` : l'app ne rédige qu'en FR/EN, mais
 * certains pays soumettent dans une langue que l'éditeur ne produit pas (Guinée-Bissau = `pt`).
 */
export type SubmissionLang = 'fr' | 'en' | 'pt'

/** Nom de langue affichable (bilingue) pour le constat de soumission. */
const SUBMISSION_LANG_NAME: Readonly<Record<SubmissionLang, Translatable>> = Object.freeze({
  fr: { fr: 'français', en: 'French' },
  en: { fr: 'anglais', en: 'English' },
  pt: { fr: 'portugais', en: 'Portuguese' },
})

export interface SubmissionMismatch {
  /** Langue de soumission du pays cible (`officialLanguage`, langue de la version à fournir). */
  submissionLang: SubmissionLang
  /** Nom bilingue de cette langue (« français » / « French »). */
  submissionLangName: Translatable
  /**
   * L'éditeur peut-il produire cette langue ? FR/EN → oui (bouton « Passer en … »).
   * `pt` (Guinée-Bissau) → non : constat purement informatif, pas de bascule.
   */
  canSwitch: boolean
}

/**
 * **M4 — Nudge langue de soumission.** Constat DÉTERMINISTE « langue du document ≠ langue de
 * soumission du pays » (pattern Monitor, non bloquant).
 *
 * La langue de soumission = `officialLanguage(country)` (roadmap-data) — français par défaut UEMOA,
 * `en` pour les agences anglophones (CEDEAO), `pt` pour la Guinée-Bissau. Renvoie `null` quand aucun
 * pays n'est sélectionné ou que le document est DÉJÀ dans la bonne langue (aucun nudge à afficher).
 */
export function submissionLanguageMismatch(
  docLang: Lang,
  country: string,
): SubmissionMismatch | null {
  if (!country) return null
  // `officialLanguage` renvoie `string` (défaut FR) — on NARROW au lieu de caster : si la carte
  // gagnait un jour une langue non gérée (ex. `ar`), le repli FR reste sûr plutôt que de mentir au type.
  const raw = officialLanguage(country)
  const submissionLang: SubmissionLang = raw === 'en' || raw === 'pt' ? raw : 'fr'
  if (submissionLang === docLang) return null
  return {
    submissionLang,
    submissionLangName: SUBMISSION_LANG_NAME[submissionLang],
    canSwitch: submissionLang === 'fr' || submissionLang === 'en',
  }
}
