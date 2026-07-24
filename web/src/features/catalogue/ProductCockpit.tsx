import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Pencil,
  Pill,
  Zap,
} from 'lucide-react'
import { Tabs as RadixTabs } from 'radix-ui'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { useHeaderSlot } from '@/components/layout/header-slot'
import { LangThemeControls } from '@/components/layout/lang-theme-controls'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import {
  expiryTone,
  KPI_BADGE_TONE,
  openCorrespondences,
  type CorrSubState,
} from '@/features/dashboard/dashboard-data'
import { useOrgId } from '@/features/org/org-context'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { eurStringToFcfa } from '@/lib/money'
import { docTypeLabel } from './doc-types'
import { DocumentsSection } from './DocumentsSection'
import { ProductIcon } from './product-icon'
import {
  productCockpitVm,
  productConformity,
  productHistory,
  type DocConformityStatus,
} from './product-cockpit-data'
import { ProductForm } from './ProductForm'
import { getProduct, updateProduct } from './repository'
import { syncCatalogue } from './catalogue-sync'
import type { ProductFormValues } from './types'
import { useCatalogueSync } from './use-catalogue-sync'
import './product-cockpit.css'

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
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const setHeaderSlot = useHeaderSlot()
  // Identification en LECTURE SEULE par défaut (vigilance RA) ; « Modifier » révèle le formulaire.
  const [editingId, setEditingId] = useState(false)
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

  // En-tête applicatif (façon Google Docs) : retour + nom du produit ; libéré au démontage.
  const productName = data?.product?.nomCommercial
  useEffect(() => {
    if (!setHeaderSlot) return
    if (!productName) {
      setHeaderSlot(null)
      return
    }
    setHeaderSlot(
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Retour au catalogue', en: 'Back to catalogue' })}
          onClick={() => navigate('/catalogue')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-display min-w-0 flex-1 truncate text-base font-bold">
          {productName}
        </span>
        {/* Sélecteurs Langue/Thème — la fiche pose un headerSlot plein qui sinon masquerait ces
            contrôles. Réutilise la primitive partagée (DRY). Sous lg : disponibles via le tiroir ☰. */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <LangThemeControls />
        </div>
      </div>,
    )
    return () => setHeaderSlot(null)
  }, [setHeaderSlot, productName, navigate, t])

  async function handleSave(values: ProductFormValues, silent = false) {
    if (!productId) return
    try {
      await updateProduct(productId, values)
      // `updateProduct` re-dérive les liens vers les parties → chaîne ordonnée (FK), pas de push isolé.
      void syncCatalogue(orgId)
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
  const subtitle = [
    p.forme,
    p.classeTherapeutique,
    p.titulaire ? `${t({ fr: 'Titulaire', en: 'MAH' })} : ${p.titulaire}` : '',
  ]
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
    pght: p.pght ?? [],
    titulaire: p.titulaire ?? '',
    titulaireAdresse: p.titulaireAdresse ?? '',
    fabricant: p.fabricant ?? '',
    fabricantAdresse: p.fabricantAdresse ?? '',
  }

  const meta: { label: string; value: string }[] = [
    { label: t({ fr: 'Forme pharma.', en: 'Pharma form' }), value: p.forme || '—' },
    { label: t({ fr: 'Dosage', en: 'Strength' }), value: p.dosage || '—' },
    { label: t({ fr: 'Code ATC', en: 'ATC code' }), value: p.codeAtc || '—' },
    { label: t({ fr: 'Fabricant', en: 'Manufacturer' }), value: p.fabricant || '—' },
  ]

  // Identification produit (read-only) — hors titulaire/fabricant qui ont leur bloc apparié.
  const idFields: { label: string; value: string }[] = [
    { label: t({ fr: 'Nom commercial', en: 'Trade name' }), value: p.nomCommercial },
    { label: t({ fr: 'DCI', en: 'INN' }), value: p.dci },
    { label: t({ fr: 'Dosage', en: 'Strength' }), value: p.dosage },
    { label: t({ fr: 'Forme pharmaceutique', en: 'Pharma form' }), value: p.forme },
    { label: t({ fr: 'Présentation', en: 'Presentation' }), value: p.presentation },
    {
      label: t({ fr: 'Classe thérapeutique', en: 'Therapeutic class' }),
      value: p.classeTherapeutique,
    },
    { label: t({ fr: 'Code ATC', en: 'ATC code' }), value: p.codeAtc },
  ]

  const subStateLabel = (s: CorrSubState, unread: number) =>
    s === 'unread'
      ? t({ fr: `${unread} non lu(s)`, en: `${unread} unread` })
      : s === 'awaiting_agency'
        ? t({ fr: 'En attente agence', en: 'Awaiting agency' })
        : t({ fr: 'Décidé', en: 'Decided' })

  return (
    <div className="rim-cockpit -mx-4 md:-mx-6">
      <RadixTabs.Root defaultValue="identification">
        {/* ── HAUT FIGÉ : header + méta + onglets (ne bouge pas au scroll) ── */}
        <div className="rim-top">
          <header className="prod-header">
            <span className="prod-ico" aria-hidden>
              <ProductIcon forme={p.forme} className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="prod-name truncate">{p.nomCommercial}</div>
              {subtitle ? <div className="prod-sub truncate">{subtitle}</div> : null}
              <div className="prod-tags">
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
                  <StatusBadge tone={KPI_BADGE_TONE[expiryTone(vm.expiring)]}>
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
            <div className="prod-actions">
              {/* « Exporter CTD » n'a de sens que si le produit a AU MOINS un dossier (= passé par le
                  CTD Builder) ; masqué sinon (produit neuf sans opération). */}
              {data.dossiers.length > 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/workspace">
                    <Download /> {t({ fr: 'Exporter CTD', en: 'Export CTD' })}
                  </Link>
                </Button>
              ) : null}
              <Button size="sm" asChild variant="primary">
                <Link to={`/workspace/nouveau?produit=${productId}`}>
                  <Zap /> {t({ fr: 'Lancer une opération', en: 'Start an operation' })}
                </Link>
              </Button>
            </div>
          </header>

          <div className="prod-meta">
            {meta.map((m) => (
              <div key={m.label} className="min-w-0">
                <div className="meta-key">{m.label}</div>
                <div className="meta-val truncate" title={m.value}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <RadixTabs.List className="tabs-bar">
            <RadixTabs.Trigger value="identification" className="tab">
              {t({ fr: 'Identification', en: 'Identification' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="documents" className="tab">
              {t({ fr: 'Documents', en: 'Documents' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="soumissions" className="tab">
              {t({ fr: 'Soumissions', en: 'Submissions' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="historique" className="tab">
              {t({ fr: 'Historique', en: 'History' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="conformite" className="tab">
              {t({ fr: 'Conformité', en: 'Compliance' })}
            </RadixTabs.Trigger>
          </RadixTabs.List>
        </div>

        {/* ── CONTENU DÉFILANT ── */}
        <div className="rim-content">
          <RadixTabs.Content value="identification" className="outline-none">
            {editingId ? (
              <ProductForm
                key={p.id}
                defaultValues={defaults}
                onCancel={() => setEditingId(false)}
                onSubmit={(v) => {
                  void handleSave(v, false)
                  setEditingId(false)
                }}
                submitLabel={t({ fr: 'Enregistrer les modifications', en: 'Save changes' })}
              />
            ) : (
              <div className="rim-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="rim-section-title">
                    {t({ fr: 'Identification', en: 'Identification' })}
                  </h2>
                  <Button variant="outline" size="sm" onClick={() => setEditingId(true)}>
                    <Pencil /> {t({ fr: 'Modifier', en: 'Edit' })}
                  </Button>
                </div>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
                  {idFields.map((f) => (
                    <div key={f.label} className="min-w-0">
                      <dt className="meta-key">{f.label}</dt>
                      <dd className="meta-val mt-1 break-words">{f.value || '—'}</dd>
                    </div>
                  ))}
                </dl>
                {/* Titulaire / Fabricant — blocs appariés (nom + adresse), visuellement cohérents. */}
                <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <div className="meta-key">{t({ fr: "Titulaire d'AMM", en: 'MA holder' })}</div>
                    <div className="mt-1 font-medium break-words">{p.titulaire || '—'}</div>
                    {p.titulaireAdresse ? (
                      <div className="text-muted-foreground mt-0.5 text-sm break-words">
                        {p.titulaireAdresse}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="meta-key">{t({ fr: 'Fabricant', en: 'Manufacturer' })}</div>
                    <div className="mt-1 font-medium break-words">{p.fabricant || '—'}</div>
                    {p.fabricantAdresse ? (
                      <div className="text-muted-foreground mt-0.5 text-sm break-words">
                        {p.fabricantAdresse}
                      </div>
                    ) : null}
                  </div>
                </div>
                {/* PGHT par pays (lecture seule) — même donnée que la fiche de création. */}
                {p.pght && p.pght.some((e) => e.country || e.amount.trim()) ? (
                  <div className="mt-5 border-t pt-4">
                    <div className="meta-key mb-2">
                      {t({ fr: 'PGHT par pays', en: 'PGHT by country' })}
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {p.pght
                        .filter((e) => e.country || e.amount.trim())
                        .map((e, i) => {
                          const fcfa = e.currency === 'EUR' ? eurStringToFcfa(e.amount, lang) : ''
                          return (
                            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                              <span className="w-28 shrink-0 font-medium break-words">
                                {countryLabel(e.country, lang) || '—'}
                              </span>
                              <span className="text-muted-foreground">
                                {e.currency === 'EUR'
                                  ? `${e.amount} €${fcfa ? ` = ${fcfa} FCFA` : ''}`
                                  : `${e.amount} FCFA`}
                              </span>
                            </li>
                          )
                        })}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="documents" className="outline-none">
            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <section className="min-w-0 space-y-3">
                <h2 className="rim-section-title">
                  {t({ fr: "Documents d'information", en: 'Product information' })}
                </h2>
                <DocumentsSection orgId={orgId} productId={p.id} category="info" />
              </section>
              <section className="min-w-0 space-y-3">
                <h2 className="rim-section-title">
                  {t({ fr: 'Pièces administratives', en: 'Administrative documents' })}
                </h2>
                <DocumentsSection orgId={orgId} productId={p.id} category="admin" />
              </section>
            </div>
          </RadixTabs.Content>

          <RadixTabs.Content value="soumissions" className="outline-none">
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
              <div className="space-y-2">
                {soumissions.map((c) => (
                  <Link key={c.id} to={`/workspace/${c.dossierId}`} className="doc-row">
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
                ))}
              </div>
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="historique" className="outline-none">
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
                    <span className="text-muted-foreground shrink-0 text-xs">{fmtDate(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="conformite" className="outline-none">
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
              <div className="space-y-2">
                {conformity.perDoc.map((d) => (
                  <div key={d.docId} className="doc-row text-sm">
                    <span className="min-w-0 flex-1 truncate">{docTypeLabel(d.docType, lang)}</span>
                    <StatusBadge tone={CONFORMITY_TONE[d.status]}>
                      {d.status === 'conform'
                        ? t({ fr: 'Conforme', en: 'Compliant' })
                        : d.status === 'nonconform'
                          ? t({ fr: `${d.findings} à corriger`, en: `${d.findings} to fix` })
                          : t({ fr: 'Non analysé', en: 'Not analyzed' })}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </RadixTabs.Content>
        </div>
      </RadixTabs.Root>
    </div>
  )
}
