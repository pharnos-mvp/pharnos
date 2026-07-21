import type { Lang } from '@/lib/i18n-context'

/**
 * Parité FIXE FCFA (XOF) ↔ EUR — arrimage BCEAO au Trésor français, immuable depuis 1999 :
 * 1 EUR = 655,957 XOF. Ce n'est PAS un taux de marché (aucun appel réseau, aucune dérive dans le
 * temps) : le PGHT saisi en euros se convertit en FCFA de façon exacte et déterministe.
 */
export const EUR_TO_XOF = 655.957

/** Convertit un montant EUR → FCFA (XOF) à la parité fixe. `NaN` propagé si l'entrée n'est pas finie. */
export function eurToXof(eur: number): number {
  return eur * EUR_TO_XOF
}

/**
 * Parse un montant saisi (string) en nombre fini ≥ 0 ; `null` si vide / invalide / négatif.
 * Tolère la virgule décimale (fr) et les espaces (séparateurs de milliers) — jamais de throw.
 */
export function parseAmount(input: string): number | null {
  const normalized = input.replace(/\s/g, '').replace(',', '.')
  // Décimal simple UNIQUEMENT : rejette vide, négatif, hexadécimal (0x10), notation scientifique
  // (1e3), point final (3.)… — `Number()` seul accepterait ces formes, jamais un prix réel.
  if (!/^\d*\.?\d+$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Formate un nombre en montant localisé : séparateur décimal selon la langue (virgule en fr),
 * SANS séparateur de milliers (évite l'espace insécable U+202F, fragile en test/regex), 0–2 décimales.
 */
export function formatMoney(n: number, lang: Lang = 'fr'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Montant EUR (string saisie) → FCFA formaté ; `''` si l'entrée n'est pas un nombre ≥ 0. */
export function eurStringToFcfa(input: string, lang: Lang = 'fr'): string {
  const eur = parseAmount(input)
  return eur === null ? '' : formatMoney(eurToXof(eur), lang)
}
