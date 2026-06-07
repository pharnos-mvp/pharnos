import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, Newspaper } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { REGULATORY_WATCH } from './regulatory-watch'

type Status = 'expired' | 'soon' | 'ok'

export function DashboardPage() {
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  useCatalogueSync(orgId)

  const items = useLiveQuery(async () => {
    const docs = (await db.documents.where('orgId').equals(orgId).toArray()).filter(
      (d) => d.deletedAt === null && d.expiryDate,
    )
    const products = new Map(
      (await db.products.where('orgId').equals(orgId).toArray()).map((p) => [
        p.id,
        p.nomCommercial,
      ]),
    )
    return docs
      .map((d) => ({
        id: d.id,
        productId: d.productId,
        productName: products.get(d.productId) ?? '—',
        docType: d.docType,
        expiryDate: d.expiryDate as string,
      }))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }, [orgId])

  const { rows, expired, soon, ok } = useMemo(() => {
    const today = new Date()
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 90)
    const computed = (items ?? []).map((it) => {
      const exp = new Date(it.expiryDate)
      const status: Status = exp < today ? 'expired' : exp <= soonDate ? 'soon' : 'ok'
      return { ...it, status }
    })
    return {
      rows: computed,
      expired: computed.filter((r) => r.status === 'expired').length,
      soon: computed.filter((r) => r.status === 'soon').length,
      ok: computed.filter((r) => r.status === 'ok').length,
    }
  }, [items])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t({ fr: 'Tableau de bord', en: 'Dashboard' })}</h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Validité des pièces & veille réglementaire (UEMOA/CEDEAO).',
            en: 'Document validity & regulatory watch (UEMOA/CEDEAO).',
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={AlertTriangle}
          color="text-red-600"
          value={expired}
          label={t({ fr: 'Expirées', en: 'Expired' })}
        />
        <Kpi
          icon={CalendarClock}
          color="text-amber-600"
          value={soon}
          label={t({ fr: 'Bientôt (90 j)', en: 'Soon (90 d)' })}
        />
        <Kpi
          icon={CheckCircle2}
          color="text-emerald-600"
          value={ok}
          label={t({ fr: 'Valides', en: 'Valid' })}
        />
      </div>

      <section className="rounded-lg border">
        <div className="border-b p-3 text-sm font-semibold">
          {t({ fr: 'Validité des pièces administratives', en: 'Administrative document validity' })}
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {t({
              fr: 'Aucune pièce datée. Renseignez des dates de validité (GMP, AMM, COPP…) sur les documents.',
              en: 'No dated documents. Add expiry dates (GMP, AMM, COPP…) on documents.',
            })}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/catalogue/${r.productId}`)}
                  className="hover:bg-accent flex w-full items-center gap-3 p-3 text-left text-sm"
                >
                  <StatusBadge status={r.status} t={t} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.productName}</span>
                    <span className="text-muted-foreground"> — {docTypeLabel(r.docType)}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {new Date(r.expiryDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border">
        <div className="flex items-center gap-2 border-b p-3 text-sm font-semibold">
          <Newspaper className="size-4" />
          {t({ fr: 'Veille réglementaire', en: 'Regulatory watch' })}
        </div>
        <ul className="divide-y">
          {REGULATORY_WATCH.map((w) => (
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
    </div>
  )
}

function Kpi({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof AlertTriangle
  color: string
  value: number
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <Icon className={cn('size-7', color)} />
      <div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </div>
    </div>
  )
}

function StatusBadge({ status, t }: { status: Status; t: (s: Translatable) => string }) {
  if (status === 'expired')
    return <Badge variant="destructive">{t({ fr: 'Expiré', en: 'Expired' })}</Badge>
  if (status === 'soon') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        {t({ fr: 'Bientôt', en: 'Soon' })}
      </Badge>
    )
  }
  return <Badge variant="outline">{t({ fr: 'Valide', en: 'Valid' })}</Badge>
}
