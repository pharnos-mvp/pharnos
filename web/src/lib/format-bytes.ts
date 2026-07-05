import type { Lang } from '@/lib/i18n-context'

const UNITS: Record<Lang, string[]> = {
  fr: ['o', 'Ko', 'Mo', 'Go', 'To'],
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
}

/**
 * Formatte une taille en octets pour l'affichage (base 1024, 1 décimale sous 10, unités FR/EN).
 * Source UNIQUE du format « octets » côté app (compte ; admin et correspondance convergent ici
 * au fil de leurs lots — cf. PLAN-RESTANT). Décimale localisée (« 1,5 Go » / "1.5 GB").
 */
export function formatBytes(n: number, lang: Lang = 'fr'): string {
  const units = UNITS[lang]
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  if (n < 1024) return `${n} ${units[0]}`
  let v = n / 1024
  let i = 1
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString(locale, { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`
}
