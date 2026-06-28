import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  PauseCircle,
  XCircle,
} from 'lucide-react'

import { docTypeLabel } from '@/features/catalogue/doc-types'
import type { ExpiryItem } from '@/features/dashboard/dashboard-data'
import {
  statusLabel,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import type { FeedItem } from '@/features/correspondence/correspondence-feed'
import { countryLabel } from './dossier-constants'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

function relativeTime(iso: string, lang: Lang, now: number): string {
  const diff = now - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor(diff / 3_600_000)
  if (days >= 2) return lang === 'fr' ? `il y a ${days} j` : `${days}d ago`
  if (days === 1) return lang === 'fr' ? 'hier' : 'yesterday'
  if (hours >= 1) return lang === 'fr' ? `il y a ${hours} h` : `${hours}h ago`
  return lang === 'fr' ? "à l'instant" : 'just now'
}

/** Tonalité (classe pastille) d'un item du fil. */
const FEED_ICON: Record<DossierDisplayStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-info-subtle text-info-subtle-foreground',
  accepted: 'bg-success-subtle text-success-subtle-foreground',
  suspended: 'bg-warning-subtle text-warning-subtle-foreground',
  rejected: 'bg-danger-subtle text-danger-subtle-foreground',
}

function feedIcon(item: FeedItem) {
  if (item.kind === 'message') return <MessageSquare className="size-3.5" />
  if (item.kind === 'review') return <Clock className="size-3.5" />
  if (item.status === 'accepted') return <CheckCircle2 className="size-3.5" />
  if (item.status === 'suspended') return <PauseCircle className="size-3.5" />
  return <XCircle className="size-3.5" />
}

function feedLabel(item: FeedItem): { main: Translatable; product: string } {
  if (item.kind === 'message')
    return {
      product: item.product,
      main: {
        fr: `${item.unread} nouveau${item.unread > 1 ? 'x' : ''} message${item.unread > 1 ? 's' : ''}`,
        en: `${item.unread} new message${item.unread > 1 ? 's' : ''}`,
      },
    }
  if (item.kind === 'review')
    return { product: item.product, main: { fr: 'En review', en: 'In review' } }
  return {
    product: item.product,
    main: { fr: statusLabel(item.status, 'fr'), en: statusLabel(item.status, 'en') },
  }
}

/** Panneau d'activité du board : fil de correspondances + échéances réglementaires. */
export function OperationsActivity({
  feed,
  echeances,
  onOpen,
  now,
}: {
  feed: FeedItem[]
  echeances: ExpiryItem[]
  onOpen: (dossierId: string) => void
  now: number
}) {
  const { t, lang } = useI18n()
  const topFeed = feed.slice(0, 6)
  const topEch = echeances.slice(0, 4)

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-2 lg:self-start">
      <section className="bg-card rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">
            {t({ fr: 'Correspondances', en: 'Correspondence' })}
          </h2>
          <Bell className="text-muted-foreground size-4" aria-hidden />
        </div>
        {topFeed.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
            <Inbox className="size-4" aria-hidden />
            {t({ fr: 'Aucune correspondance en cours.', en: 'No correspondence in progress.' })}
          </p>
        ) : (
          <ul className="divide-border -mx-1 divide-y">
            {topFeed.map((item) => {
              const { main, product } = feedLabel(item)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.dossierId)}
                    className="hover:bg-accent flex w-full items-start gap-2.5 rounded-md px-1 py-2 text-left transition-colors"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
                        FEED_ICON[item.status],
                      )}
                    >
                      {feedIcon(item)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block text-xs">
                        <span className="font-medium">{t(main)}</span>
                        <span className="text-muted-foreground"> — {product}</span>
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-[10.5px]">
                        {countryLabel(item.country, lang)} · {relativeTime(item.at, lang, now)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="bg-card rounded-xl border p-4">
        <h2 className="font-display mb-2 text-sm font-semibold">
          {t({ fr: 'Échéances', en: 'Deadlines' })}
        </h2>
        {topEch.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
            <CheckCircle2 className="size-4" aria-hidden />
            {t({ fr: 'Aucune échéance proche.', en: 'No upcoming deadline.' })}
          </p>
        ) : (
          <ul className="divide-border -mx-1 divide-y">
            {topEch.map((e) => {
              const expired = e.daysLeft < 0
              return (
                <li key={e.id} className="flex items-start gap-2.5 px-1 py-2">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
                      expired
                        ? 'bg-danger-subtle text-danger-subtle-foreground'
                        : 'bg-warning-subtle text-warning-subtle-foreground',
                    )}
                  >
                    {expired ? (
                      <AlertTriangle className="size-3.5" />
                    ) : (
                      <CalendarClock className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block text-xs">
                      <span className="font-medium">{docTypeLabel(e.docType, lang)}</span>
                      <span className="text-muted-foreground"> — {e.productName}</span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-[10.5px]">
                      {expired
                        ? t({
                            fr: `Périmé depuis ${-e.daysLeft} j`,
                            en: `${-e.daysLeft}d overdue`,
                          })
                        : t({ fr: `Expire dans ${e.daysLeft} j`, en: `Expires in ${e.daysLeft}d` })}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
