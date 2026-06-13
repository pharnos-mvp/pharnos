import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, Newspaper } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { useOrgId } from '@/features/org/org-context'
import { useDossierSync } from '@/features/workspace/use-dossier-sync'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { ActionsRequises } from './components/ActionsRequises'
import { buildActions, expiryStatus, type ExpiryStatus } from './dashboard-data'
import { REGULATORY_WATCH } from './regulatory-watch'

export function DashboardPage() {
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  // Synchros (best-effort) pour un poste de pilotage frais — offline : on lit le cache Dexie.
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  useCorrespondenceSync(orgId)

  // Une requête batchée par domaine (perf) ; tout dérive ensuite côté client.
  const data = useLiveQuery(async () => {
    const [products, documents, dossiers, correspondences, messages, reads, docAnalysis] =
      await Promise.all([
        db.products.where('orgId').equals(orgId).toArray(),
        db.documents.where('orgId').equals(orgId).toArray(),
        db.dossiers.where('orgId').equals(orgId).toArray(),
        db.correspondences.where('orgId').equals(orgId).toArray(),
        db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
        db.correspondenceReads.toArray(),
        db.docAnalysis.toArray(),
      ])
    return { products, documents, dossiers, correspondences, messages, reads, docAnalysis }
  }, [orgId])

  const actions = useMemo(() => (data ? buildActions(data, new Date()) : []), [data])

  // Validité des pièces administratives (vue détaillée, complément des actions priorisées).
  const { rows, expired, soon, ok } = useMemo(() => {
    const now = new Date()
    const products = new Map((data?.products ?? []).map((p) => [p.id, p.nomCommercial]))
    const computed = (data?.documents ?? [])
      .filter((d) => d.deletedAt === null && d.expiryDate)
      .map((d) => ({
        id: d.id,
        productId: d.productId,
        productName: products.get(d.productId) ?? '—',
        docType: d.docType,
        expiryDate: d.expiryDate as string,
        status: expiryStatus(d.expiryDate as string, now),
      }))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    return {
      rows: computed,
      expired: computed.filter((r) => r.status === 'expired').length,
      soon: computed.filter((r) => r.status === 'soon').length,
      ok: computed.filter((r) => r.status === 'ok').length,
    }
  }, [data])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t({ fr: 'Tableau de bord', en: 'Dashboard' })}</h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Poste de pilotage RA — vos actions, la validité des pièces & la veille (UEMOA/CEDEAO).',
            en: 'RA control center — your actions, document validity & regulatory watch (UEMOA/CEDEAO).',
          })}
        </p>
      </div>

      {/* Cœur : ce qui requiert une action, priorisé. */}
      <ActionsRequises items={actions} />

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

function StatusBadge({ status, t }: { status: ExpiryStatus; t: (s: Translatable) => string }) {
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
