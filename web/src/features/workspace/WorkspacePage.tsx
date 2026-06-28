import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, FileStack, FolderPlus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useAuth } from '@/features/auth/auth-context'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import {
  dossierDisplayStatus,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import { CorrespondencePanel } from '@/features/correspondence/CorrespondencePanel'
import { buildInbox } from '@/features/correspondence/correspondence-feed'
import { unreadIndex } from '@/features/correspondence/correspondence-reads'
import { listCorrespondences } from '@/features/correspondence/correspondence-repository'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { countryLabel } from './dossier-constants'
import { deadlineLabel, relativeTime } from './format-time'
import {
  buildOpsRows,
  isDeadlineUrgent,
  opsKpis,
  opsPipeline,
  opsProcedureCounts,
  opsStatusLabel,
  OPS_STATUS_TONE,
  PROCEDURE_DOT,
  procedureLabel,
  type OpsRow,
} from './operations-data'
import { RegulatoryInbox } from './RegulatoryInbox'
import {
  archiveDossier,
  deleteDossier,
  listArchivedDossiers,
  listDossiers,
  restoreDossier,
} from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import { useDossierSync } from './use-dossier-sync'

export function WorkspacePage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { user } = useAuth()
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  useCorrespondenceSync(orgId)
  const activeDossiers = useLiveQuery(() => listDossiers(orgId), [orgId])
  const archivedDossiers = useLiveQuery(() => listArchivedDossiers(orgId), [orgId])
  const correspondences = useLiveQuery(() => listCorrespondences(orgId), [orgId])
  const unread = useLiveQuery(() => unreadIndex(orgId), [orgId])
  const products = useLiveQuery(() => db.products.where('orgId').equals(orgId).toArray(), [orgId])
  const documents = useLiveQuery(() => db.documents.where('orgId').equals(orgId).toArray(), [orgId])

  const [reviewDossierId, setReviewDossierId] = useState<string | null>(null)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [proc, setProc] = useState<string>('all') // filtre par procédure

  // `now` figé au montage (l'âge relatif d'un board n'a pas besoin d'être à la seconde).
  const now = useMemo(() => new Date(), [])

  // Statut RA dérivé (correspondance la plus récente) + dernière activité par dossier.
  const { statusById, lastActivityById } = useMemo(() => {
    const statusById = new Map<string, DossierDisplayStatus>()
    const lastActivityById = new Map<string, string>()
    for (const d of [...(activeDossiers ?? []), ...(archivedDossiers ?? [])]) {
      statusById.set(d.id, dossierDisplayStatus(d.id, correspondences ?? []))
    }
    for (const c of correspondences ?? []) {
      if (c.deletedAt !== null) continue
      const cur = lastActivityById.get(c.dossierId)
      if (!cur || c.updatedAt > cur) lastActivityById.set(c.dossierId, c.updatedAt)
    }
    return { statusById, lastActivityById }
  }, [activeDossiers, archivedDossiers, correspondences])

  const activeRows = useMemo(
    () =>
      buildOpsRows(
        activeDossiers ?? [],
        statusById,
        products ?? [],
        documents ?? [],
        lastActivityById,
        now,
      ),
    [activeDossiers, statusById, products, documents, lastActivityById, now],
  )
  const archivedRows = useMemo(
    () =>
      buildOpsRows(
        archivedDossiers ?? [],
        statusById,
        products ?? [],
        documents ?? [],
        lastActivityById,
        now,
      ),
    [archivedDossiers, statusById, products, documents, lastActivityById, now],
  )
  const kpis = useMemo(() => opsKpis(activeRows), [activeRows])
  const pipeline = useMemo(() => opsPipeline(activeRows), [activeRows])
  const procCounts = useMemo(() => opsProcedureCounts(activeRows), [activeRows])
  const inbox = useMemo(
    () => buildInbox(correspondences ?? [], unread?.byConversation ?? new Map(), now),
    [correspondences, unread, now],
  )

  const rows = view === 'archived' ? archivedRows : activeRows
  const visible =
    view === 'active' && proc !== 'all' ? rows.filter((r) => r.dossier.activity === proc) : rows

  const loading = (view === 'archived' ? archivedDossiers : activeDossiers) === undefined
  const archivedCount = archivedDossiers?.length ?? 0

  async function handleDelete(id: string, reason: string) {
    await deleteDossier(id, reason)
    void syncDossiers(orgId)
    toast.success(t({ fr: 'Brouillon supprimé', en: 'Draft deleted' }))
  }
  async function handleArchive(id: string, reason: string) {
    await archiveDossier(id, reason)
    void syncDossiers(orgId)
    toast.success(t({ fr: 'Dossier archivé', en: 'Dossier archived' }))
  }
  async function handleRestore(id: string) {
    await restoreDossier(id)
    void syncDossiers(orgId)
    toast.success(t({ fr: 'Dossier restauré', en: 'Dossier restored' }))
  }

  return (
    <Page className="max-w-6xl">
      <PageHeader
        title={t({ fr: 'Opérations', en: 'Operations' })}
        description={t({
          fr: 'Vos procédures réglementaires CTD/eCTD Module 1 — montez, suivez et corrigez.',
          en: 'Your CTD/eCTD Module 1 regulatory procedures — build, track and amend.',
        })}
        actions={
          <Button asChild variant="primary">
            <Link to="/workspace/nouveau">
              <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
            </Link>
          </Button>
        }
      />

      {/* Bande KPI + barre Pipeline */}
      {activeRows.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              value={kpis.active}
              label={t({ fr: 'Dossiers actifs', en: 'Active dossiers' })}
            />
            <KpiTile value={kpis.inReview} label={t({ fr: 'En évaluation', en: 'Under review' })} />
            <KpiTile
              value={kpis.complement}
              label={t({ fr: 'Compléments', en: 'Information' })}
              tone={kpis.complement > 0 ? 'warning' : undefined}
            />
            <KpiTile
              value={kpis.granted}
              label={t({ fr: 'Octroyés', en: 'Granted' })}
              tone="success"
            />
            <KpiTile
              value={kpis.dueSoon}
              label={t({ fr: 'Échéances ≤ 7 j', en: 'Deadlines ≤ 7d' })}
              tone={kpis.dueSoon > 0 ? 'danger' : undefined}
            />
          </div>
          <PipelineBar pipeline={pipeline} total={activeRows.length} />
        </div>
      ) : null}

      {/* Barre d'outils : filtres procédure + bascule actifs/archivés */}
      <div className="flex flex-wrap items-center gap-2">
        {view === 'active' && activeRows.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t({ fr: 'Filtrer par procédure', en: 'Filter by procedure' })}
          >
            <ProcChip
              active={proc === 'all'}
              count={activeRows.length}
              onClick={() => setProc('all')}
            >
              {t({ fr: 'Toutes', en: 'All' })}
            </ProcChip>
            {procCounts.map((p) => (
              <ProcChip
                key={p.activity}
                active={proc === p.activity}
                count={p.count}
                dot={PROCEDURE_DOT[p.activity]}
                onClick={() => setProc(proc === p.activity ? 'all' : p.activity)}
              >
                {procedureLabel(p.activity, lang)}
              </ProcChip>
            ))}
          </div>
        ) : null}
        {archivedCount > 0 ? (
          <div className="bg-muted/60 ml-auto inline-flex rounded-lg border p-0.5 text-xs font-medium">
            {(['active', 'archived'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1 transition-colors',
                  view === v
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'active'
                  ? t({ fr: 'Actifs', en: 'Active' })
                  : t({ fr: 'Archivés', en: 'Archived' })}{' '}
                · {v === 'active' ? activeRows.length : archivedCount}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">
          {t({ fr: 'Chargement…', en: 'Loading…' })}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileStack />}
          title={t({ fr: 'Aucun dossier', en: 'No dossier' })}
          description={t({
            fr: 'Créez un dossier : choisissez un produit, le format (CTD/eCTD), la procédure et le pays cible.',
            en: 'Create a dossier: choose a product, the format (CTD/eCTD), the procedure and the target country.',
          })}
          action={
            <Button asChild variant="primary">
              <Link to="/workspace/nouveau">
                <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
              </Link>
            </Button>
          }
        />
      ) : (
        <div
          className={cn(
            view === 'active' && 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start',
          )}
        >
          <OperationsTable
            rows={visible}
            view={view}
            now={now.getTime()}
            onOpenPanel={(id) => setReviewDossierId(id)}
            onDelete={handleDelete}
            onArchive={handleArchive}
            onRestore={handleRestore}
          />
          {view === 'active' ? (
            <RegulatoryInbox
              items={inbox}
              onOpen={(id) => setReviewDossierId(id)}
              now={now.getTime()}
            />
          ) : null}
        </div>
      )}

      {reviewDossierId ? (
        <CorrespondencePanel
          orgId={orgId}
          dossierId={reviewDossierId}
          senderEmail={user?.email ?? 'local'}
          onClose={() => setReviewDossierId(null)}
          onEdit={() => navigate(`/workspace/${reviewDossierId}`)}
        />
      ) : null}
    </Page>
  )
}

