import type { UrgencyLevel } from './dashboard-data'

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

/**
 * Classe du PANNEAU d'alerte d'une tuile pays selon la sévérité (barème CEO) : rouge AMM expirée,
 * orange pièce admin expirée, jaune rien d'expiré mais sous préavis, neutre sinon. Les valeurs de
 * `UrgencyLevel` sont volontairement les suffixes de classe — un seul vocabulaire données↔CSS.
 */
export function urgencyCls(level: UrgencyLevel): string {
  return level === 'none' ? 'ctry-stat' : `ctry-stat is-${level}`
}
