import type { Lang } from '@/lib/i18n-context'

/**
 * Parité FIXE FCFA (XOF) ↔ EUR — arrimage BCEAO au Trésor français, immuable depuis 1999 :
 * 1 EUR = 655,957 XOF. Ce n'est PAS un taux de marché (aucun appel réseau, aucune dérive dans le
 * temps) : le PGHT saisi en euros se convertit en FCFA de façon exacte et déterministe.
 */
export const EUR_TO_XOF = 655.957

/**
 * Le visiteur est-il dans la zone où le prix en FCFA lui apprend quelque chose ?
 *
 * Règle CEO du 2026-08-16 : « Euro (FCFA) pour l'Afrique, euro seul pour les autres continents ».
 * Sert l'AFFICHAGE d'un barème (cf. `priceXof` de `plan-catalog`), jamais un calcul : la parité
 * ci-dessus est fixe et ne dépend d'aucun visiteur.
 *
 * ⚠️ FAIL-OPEN : au moindre doute (fuseau absent, `Intl` indisponible, fuseau inconnu) elle rend
 * `true`, donc les DEUX devises. Cacher le FCFA à quelqu'un qui paiera en FCFA est l'erreur qui
 * coûte ; montrer le FCFA à un lecteur européen ne coûte rien.
 *
 * Le fuseau du poste, et rien d'autre : aucun appel réseau, aucune géolocalisation.
 * Jumeau de `zoneFcfa()` dans `landing/checking/bibliotheque-core.js` et du garde en tête de
 * `landing/landing.js` — toute correction de la liste des fuseaux se porte aux TROIS endroits.
 */
export function zoneFcfa(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (!tz) return true
    // Les fuseaux africains ne sont pas tous sous « Africa/ » : les îles de l'océan Indien et de
    // l'Atlantique sont classées par océan. Les omettre priverait Madagascar ou le Cap-Vert du FCFA.
    return /^(Africa\/|Indian\/(Antananarivo|Comoro|Mayotte|Reunion)|Atlantic\/(Cape_Verde|St_Helena))/.test(
      tz,
    )
  } catch {
    return true
  }
}

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