// ───────────────────────── KPI + Pipeline ─────────────────────────
const KPI_TONE = {
  success: 'text-success-subtle-foreground',
  warning: 'text-warning-subtle-foreground',
  danger: 'text-danger-subtle-foreground',
} as const

function KpiTile({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone?: keyof typeof KPI_TONE
}) {
  return (
    <div className="bg-card rounded-xl border px-3.5 py-3">
      <div
        className={cn(
          'font-display text-2xl leading-none font-bold tabular-nums',
          tone && KPI_TONE[tone],
        )}
      >
        {value}
      </div>
      <div className="text-muted-foreground mt-1 text-[11.5px]">{label}</div>
    </div>
  )
}

const SEG_COLOR: Record<DossierDisplayStatus, string> = {
  draft: 'bg-muted-foreground/35',
  in_review: 'bg-info',
  suspended: 'bg-warning',
  accepted: 'bg-success',
  rejected: 'bg-danger',
}

function PipelineBar({
  pipeline,
  total,
}: {
  pipeline: { status: DossierDisplayStatus; count: number }[]
  total: number
}) {
  const { t, lang } = useI18n()
  return (
    <div className="bg-card rounded-xl border p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-xs font-semibold">
          {t({ fr: 'Pipeline réglementaire', en: 'Regulatory pipeline' })}
        </h2>
        <span className="text-muted-foreground text-[11px]">
          {t({
            fr: `${total} dossier${total > 1 ? 's' : ''}`,
            en: `${total} dossier${total > 1 ? 's' : ''}`,
          })}
        </span>
      </div>
      <div className="bg-muted flex h-2.5 overflow-hidden rounded-full" role="presentation">
        {pipeline
          .filter((p) => p.count > 0)
          .map((p) => (
            // `flex: count` répartit sans erreur d'arrondi (≠ width %, qui laisse un liseré).
            <div
              key={p.status}
              className={cn('h-full', SEG_COLOR[p.status])}
              style={{ flex: p.count }}
            />
          ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {pipeline.map((p) => (
          <li key={p.status} className="flex items-center gap-1.5 text-[11.5px]">
            <span aria-hidden className={cn('size-2 rounded-full', SEG_COLOR[p.status])} />
            <span className="text-muted-foreground">{opsStatusLabel(p.status, lang)}</span>
            <span className="font-medium tabular-nums">{p.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProcChip({
  active,
  count,
  dot,
  onClick,
  children,
}: {
  active: boolean
  count: number
  dot?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-foreground text-background border-transparent'
          : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {dot ? (
        <span aria-hidden className="size-2 rounded-full" style={{ background: dot }} />
      ) : null}
      {children} · <span className="tabular-nums">{count}</span>
    </button>
  )
}

// ───────────────────────── Table dense ─────────────────────────
function OperationsTable({
  rows,
  view,
  now,
  onOpenPanel,
  onDelete,
  onArchive,
  onRestore,
}: {
  rows: OpsRow[]
  view: 'active' | 'archived'
  now: number
  onOpenPanel: (dossierId: string) => void
  onDelete: (id: string, reason: string) => Promise<void>
  onArchive: (id: string, reason: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
}) {
  const { t, lang } = useI18n()
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground bg-card rounded-xl border p-6 text-center text-sm">
        {t({ fr: 'Aucun dossier pour ce filtre.', en: 'No dossier for this filter.' })}
      </p>
    )
  }
  const col = (label: Translatable) => (
    <th
      scope="col"
      className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wide uppercase"
    >
      {t(label)}
    </th>
  )
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th scope="col" className="sr-only">
              {t({ fr: 'Procédure', en: 'Procedure' })}
            </th>
            {col({ fr: 'Produit · réf', en: 'Product · ref' })}
            {col({ fr: 'Marché', en: 'Market' })}
            {col({ fr: 'Statut', en: 'Status' })}
            {col({ fr: 'Avancement CTD', en: 'CTD progress' })}
            {col({ fr: 'Échéance', en: 'Deadline' })}
            <th scope="col" className="sr-only">
              {t({ fr: 'Actions', en: 'Actions' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.dossier
            const hasReviews = r.status !== 'draft'
            const urgent = isDeadlineUrgent(r.deadlineDays)
            return (
              <tr
                key={d.id}
                className="hover:bg-accent/40 border-b transition-colors last:border-0"
              >
                <td className="py-2.5 pr-1 pl-3 align-middle">
                  <span
                    aria-hidden
                    title={procedureLabel(d.activity, lang)}
                    className="block size-2.5 rounded-full"
                    style={{ background: PROCEDURE_DOT[d.activity] ?? '#6b7280' }}
                  />
                  <span className="sr-only">{procedureLabel(d.activity, lang)}</span>
                </td>
                <td className="min-w-0 px-3 py-2.5 align-middle">
                  {hasReviews ? (
                    <button
                      type="button"
                      onClick={() => onOpenPanel(d.id)}
                      className="font-display hover:text-info cursor-pointer text-left text-sm font-semibold"
                    >
                      {d.productName}
                    </button>
                  ) : (
                    <Link
                      to={`/workspace/${d.id}`}
                      className="font-display hover:text-info text-sm font-semibold"
                    >
                      {d.productName}
                    </Link>
                  )}
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className="font-mono">{r.ref}</span>
                    <span>· {procedureLabel(d.activity, lang)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <span className="flex items-center gap-1.5 text-xs">
                    <CountryFlag code={d.country} size={16} />
                    <span className="hidden sm:inline">{countryLabel(d.country, lang)}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <StatusBadge tone={OPS_STATUS_TONE[r.status]}>
                    {opsStatusLabel(r.status, lang)}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex items-center gap-2">
                    <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full" aria-hidden>
                      <div
                        className="bg-info h-full rounded-full"
                        style={{ width: `${r.completionPct}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {r.completionPct}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      urgent ? 'text-danger-subtle-foreground' : 'text-foreground',
                    )}
                  >
                    {deadlineLabel(r.deadlineDays)}
                  </div>
                  {r.lastActivityAt ? (
                    <div className="text-muted-foreground text-[10.5px]">
                      {relativeTime(r.lastActivityAt, lang, now)}
                    </div>
                  ) : null}
                </td>
                <td className="py-2.5 pr-2 pl-1 text-right align-middle">
                  {view === 'archived' ? (
                    <DossierAction
                      mode="restore"
                      name={d.productName}
                      onConfirm={() => onRestore(d.id)}
                    />
                  ) : hasReviews ? (
                    <DossierAction
                      mode="archive"
                      name={d.productName}
                      onConfirm={(reason) => onArchive(d.id, reason)}
                    />
                  ) : (
                    <DossierAction
                      mode="delete"
                      name={d.productName}
                      onConfirm={(reason) => onDelete(d.id, reason)}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type DossierActionMode = 'delete' | 'archive' | 'restore'

/**
 * Action de fin de vie d'un dossier, avec confirmation + motif (audit ALCOA). Trois régimes :
 * - delete : brouillon jamais soumis → suppression douce (récupérable par un admin).
 * - archive : dossier soumis (enregistrement réglementaire) → conservé, jamais purgé.
 * - restore : remet un archivé dans l'actif.
 */
function DossierAction({
  mode,
  name,
  onConfirm,
}: {
  mode: DossierActionMode
  name: string
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const cfg = {
    delete: {
      Icon: Trash2,
      trigger: t({ fr: 'Supprimer le brouillon', en: 'Delete draft' }),
      title: t({ fr: 'Supprimer ce brouillon ?', en: 'Delete this draft?' }),
      desc: t({
        fr: `« ${name} » est un brouillon jamais soumis. Il sera retiré (action tracée, récupérable par un administrateur).`,
        en: `"${name}" is a draft never submitted. It will be removed (audited, recoverable by an administrator).`,
      }),
      confirm: t({ fr: 'Supprimer', en: 'Delete' }),
      reason: true,
      destructive: true,
    },
    archive: {
      Icon: Archive,
      trigger: t({ fr: 'Archiver le dossier', en: 'Archive dossier' }),
      title: t({ fr: 'Archiver ce dossier ?', en: 'Archive this dossier?' }),
      desc: t({
        fr: `« ${name} » a été soumis à une agence : la réglementation interdit sa suppression (rétention). Il sera archivé — conservé et restaurable à tout moment.`,
        en: `"${name}" was submitted to an agency: regulation forbids deletion (retention). It will be archived — kept and restorable anytime.`,
      }),
      confirm: t({ fr: 'Archiver', en: 'Archive' }),
      reason: true,
      destructive: false,
    },
    restore: {
      Icon: ArchiveRestore,
      trigger: t({ fr: 'Restaurer le dossier', en: 'Restore dossier' }),
      title: t({ fr: 'Restaurer ce dossier ?', en: 'Restore this dossier?' }),
      desc: t({
        fr: `« ${name} » reviendra dans vos dossiers actifs.`,
        en: `"${name}" will return to your active dossiers.`,
      }),
      confirm: t({ fr: 'Restaurer', en: 'Restore' }),
      reason: false,
      destructive: false,
    },
  }[mode]
  const { Icon } = cfg

  async function go() {
    setBusy(true)
    try {
      await onConfirm(reason)
      setOpen(false)
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={cfg.trigger}>
          <Icon className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cfg.title}</AlertDialogTitle>
          <AlertDialogDescription>{cfg.desc}</AlertDialogDescription>
        </AlertDialogHeader>
        {cfg.reason ? (
          <div className="space-y-1.5">
            <label htmlFor="dossier-action-reason" className="text-muted-foreground text-xs">
              {t({ fr: 'Motif (recommandé)', en: 'Reason (recommended)' })}
            </label>
            <textarea
              id="dossier-action-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{t({ fr: 'Annuler', en: 'Cancel' })}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              void go()
            }}
            className={
              cfg.destructive ? 'bg-destructive hover:bg-destructive/90 text-white' : undefined
            }
          >
            {cfg.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
