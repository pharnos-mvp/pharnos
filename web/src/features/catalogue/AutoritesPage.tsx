import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Landmark, Receipt, Search, SearchX } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ListRow, ListRowIcon, ListRowLink } from '@/components/ui/list-row'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useTopbar } from '@/components/layout/topbar'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { buildAuthorityRows, filterAuthorityRows, type AuthorityRow } from './authorities-data'
import { CatalogueTabs } from './CatalogueTabs'

const LANG_LABEL: Record<string, string> = { fr: 'FR', en: 'EN', pt: 'PT' }

export function AutoritesPage() {
  const { t } = useI18n()
  const orgId = useOrgId()
  useTopbar({ searchHidden: true })
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''

  // Empreinte RA de l'org (dossiers + AMM) — le référentiel agences est statique (curé).
  const data = useLiveQuery(async () => {
    const [dossiers, documents] = await Promise.all([
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
    ])
    return { dossiers, documents }
  }, [orgId])

  const rows = useMemo(
    () => (data ? buildAuthorityRows(data.dossiers, data.documents) : undefined),
    [data],
  )
  const filtered = useMemo(() => (rows ? filterAuthorityRows(rows, q) : []), [rows, q])

  const setQ = (v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('q', v)
        else next.delete('q')
        return next
      },
      { replace: true },
    )

  return (
    <Page>
      <CatalogueTabs />
      <PageHeader
        title={t({ fr: 'Autorités', en: 'Authorities' })}
        description={t({
          fr: 'Agences nationales de réglementation pharmaceutique (UEMOA/CEDEAO) — destinataires de vos dossiers.',
          en: 'National medicines regulatory authorities (UEMOA/ECOWAS) — recipients of your submissions.',
        })}
      />

      {rows === undefined ? (
        <AuthSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={100}
                placeholder={t({
                  fr: 'Rechercher (sigle, pays…)',
                  en: 'Search (acronym, country…)',
                })}
                aria-label={t({ fr: 'Rechercher une autorité', en: 'Search an authority' })}
                className="pl-9"
              />
            </div>
            <span className="text-muted-foreground ml-auto text-sm" aria-live="polite">
              {t({
                fr: `${filtered.length} autorité${filtered.length > 1 ? 's' : ''}`,
                en: `${filtered.length} authorit${filtered.length > 1 ? 'ies' : 'y'}`,
              })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={t({ fr: 'Aucun résultat', en: 'No result' })}
              description={t({
                fr: 'Aucune autorité ne correspond à votre recherche.',
                en: 'No authority matches your search.',
              })}
            />
          ) : (
            <div className="flex flex-col gap-2" role="list">
              {filtered.map((row) => (
                <AuthorityListRow key={row.code} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  )
}

function AuthorityListRow({ row }: { row: AuthorityRow }) {
  const { t } = useI18n()
  const footprint = [
    row.dossierCount > 0
      ? t({
          fr: `${row.dossierCount} dossier${row.dossierCount > 1 ? 's' : ''}`,
          en: `${row.dossierCount} submission${row.dossierCount > 1 ? 's' : ''}`,
        })
      : null,
    row.ammCount > 0 ? t({ fr: `${row.ammCount} AMM`, en: `${row.ammCount} MA` }) : null,
  ].filter(Boolean)

  return (
    <ListRow role="listitem">
      <ListRowIcon className="from-violet-100 to-violet-200 text-violet-700 dark:from-[#241b3b] dark:to-[#33245e] dark:text-violet-300">
        <Landmark className="size-5" />
      </ListRowIcon>
      <div className="min-w-0 flex-1">
        <ListRowLink to={`/catalogue/autorites/${row.code}`} title={row.agency.full}>
          {row.agency.name}
        </ListRowLink>
        <div className="text-muted-foreground mt-0.5 truncate text-xs" title={row.agency.full}>
          {row.agency.full}
          {footprint.length > 0 ? ` · ${footprint.join(' · ')}` : ''}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {row.hasProfile ? (
          <StatusBadge tone="info">
            <Receipt />
            {t({ fr: 'Barème', en: 'Fees' })}
          </StatusBadge>
        ) : null}
        <StatusBadge tone="neutral">{LANG_LABEL[row.officialLang] ?? row.officialLang}</StatusBadge>
      </div>

      <span className="hidden shrink-0 sm:flex" role="img" aria-label={row.code}>
        <CountryFlag code={row.code} size={16} />
      </span>
    </ListRow>
  )
}

function AuthSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-9 w-full max-w-md" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}
