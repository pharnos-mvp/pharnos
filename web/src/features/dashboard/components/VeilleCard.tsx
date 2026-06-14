import { useState } from 'react'
import { Newspaper } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { REGULATORY_WATCH } from '../regulatory-watch'

export function VeilleCard() {
  const { t } = useI18n()
  const sources = ['all', ...Array.from(new Set(REGULATORY_WATCH.map((w) => w.source)))]
  const [filter, setFilter] = useState('all')
  const items =
    filter === 'all' ? REGULATORY_WATCH : REGULATORY_WATCH.filter((w) => w.source === filter)

  return (
    <section className="rounded-lg border" aria-labelledby="veille-title">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Newspaper className="size-4" aria-hidden />
        <span id="veille-title" className="text-sm font-semibold">
          {t({ fr: 'Veille réglementaire', en: 'Regulatory watch' })}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs transition-colors',
                filter === s
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'hover:bg-accent',
              )}
            >
              {s === 'all' ? t({ fr: 'Toutes', en: 'All' }) : s}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y">
        {items.map((w) => (
          <li key={w.id} className="flex items-start gap-3 p-3 text-sm">
            <span className="bg-accent text-foreground shrink-0 rounded px-2 py-0.5 text-xs tabular-nums">
              {w.date}
            </span>
            <span className="min-w-0 flex-1">{t({ fr: w.fr, en: w.en })}</span>
            <span className="text-muted-foreground shrink-0 text-xs">{w.source}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
