import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, FileStack, FolderPlus, Info, Pencil, Route, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useBelowLg } from '@/hooks/use-below-lg'
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
import { useMemberScope } from '@/features/org/use-current-org'
import { db, type DossierRecord } from '@/lib/db'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { countryLabel } from './dossier-constants'
import { deadlineLabel, relativeTime } from './format-time'
import {
  avancementLabel,
  buildOpsRows,
  dossierRef,
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
import { DossierAction } from './dossier-action'
import { RegulatoryInbox } from './RegulatoryInbox'
import {
  archiveDossier,
  deleteDossier,
  listArchivedDossiers,
  listDossiers,
  listTrashedDossiers,
  restoreDossier,
  restoreTrashedDossier,
  TRASH_RETENTION_DAYS,
  trashDaysLeft,
} from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import { useDossierSync } from './use-dossier-sync'

export function WorkspacePage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { scoped } = useMemberScope()
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  useCorrespondenceSync(orgId)
  const activeDossiers = useLiveQuery(() => listDossiers(orgId), [orgId])
  const archivedDossiers = useLiveQuery(() => listArchivedDossiers(orgId), [orgId])
  const trashedDossiers = useLiveQuery(() => listTrashedDossiers(orgId), [orgId])
  const correspondences = useLiveQuery(() => listCorrespondences(orgId), [orgId])
  const unread = useLiveQuery(() => unreadIndex(orgId), [orgId])
  const products = useLiveQuery(() => db.products.where('orgId').equals(orgId).toArray(), [orgId])
  const documents = useLiveQuery(() => db.documents.where('orgId').equals(orgId).toArray(), [orgId])

  const [reviewDossierId, setReviewDossierId] = useState<string | null>(null)
  const [view, setView] = useState<'active' | 'archived' | 'trash'>('active')
  const [proc, setProc] = useState<string>('all') // filtre par procédure

  // `now` figé au montage (l'âge relatif d'un board n'a pas besoin d'être à la seconde).
  const now = useMemo(() => new Date(), [])

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

  const loading =
    (view === 'archived'
      ? archivedDossiers
      : view === 'trash'
        ? trashedDossiers
        : activeDossiers) === undefined
  const archivedCount = archivedDossiers?.length ?? 0
  const trashCount = trashedDossiers?.length ?? 0
  const belowLg = useBelowLg()
  // Cockpit hauteur fixe (table + inbox à scroll interne) en vue active peuplée — lg+ uniquement
  // (sous lg, un cockpit à hauteur fixe écraserait la table → on rend une page défilante empilée).
  const showRail = view === 'active' && activeRows.length > 0 && !loading && !belowLg

  async function handleDelete(id: string, reason: string) {
    await deleteDossier(id, reason)
    void syncDossiers(orgId)
    toast.success(
      t({
        fr: `Brouillon déplacé dans la corbeille (${TRASH_RETENTION_DAYS} j)`,
        en: `Draft moved to trash (${TRASH_RETENTION_DAYS} d)`,
      }),
      {
        // Filet « annuler » : restauration en un geste, sans naviguer vers la corbeille.
        action: {
          label: t({ fr: 'Restaurer', en: 'Restore' }),
          onClick: () => {
            void restoreTrashedDossier(id).then(() => syncDossiers(orgId))
          },
        },
        duration: 8000,
      },
    )
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
    // Dernier archivé restauré → la vue Archivés se vide et sa pilule disparaît : retour à l'actif.
    if ((await listArchivedDossiers(orgId)).length === 0) setView('active')
  }
  async function handleTrashRestore(id: string) {
    await restoreTrashedDossier(id)
    void syncDossiers(orgId)
    toast.success(t({ fr: 'Brouillon restauré', en: 'Draft restored' }))
    if ((await listTrashedDossiers(orgId)).length === 0) setView('active')
  }

  // CS1 : membre scopé = couche SUIVI seulement — pas de création, pas d'édition (RLS 0048 ;
  // le masquage évite seulement des actions qui renverraient 42501).
  const newDossierBtn = scoped ? null : (
    <Button asChild variant="primary">
      <Link to="/workspace/nouveau">
        <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
      </Link>
    </Button>
  )
  // Pilules de vue : Archivés / Corbeille n'apparaissent que peuplées (la corbeille est un outil
  // de gestion → masquée pour les membres scopés CS1, comme les actions de fin de vie).
  const viewPills: { key: typeof view; label: Translatable; count: number }[] = [
    { key: 'active', label: { fr: 'Actifs', en: 'Active' }, count: activeRows.length },
    ...(archivedCount > 0
      ? [
          {
            key: 'archived' as const,
            label: { fr: 'Archivés', en: 'Archived' },
            count: archivedCount,
          },
        ]
      : []),
    ...(trashCount > 0 && !scoped
      ? [{ key: 'trash' as const, label: { fr: 'Corbeille', en: 'Trash' }, count: trashCount }]
      : []),
  ]
  const archivedToggle =
    viewPills.length > 1 ? (
      <div className="bg-muted/60 inline-flex rounded-lg border p-0.5 text-xs font-medium">
        {viewPills.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setView(v.key)}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1 transition-colors',
              view === v.key
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(v.label)} · {v.count}
          </button>
        ))}
      </div>
    ) : null

  // Encart politique de rétention (docs/RETENTION-POLICY.md) — l'argument conformité, dit là où
  // il se joue : corbeille (grâce puis purge) et archives (jamais purgé).
  const retentionNote =
    view === 'trash' || view === 'archived' ? (
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {view === 'trash'
          ? t({
              fr: `Politique de rétention : un brouillon supprimé reste restaurable ${TRASH_RETENTION_DAYS} jours, puis est purgé définitivement (fichiers inclus). L'action reste tracée au journal d'audit.`,
              en: `Retention policy: a deleted draft can be restored for ${TRASH_RETENTION_DAYS} days, then is permanently purged (files included). The action remains in the audit log.`,
            })
          : t({
              fr: 'Politique de rétention : un dossier soumis est un enregistrement réglementaire (GxP) — conservé sans limite de durée, jamais purgé, restaurable à tout moment.',
              en: 'Retention policy: a submitted dossier is a regulatory record (GxP) — retained without time limit, never purged, restorable at any time.',
            })}
      </p>
    ) : null

  const procedureChips =
    view === 'active' && activeRows.length > 0 ? (
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t({ fr: 'Filtrer par procédure', en: 'Filter by procedure' })}
      >
        <ProcChip active={proc === 'all'} count={activeRows.length} onClick={() => setProc('all')}>
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
    ) : null

  const table =
    view === 'trash' ? (
      <TrashTable rows={trashedDossiers ?? []} now={now} onRestore={handleTrashRestore} />
    ) : (
      <OperationsTable
        rows={visible}
        view={view}
        now={now.getTime()}
        scoped={scoped}
        onOpenDossier={(id) => navigate(`/workspace/${id}/roadmap`)}
        onDelete={handleDelete}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
    )
  const isEmpty = view === 'trash' ? trashCount === 0 : rows.length === 0

  // ─── Cockpit hauteur fixe : aucune barre de défilement de page ; table + inbox scrollent chacun
  //     dans leur panneau. `h-full` se résout sur <main> (flex-1 d'un shell `h-svh`). ───
  if (showRail) {
    return (
      <div className="flex h-full flex-col pt-6">
        {/* h1 du document (le cockpit ne monte pas PageHeader ; le titre visible est le breadcrumb du shell). */}
        <h1 className="sr-only">{t({ fr: 'Opérations', en: 'Operations' })}</h1>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <KpiBand kpis={kpis} />
            <PipelineBar pipeline={pipeline} total={activeRows.length} />
            <section className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
              <div className="shrink-0 border-b p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-semibold">
                      {t({ fr: 'Opérations réglementaires', en: 'Regulatory operations' })}
                    </h2>
                    <p className="text-muted-foreground text-xs">
                      {t({
                        fr: "Point d'avancement par activité réglementaire",
                        en: 'Progress by regulatory activity',
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {archivedToggle}
                    {newDossierBtn}
                  </div>
                </div>
                <div className="mt-3">{procedureChips}</div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{table}</div>
            </section>
          </div>

          <RegulatoryInbox
            className="min-h-0"
            items={inbox}
            onOpen={(id) => setReviewDossierId(id)}
            now={now.getTime()}
          />
        </div>

        {reviewDossierId ? (
          <CorrespondencePanel
            orgId={orgId}
            dossierId={reviewDossierId}
            senderEmail={user?.email ?? 'local'}
            onClose={() => setReviewDossierId(null)}
            onEdit={() => navigate(`/workspace/${reviewDossierId}`)}
          />
        ) : null}
      </div>
    )
  }

  // ─── Page défilante (mobile actif / chargement / vide / archivés) : blocs empilés. ───
  const activePopulated = view === 'active' && activeRows.length > 0
  return (
    <Page className="max-w-6xl">
      <PageHeader
        title={t({ fr: 'Opérations', en: 'Operations' })}
        description={t({
          fr: 'Vos procédures réglementaires CTD/eCTD Module 1 — montez, suivez et corrigez.',
          en: 'Your CTD/eCTD Module 1 regulatory procedures — build, track and amend.',
        })}
        actions={newDossierBtn}
      />
      {activePopulated ? (
        <>
          <KpiBand kpis={kpis} />
          <PipelineBar pipeline={pipeline} total={activeRows.length} />
        </>
      ) : null}
      {procedureChips || archivedToggle ? (
        <div className="flex flex-wrap items-center gap-2">
          {procedureChips}
          {archivedToggle ? <div className="ml-auto">{archivedToggle}</div> : null}
        </div>
      ) : null}
      {retentionNote}
      {loading ? (
        <div className="text-muted-foreground text-sm">
          {t({ fr: 'Chargement…', en: 'Loading…' })}
        </div>
      ) : isEmpty ? (
        view === 'trash' ? (
          <EmptyState
            icon={<Trash2 />}
            title={t({ fr: 'Corbeille vide', en: 'Trash is empty' })}
            description={t({
              fr: 'Les brouillons supprimés apparaissent ici, restaurables pendant la fenêtre de grâce.',
              en: 'Deleted drafts appear here, restorable during the grace window.',
            })}
          />
        ) : (
          <EmptyState
            icon={<FileStack />}
            title={t({ fr: 'Aucun dossier', en: 'No dossier' })}
            description={t({
              fr: 'Créez un dossier : choisissez un produit, le format (CTD/eCTD), la procédure et le pays cible.',
              en: 'Create a dossier: choose a product, the format (CTD/eCTD), the procedure and the target country.',
            })}
            action={newDossierBtn}
          />
        )
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">{table}</div>
      )}
      {activePopulated ? (
        <RegulatoryInbox
          className="max-h-[70vh]"
          items={inbox}
          onOpen={(id) => setReviewDossierId(id)}
          now={now.getTime()}
        />
      ) : null}

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

// ───────────────────────── KPI ─────────────────────────
const KPI_TONE = {
  success: 'text-success-subtle-foreground',
  warning: 'text-warning-subtle-foreground',
  danger: 'text-danger-subtle-foreground',
} as const

function KpiBand({ kpis }: { kpis: ReturnType<typeof opsKpis> }) {
  const { t } = useI18n()
  const tiles: { value: number; label: Translatable; tone?: keyof typeof KPI_TONE }[] = [
    { value: kpis.active, label: { fr: 'Dossiers actifs', en: 'Active dossiers' } },
    { value: kpis.inReview, label: { fr: 'En évaluation', en: 'Under review' } },
    {
      value: kpis.complement,
      label: { fr: 'Compléments', en: 'Information' },
      tone: kpis.complement > 0 ? 'warning' : undefined,
    },
    { value: kpis.granted, label: { fr: 'Octroyés', en: 'Granted' }, tone: 'success' },
    {
      value: kpis.dueSoon,
      label: { fr: 'Échéances ≤ 7 j', en: 'Deadlines ≤ 7d' },
      tone: kpis.dueSoon > 0 ? 'danger' : undefined,
    },
  ]
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label.en} className="bg-card rounded-xl border px-3.5 py-3">
          <div
            className={cn(
              'font-display text-2xl leading-none font-bold tabular-nums',
              tile.tone && KPI_TONE[tile.tone],
            )}
          >
            {tile.value}
          </div>
          <div className="text-muted-foreground mt-1 text-[11.5px]">{t(tile.label)}</div>
        </div>
      ))}
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
    <div className="bg-card shrink-0 rounded-xl border p-3.5">
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

/** Date courte localisée (vues Archivés / Corbeille) — ex. « 5 juil. 2026 » / “5 Jul 2026”. */
const shortDate = (iso: string, lang: Lang): string =>
  new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

// ───────────────────────── Table dense (clic ligne → Roadmap/statut) ─────────────────────────
function OperationsTable({
  rows,
  view,
  now,
  scoped,
  onOpenDossier,
  onDelete,
  onArchive,
  onRestore,
}: {
  rows: OpsRow[]
  view: 'active' | 'archived'
  now: number
  /** CS1 : membre scopé (couche suivi) → seuls le clic ligne et le raccourci Statut restent. */
  scoped: boolean
  onOpenDossier: (id: string) => void
  onDelete: (id: string, reason: string) => Promise<void>
  onArchive: (id: string, reason: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
}) {
  const { t, lang } = useI18n()
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        {t({ fr: 'Aucun dossier pour ce filtre.', en: 'No dossier for this filter.' })}
      </p>
    )
  }
  const col = (label: Translatable, className?: string) => (
    <th
      scope="col"
      className={cn(
        'bg-card text-muted-foreground sticky top-0 z-10 px-3 py-2.5 text-[11px] font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {t(label)}
    </th>
  )
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr>
          <th scope="col" className="bg-card sticky top-0 z-10 border-b">
            <span className="sr-only">{t({ fr: 'Procédure', en: 'Procedure' })}</span>
          </th>
          {col({ fr: 'Produit · réf', en: 'Product · ref' }, 'border-b')}
          {col({ fr: 'Marché', en: 'Market' }, 'border-b')}
          {col({ fr: 'Statut', en: 'Status' }, 'border-b')}
          {col({ fr: 'Avancement CTD', en: 'CTD progress' }, 'border-b')}
          {view === 'archived'
            ? col({ fr: 'Archivé le', en: 'Archived on' }, 'border-b')
            : col({ fr: 'Échéance', en: 'Deadline' }, 'border-b')}
          <th scope="col" className="bg-card sticky top-0 z-10 border-b">
            <span className="sr-only">{t({ fr: 'Actions', en: 'Actions' })}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const d = r.dossier
          const urgent = isDeadlineUrgent(r.deadlineDays)
          return (
            <tr
              key={d.id}
              onClick={() => onOpenDossier(d.id)}
              className="group hover:bg-accent/50 cursor-pointer border-b transition-colors last:border-0"
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
                <Link
                  to={`/workspace/${d.id}/roadmap`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-display hover:text-info text-sm font-semibold"
                >
                  {d.productName}
                </Link>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                  {r.ref ? (
                    <span className="font-mono">{r.ref}</span>
                  ) : (
                    <span className="italic">{t({ fr: 'n° en attente', en: 'no. pending' })}</span>
                  )}
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
                <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full" aria-hidden>
                  <div
                    className="bg-info h-full rounded-full"
                    style={{ width: `${r.completionPct}%` }}
                  />
                </div>
                <div className="text-muted-foreground mt-1 text-[11px]">
                  {t(avancementLabel(r.completionPct))}
                  <span className="sr-only"> {r.completionPct}%</span>
                </div>
              </td>
              <td className="px-3 py-2.5 align-middle">
                {view === 'archived' ? (
                  // Vue Archivés : la date d'archivage (enregistrement de rétention) remplace
                  // l'échéance — un dossier archivé n'a plus d'horloge réglementaire qui court.
                  <div className="text-foreground text-xs font-medium tabular-nums">
                    {d.archivedAt ? shortDate(d.archivedAt, lang) : '—'}
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </td>
              <td
                className="py-2.5 pr-2 pl-1 text-right align-middle opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-end gap-0.5">
                  {/* Le clic ligne mène au Roadmap. On affiche AUSSI les raccourcis explicites (sinon
                      l'utilisateur pourrait croire que seules ces actions existent) : Statut · Aperçu
                      (mis en évidence en accent) · Modifier. Puis Archiver/Supprimer. */}
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    aria-label={t({ fr: 'Statut', en: 'Status' })}
                  >
                    <Link
                      to={`/workspace/${d.id}/roadmap`}
                      title={t({ fr: 'Statut', en: 'Status' })}
                    >
                      <Route className="size-4" />
                    </Link>
                  </Button>
                  {!scoped ? (
                    <>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="text-info hover:text-info hover:bg-info-subtle"
                        aria-label={t({ fr: 'Aperçu', en: 'Preview' })}
                      >
                        <Link
                          to={`/workspace/${d.id}/apercu`}
                          title={t({ fr: 'Aperçu', en: 'Preview' })}
                        >
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={t({ fr: 'Modifier', en: 'Edit' })}
                      >
                        <Link to={`/workspace/${d.id}`} title={t({ fr: 'Modifier', en: 'Edit' })}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      {view === 'archived' ? (
                        <DossierAction
                          mode="restore"
                          name={d.productName}
                          onConfirm={() => onRestore(d.id)}
                        />
                      ) : r.status !== 'draft' ? (
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
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─────────────── Corbeille : brouillons supprimés, fenêtre de grâce puis purge ───────────────
function TrashTable({
  rows,
  now,
  onRestore,
}: {
  rows: DossierRecord[]
  now: Date
  onRestore: (id: string) => Promise<void>
}) {
  const { t, lang } = useI18n()
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        {t({ fr: 'Corbeille vide.', en: 'Trash is empty.' })}
      </p>
    )
  }
  const col = (label: Translatable, className?: string) => (
    <th
      scope="col"
      className={cn(
        'bg-card text-muted-foreground sticky top-0 z-10 border-b px-3 py-2.5 text-[11px] font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {t(label)}
    </th>
  )
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr>
          <th scope="col" className="bg-card sticky top-0 z-10 border-b">
            <span className="sr-only">{t({ fr: 'Procédure', en: 'Procedure' })}</span>
          </th>
          {col({ fr: 'Produit · réf', en: 'Product · ref' })}
          {col({ fr: 'Marché', en: 'Market' })}
          {col({ fr: 'Supprimé le', en: 'Deleted on' })}
          {col({ fr: 'Purge automatique', en: 'Automatic purge' })}
          <th scope="col" className="bg-card sticky top-0 z-10 border-b">
            <span className="sr-only">{t({ fr: 'Actions', en: 'Actions' })}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          // deletedAt garanti non nul par listTrashedDossiers ; repli défensif = purge « aujourd'hui ».
          const daysLeft = trashDaysLeft(d.deletedAt ?? now.toISOString(), now)
          const ref = dossierRef(d)
          return (
            <tr key={d.id} className="border-b last:border-0">
              <td className="py-2.5 pr-1 pl-3 align-middle">
                <span
                  aria-hidden
                  title={procedureLabel(d.activity, lang)}
                  className="block size-2.5 rounded-full opacity-50"
                  style={{ background: PROCEDURE_DOT[d.activity] ?? '#6b7280' }}
                />
                <span className="sr-only">{procedureLabel(d.activity, lang)}</span>
              </td>
              <td className="min-w-0 px-3 py-2.5 align-middle">
                <span className="font-display text-sm font-semibold">{d.productName}</span>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                  {ref ? <span className="font-mono">{ref}</span> : null}
                  <span>
                    {ref ? '· ' : ''}
                    {procedureLabel(d.activity, lang)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5 align-middle">
                <span className="flex items-center gap-1.5 text-xs">
                  <CountryFlag code={d.country} size={16} />
                  <span className="hidden sm:inline">{countryLabel(d.country, lang)}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 align-middle">
                <span className="text-xs font-medium tabular-nums">
                  {d.deletedAt ? shortDate(d.deletedAt, lang) : '—'}
                </span>
              </td>
              <td className="px-3 py-2.5 align-middle">
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    daysLeft <= 7 ? 'text-danger-subtle-foreground' : 'text-muted-foreground',
                  )}
                >
                  {daysLeft > 0
                    ? t({ fr: `dans ${daysLeft} j`, en: `in ${daysLeft} d` })
                    : t({ fr: 'imminente', en: 'imminent' })}
                </span>
              </td>
              <td className="py-2.5 pr-2 pl-1 text-right align-middle">
                <DossierAction
                  mode="restore-trash"
                  name={d.productName}
                  onConfirm={() => onRestore(d.id)}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
