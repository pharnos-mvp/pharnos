import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Clock3, FileText, Pill, Zap } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { expiryTone, type KpiTone } from '@/features/dashboard/dashboard-data'
import { useOrgId } from '@/features/org/org-context'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { DocumentsSection } from './DocumentsSection'
import { productCockpitVm } from './product-cockpit-data'
import { ProductForm } from './ProductForm'
import { getProduct, updateProduct } from './repository'
import { syncProducts } from './sync'
import type { ProductFormValues } from './types'
import { useCatalogueSync } from './use-catalogue-sync'

// Tonalité métier → variante du badge sémantique (réutilise le grading du dashboard).
const TONE_BADGE: Record<KpiTone, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  good: 'success',
  fair: 'info',
  passable: 'warning',
  poor: 'danger',
  neutral: 'neutral',
}

function BackLink() {
  const { t } = useI18n()
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/catalogue">
        <ArrowLeft /> {t({ fr: 'Retour au catalogue', en: 'Back to catalogue' })}
      </Link>
    </Button>
  )
}

function SoonState({ icon }: { icon: ReactNode }) {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={icon}
      title={t({ fr: 'Bientôt', en: 'Coming soon' })}
      description={t({
        fr: 'Cet onglet arrive dans la prochaine tranche du cockpit.',
        en: 'This tab is coming in the next cockpit slice.',
      })}
    />
  )
}

