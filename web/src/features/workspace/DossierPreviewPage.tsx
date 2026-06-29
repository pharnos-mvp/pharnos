import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Download, PanelLeftClose, PanelLeftOpen, Pencil, Send } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAuth } from '@/features/auth/auth-context'
import { listDocuments } from '@/features/catalogue/documents-repository'
import { dossierDisplayStatus } from '@/features/correspondence/correspondence-constants'
import { listByDossier } from '@/features/correspondence/correspondence-repository'
import { ShareDialog } from '@/features/correspondence/ShareDialog'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { expiringDocs } from '@/features/dashboard/dashboard-data'
import { useOrgId } from '@/features/org/org-context'
import { getOrgBranding } from '@/features/profile/pro-settings-repository'
import { db, type DossierAttachmentRecord, type GeneratedDocRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { listAttachments } from './dossier-attachments-repository'
import { DossierAction } from './dossier-action'
import { countryLabel } from './dossier-constants'
import { archiveDossier, deleteDossier, getDossier, restoreDossier } from './dossier-repository'
import {
  attachmentsForNode,
  buildDocsByNode,
  docsForNode,
  dossierCompletion,
  genDocsForNode,
} from './dossier-selectors'
import { syncDossiers } from './dossier-sync'
import { dossierBaseName, triggerDownload } from './download-utils'
import { deadlineLabel } from './format-time'
import { listGeneratedDocs } from './generated-docs-repository'
import type { CtdNodeDef } from './module1-tree'
import {
  avancementLabel,
  dossierRef,
  isDeadlineUrgent,
  OPS_STATUS_TONE,
  opsStatusLabel,
  procedureLabel,
} from './operations-data'
import { PdfViewer, type PdfViewerHandle } from './PdfViewer'
import { agencyFor } from './roadmap-data'
import { flattenTree } from './tree-utils'

/**
 * Page d'APERÇU d'un dossier (clic par défaut depuis le board) : prévisualisation du montage
 * Module 1 compilé (moteur `compileDossierToPdf` réutilisé, zone A4 byte-exact en lecture seule) +
 * actions Modifier (→ CTD Builder) / Télécharger / Envoyer + cycle de vie. Métriques DÉRIVÉES
 * (mêmes helpers que le builder → chiffres identiques).
 */
export function DossierPreviewPage() {
  const { dossierId } = useParams()
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { user } = useAuth()

  const dossier = useLiveQuery(
    async () => (dossierId ? ((await getDossier(dossierId)) ?? null) : null),
    [dossierId],
  )
  const product = useLiveQuery(
    async () => (dossier ? ((await db.products.get(dossier.productId)) ?? null) : null),
    [dossier?.productId],
  )
  const docs = useLiveQuery(
    () => (dossier ? listDocuments(dossier.productId) : undefined),
    [dossier?.productId],
  )
  const genDocs = useLiveQuery(
    () => (dossierId ? listGeneratedDocs(dossierId) : Promise.resolve([])),
    [dossierId],
  )
  const attachments = useLiveQuery(
    () => (dossierId ? listAttachments(dossierId) : Promise.resolve([])),
    [dossierId],
  )
  const corrs = useLiveQuery(
    () => (dossierId ? listByDossier(dossierId) : Promise.resolve([])),
    [dossierId],
  )
  // `?? null` : distingue « en cours de chargement » (undefined) de « pas de branding » (null) →
  // le 1er compile attend la résolution du branding (pas de flash non-brandé → bandé).
  const branding = useLiveQuery(() => getOrgBranding(orgId).then((b) => b ?? null), [orgId])

  const now = useMemo(() => new Date(), [])
  const [pdf, setPdf] = useState<{
    url: string
    blob: Blob
    key: string
    sectionPages: Record<string, number>
  } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(true)
  const viewerRef = useRef<PdfViewerHandle>(null)

  const ready =
    dossier != null &&
    docs !== undefined &&
    genDocs !== undefined &&
    attachments !== undefined &&
    product !== undefined &&
    branding !== undefined
  // Signature stable → un compile par ÉTAT réel. `maxTs` = dernier `updatedAt` (dossier OU enfant) :
  // une édition in-place (contenu d'un doc généré → son `updatedAt`) à effectif constant recompile.
  const sig = ready
    ? `${dossier.id}:${product?.id ?? ''}:${docs.length}:${genDocs.length}:${attachments.length}:` +
      `${[dossier.updatedAt, ...genDocs.map((g) => g.updatedAt), ...attachments.map((a) => a.updatedAt ?? ''), ...docs.map((d) => d.updatedAt ?? '')].reduce((m, x) => (x > m ? x : m), '')}:` +
      `${branding ? '1' : '0'}`
    : null
  const previewReady = pdf?.key === sig

  useEffect(() => {
    if (!sig || !dossier) return
    let cancelled = false
    let createdUrl: string | null = null
    void (async () => {
      try {
        const { compileDossierToPdf } = await import('./pdf/dossier-compiler')
        const { bytes, sectionPages } = await compileDossierToPdf({
          dossier,
          product: product ?? undefined,
          generatedDocs: genDocs ?? [],
          docs: docs ?? [],
          attachments: attachments ?? [],
          branding: branding ?? undefined,
          autoStructural: true,
        })
        if (cancelled) return
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
        createdUrl = URL.createObjectURL(blob)
        setPdf({ url: createdUrl, blob, key: sig, sectionPages })
      } catch {
        if (!cancelled) toast.error(t({ fr: 'Aperçu indisponible.', en: 'Preview unavailable.' }))
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
    // sig encode toutes les entrées pertinentes ; les déps brutes churn à chaque écriture Dexie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  // Table des matières = arbre Module 1 APLATI (avec profondeur pour l'indentation, façon Google
  // Docs) + complétude par nœud (sous-arbre). Le saut-à-la-page se lit dans `pdf.sectionPages`.
  const toc = useMemo(() => {
    if (!dossier) return []
    const docsByNode = buildDocsByNode(dossier, docs ?? [])
    const genByNode = new Map<string, GeneratedDocRecord>(
      (genDocs ?? []).map((g) => [g.nodeNumber, g]),
    )
    const attachByNode = new Map<string, DossierAttachmentRecord[]>()
    for (const a of attachments ?? [])
      attachByNode.set(a.nodeNumber, [...(attachByNode.get(a.nodeNumber) ?? []), a])
    const countFor = (n: CtdNodeDef) =>
      docsForNode(docsByNode, n).length +
      genDocsForNode(genByNode, n).length +
      attachmentsForNode(attachByNode, n).length
    const rows: { node: CtdNodeDef; depth: number; filled: number; total: number }[] = []
    const walk = (nodes: CtdNodeDef[], depth: number) => {
      for (const n of nodes) {
        const leaves = flattenTree([n]).filter((l) => !l.children?.length)
        rows.push({
          node: n,
          depth,
          filled: leaves.filter((l) => countFor(l) > 0).length,
          total: leaves.length,
        })
        if (n.children?.length) walk(n.children, depth + 1)
      }
    }
    walk(dossier.tree, 0)
    return rows
  }, [dossier, docs, genDocs, attachments])

  if (dossier === undefined) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({ fr: 'Chargement…', en: 'Loading…' })}
      </p>
    )
  }
  if (dossier === null) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Dossier introuvable.', en: 'Dossier not found.' })}
        </p>
        <Button variant="ghost" className="mt-2 -ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> {t({ fr: 'Retour aux opérations', en: 'Back to operations' })}
        </Button>
      </div>
    )
  }

  const activeDossier = dossier // narrowing stable pour les closures (handleLifecycle)
  const status = dossierDisplayStatus(dossier.id, corrs ?? [])
  const ref = dossierRef(dossier)
  const completion = dossierCompletion(dossier, docs ?? [], genDocs ?? [], attachments ?? [])
  const exp = product ? expiringDocs(docs ?? [], [product], now) : []
  const deadlineDays = exp.length > 0 ? Math.min(...exp.map((e) => e.daysLeft)) : null
  const agency = agencyFor(dossier.country)
  const downloadName = `${dossierBaseName(dossier.productName, dossier.country)}.pdf`
  const isArchived = !!dossier.archivedAt
  const lifecycleMode = isArchived ? 'restore' : status === 'draft' ? 'delete' : 'archive'

  // Page de saut d'un nœud : sa page directe, sinon la 1re page d'un descendant (section de garde).
  const pageFor = (n: CtdNodeDef): number | undefined => {
    const sp = pdf?.sectionPages
    if (!sp) return undefined
    if (sp[n.number]) return sp[n.number]
    const desc = Object.entries(sp)
      .filter(([k]) => k === n.number || k.startsWith(`${n.number}.`))
      .map(([, v]) => v)
    return desc.length ? Math.min(...desc) : undefined
  }

  async function handleLifecycle(reason: string) {
    if (isArchived) await restoreDossier(activeDossier.id)
    else if (status === 'draft') await deleteDossier(activeDossier.id, reason)
    else await archiveDossier(activeDossier.id, reason)
    void syncDossiers(orgId)
    toast.success(
      isArchived
        ? t({ fr: 'Dossier restauré', en: 'Dossier restored' })
        : status === 'draft'
          ? t({ fr: 'Brouillon supprimé', en: 'Draft deleted' })
          : t({ fr: 'Dossier archivé', en: 'Dossier archived' }),
    )
    navigate('/workspace')
  }

  return (
    <div className="mx-auto max-w-[84rem] pt-6">
      <Link
        to="/workspace"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> {t({ fr: 'Opérations', en: 'Operations' })}
      </Link>

      <div className="bg-card flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4 md:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {dossier.productName}
            </h1>
            {ref ? (
              <span className="text-muted-foreground font-mono text-xs">{ref}</span>
            ) : (
              <span className="text-muted-foreground text-xs italic">
                {t({ fr: 'n° en attente', en: 'no. pending' })}
              </span>
            )}
            <StatusBadge tone={OPS_STATUS_TONE[status]}>{opsStatusLabel(status, lang)}</StatusBadge>
          </div>
          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <CountryFlag code={dossier.country} size={15} /> {countryLabel(dossier.country, lang)}{' '}
              · {agency.name}
            </span>
            <span aria-hidden>·</span>
            <span>{procedureLabel(dossier.activity, lang)}</span>
            <span aria-hidden>·</span>
            <span>CTD/eCTD Module 1</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/workspace/${dossier.id}`}>
              <Pencil /> {t({ fr: 'Modifier', en: 'Edit' })}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!previewReady}
            onClick={() => pdf && triggerDownload(pdf.url, downloadName, false)}
          >
            <Download /> {t({ fr: 'Télécharger', en: 'Download' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!previewReady}
            onClick={() => setShareOpen(true)}
          >
            <Send /> {t({ fr: 'Envoyer', en: 'Send' })}
          </Button>
          <DossierAction
            mode={lifecycleMode}
            name={dossier.productName}
            onConfirm={handleLifecycle}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={t({ fr: 'Avancement CTD', en: 'CTD progress' })}>
          <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
            <div className="bg-info h-full rounded-full" style={{ width: `${completion.pct}%` }} />
          </div>
          <div className="text-muted-foreground mt-1 text-[11.5px]">
            {t(avancementLabel(completion.pct))} · {completion.pct}%
          </div>
        </Metric>
        <Metric label={t({ fr: 'Échéance', en: 'Deadline' })}>
          <div
            className={cn(
              'font-display text-lg font-semibold tabular-nums',
              isDeadlineUrgent(deadlineDays) ? 'text-danger-subtle-foreground' : 'text-foreground',
            )}
          >
            {deadlineLabel(deadlineDays)}
          </div>
        </Metric>
        <Metric label={t({ fr: 'Sections prêtes', en: 'Sections ready' })}>
          <div className="font-display text-lg font-semibold tabular-nums">
            {completion.okCount} / {completion.total}
          </div>
        </Metric>
        <Metric label={t({ fr: 'Pièces', en: 'Documents' })}>
          <div className="font-display text-lg font-semibold tabular-nums">
            {(docs ?? []).length}
          </div>
        </Metric>
      </div>

      <div
        className={cn(
          'mt-3 grid gap-3 lg:items-start',
          tocOpen ? 'lg:grid-cols-[248px_minmax(0,1fr)]' : 'lg:grid-cols-[44px_minmax(0,1fr)]',
        )}
      >
        {/* Table des matières — gauche, sticky, rétractable, cliquable (saut à la page, façon Google Docs). */}
        <aside className="bg-card flex max-h-[calc(100svh-5rem)] flex-col overflow-hidden rounded-xl border lg:sticky lg:top-2 lg:self-start">
          <div className="flex shrink-0 items-center justify-between gap-1 border-b p-1.5 pl-2.5">
            {tocOpen ? (
              <span id="toc-titre" className="font-display text-xs font-semibold">
                {t({ fr: 'Sommaire', en: 'Contents' })}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-expanded={tocOpen}
              aria-label={
                tocOpen
                  ? t({ fr: 'Réduire le sommaire', en: 'Collapse contents' })
                  : t({ fr: 'Afficher le sommaire', en: 'Show contents' })
              }
              onClick={() => setTocOpen((o) => !o)}
            >
              {tocOpen ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
            </Button>
          </div>
          {tocOpen ? (
            <nav aria-labelledby="toc-titre" className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <ul className="flex flex-col">
                {toc.map(({ node, depth, filled, total }) => {
                  const page = pageFor(node)
                  const state =
                    total === 0 || filled === 0 ? 'empty' : filled < total ? 'partial' : 'ok'
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        disabled={!page}
                        onClick={() => page && viewerRef.current?.scrollToPage(page)}
                        title={
                          page
                            ? t({ fr: `Aller à la page ${page}`, en: `Go to page ${page}` })
                            : t({ fr: 'Section sans contenu pour l’instant', en: 'No content yet' })
                        }
                        style={{ paddingLeft: 6 + depth * 12 }}
                        className="hover:bg-accent flex w-full items-center gap-1.5 rounded py-1 pr-1.5 text-left text-[12.5px] transition-colors disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            state === 'ok'
                              ? 'bg-success'
                              : state === 'partial'
                                ? 'bg-warning'
                                : 'bg-muted-foreground/40',
                          )}
                        />
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {node.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{node.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          ) : null}
        </aside>

        {/* Aperçu PDF compilé — agrandi (le rail TdM étroit libère de la largeur). */}
        <div className="bg-muted/40 rounded-xl border p-3" aria-busy={!previewReady}>
          {previewReady && pdf ? (
            <PdfViewer ref={viewerRef} blob={pdf.blob} flow />
          ) : (
            <div
              role="status"
              className="text-muted-foreground flex h-[520px] items-center justify-center text-sm"
            >
              {t({ fr: 'Compilation de l’aperçu…', en: 'Compiling preview…' })}
            </div>
          )}
        </div>
      </div>

      {shareOpen && pdf ? (
        <ShareDialog
          orgId={orgId}
          dossier={dossier}
          pdfBlob={pdf.blob}
          senderEmail={user?.email ?? 'local'}
          onClose={() => setShareOpen(false)}
          onSent={() => {
            setShareOpen(false)
            toast.success(t({ fr: 'Dossier envoyé', en: 'Dossier sent' }))
          }}
        />
      ) : null}
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card rounded-xl border px-3.5 py-3">
      <div className="text-muted-foreground text-[11.5px]">{label}</div>
      {children}
    </div>
  )
}
