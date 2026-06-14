import { CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'

import { docTypeLabel } from '@/features/catalogue/doc-types'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { ExpiryItem } from '../dashboard-data'

const MAX_SHOWN = 8

export function EcheancesTimeline({ items }: { items: ExpiryItem[] }) {
  const { t, lang } = useI18n()
  const expired = items.filter((i) => i.daysLeft < 0).length
  const d30 = items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30).length
  const d90 = items.filter((i) => i.daysLeft > 30 && i.daysLeft <= 90).length

  const badge = (d: number): { cls: string; label: string } =>
    d < 0
      ? {
          cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
          label: t({ fr: 'expiré', en: 'expired' }),
        }
      : d <= 30
        ? {
            cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
            label: t({ fr: `J-${d}`, en: `${d}d` }),
          }
        : {
            cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
            label: t({ fr: `J-${d}`, en: `${d}d` }),
          }

  return (
    <section className="rounded-lg border" aria-labelledby="ech-title">
      <div className="flex items-center gap-2 border-b p-3">
        <CalendarClock className="size-4" aria-hidden />
        <span id="ech-title" className="text-sm font-semibold">
          {t({ fr: 'Échéances & renouvellements', en: 'Deadlines & renewals' })}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          {t({ fr: 'Aucune échéance sous 90 jours.', en: 'No deadline within 90 days.' })}
        </p>
      ) : (
        <>
          <div className="text-muted-foreground flex gap-4 border-b px-3 py-2 text-xs">
            <span>
              <b className="text-foreground tabular-nums">{expired}</b>{' '}
              {t({ fr: 'expirées', en: 'expired' })}
            </span>
            <span>
              <b className="text-foreground tabular-nums">{d30}</b> ≤ 30 j
            </span>
            <span>
              <b className="text-foreground tabular-nums">{d90}</b> ≤ 90 j
            </span>
          </div>
          <ul className="divide-y">
            {items.slice(0, MAX_SHOWN).map((i) => {
              const b = badge(i.daysLeft)
              return (
                <li key={i.id}>
                  <Link
                    to={`/catalogue/${i.productId}`}
                    className="hover:bg-accent flex items-center gap-3 p-3 text-sm transition-colors"
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums',
                        b.cls,
                      )}
                    >
                      {b.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{i.productName}</span>{' '}
                      <span className="text-muted-foreground">
                        — {docTypeLabel(i.docType, lang)}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {new Date(i.expiryDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
