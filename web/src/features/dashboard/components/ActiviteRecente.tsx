import { History } from 'lucide-react'

import type { AuditLogRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'

export function ActiviteRecente({ items }: { items: AuditLogRecord[] }) {
  const { t, lang } = useI18n()
  const actionLabel = (a: string): string =>
    a === 'create'
      ? t({ fr: 'créé', en: 'created' })
      : a === 'delete'
        ? t({ fr: 'supprimé', en: 'deleted' })
        : t({ fr: 'modifié', en: 'updated' })

  return (
    <section className="rounded-lg border" aria-labelledby="activity-title">
      <div className="flex items-center gap-2 border-b p-3">
        <History className="size-4" aria-hidden />
        <span id="activity-title" className="text-sm font-semibold">
          {t({ fr: 'Activité récente', en: 'Recent activity' })}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          {t({ fr: 'Aucune activité récente.', en: 'No recent activity.' })}
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{a.label}</span>{' '}
                <span className="text-muted-foreground">— {actionLabel(a.action)}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {new Date(a.at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
