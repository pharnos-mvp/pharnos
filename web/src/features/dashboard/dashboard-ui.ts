/**
 * Helpers de présentation PURS du Dashboard (aucune dépendance React) — testables isolément.
 */

/**
 * Classe d'un micro-stat de tuile pays : `is-<tone>` UNIQUEMENT si l'indicateur est actionnable.
 *
 * Helper (et non une interpolation en ligne) : concaténer à la main perd trivialement l'espace
 * séparateur (`ctry-statis-danger`), ce qui casse la classe **précisément dans l'état coloré** —
 * l'indicateur reste correct à zéro et devient invisible quand il compte. Verrouillé par test.
 */
export function statCls(active: boolean, tone: string): string {
  return active ? `ctry-stat is-${tone}` : 'ctry-stat'
}
