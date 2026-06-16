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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import {
  dossierDisplayStatus,
  DOSSIER_STATUS_ORDER,
  STATUS_BADGE_CLASSES,
  statusLabel,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import { CorrespondencePanel } from '@/features/correspondence/CorrespondencePanel'
import { unreadIndex } from '@/features/correspondence/correspondence-reads'
import { listCorrespondences } from '@/features/correspondence/correspondence-repository'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { useOrgId } from '@/features/org/org-context'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
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
    <section className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t({ fr: 'CTD Workspace', en: 'CTD Workspace' })}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t({
              fr: 'Montez vos dossiers CTD/eCTD Module 1.',
              en: 'Build your CTD/eCTD Module 1 dossiers.',
            })}
          </p>
        </div>
        <Button asChild>
          <Link to="/workspace/nouveau">
            <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
          </Link>
        </Button>
      </div>

      {/* Bascule Actifs / Archivés — n'apparaît que si des dossiers sont archivés. */}
      {archivedCount > 0 ? (
        <div className="mt-5 inline-flex rounded-lg border p-0.5 text-xs font-medium">
          <button
            type="button"
            aria-pressed={view === 'active'}
            onClick={() => setView('active')}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1 transition-colors',
              view === 'active' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {t({ fr: 'Actifs', en: 'Active' })} · {activeDossiers?.length ?? 0}
          </button>
          <button
            type="button"
            aria-pressed={view === 'archived'}
            onClick={() => setView('archived')}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1 transition-colors',
              view === 'archived' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {t({ fr: 'Archivés', en: 'Archived' })} · {archivedCount}
          </button>
        </div>
      ) : null}

      {view === 'active' && (activeDossiers ?? []).length > 0 ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t({ fr: 'Filtrer par état', en: 'Filter by status' })}
        >
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === 'all'
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'hover:bg-muted',
            )}
          >
            {t({ fr: 'Tous', en: 'All' })} · {activeDossiers?.length ?? 0}
          </button>
          {DOSSIER_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(filter === s ? 'all' : s)}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === s ? STATUS_BADGE_CLASSES[s] : 'hover:bg-muted',
              )}
            >
              {statusLabel(s, lang)} · {counts.get(s) ?? 0}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        {dossiers === undefined ? (
          <p className="text-muted-foreground text-sm">
            {t({ fr: 'Chargement…', en: 'Loading…' })}
          </p>
        ) : view === 'active' && dossiers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <FileStack className="text-muted-foreground mx-auto size-8" />
            <h2 className="mt-2 text-lg font-medium">
              {t({ fr: 'Aucun dossier', en: 'No dossier' })}
            </h2>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
              {t({
                fr: "Créez un dossier : choisissez un produit, le format (CTD/eCTD), l'activité et le pays cible.",
                en: 'Create a dossier: choose a product, the format (CTD/eCTD), the activity and the target country.',
              })}
            </p>
            <Button asChild className="mt-4">
              <Link to="/workspace/nouveau">
                <FolderPlus /> {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
              </Link>
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            {view === 'archived'
              ? t({ fr: 'Aucun dossier archivé.', en: 'No archived dossier.' })
              : t({
                  fr: `Aucun dossier « ${statusLabel(filter, lang)} ».`,
                  en: `No "${statusLabel(filter, lang)}" dossier.`,
                })}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((d) => {
              const s = statusById.get(d.id) ?? 'draft'
              const unreadCount = unread?.byDossier.get(d.id) ?? 0
              // Dossier déjà en correspondance : le clic ouvre la boîte (reviews au premier
              // plan, bouton « Modifier le dossier » pour rejoindre le montage) — brief CEO.
              const hasReviews = s !== 'draft'
              const cardBody = (
                <>
                  <div className="truncate font-medium">{d.productName}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {activityLabel(d.activity, lang)} · {countryLabel(d.country, lang)}
                  </div>
                </>
              )
              return (
                <li key={d.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    {hasReviews ? (
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        onClick={() => setReviewDossierId(d.id)}
                      >
                        {cardBody}
                      </button>
                    ) : (
                      <Link to={`/workspace/${d.id}`} className="min-w-0 flex-1">
                        {cardBody}
                      </Link>
                    )}
                    <Badge variant="secondary">{formatLabel(d.format)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge className={cn(STATUS_BADGE_CLASSES[s])}>{statusLabel(s, lang)}</Badge>
                      {unreadCount > 0 ? (
                        <Badge
                          className="bg-primary text-primary-foreground border-transparent"
                          aria-label={t({
                            fr: `${unreadCount} message(s) non lu(s)`,
                            en: `${unreadCount} unread message(s)`,
                          })}
                        >
                          {t({
                            fr: `${unreadCount} non lu${unreadCount > 1 ? 's' : ''}`,
                            en: `${unreadCount} unread`,
                          })}
                        </Badge>
                      ) : null}
                    </div>
                    {/* Garde-fou GxP : un dossier SOUMIS (≥1 correspondance) ne se supprime pas →
                        Archiver (rétention). Un brouillon → Supprimer. Un archivé → Restaurer.
                        Toutes les actions passent par une confirmation + motif (audit). */}
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
                  </div>
                </li>
              )
            })}
          </ul>
        )}
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
    </section>
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
