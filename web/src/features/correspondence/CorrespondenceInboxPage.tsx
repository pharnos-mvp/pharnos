import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  Ban,
  Copy,
  FileDown,
  FolderOpen,
  Gavel,
  History,
  Inbox,
  MoreVertical,
  Package,
  Search,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useTopbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAuth } from '@/features/auth/auth-context'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useOrgId } from '@/features/org/org-context'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STATUS_TONE,
  lifecycleStatusLabel,
  type LifecycleTone,
} from '@/features/workspace/lifecycle-constants'
import { dossierRef } from '@/features/workspace/operations-data'
import { agencyFor } from '@/features/workspace/roadmap-data'
import { STAGE_ICON } from '@/features/workspace/roadmap-mini-utils'
import { useBelowLg } from '@/hooks/use-below-lg'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import { ConversationPane } from './ConversationPane'
import { statusLabel } from './correspondence-constants'
import { isActionNeeded, listInboxRows, type InboxRow } from './correspondence-inbox'
import { useDossierConversation } from './use-dossier-conversation'

type InboxFilter = 'all' | 'action' | 'unread'

const listTime = (iso: string, lang: Lang): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  return new Intl.DateTimeFormat(
    lang === 'en' ? 'en-GB' : 'fr',
    sameDay ? { hour: '2-digit', minute: '2-digit' } : { dateStyle: 'medium' },
  ).format(d)
}

const TONE_TEXT: Record<LifecycleTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * Boîte de réception (mockup C, GO CEO 2026-07-09) : la « boîte mail » RA plein écran — volet
 * gauche = tous les fils d'échange (tous dossiers, scopés par la sync RLS/CS1), volet droit = la
 * conversation ouverte, coiffée du **rail Parcours permanent** (où en est le dossier, à tout
 * moment). Cockpit hauteur fixe (scrolls INTERNES, pattern board Opérations v2) ; sous lg, une
 * seule colonne : liste ↔ conversation (retour ←). Complète la cloche (signal) sans la doubler :
 * ici on TRIE et on RÉPOND. Lecture locale (Dexie) déjà bornée au périmètre synchronisé.
 */
