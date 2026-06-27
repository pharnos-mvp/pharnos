import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  Clock3,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import type { KpiTone } from '@/features/dashboard/dashboard-data'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useDossierSync } from '@/features/workspace/use-dossier-sync'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import {
  buildCatalogueRows,
  catalogueCountries,
  filterCatalogueRows,
  type CatalogueRow,
  type StatusFilter,
} from './catalogue-list-data'
import { ProductIcon } from './product-icon'
import { deleteProduct } from './repository'
import { syncProducts } from './sync'
import { useCatalogueSync } from './use-catalogue-sync'
import './catalogue-list.css'

/** Tonalité de santé (KPI) → tonalité de badge sémantique. */
const TONE_BADGE: Record<KpiTone, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  good: 'success',
  fair: 'info',
  passable: 'warning',
  poor: 'danger',
  neutral: 'neutral',
}

export function CataloguePage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  const [params, setParams] = useSearchParams()

  const data = useLiveQuery(async () => {
    const [products, documents, dossiers, docAnalysis] = await Promise.all([
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.docAnalysis.toArray(),
    ])
    return { products, documents, dossiers, docAnalysis }
  }, [orgId])

  const rows = useMemo(
    () =>
      data
        ? buildCatalogueRows(
            data.products,
            data.documents,
            data.dossiers,
            data.docAnalysis,
            new Date(),
          )
        : undefined,
    [data],
  )

  const q = params.get('q') ?? ''
  const country = params.get('country') ?? ''
  const status = (params.get('filter') as StatusFilter) || 'all'

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  const toggleStatus = (s: StatusFilter) => setParam('filter', status === s ? '' : s)
  const reset = () => setParams({}, { replace: true })
  const hasFilters = q !== '' || country !== '' || status !== 'all'

  const filtered = useMemo(
    () => (rows ? filterCatalogueRows(rows, { q, country, status }) : []),
    [rows, q, country, status],
  )
  const countries = useMemo(
    () =>
      rows
        ? catalogueCountries(rows).sort((a, b) =>
            countryLabel(a, lang).localeCompare(countryLabel(b, lang)),
          )
        : [],
    [rows, lang],
  )

  return (
    <Page>
      <PageHeader
        title={t({ fr: 'Catalogue', en: 'Catalogue' })}
        description={t({
          fr: 'Le référentiel de vos produits — santé réglementaire en un coup d’œil.',
          en: 'Your product master data — regulatory health at a glance.',
        })}
        actions={
          <Button asChild>
            <Link to="/catalogue/nouveau">
              <Plus /> {t({ fr: 'Nouveau produit', en: 'New product' })}
            </Link>
          </Button>
        }
      />

      {rows === undefined ? (
        <CatalogueSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title={t({ fr: 'Aucun produit', en: 'No product' })}
          description={t({
            fr: 'Enregistrez votre premier produit. Il sera disponible hors-ligne et alimentera le CTD Workspace, la traduction et le suivi de validité.',
            en: 'Save your first product. It will be available offline and feed the CTD Workspace, translation and validity tracking.',
          })}
          action={
            <Button asChild>
              <Link to="/catalogue/nouveau">
                <Plus /> {t({ fr: 'Nouveau produit', en: 'New product' })}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <CatalogueToolbar
            q={q}
            country={country}
            status={status}
            countries={countries}
            total={rows.length}
            shown={filtered.length}
            hasFilters={hasFilters}
            onSearch={(v) => setParam('q', v)}
            onCountry={(v) => setParam('country', v)}
            onToggleStatus={toggleStatus}
            onReset={reset}
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={t({ fr: 'Aucun résultat', en: 'No result' })}
              description={t({
                fr: 'Aucun produit ne correspond à votre recherche ou à vos filtres.',
                en: 'No product matches your search or filters.',
              })}
              action={
                <Button variant="outline" onClick={reset}>
                  {t({ fr: 'Réinitialiser', en: 'Reset' })}
                </Button>
              }
            />
          ) : (
            <ProductList rows={filtered} />
          )}
        </div>
      )}
    </Page>
  )
}

function CatalogueSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

