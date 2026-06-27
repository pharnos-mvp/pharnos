import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Minus,
  Pill,
  Zap,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import {
  conformityTone,
  expiryTone,
  openCorrespondences,
  type CorrSubState,
  type KpiTone,
} from '@/features/dashboard/dashboard-data'
import { useOrgId } from '@/features/org/org-context'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { docTypeLabel } from './doc-types'
import { DocumentsSection } from './DocumentsSection'
import {
  productCockpitVm,
  productConformity,
  productHistory,
  type DocConformityStatus,
} from './product-cockpit-data'
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
const TONE_COLOR: Record<KpiTone, string> = {
  good: 'var(--success)',
  fair: 'var(--info)',
  passable: 'var(--warning)',
  poor: 'var(--danger)',
  neutral: 'var(--muted-foreground)',
}
const SUB_TONE: Record<CorrSubState, 'info' | 'warning' | 'success'> = {
  unread: 'info',
  awaiting_agency: 'warning',
  decided: 'success',
}
const CONFORMITY_TONE: Record<DocConformityStatus, 'success' | 'danger' | 'neutral'> = {
  conform: 'success',
  nonconform: 'danger',
  unanalyzed: 'neutral',
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
    const product = await getProduct(productId)
    if (!product)
      return {
        product: null as null,
        documents: [],
        dossiers: [],
        correspondences: [],
        messages: [],
        reads: [],
        docAnalysis: [],
        auditLog: [],
        generatedDocs: [],
      }
    const [docsRaw, dossiersRaw] = await Promise.all([
      db.documents.where('productId').equals(productId).toArray(),
      db.dossiers.where('productId').equals(productId).toArray(),
    ])
    const documents = docsRaw.filter((d) => d.deletedAt == null)
    const dossiers = dossiersRaw.filter((d) => d.deletedAt == null)
    const docIds = documents.map((d) => d.id)
    const dossierIds = dossiers.map((d) => d.id)
    const [corrRaw, docAnalysis, auditLog, genDocsRaw] = await Promise.all([
      dossierIds.length ? db.correspondences.where('dossierId').anyOf(dossierIds).toArray() : [],
      docIds.length ? db.docAnalysis.where('docId').anyOf(docIds).toArray() : [],
      // TODO(scale): auditLog chargé org-wide (append-only, non borné) puis filtré côté client ;
      // ajouter un index par entité/produit avant les grosses orgs. OK à l'échelle pilote.
      db.auditLog.where('orgId').equals(orgId).toArray(),
      dossierIds.length ? db.generatedDocs.where('dossierId').anyOf(dossierIds).toArray() : [],
    ])
    const correspondences = corrRaw.filter((c) => c.deletedAt == null)
    const generatedDocs = genDocsRaw.filter((g) => g.deletedAt == null)
    const corrIds = correspondences.map((c) => c.id)
    const [messages, reads] = await Promise.all([
      corrIds.length
        ? db.correspondenceMessages.where('correspondenceId').anyOf(corrIds).toArray()
        : [],
      db.correspondenceReads.toArray(),
    ])
    return {
      product,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      auditLog,
      generatedDocs,
    }
  }, [productId, orgId])

  const derived = useMemo(() => {
    if (!data?.product) return null
    const now = new Date()
    const vm = productCockpitVm(data.product, data.documents, data.dossiers, now)
    const soumissions = openCorrespondences(data.correspondences, data.messages, data.reads)
    const entityIds = new Set<string>([
      data.product.id,
      ...data.documents.map((d) => d.id),
      ...data.dossiers.map((d) => d.id),
      ...data.generatedDocs.map((g) => g.id),
    ])
    const historique = productHistory(data.auditLog, entityIds)
    const conformity = productConformity(data.documents, data.docAnalysis)
    return { vm, soumissions, historique, conformity }
  }, [data])

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

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : ''
  const actionLabel = (action: string) =>
    action === 'create'
      ? t({ fr: 'créé', en: 'created' })
      : action === 'delete'
        ? t({ fr: 'supprimé', en: 'deleted' })
        : t({ fr: 'modifié', en: 'updated' })

  if (data === undefined) return <CockpitSkeleton />

  if (!data?.product || !derived) {
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
  const { vm, soumissions, historique, conformity } = derived
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

  const subStateLabel = (s: CorrSubState, unread: number) =>
    s === 'unread'
      ? t({ fr: `${unread} non lu(s)`, en: `${unread} unread` })
      : s === 'awaiting_agency'
        ? t({ fr: 'En attente agence', en: 'Awaiting agency' })
        : t({ fr: 'Décidé', en: 'Decided' })

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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
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
              <TabsTrigger value="conformite">
                {t({ fr: 'Conformité', en: 'Compliance' })}
              </TabsTrigger>
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
              {soumissions.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title={t({ fr: 'Aucune soumission', en: 'No submission' })}
                  description={t({
                    fr: "Les correspondances avec l'agence apparaîtront ici.",
                    en: 'Agency correspondences will appear here.',
                  })}
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {soumissions.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/workspace/${c.dossierId}`}
                        className="hover:bg-accent/50 flex items-center gap-3 p-3"
                      >
                        <StatusBadge tone={SUB_TONE[c.state]}>
                          {subStateLabel(c.state, c.unread)}
                        </StatusBadge>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {c.country ? countryLabel(c.country, lang) : c.productName}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {fmtDate(c.date)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="historique" className="pt-4">
              {historique.length === 0 ? (
                <EmptyState
                  icon={<Clock3 />}
                  title={t({ fr: 'Aucune activité', en: 'No activity' })}
                  description={t({
                    fr: "L'activité du produit (pièces, dossiers, compilations) est tracée ici.",
                    en: 'Product activity (documents, dossiers, compilations) is tracked here.',
                  })}
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {historique.slice(0, 50).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {a.label}{' '}
                        <span className="text-muted-foreground">— {actionLabel(a.action)}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {fmtDate(a.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="conformite" className="pt-4">
              {conformity.perDoc.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 />}
                  title={t({ fr: 'Aucun document', en: 'No document' })}
                  description={t({
                    fr: 'Ajoutez des documents pour suivre leur conformité.',
                    en: 'Add documents to track their compliance.',
                  })}
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {conformity.perDoc.map((d) => (
                    <li key={d.docId} className="flex items-center gap-3 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {docTypeLabel(d.docType, lang)}
                      </span>
                      <StatusBadge tone={CONFORMITY_TONE[d.status]}>
                        {d.status === 'conform'
                          ? t({ fr: 'Conforme', en: 'Compliant' })
                          : d.status === 'nonconform'
                            ? t({ fr: `${d.findings} à corriger`, en: `${d.findings} to fix` })
                            : t({ fr: 'Non analysé', en: 'Not analyzed' })}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="min-w-0">
          <ConformityPanel
            pct={conformity.pct}
            nonConform={conformity.nonConform}
            notAnalyzed={conformity.notAnalyzed}
            expiring={vm.expiring.length}
            expiringTone={vm.expiring.length > 0 ? expiryTone(vm.expiring) : 'good'}
          />
        </aside>
      </div>
    </div>
  )
}

function ConformityPanel({
  pct,
  nonConform,
  notAnalyzed,
  expiring,
  expiringTone,
}: {
  pct: number | null
  nonConform: number
  notAnalyzed: number
  expiring: number
  expiringTone: KpiTone
}) {
  const { t } = useI18n()
  const tone = conformityTone(pct)
  const items: { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }[] = []
  if (expiring > 0)
    items.push({
      tone: TONE_BADGE[expiringTone] === 'danger' ? 'danger' : 'warning',
      label: t({ fr: `${expiring} pièce(s) à renouveler`, en: `${expiring} item(s) to renew` }),
    })
  if (nonConform > 0)
    items.push({
      tone: 'danger',
      label: t({ fr: `${nonConform} non conforme(s)`, en: `${nonConform} non-compliant` }),
    })
  if (notAnalyzed > 0)
    items.push({
      tone: 'neutral',
      label: t({ fr: `${notAnalyzed} à analyser`, en: `${notAnalyzed} to analyze` }),
    })
  if (items.length === 0)
    items.push({ tone: 'success', label: t({ fr: 'Tout est à jour', en: 'All up to date' }) })

  const ItemIcon = (itemTone: string) =>
    itemTone === 'success' ? (
      <CheckCircle2 className="text-success size-4 shrink-0" />
    ) : itemTone === 'neutral' ? (
      <Minus className="text-muted-foreground size-4 shrink-0" />
    ) : (
      <AlertTriangle
        className={`${itemTone === 'danger' ? 'text-danger' : 'text-warning'} size-4 shrink-0`}
      />
    )

  return (
    <Card className="gap-0 p-5">
      <h2 className="font-display text-sm font-semibold">
        {t({ fr: 'Conformité', en: 'Compliance' })}
      </h2>
      <div className="mt-3 flex items-end justify-between">
        <span className="font-display text-3xl font-semibold" style={{ color: TONE_COLOR[tone] }}>
          {pct == null ? '—' : `${pct}%`}
        </span>
        <span className="text-muted-foreground text-xs">{t({ fr: 'globale', en: 'overall' })}</span>
      </div>
      <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct ?? 0}%`, background: TONE_COLOR[tone] }}
        />
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {ItemIcon(it.tone)}
            <span className="min-w-0">{it.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
