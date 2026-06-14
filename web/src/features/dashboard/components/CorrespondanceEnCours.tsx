import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

import { countryFlag, countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { CorrItem, CorrSubState } from '../dashboard-data'

const MAX_SHOWN = 5

const STATE_CLS: Record<CorrSubState, string> = {
  unread: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  awaiting_agency: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  decided: 'bg-muted text-muted-foreground',
}

export function CorrespondanceEnCours({ items }: { items: CorrItem[] }) {
  const { t } = useI18n()
  const stateLabel = (it: CorrItem): string => {
    switch (it.state) {
      case 'unread':
        return t({ fr: `${it.unread} non lu(s)`, en: `${it.unread} unread` })
      case 'awaiting_agency':
        return t({ fr: 'En attente agence', en: 'Awaiting agency' })
      case 'decided':
        return t({ fr: 'Décidé', en: 'Decided' })
    }
  }

  return (
    <section className="rounded-lg border" aria-labelledby="corr-title">
      <div className="flex items-center gap-2 border-b p-3">
        <MessageSquare className="size-4" aria-hidden />
        <span id="corr-title" className="text-sm font-semibold">
          {t({ fr: 'Correspondance en cours', en: 'Active correspondence' })}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          {t({ fr: 'Aucune correspondance.', en: 'No correspondence.' })}
        </p>
      ) : (
        <ul className="divide-y">
          {items.slice(0, MAX_SHOWN).map((it) => (
            <li key={it.id}>
              <Link
                to={`/workspace/${it.dossierId}`}
                className="hover:bg-accent flex items-center gap-3 p-3 text-sm transition-colors"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{it.productName}</span>
                  {it.country && (
                    <span className="text-muted-foreground">
                      {' '}
                      · <span aria-hidden>{countryFlag(it.country)}</span>{' '}
                      {countryLabel(it.country)}
                    </span>
                  )}
                </span>
                <span
                  className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', STATE_CLS[it.state])}
                >
                  {stateLabel(it)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