function CatalogueToolbar({
  q,
  country,
  status,
  countries,
  total,
  shown,
  hasFilters,
  onSearch,
  onCountry,
  onToggleStatus,
  onReset,
}: {
  q: string
  country: string
  status: StatusFilter
  countries: string[]
  total: number
  shown: number
  hasFilters: boolean
  onSearch: (v: string) => void
  onCountry: (v: string) => void
  onToggleStatus: (s: StatusFilter) => void
  onReset: () => void
}) {
  const { t, lang } = useI18n()
  const chip = (s: StatusFilter, active: boolean, label: string, Icon: typeof Clock3) => (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={() => onToggleStatus(s)}
      aria-pressed={active}
    >
      <Icon /> {label}
    </Button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t({ fr: 'Rechercher (nom, DCI, ATC…)', en: 'Search (name, INN, ATC…)' })}
          aria-label={t({ fr: 'Rechercher un produit', en: 'Search a product' })}
          className="pl-9"
        />
      </div>

      <select
        value={country}
        onChange={(e) => onCountry(e.target.value)}
        aria-label={t({ fr: 'Filtrer par pays', en: 'Filter by country' })}
        className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
      >
        <option value="">{t({ fr: 'Tous les pays', en: 'All countries' })}</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {countryLabel(c, lang)}
          </option>
        ))}
      </select>

      {chip('expiring', status === 'expiring', t({ fr: 'À renouveler', en: 'Renewals' }), Clock3)}
      {chip(
        'nonconform',
        status === 'nonconform',
        t({ fr: 'Non conforme', en: 'Non-compliant' }),
        AlertCircle,
      )}

      <div className="text-muted-foreground ml-auto flex items-center gap-2 text-sm">
        <span aria-live="polite">
          {hasFilters
            ? t({ fr: `${shown} sur ${total}`, en: `${shown} of ${total}` })
            : t({
                fr: `${total} produit${total > 1 ? 's' : ''}`,
                en: `${total} product${total > 1 ? 's' : ''}`,
              })}
        </span>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RefreshCw /> {t({ fr: 'Réinitialiser', en: 'Reset' })}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function HealthBadges({ row }: { row: CatalogueRow }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.ammStatus === 'active' ? (
        <StatusBadge tone="success">{t({ fr: 'AMM active', en: 'MA active' })}</StatusBadge>
      ) : row.ammStatus === 'expired' ? (
        <StatusBadge tone="danger">{t({ fr: 'AMM expirée', en: 'MA expired' })}</StatusBadge>
      ) : (
        <StatusBadge tone="neutral">{t({ fr: 'Sans AMM', en: 'No MA' })}</StatusBadge>
      )}
      {row.expiringCount > 0 ? (
        <StatusBadge tone={TONE_BADGE[row.expiringTone]}>
          <Clock3 />
          {t({
            fr: `${row.expiringCount} à renouveler`,
            en: `${row.expiringCount} to renew`,
          })}
        </StatusBadge>
      ) : null}
      {row.nonConformCount > 0 ? (
        <StatusBadge tone="danger">
          <AlertCircle />
          {t({
            fr: `${row.nonConformCount} non conforme`,
            en: `${row.nonConformCount} non-compliant`,
          })}
        </StatusBadge>
      ) : null}
    </div>
  )
}

function ProductList({ rows }: { rows: CatalogueRow[] }) {
  const { lang } = useI18n()
  return (
    <div className="pharnos-cat">
      <div className="cat-list" role="list">
        {rows.map(({ product: p, ...row }) => {
          const sub = [p.dci, p.dosage, p.forme].filter(Boolean).join(' · ')
          return (
            <div className="cat-row" role="listitem" key={p.id}>
              <span className="cat-ico" aria-hidden>
                <ProductIcon forme={p.forme} className="size-5" />
              </span>
              <div className="cat-main">
                <Link to={`/catalogue/${p.id}`} className="cat-name" title={p.nomCommercial}>
                  {p.nomCommercial}
                </Link>
                {sub ? (
                  <div className="cat-sub" title={sub}>
                    {sub}
                  </div>
                ) : null}
              </div>

              <div className="cat-health">
                <HealthBadges row={{ product: p, ...row }} />
              </div>

              {row.countries.length > 0 ? (
                <span
                  className="cat-flags"
                  aria-label={row.countries.map((c) => countryLabel(c, lang)).join(', ')}
                >
                  {row.countries.slice(0, 4).map((c) => (
                    <CountryFlag key={c} code={c} size={16} />
                  ))}
                  {row.countries.length > 4 ? (
                    <span className="text-muted-foreground text-xs">
                      +{row.countries.length - 4}
                    </span>
                  ) : null}
                </span>
              ) : null}

              <div className="cat-actions">
                <DeleteProductDialog id={p.id} name={p.nomCommercial} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeleteProductDialog({ id, name }: { id: string; name: string }) {
  const { t } = useI18n()
  const orgId = useOrgId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await deleteProduct(id)
      void syncProducts(orgId)
      toast.success(t({ fr: 'Produit supprimé', en: 'Product deleted' }))
    } catch {
      toast.error(t({ fr: 'Échec de la suppression', en: 'Deletion failed' }))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-danger"
          aria-label={t({ fr: `Supprimer ${name}`, en: `Delete ${name}` })}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t({ fr: `Supprimer « ${name} » ?`, en: `Delete "${name}"?` })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t({
              fr: 'Cette action est irréversible. Le produit et ses informations seront supprimés.',
              en: 'This action is irreversible. The product and its information will be deleted.',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t({ fr: 'Annuler', en: 'Cancel' })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void confirm()
            }}
            disabled={busy}
          >
            {t({ fr: 'Supprimer', en: 'Delete' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
