import { ShieldCheck } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { ConformitySummary } from '../dashboard-data'

function Stat({ value, label, cls }: { value: number; label: string; cls?: string }) {
  return (
    <div>
      <div className={cn('text-2xl font-bold tabular-nums', cls)}>{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  )
}

export function ConformiteCard({ data }: { data: ConformitySummary }) {
  const { t } = useI18n()

  return (
    <section className="rounded-lg border" aria-labelledby="conf-title">
      <div className="flex items-center gap-2 border-b p-3">
        <ShieldCheck className="size-4" aria-hidden />
        <span id="conf-title" className="text-sm font-semibold">
          {t({ fr: 'Conformité (Regafy)', en: 'Compliance (Regafy)' })}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4 text-center">
        <Stat
          value={data.nonConformDocs}
          label={t({ fr: 'Non conformes', en: 'Non-compliant' })}
          cls={data.nonConformDocs > 0 ? 'text-red-600' : undefined}
        />
        <Stat value={data.analyzedDocs} label={t({ fr: 'Analysés', en: 'Analyzed' })} />
        <Stat value={data.notAnalyzed} label={t({ fr: 'À analyser', en: 'To analyze' })} />
      </div>
    </section>
  )
}
