import { useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  MessageSquare,
  XCircle,
} from 'lucide-react'

import { inboxUnreadTotal, type InboxItem } from '@/features/correspondence/correspondence-feed'
import type { DossierDisplayStatus } from '@/features/correspondence/correspondence-constants'
import { agencyFor } from '@/features/workspace/roadmap-data'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { countryLabel } from './dossier-constants'
import { deadlineLabel, relativeTime } from './format-time'

// Filtre PAR STATUT de correspondance (mockup v2 : Tous/Accepté/Review/En suspens/Rejeté).
type FilterKey = 'all' | DossierDisplayStatus
const FILTERS: { key: FilterKey; label: Translatable }[] = [
  { key: 'all', label: { fr: 'Tous', en: 'All' } },
  { key: 'accepted', label: { fr: 'Accepté', en: 'Granted' } },
  { key: 'in_review', label: { fr: 'Review', en: 'Review' } },
  { key: 'suspended', label: { fr: 'En suspens', en: 'On hold' } },
  { key: 'rejected', label: { fr: 'Rejeté', en: 'Rejected' } },
]

const ICON_TONE: Record<string, string> = {
  accepted: 'bg-success-subtle text-success-subtle-foreground',
  rejected: 'bg-danger-subtle text-danger-subtle-foreground',
  complement: 'bg-warning-subtle text-warning-subtle-foreground',
  message: 'bg-info-subtle text-info-subtle-foreground',
  echeance: 'bg-warning-subtle text-warning-subtle-foreground',
  review: 'bg-muted text-muted-foreground',
}

function iconFor(item: InboxItem) {
  if (item.kind === 'decision')
    return item.status === 'accepted' ? (
      <CheckCircle2 className="size-3.5" />
    ) : (
      <XCircle className="size-3.5" />
    )
  if (item.kind === 'complement') return <FileText className="size-3.5" />
  if (item.kind === 'echeance') return <CalendarClock className="size-3.5" />
  if (item.kind === 'review') return <Clock className="size-3.5" />
  return <MessageSquare className="size-3.5" />
}

const toneKey = (item: InboxItem) => (item.kind === 'decision' ? item.status : item.kind)

function titleFor(item: InboxItem): Translatable {
  const p = item.product
  switch (item.kind) {
    case 'decision':
      return item.status === 'accepted'
        ? { fr: `AMM octroyée — ${p}`, en: `MA granted — ${p}` }
        : { fr: `Rejeté — ${p}`, en: `Rejected — ${p}` }
    case 'complement':
      return { fr: `Complément demandé — ${p}`, en: `Information requested — ${p}` }
    case 'echeance':
      return { fr: `Réponse attendue — ${p}`, en: `Response due — ${p}` }
    case 'message':
      return {
        fr: `${item.unread} nouveau${item.unread > 1 ? 'x' : ''} message${item.unread > 1 ? 's' : ''} — ${p}`,
        en: `${item.unread} new message${item.unread > 1 ? 's' : ''} — ${p}`,
      }
    default:
      return { fr: `Évaluation en cours — ${p}`, en: `Under review — ${p}` }
  }
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Boîte de réception réglementaire = rail d'un cockpit. SCROLL INTERNE : en-tête figé (`shrink-0`)
 * + liste `min-h-0 flex-1 overflow-y-auto`. La hauteur est donnée par la cellule de grille hôte
 * (pas de sticky/calc) → une seule barre de défilement, dans le panneau. `className` = placement.
 */
export function RegulatoryInbox({
  items,
  onOpen,
  className,
  now,
}: {
  items: InboxItem[]
  onOpen: (dossierId: string) => void
  now: number
  className?: string
}) {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState<FilterKey>('all')

  const count = (k: FilterKey) =>
    k === 'all' ? items.length : items.filter((i) => i.status === k).length
  const unread = inboxUnreadTotal(items)
  // Si le statut filtré n'a plus d'entrée (sa pastille a disparu), on retombe sur « Tous » AU RENDU
  // (pas de setState dans un effet = pas de cul-de-sac) ; le filtre reprend si ce statut réapparaît.
  const effectiveFilter: FilterKey =
    filter !== 'all' && !items.some((i) => i.status === filter) ? 'all' : filter
  const shown = items.filter((i) => effectiveFilter === 'all' || i.status === effectiveFilter)
  const today = shown.filter((i) => new Date(i.at).getTime() >= startOfDay(now))
  const earlier = shown.filter((i) => new Date(i.at).getTime() < startOfDay(now))

  return (
    <aside
      aria-labelledby="reg-inbox-title"
      className={cn('bg-card flex min-h-0 flex-col overflow-hidden rounded-xl border', className)}
    >
      <div className="shrink-0 border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="reg-inbox-title" className="font-display text-sm font-semibold">
            {t({ fr: 'Correspondances', en: 'Correspondence' })}
          </h2>
          {unread > 0 ? (
            <span className="bg-info-subtle text-info-subtle-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
              {t({ fr: `${unread} non lus`, en: `${unread} unread` })}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t({ fr: 'Boîte de réception réglementaire', en: 'Regulatory inbox' })}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {FILTERS.map((c) => {
            const n = count(c.key)
            if (c.key !== 'all' && n === 0) return null // masque un statut vide
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={effectiveFilter === c.key}
                onClick={() => setFilter(c.key)}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  effectiveFilter === c.key
                    ? 'bg-info border-transparent text-white'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {t(c.label)} · {n}
              </button>
            )
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 p-4 text-xs">
          <Inbox className="size-4" aria-hidden />
          {t({ fr: 'Aucune correspondance.', en: 'No correspondence.' })}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {today.length > 0 ? (
            <InboxGroup
              label={t({ fr: "Aujourd'hui", en: 'Today' })}
              items={today}
              onOpen={onOpen}
              now={now}
              lang={lang}
              t={t}
            />
          ) : null}
          {earlier.length > 0 ? (
            <InboxGroup
              label={t({ fr: 'Plus tôt', en: 'Earlier' })}
              items={earlier}
              onOpen={onOpen}
              now={now}
              lang={lang}
              t={t}
            />
          ) : null}
        </div>
      )}
    </aside>
  )
}

function InboxGroup({
  label,
  items,
  onOpen,
  now,
  lang,
  t,
}: {
  label: string
  items: InboxItem[]
  onOpen: (dossierId: string) => void
  now: number
  lang: Lang
  t: (v: Translatable) => string
}) {
  return (
    <div className="mb-1">
      <div className="text-muted-foreground px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.dossierId)}
              className="hover:bg-accent flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors"
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
                  ICON_TONE[toneKey(item)],
                )}
              >
                {iconFor(item)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-xs font-medium">
                  {t(titleFor(item))}
                </span>
                <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[10.5px]">
                  <span className="truncate">
                    {agencyFor(item.country).name} · {countryLabel(item.country, lang)}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">
                    {item.kind === 'echeance' && item.deadlineDays !== undefined
                      ? t({
                          fr: `échéance ${deadlineLabel(item.deadlineDays)}`,
                          en: `due ${deadlineLabel(item.deadlineDays)}`,
                        })
                      : relativeTime(item.at, lang, now)}
                  </span>
                </span>
              </span>
              {item.unread > 0 ? (
                <span
                  aria-label={t({ fr: 'Non lu', en: 'Unread' })}
                  className="bg-info mt-1.5 size-2 shrink-0 rounded-full"
                />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