function CockpitSkeleton() {
  return (
    <div className="space-y-5 pt-4 md:pt-6" aria-hidden="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

export function ProductCockpit() {
  const { productId } = useParams()
  const orgId = useOrgId()
  const { t, lang } = useI18n()
  useCatalogueSync(orgId)

  const data = useLiveQuery(async () => {
    if (!productId) return null
    const [product, documents, dossiers] = await Promise.all([
      getProduct(productId),
      db.documents.where('productId').equals(productId).toArray(),
      db.dossiers.where('productId').equals(productId).toArray(),
    ])
    return {
      product: product ?? null,
      documents: documents.filter((d) => d.deletedAt == null),
      dossiers: dossiers.filter((d) => d.deletedAt == null),
    }
  }, [productId])

  const vm = useMemo(
    () =>
      data?.product
        ? productCockpitVm(data.product, data.documents, data.dossiers, new Date())
        : null,
    [data],
  )

  async function handleSave(values: ProductFormValues, silent = false) {
    if (!productId) return
    try {
      await updateProduct(productId, values)
      void syncProducts(orgId)
      if (!silent) toast.success(t({ fr: 'Modifications enregistrées', en: 'Changes saved' }))
    } catch (error) {
      if (!silent)
        toast.error(t({ fr: "Échec de l'enregistrement", en: 'Save failed' }), {
          description: error instanceof Error ? error.message : undefined,
        })
    }
  }

  if (data === undefined) return <CockpitSkeleton />

  if (!data?.product || !vm) {
    return (
      <div className="pt-4 md:pt-6">
        <BackLink />
        <EmptyState
          icon={<Pill />}
          title={t({ fr: 'Produit introuvable', en: 'Product not found' })}
          description={t({
            fr: 'Ce produit a peut-être été supprimé.',
            en: 'This product may have been deleted.',
          })}
          action={
            <Button asChild>
              <Link to="/catalogue">
                {t({ fr: 'Retour au catalogue', en: 'Back to catalogue' })}
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  const p = data.product
  const subtitle = [p.forme, p.classeTherapeutique, p.titulaire ? `MAH : ${p.titulaire}` : '']
    .filter(Boolean)
    .join(' · ')

  const defaults: ProductFormValues = {
    nomCommercial: p.nomCommercial,
    dci: p.dci,
    dosage: p.dosage,
    forme: p.forme,
    presentation: p.presentation,
    classeTherapeutique: p.classeTherapeutique,
    codeAtc: p.codeAtc,
    titulaire: p.titulaire ?? '',
    titulaireAdresse: p.titulaireAdresse ?? '',
    fabricant: p.fabricant ?? '',
    fabricantAdresse: p.fabricantAdresse ?? '',
  }

  const details: { label: string; value: string }[] = [
    { label: t({ fr: 'Forme pharma.', en: 'Pharma form' }), value: p.forme || '—' },
    { label: t({ fr: 'Dosage', en: 'Strength' }), value: p.dosage || '—' },
    { label: t({ fr: 'Code ATC', en: 'ATC code' }), value: p.codeAtc || '—' },
    { label: t({ fr: 'Fabricant', en: 'Manufacturer' }), value: p.fabricant || '—' },
  ]

  return (
    <div className="space-y-5 pt-4 md:pt-6">
      <BackLink />

      <Card className="gap-0 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="bg-info-subtle text-info flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Pill className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display truncate text-2xl font-semibold tracking-tight">
                {p.nomCommercial}
              </h1>
              {subtitle ? (
                <p className="text-muted-foreground mt-0.5 truncate text-sm">{subtitle}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {vm.ammActive ? (
                  <StatusBadge tone="success">
                    {t({ fr: 'AMM active', en: 'MA active' })}
                  </StatusBadge>
                ) : vm.hasAmm ? (
                  <StatusBadge tone="danger">
                    {t({ fr: 'AMM expirée', en: 'MA expired' })}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">
                    {t({ fr: 'AMM non renseignée', en: 'MA not set' })}
                  </StatusBadge>
                )}
                {vm.countries.length > 0 ? (
                  <StatusBadge tone="info">
                    {t({
                      fr: `${vm.countries.length} pays`,
                      en: `${vm.countries.length} ${vm.countries.length > 1 ? 'countries' : 'country'}`,
                    })}
                  </StatusBadge>
                ) : null}
                {vm.expiring.length > 0 ? (
                  <StatusBadge tone={TONE_BADGE[expiryTone(vm.expiring)]}>
                    <Clock3 />
                    {t({
                      fr: `${vm.expiring.length} à renouveler`,
                      en: `${vm.expiring.length} to renew`,
                    })}
                  </StatusBadge>
                ) : null}
                {vm.countries.length > 0 ? (
                  <span
                    className="ml-1 flex items-center gap-1"
                    aria-label={vm.countries.map((c) => countryLabel(c, lang)).join(', ')}
                  >
                    {vm.countries.slice(0, 8).map((c) => (
                      <CountryFlag key={c} code={c} size={16} />
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Button asChild>
            <Link to="/workspace/nouveau">
              <Zap /> {t({ fr: 'Lancer une opération', en: 'Start an operation' })}
            </Link>
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {d.label}
              </div>
              <div className="mt-1 truncate font-medium" title={d.value}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Tabs defaultValue="documents">
        <TabsList variant="line">
          <TabsTrigger value="documents">{t({ fr: 'Documents', en: 'Documents' })}</TabsTrigger>
          <TabsTrigger value="identification">
            {t({ fr: 'Identification', en: 'Identification' })}
          </TabsTrigger>
          <TabsTrigger value="soumissions">
            {t({ fr: 'Soumissions', en: 'Submissions' })}
          </TabsTrigger>
          <TabsTrigger value="historique">{t({ fr: 'Historique', en: 'History' })}</TabsTrigger>
          <TabsTrigger value="conformite">{t({ fr: 'Conformité', en: 'Compliance' })}</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6 pt-4">
          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold">
              {t({ fr: "Documents d'information", en: 'Product information' })}
            </h2>
            <DocumentsSection orgId={orgId} productId={p.id} category="info" />
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold">
              {t({ fr: 'Pièces administratives', en: 'Administrative documents' })}
            </h2>
            <DocumentsSection orgId={orgId} productId={p.id} category="admin" />
          </section>
        </TabsContent>

        <TabsContent value="identification" className="pt-4">
          <ProductForm
            key={p.id}
            defaultValues={defaults}
            onSubmit={(v) => void handleSave(v, false)}
            onAutoSave={(v) => void handleSave(v, true)}
            submitLabel={t({ fr: 'Enregistrer les modifications', en: 'Save changes' })}
          />
        </TabsContent>

        <TabsContent value="soumissions" className="pt-4">
          <SoonState icon={<FileText />} />
        </TabsContent>
        <TabsContent value="historique" className="pt-4">
          <SoonState icon={<Clock3 />} />
        </TabsContent>
        <TabsContent value="conformite" className="pt-4">
          <SoonState icon={<FileText />} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
