import { useMemo, useState, type ReactNode } from 'react'
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
import {
  ListRow,
  ListRowActions,
  ListRowButton,
  ListRowIcon,
  ListRowLink,
} from '@/components/ui/list-row'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAuth } from '@/features/auth/auth-context'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import {
  dossierDisplayStatus,
  DOSSIER_STATUS_ORDER,
  DOSSIER_STATUS_TONE,
  statusLabel,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import { CorrespondencePanel } from '@/features/correspondence/CorrespondencePanel'
import { unreadIndex } from '@/features/correspondence/correspondence-reads'
import { buildCorrespondenceFeed } from '@/features/correspondence/correspondence-feed'
import { listCorrespondences } from '@/features/correspondence/correspondence-repository'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { expiringDocs } from '@/features/dashboard/dashboard-data'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
import { OperationsActivity } from './OperationsActivity'
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
  // Non-lus par dossier (pastilles) — useLiveQuery observe les tables LUES dans unreadIndex
  // (messages, reads, correspondences) : il se relance tout seul à chaque écriture.
  const unread = useLiveQuery(() => unreadIndex(orgId), [orgId])
  // Produits + documents : alimentent UNIQUEMENT la colonne « Échéances » (réutilise la politique
  // de validité Monitor `expiringDocs`). La liste des dossiers n'en dépend pas.
  const products = useLiveQuery(() => db.products.where('orgId').equals(orgId).toArray(), [orgId])
  const documents = useLiveQuery(() => db.documents.where('orgId').equals(orgId).toArray(), [orgId])
  // Boîte de correspondance ouverte depuis une carte (dossier déjà reviewé — brief CEO point c).
  const [reviewDossierId, setReviewDossierId] = useState<string | null>(null)
  // Vue : dossiers actifs vs archivés (rétention réglementaire des dossiers soumis).
  const [view, setView] = useState<'active' | 'archived'>('active')
  // Filtre par état (brief CEO) : Draft / En review / Accepté / En suspens / Rejeté.
  const [filter, setFilter] = useState<DossierDisplayStatus | 'all'>('all')

  const dossiers = view === 'archived' ? archivedDossiers : activeDossiers

  // État dérivé de chaque dossier (la dernière correspondance fait foi — jamais dossiers.status).
  const { statusById, counts } = useMemo(() => {
    const statusById = new Map<string, DossierDisplayStatus>()
    const counts = new Map<DossierDisplayStatus, number>()
    for (const d of activeDossiers ?? []) {
      const s = dossierDisplayStatus(d.id, correspondences ?? [])
      statusById.set(d.id, s)
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    // Statut aussi pour les archivés (badge sur leurs cartes), sans compter dans les filtres.
    for (const d of archivedDossiers ?? []) {
      statusById.set(d.id, dossierDisplayStatus(d.id, correspondences ?? []))
    }
    return { statusById, counts }
  }, [activeDossiers, archivedDossiers, correspondences])

  const visible =
    view === 'archived'
      ? (archivedDossiers ?? [])
      : (activeDossiers ?? []).filter((d) => filter === 'all' || statusById.get(d.id) === filter)

  // Colonne d'activité (centre de notifications RA) : fil des correspondances + échéances Monitor.
  // `now` figé au montage (l'âge relatif d'un board n'a pas besoin d'être à la seconde ; il se
  // recalcule à la navigation). Évite l'appel impur en render (Date.now() interdit, React Compiler).
  const now = useMemo(() => new Date(), [])
  const feed = useMemo(
    () => buildCorrespondenceFeed(correspondences ?? [], unread?.byConversation ?? new Map()),
    [correspondences, unread],
  )
  const echeances = useMemo(
    () => expiringDocs(documents ?? [], products ?? [], now),
    [documents, products, now],
  )

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

  const archivedCount = archivedDossiers?.length ?? 0

  return (
    <Page>
      <PageHeader
        title={t({ fr: 'Opérations', en: 'Operations' })}
        description={t({
          fr: 'Montez, suivez et corrigez vos dossiers CTD/eCTD Module 1.',
          en: 'Build, track and amend your CTD/eCTD Module 1 dossiers.',
        })}
        actions={
          <Button asChild variant="primary">
            <Link to="/workspace/nouveau">
              <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
            </Link>
          </Button>
        }
      />

      {/* Bascule Actifs / Archivés — n'apparaît que si des dossiers sont archivés. */}
      {archivedCount > 0 ? (
        <div className="bg-muted/60 inline-flex rounded-lg border p-0.5 text-xs font-medium">
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
              · {v === 'active' ? (activeDossiers?.length ?? 0) : archivedCount}
            </button>
          ))}
        </div>
      ) : null}

      {view === 'active' && (activeDossiers ?? []).length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t({ fr: 'Filtrer par état', en: 'Filter by status' })}
        >
          <FilterChip
            active={filter === 'all'}
            tone="all"
            count={activeDossiers?.length ?? 0}
            onClick={() => setFilter('all')}
          >
            {t({ fr: 'Tous', en: 'All' })}
          </FilterChip>
          {DOSSIER_STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={filter === s}
              tone={DOSSIER_STATUS_TONE[s]}
              count={counts.get(s) ?? 0}
              onClick={() => setFilter(filter === s ? 'all' : s)}
            >
              {statusLabel(s, lang)}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {dossiers === undefined ? (
        <div className="text-muted-foreground text-sm">
          {t({ fr: 'Chargement…', en: 'Loading…' })}
        </div>
      ) : view === 'active' && dossiers.length === 0 ? (
        <EmptyState
          icon={<FileStack />}
          title={t({ fr: 'Aucun dossier', en: 'No dossier' })}
          description={t({
            fr: "Créez un dossier : choisissez un produit, le format (CTD/eCTD), l'activité et le pays cible.",
            en: 'Create a dossier: choose a product, the format (CTD/eCTD), the activity and the target country.',
          })}
          action={
            <Button asChild variant="primary">
              <Link to="/workspace/nouveau">
                <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
              </Link>
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FileStack />}
          title={t({ fr: 'Aucun résultat', en: 'No result' })}
          description={
            view === 'archived'
              ? t({ fr: 'Aucun dossier archivé.', en: 'No archived dossier.' })
              : t({
                  fr: `Aucun dossier « ${statusLabel(filter, lang)} ».`,
                  en: `No "${statusLabel(filter, lang)}" dossier.`,
                })
          }
        />
      ) : (
        <div
          className={cn(
            view === 'active' &&
              'grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start',
          )}
        >
          <div className="flex flex-col gap-2" role="list">
            {visible.map((d) => {
              const s = statusById.get(d.id) ?? 'draft'
              const unreadCount = unread?.byDossier.get(d.id) ?? 0
              // Dossier déjà en correspondance : le clic ouvre la boîte (reviews au premier plan,
              // bouton « Modifier le dossier » pour rejoindre le montage) — brief CEO. Sinon → montage.
              const hasReviews = s !== 'draft'
              const sub = [
                activityLabel(d.activity, lang),
                countryLabel(d.country, lang),
                formatLabel(d.format),
              ].join(' · ')
              return (
                <ListRow role="listitem" key={d.id}>
                  <ListRowIcon>
                    <FileStack className="size-5" />
                  </ListRowIcon>
                  <div className="min-w-0 flex-1">
                    {hasReviews ? (
                      <ListRowButton
                        onClick={() => setReviewDossierId(d.id)}
                        aria-label={t({
                          fr: `Ouvrir la correspondance de ${d.productName}`,
                          en: `Open correspondence for ${d.productName}`,
                        })}
                        title={d.productName}
                      >
                        {d.productName}
                      </ListRowButton>
                    ) : (
                      <ListRowLink to={`/workspace/${d.id}`} title={d.productName}>
                        {d.productName}
                      </ListRowLink>
                    )}
                    <div className="text-muted-foreground mt-0.5 truncate text-xs">{sub}</div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <StatusBadge tone={DOSSIER_STATUS_TONE[s]}>{statusLabel(s, lang)}</StatusBadge>
                    {unreadCount > 0 ? (
                      <StatusBadge
                        tone="info"
                        aria-label={t({
                          fr: `${unreadCount} message(s) non lu(s)`,
                          en: `${unreadCount} unread message(s)`,
                        })}
                      >
                        {t({
                          fr: `${unreadCount} non lu${unreadCount > 1 ? 's' : ''}`,
                          en: `${unreadCount} unread`,
                        })}
                      </StatusBadge>
                    ) : null}
                  </div>

                  {/* Garde-fou GxP : un dossier SOUMIS (≥1 correspondance) ne se supprime pas →
                    Archiver (rétention). Un brouillon → Supprimer. Un archivé → Restaurer.
                    Toutes les actions passent par une confirmation + motif (audit). */}
                  <ListRowActions>
                    {view === 'archived' ? (
                      <DossierAction
                        mode="restore"
                        name={d.productName}
                        onConfirm={() => handleRestore(d.id)}
                      />
                    ) : hasReviews ? (
                      <DossierAction
                        mode="archive"
                        name={d.productName}
                        onConfirm={(r) => handleArchive(d.id, r)}
                      />
                    ) : (
                      <DossierAction
                        mode="delete"
                        name={d.productName}
                        onConfirm={(r) => handleDelete(d.id, r)}
                      />
                    )}
                  </ListRowActions>
                </ListRow>
              )
            })}
          </div>
          {view === 'active' ? (
            <OperationsActivity
              feed={feed}
              echeances={echeances}
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

/** Chip de filtre d'état — actif = tonalité sémantique subtile (DA), inactif = neutre. */
const CHIP_ACTIVE: Record<'all' | 'neutral' | 'info' | 'success' | 'warning' | 'danger', string> = {
  all: 'bg-info text-white border-transparent',
  neutral: 'bg-secondary text-secondary-foreground border-transparent',
  info: 'bg-info-subtle text-info-subtle-foreground border-transparent',
  success: 'bg-success-subtle text-success-subtle-foreground border-transparent',
  warning: 'bg-warning-subtle text-warning-subtle-foreground border-transparent',
  danger: 'bg-danger-subtle text-danger-subtle-foreground border-transparent',
}

function FilterChip({
  active,
  tone,
  count,
  onClick,
  children,
}: {
  active: boolean
  tone: keyof typeof CHIP_ACTIVE
  count: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? CHIP_ACTIVE[tone] : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {children} · <span className="tabular-nums">{count}</span>
    </button>
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
