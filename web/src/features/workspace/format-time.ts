import type { Lang } from '@/lib/i18n-context'

const DAY = 86_400_000
const HOUR = 3_600_000
const WEEK = 7 * DAY

/** Âge relatif compact (à l'instant / il y a Xh / hier / il y a Xj / sem. dernière). */
export function relativeTime(iso: string, lang: Lang, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff >= 2 * WEEK) {
    const w = Math.floor(diff / WEEK)
    return lang === 'fr' ? `il y a ${w} sem.` : `${w}w ago`
  }
  if (diff >= WEEK) return lang === 'fr' ? 'sem. dernière' : 'last week'
  const days = Math.floor(diff / DAY)
  const hours = Math.floor(diff / HOUR)
  if (days >= 2) return lang === 'fr' ? `il y a ${days} j` : `${days}d ago`
  if (days === 1) return lang === 'fr' ? 'hier' : 'yesterday'
  if (hours >= 1) return lang === 'fr' ? `il y a ${hours} h` : `${hours}h ago`
  return lang === 'fr' ? "à l'instant" : 'just now'
}

/** Échéance « J-12 » / « J+3 » (dépassée) ; null → tiret. */
export function deadlineLabel(days: number | null): string {
  if (days === null) return '—'
  return days < 0 ? `J+${-days}` : `J-${days}`
}
