import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, Building2, Clock3, Search, SearchX } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ListRow, ListRowIcon, ListRowLink } from '@/components/ui/list-row'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useTopbar } from '@/components/layout/topbar'
import { KPI_BADGE_TONE } from '@/features/dashboard/dashboard-data'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useOrgId } from '@/features/org/org-context'
import { db, type PartyRole } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { CatalogueTabs } from './CatalogueTabs'
import { buildOrgRows, filterOrgRows, sortRoles, type OrgRow } from './parties-data'
import { useCatalogueSync } from './use-catalogue-sync'

const ROLE_LABEL: Record<PartyRole, Translatable> = {
  titulaire: { fr: "Titulaire d'AMM", en: 'MA holder' },
  fabricant: { fr: 'Fabricant', en: 'Manufacturer' },
  distributeur: { fr: 'Distributeur', en: 'Distributor' },
}

export function OrganisationsPage() {
  const { t } = useI18n()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  useTopbar({ searchHidden: true })
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''

  const data = useLiveQuery(async () => {
    const [parties, products, documents] = await Promise.all([
      db.parties.where('orgId').equals(orgId).toArray(),
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
    ])
    return { parties, products, documents }
  }, [orgId])

  const rows = useMemo(
    () =>
      data ? buildOrgRows(data.parties, data.products, data.documents, new Date()) : undefined,
    [data],
  )
  const filtered = useMemo(() => (rows ? filterOrgRows(rows, q) : []), [rows, q])

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
        title={t({ fr: 'Organisations', en: 'Organizations' })}
        description={t({
          fr: 'Titulaires d’AMM, fabricants et distributeurs — alimentés automatiquement par vos produits.',
          en: 'MA holders, manufacturers and distributors — populated automatically from your products.',
        })}
      />

      {rows === undefined ? (
        <OrgSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={t({ fr: 'Aucune organisation', en: 'No organization' })}
          description={t({
            fr: 'Renseignez le titulaire d’AMM et le fabricant de vos produits : leurs fiches d’organisation apparaîtront ici, sans ressaisie.',
            en: 'Fill in the MA holder and manufacturer of your products: their organization records will appear here, with no re-entry.',
          })}
        />
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
                  fr: 'Rechercher (nom, pays, rôle…)',
                  en: 'Search (name, country, role…)',
                })}
                aria-label={t({ fr: 'Rechercher une organisation', en: 'Search an organization' })}
                className="pl-9"
              />
            </div>
            <span className="text-muted-foreground ml-auto text-sm" aria-live="polite">
              {q
                ? t({
                    fr: `${filtered.length} sur ${rows.length}`,
                    en: `${filtered.length} of ${rows.length}`,
                  })
                : t({
                    fr: `${rows.length} organisation${rows.length > 1 ? 's' : ''}`,
                    en: `${rows.length} organization${rows.length > 1 ? 's' : ''}`,
                  })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={t({ fr: 'Aucun résultat', en: 'No result' })}
              description={t({
                fr: 'Aucune organisation ne correspond à votre recherche.',
                en: 'No organization matches your search.',
              })}
            />
          ) : (
            <div className="flex flex-col gap-2" role="list">
              {filtered.map((row) => (
                <OrgListRow key={row.party.id} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  )
}

function OrgListRow({ row }: { row: OrgRow }) {
  const { t } = useI18n()
  const { party } = row
  const counts = [
    t({
      fr: `${row.productCount} produit${row.productCount > 1 ? 's' : ''}`,
      en: `${row.productCount} product${row.productCount > 1 ? 's' : ''}`,
    }),
    t({
      fr: `${row.docCount} document${row.docCount > 1 ? 's' : ''}`,
      en: `${row.docCount} document${row.docCount > 1 ? 's' : ''}`,
    }),
  ].join(' · ')

  return (
    <ListRow role="listitem">
      <ListRowIcon>
        <Building2 className="size-5" />
      </ListRowIcon>
      <div className="min-w-0 flex-1">
        <ListRowLink to={`/catalogue/organisations/${party.id}`} title={party.nom}>
          {party.nom}
        </ListRowLink>
        <div className="text-muted-foreground mt-0.5 truncate text-xs">{counts}</div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <OrgHealthBadges row={row} />
        {sortRoles(party.roles).map((r) => (
          <StatusBadge key={r} tone="info">
            {t(ROLE_LABEL[r])}
          </StatusBadge>
        ))}
      </div>

      {row.countries.length > 0 ? (
        <span
          className="hidden shrink-0 items-center gap-1 sm:flex"
          role="img"
          aria-label={row.countries.join(', ')}
        >
          {row.countries.slice(0, 4).map((c) => (
            <CountryFlag key={c} code={c} size={16} />
          ))}
          {row.countries.length > 4 ? (
            <span className="text-muted-foreground text-xs">+{row.countries.length - 4}</span>
          ) : null}
        </span>
      ) : null}
    </ListRow>
  )
}

/** Badges d'exception (périmée / à renouveler) — management par exception, comme la liste produits. */
function OrgHealthBadges({ row }: { row: OrgRow }) {
  const { t } = useI18n()
  if (row.expiredCount === 0 && row.expiringCount === 0) return null
  return (
    <>
      {row.expiredCount > 0 ? (
        <StatusBadge tone="danger">
          <AlertCircle />
          {t({
            fr: `${row.expiredCount} expirée${row.expiredCount > 1 ? 's' : ''}`,
            en: `${row.expiredCount} expired`,
          })}
        </StatusBadge>
      ) : null}
      {row.expiringCount > 0 ? (
        // Si un badge « expirée » (rouge) est déjà là, le « à renouveler » passe en amber pour ne
        // pas dupliquer le rouge ; sinon il porte l'urgence réelle (rouge si pièce à mi-fenêtre).
        <StatusBadge tone={row.expiredCount > 0 ? 'warning' : KPI_BADGE_TONE[row.tone]}>
          <Clock3 />
          {t({
            fr: `${row.expiringCount} à renouveler`,
            en: `${row.expiringCount} to renew`,
          })}
        </StatusBadge>
      ) : null}
    </>
  )
}

function OrgSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-9 w-full max-w-md" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}