export function CorrespondenceInboxPage() {
  const { t, lang } = useI18n()
  useTopbar({ searchHidden: true }) // la page a sa propre recherche → pas de doublon dans le topbar
  const orgId = useOrgId()
  const { user } = useAuth()
  const navigate = useNavigate()
  const belowLg = useBelowLg()
  const rows = useLiveQuery(() => listInboxRows(orgId), [orgId])
  const [openDossierId, setOpenDossierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InboxFilter>('all')

  const counts = useMemo(() => {
    const list = rows ?? []
    return {
      unreadThreads: list.filter((r) => r.unread > 0).length,
      unreadMessages: list.reduce((n, r) => n + r.unread, 0),
      action: list.filter((r) => isActionNeeded(r.lifecycle)).length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const list = rows ?? []
    const q = search.trim().toLowerCase()
    return list.filter((r) => {
      if (filter === 'unread' && r.unread === 0) return false
      if (filter === 'action' && !isActionNeeded(r.lifecycle)) return false
      if (!q) return true
      return (
        r.productName.toLowerCase().includes(q) ||
        countryLabel(r.country, lang).toLowerCase().includes(q) ||
        agencyFor(r.country).name.toLowerCase().includes(q)
      )
    })
  }, [rows, filter, search, lang])

  // Fil affiché = openDossierId, VERROUILLÉ en état (jamais dérivé de la liste triée) : ouvrir un
  // fil le marque lu → la liste « non-lus d'abord » se réordonne ; une sélection qui suivrait
  // `filtered[0]` glisserait alors de fil en fil et marquerait TOUTE la boîte lue (revue CTO,
  // Blocker). Desktop : on épingle une fois le premier fil (comportement volet de lecture d'un
  // client mail — SEUL ce fil passe lu) ; re-épinglé si le fil ouvert disparaît (corbeille/org).
  // Sous lg : liste seule tant qu'aucun fil n'est ouvert (une colonne, retour ←).
  const openExists =
    openDossierId !== null && (rows ?? []).some((r) => r.dossierId === openDossierId)
  useEffect(() => {
    if (belowLg || openExists) return
    const first = filtered[0]?.dossierId
    // eslint-disable-next-line react-hooks/set-state-in-effect -- épinglage piloté par données
    if (first) setOpenDossierId(first)
  }, [belowLg, openExists, filtered])
  const displayedDossierId = openExists ? openDossierId : null

  if (rows === undefined) {
    return (
      <Page className="max-w-3xl">
        <p className="text-muted-foreground p-4 text-sm">
          {t({ fr: 'Chargement…', en: 'Loading…' })}
        </p>
      </Page>
    )
  }

  if (rows.length === 0) {
    return (
      <Page className="max-w-3xl">
        <EmptyState
          icon={<Inbox />}
          title={t({ fr: 'Aucune correspondance pour l’instant.', en: 'No correspondence yet.' })}
          description={t({
            fr: 'Depuis un dossier compilé, « Envoyer » à l’agence ouvre un fil — il apparaîtra ici, coiffé de son parcours.',
            en: 'From a compiled dossier, “Send” to the agency opens a thread — it will appear here, topped by its path.',
          })}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate('/workspace')}>
              {t({ fr: 'Aller aux dossiers', en: 'Go to dossiers' })}
            </Button>
          }
        />
      </Page>
    )
  }

  const showList = !belowLg || displayedDossierId === null
  const showConv = displayedDossierId !== null

  return (
    <div className="flex h-full flex-col pt-4 lg:pt-6">
      <h1 className="sr-only">{t({ fr: 'Boîte de réception', en: 'Inbox' })}</h1>
      <section
        className={cn(
          'bg-card grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border',
          !belowLg && 'lg:grid-cols-[360px_minmax(0,1fr)]',
        )}
      >
        {/* ── Volet LISTE : tous les fils, recherche + filtres, scroll interne ── */}
        {showList ? (
          <aside className={cn('flex min-h-0 flex-col', !belowLg && 'border-r')}>
            <div className="shrink-0 border-b px-4 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="bg-info-subtle text-info flex size-9 shrink-0 items-center justify-center rounded-xl">
                  <Inbox className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] leading-tight font-bold">
                    {t({ fr: 'Boîte de réception', en: 'Inbox' })}
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {t({
                      fr: `${rows.length} fil(s) · ${counts.unreadMessages} non lu(s)`,
                      en: `${rows.length} thread(s) · ${counts.unreadMessages} unread`,
                    })}
                  </p>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={t({ fr: 'Rechercher un fil', en: 'Search a thread' })}
                  placeholder={t({
                    fr: 'Produit, pays, agence…',
                    en: 'Product, country, agency…',
                  })}
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border pr-3 pl-8 text-sm outline-none focus-visible:ring-[3px]"
                />
              </div>
              <div
                className="mt-2.5 flex flex-wrap gap-1.5"
                role="group"
                aria-label={t({ fr: 'Filtrer', en: 'Filter' })}
              >
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  {t({ fr: 'Toutes', en: 'All' })}
                </FilterChip>
                <FilterChip active={filter === 'action'} onClick={() => setFilter('action')}>
                  {t({ fr: 'Action requise', en: 'Action needed' })}
                  {counts.action > 0 ? ` · ${counts.action}` : ''}
                </FilterChip>
                <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')}>
                  {t({ fr: 'Non lues', en: 'Unread' })}
                  {counts.unreadThreads > 0 ? ` · ${counts.unreadThreads}` : ''}
                </FilterChip>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                {t({ fr: 'Aucun fil ne correspond.', en: 'No thread matches.' })}
              </p>
            ) : (
              <ul
                className="min-h-0 flex-1 overflow-y-auto"
                aria-label={t({ fr: 'Fils de correspondance', en: 'Correspondence threads' })}
              >
                {filtered.map((row) => (
                  <InboxRowItem
                    key={row.dossierId}
                    row={row}
                    lang={lang}
                    t={t}
                    active={row.dossierId === displayedDossierId}
                    onOpen={() => setOpenDossierId(row.dossierId)}
                  />
                ))}
              </ul>
            )}
          </aside>
        ) : null}

        {/* ── Volet CONVERSATION : rail Parcours permanent + fil + composeur ── */}
        {showConv && displayedDossierId ? (
          <InboxConversation
            key={displayedDossierId}
            orgId={orgId}
            dossierId={displayedDossierId}
            senderEmail={user?.email ?? ''}
            onBack={belowLg ? () => setOpenDossierId(null) : null}
          />
        ) : !belowLg ? (
          // Desktop, aucun fil affichable (filtre sans résultat…) : volet explicite, pas un blanc.
          <div className="text-muted-foreground grid place-items-center p-8 text-sm">
            {t({ fr: 'Sélectionnez un fil à gauche.', en: 'Select a thread on the left.' })}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active ? 'bg-foreground text-background border-transparent' : 'hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

/** Anneau de progression n/7, coloré par le TON du statut — l'état se lit dès la liste. */
function ProgressRing({ done, total, tone }: { done: number; total: number; tone: LifecycleTone }) {
  const pct = Math.round((done / Math.max(1, total)) * 100)
  return (
    <span
      aria-hidden="true"
      className={cn('relative grid size-10 shrink-0 place-items-center', TONE_TEXT[tone])}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(currentColor ${pct}%, var(--border) 0)`,
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 4.5px), #000 calc(100% - 3.5px))',
          WebkitMask:
            'radial-gradient(farthest-side, transparent calc(100% - 4.5px), #000 calc(100% - 3.5px))',
        }}
      />
      <span className="text-foreground font-mono text-[10px] font-bold">
        {done}/{total}
      </span>
    </span>
  )
}

function InboxRowItem({
  row,
  lang,
  t,
  active,
  onOpen,
}: {
  row: InboxRow
  lang: Lang
  t: (v: Translatable) => string
  active: boolean
  onOpen: () => void
}) {
  const agency = agencyFor(row.country)
  const { status, currentStageId, progress } = row.lifecycle
  const stageDef = LIFECYCLE_STAGES.find((s) => s.id === currentStageId)!
  const StageIcon = STAGE_ICON[currentStageId]
  const snippet =
    !row.lastActivityIsSend && row.lastMessage
      ? row.lastMessage.kind === 'decision'
        ? `${t({ fr: 'Décision', en: 'Decision' })} : ${statusLabel(row.lastMessage.decision ?? '', lang)}`
        : row.lastMessage.body || t({ fr: 'Pièce jointe', en: 'Attachment' })
      : t({ fr: 'Dossier envoyé', en: 'Dossier sent' })
  const complete = progress.done >= progress.total

  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onOpen}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 border-b border-l-2 px-3.5 py-3 text-left transition-colors',
          active ? 'border-l-info bg-info-subtle/60' : 'hover:bg-muted/40 border-l-transparent',
        )}
      >
        <ProgressRing
          done={progress.done}
          total={progress.total}
          tone={LIFECYCLE_STATUS_TONE[status]}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'font-display truncate text-[13.5px]',
                row.unread > 0 ? 'font-bold' : 'font-semibold',
              )}
            >
              {row.productName}
            </span>
            <span className="text-muted-foreground shrink-0 text-[11px]">
              {listTime(row.lastActivityAt, lang)}
            </span>
          </span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
            <CountryFlag code={row.country} size={13} />
            <span className="truncate">
              {countryLabel(row.country, lang)} · {agency.name} ·{' '}
              {activityLabel(row.activity, lang)}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-xs',
              row.unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}
          >
            {snippet}
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium">
              <StageIcon className="size-3.5" />
              {complete ? t({ fr: 'Terminé', en: 'Done' }) : t(stageDef.label)}
            </span>
            <StatusBadge tone={LIFECYCLE_STATUS_TONE[status]}>
              {lifecycleStatusLabel(status, lang)}
            </StatusBadge>
          </span>
        </span>
        {row.unread > 0 ? (
          <span className="bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
            {row.unread}
          </span>
        ) : null}
      </button>
    </li>
  )
}

/**
 * Conversation du dossier ouvert : le hook partagé + `ConversationPane` (même moteur que le
 * panneau du dossier — UX validée), coiffés d'un en-tête IDENTITÉ DU DOSSIER (produit, pays,
 * agence, activité) et des actions du fil. `key={dossierId}` au call-site : état remis à zéro
 * en changeant de fil.
 */
function InboxConversation({
  orgId,
  dossierId,
  senderEmail,
  onBack,
}: {
  orgId: string
  dossierId: string
  senderEmail: string
  onBack: (() => void) | null
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const conv = useDossierConversation(orgId, dossierId, senderEmail)
  const { selected, canSubmit, shareLink } = conv

  if (!selected) return null
  const agency = agencyFor(selected.country)
  const opRef = conv.dossier ? dossierRef(conv.dossier) : null

  return (
    <ConversationPane
      conv={conv}
      onEdit={() => navigate(`/workspace/${dossierId}`)}
      recipientChips="always"
      header={
        <div className="bg-card flex shrink-0 items-center gap-2.5 border-b p-3">
          {onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t({ fr: 'Retour à la liste', en: 'Back to the list' })}
              onClick={onBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : null}
          <span className="bg-info-subtle text-info flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Package className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-sm font-bold">{selected.productName}</div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
              {opRef ? (
                <>
                  <span className="font-mono">{opRef}</span>
                  <span className="text-muted-foreground/50">·</span>
                </>
              ) : null}
              <CountryFlag code={selected.country} size={13} />
              <span>{countryLabel(selected.country, lang)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{agency.name}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{activityLabel(selected.activity, lang)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="truncate">{selected.recipientEmail}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t({ fr: 'Ouvrir le dossier', en: 'Open the dossier' })}
              title={t({ fr: 'Ouvrir le dossier (montage)', en: 'Open the dossier (assembly)' })}
              onClick={() => navigate(`/workspace/${dossierId}`)}
            >
              <FolderOpen className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t({ fr: 'Actions de la conversation', en: 'Conversation actions' })}
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canSubmit && selected.status === 'in_review' ? (
                  <DropdownMenuItem onClick={conv.openDecision}>
                    <Gavel className="size-4" />{' '}
                    {t({ fr: 'Rendre la décision', en: 'Record the decision' })}
                  </DropdownMenuItem>
                ) : null}
                {shareLink && selected.revokedAt === null ? (
                  <DropdownMenuItem onClick={() => void conv.handleCopy()}>
                    <Copy className="size-4" /> {t({ fr: 'Copier le lien', en: 'Copy the link' })}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => conv.setShowAccess((s) => !s)}>
                  <History className="size-4" /> {t({ fr: 'Journal d’accès', en: 'Access log' })}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={conv.handleExport}>
                  <FileDown className="size-4" />{' '}
                  {t({ fr: 'Exporter le fil (PDF)', en: 'Export the thread (PDF)' })}
                </DropdownMenuItem>
                {selected.revokedAt === null && canSubmit ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void conv.handleRevoke()}
                    >
                      <Ban className="size-4" />{' '}
                      {t({ fr: 'Révoquer le lien', en: 'Revoke the link' })}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
    />
  )
}
