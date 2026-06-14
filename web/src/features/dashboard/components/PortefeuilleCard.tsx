import { Boxes } from 'lucide-react'

import { activityLabel, countryFlag, countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n } from '@/lib/i18n-context'
import type { Portfolio } from '../dashboard-data'

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  )
}

export function PortefeuilleCard({ data }: { data: Portfolio }) {
  const { t } = useI18n()

  return (
    <section className="rounded-lg border" aria-labelledby="portfolio-title">
      <div className="flex items-center gap-2 border-b p-3">
        <Boxes className="size-4" aria-hidden />
        <span id="portfolio-title" className="text-sm font-semibold">
          {t({ fr: 'Portefeuille', en: 'Portfolio' })}
        </span>
      </div>
      <div className="space-y-3 p-3 text-sm">
        <div className="flex gap-6">
          <Stat value={data.productCount} label={t({ fr: 'Produits', en: 'Products' })} />
          <Stat value={data.dossierCount} label={t({ fr: 'Dossiers', en: 'Dossiers' })} />
          <Stat value={data.byCountry.length} label={t({ fr: 'Pays', en: 'Countries' })} />
        </div>

        {data.byCountry.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-xs">
              {t({ fr: 'Couverture pays', en: 'Country coverage' })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.byCountry.map((c) => (
                <span
                  key={c.code}
                  className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                >
                  <span aria-hidden>{countryFlag(c.code)}</span>
                  {countryLabel(c.code)}
                  <span className="text-muted-foreground tabular-nums">{c.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {data.byActivity.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-xs">
              {t({ fr: 'Par activité', en: 'By activity' })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.byActivity.map((a) => (
                <span key={a.code} className="bg-muted rounded-full px-2 py-0.5 text-xs">
                  {activityLabel(a.code)}{' '}
                  <span className="text-muted-foreground tabular-nums">{a.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
