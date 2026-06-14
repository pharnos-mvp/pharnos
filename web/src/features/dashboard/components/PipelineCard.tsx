import { Link } from 'react-router-dom'

import {
  STATUS_BADGE_CLASSES,
  statusLabel,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { PipelineCount } from '../dashboard-data'

const EN_LABELS: Record<DossierDisplayStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  accepted: 'Accepted',
  suspended: 'Suspended',
  rejected: 'Rejected',
}

export function PipelineCard({ counts }: { counts: PipelineCount[] }) {
  const { t, lang } = useI18n()
  const total = counts.reduce((s, c) => s + c.count, 0)

  return (
    <section className="rounded-lg border" aria-labelledby="pipeline-title">
      <div className="flex items-center justify-between border-b p-3">
        <span id="pipeline-title" className="text-sm font-semibold">
          {t({ fr: 'Pipeline des dossiers', en: 'Dossier pipeline' })}
        </span>
        <Link
          to="/workspace"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
        >
          {t({ fr: 'Tout voir', en: 'View all' })}
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          {t({ fr: 'Aucun dossier pour l’instant.', en: 'No dossiers yet.' })}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
          {counts.map((c) => (
            <Link
              key={c.status}
              to="/workspace"
              className="hover:bg-accent flex flex-col items-center gap-1 rounded-md border p-3 text-center transition-colors"
            >
              <span className="text-2xl font-bold tabular-nums">{c.count}</span>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-xs',
                  STATUS_BADGE_CLASSES[c.status],
                )}
              >
                {lang === 'fr' ? statusLabel(c.status) : EN_LABELS[c.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
