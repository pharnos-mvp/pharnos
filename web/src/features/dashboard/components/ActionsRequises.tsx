import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Hourglass,
  MailOpen,
  PauseCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { countryFlag, countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { ActionItem, ActionKind } from '../dashboard-data'

const MAX_SHOWN = 8

const KIND_META: Record<ActionKind, { icon: typeof AlertTriangle; color: string }> = {
  doc_expired: { icon: AlertTriangle, color: 'text-red-600' },
  dossier_suspended: { icon: PauseCircle, color: 'text-amber-600' },
  unread_reply: { icon: MailOpen, color: 'text-foreground' },
  non_conform: { icon: FileWarning, color: 'text-red-600' },
  doc_expiring: { icon: CalendarClock, color: 'text-amber-600' },
  agency_pending: { icon: Hourglass, color: 'text-muted-foreground' },
}

export function ActionsRequises({ items }: { items: ActionItem[] }) {
  const { t, lang } = useI18n()
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : ''

  const detail = (it: ActionItem): string => {
    const dt = it.docType ? docTypeLabel(it.docType) : ''
    const flag = it.country ? `${countryFlag(it.country)} ${countryLabel(it.country)}` : ''
    switch (it.kind) {
      case 'doc_expired':
        return t({ fr: `${dt} — expirée le ${fmtDate(it.date)}`, en: `${dt} — expired ${fmtDate(it.date)}` })
      case 'doc_expiring':
        return t({ fr: `${dt} — expire le ${fmtDate(it.date)}`, en: `${dt} — expires ${fmtDate(it.date)}` })
      case 'dossier_suspended':
        return t({ fr: `Dossier mis en suspens · ${flag}`, en: `Dossier suspended · ${flag}` })
      case 'unread_reply':
        return t({
          fr: `${it.count} réponse(s) d'agence non lue(s) · ${flag}`,
          en: `${it.count} unread agency reply(ies) · ${flag}`,
        })
      case 'non_conform':
        return t({
          fr: `${dt} — non conforme au template (${it.count})`,
          en: `${dt} — not template-compliant (${it.count})`,
        })
      case 'agency_pending':
        return t({ fr: `En attente de réponse de l'agence · ${flag}`, en: `Awaiting agency reply · ${flag}` })
    }
  }

  const shown = items.slice(0, MAX_SHOWN)
  const rest = items.length - shown.length

  return (
    <section className="rounded-lg border" aria-labelledby="actions-requises-title">
      <div className="flex items-center gap-2 border-b p-3">
        <span id="actions-requises-title" className="text-sm font-semibold">
          {t({ fr: 'Actions requises', en: 'Required actions' })}
        </span>
        {items.length > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {items.length}
          </Badge>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground flex items-center justify-center gap-2 p-6 text-center text-sm">
          <CheckCircle2 className="size-4 text-emerald-600" />
          {t({ fr: 'Rien à signaler — tout est à jour.', en: 'Nothing to flag — all clear.' })}
        </p>
      ) : (
        <ul className="divide-y">
          {shown.map((it) => {
            const { icon: Icon, color } = KIND_META[it.kind]
            return (
              <li key={it.id}>
                <Link
                  to={it.href}
                  className="hover:bg-accent flex items-center gap-3 p-3 text-sm transition-colors"
                >
                  <Icon className={cn('size-4 shrink-0', color)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{it.label}</span>
                    <span className="text-muted-foreground block truncate text-xs">{detail(it)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {rest > 0 && (
        <div className="text-muted-foreground border-t p-2 text-center text-xs">
          {t({ fr: `+ ${rest} autre(s)`, en: `+ ${rest} more` })}
        </div>
      )}
    </section>
  )
}
