import { useState } from 'react'
import {
  Ban,
  Copy,
  FileDown,
  FolderOpen,
  Gavel,
  History,
  Lock,
  MailX,
  Maximize2,
  Minimize2,
  MoreVertical,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import { AccessLog } from './AccessLog'
import { ConversationPane } from './ConversationPane'
import { ConversationAvatar } from './correspondence-avatar'
import { statusLabel } from './correspondence-constants'
import { useDossierConversation } from './use-dossier-conversation'

const SIZE_KEY = 'pharnos.corr.maximized'

// Locale Intl suivant la langue UI : EN = en-GB (24 h + jour/mois, registre pro), sinon FR.
const dtLocale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'fr')
const fmtDate = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(dtLocale(lang), { dateStyle: 'medium' }).format(d)
const fmtTime = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(dtLocale(lang), { hour: '2-digit', minute: '2-digit' }).format(d)

const listTime = (iso: string, lang: Lang) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  return sameDay ? fmtTime(d, lang) : fmtDate(d, lang)
}

/**
 * Boîte de correspondance DU DOSSIER (v3 — habillage WhatsApp, mockups CEO) : deux volets
 * (conversations du dossier à gauche : recherche, filtre Toutes/Non lues, aperçus, non-lus ;
 * chat à droite : fond à motifs, bulles, composeur), deux tailles (défaut docké / large
 * maximisé). Le classement inter-dossiers vit dans la Boîte de réception (`/correspondance`).
 * Données + actions : `useDossierConversation` (partagé) ; volet chat : `ConversationPane`.
 * Offline-first : Dexie est l'unique source de l'UI (Realtime/pull alimentent Dexie).
 */
export function CorrespondencePanel({
  orgId,
  dossierId,
  senderEmail,
  onClose,
  onEdit,
}: {
  orgId: string
  dossierId: string
  senderEmail: string
  onClose: () => void
  /** Ouvre la page de montage du dossier (affiché depuis la home — brief CEO point c). */
  onEdit?: () => void
}) {
  const { t, lang } = useI18n()
  const conv = useDossierConversation(orgId, dossierId, senderEmail)
  const {
    canSubmit,
    conversations,
    productName,
    selected,
    setSelectedId,
    byConversation,
    recipients,
    groupUnread,
    unreadConversations,
    shareLink,
    copied,
    handleCopy,
    handleRevoke,
    handleExport,
    showAccess,
    setShowAccess,
    openDecision,
    waitingDays,
  } = conv

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [maximized, setMaximized] = useState(() => localStorage.getItem(SIZE_KEY) === '1')
  function toggleSize() {
    setMaximized((m) => {
      localStorage.setItem(SIZE_KEY, m ? '0' : '1')
      return !m
    })
  }

  function handleNew() {
    // Un nouvel envoi exige le PDF compilé : on renvoie l'utilisateur au montage.
    if (onEdit) onEdit()
    else
      toast.info(
        t({
          fr: 'Pour un nouvel envoi : compilez le PDF puis « Envoyer ».',
          en: 'For a new send: compile the PDF then “Send”.',
        }),
      )
  }

  const visibleRecipients = recipients.filter((c) => {
    if (filter === 'unread' && groupUnread(c.recipientEmail) === 0) return false
    const q = search.trim().toLowerCase()
    return !q || c.recipientEmail.toLowerCase().includes(q)
  })

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-black/50',
        maximized ? 'items-center justify-center p-2 sm:p-4' : 'justify-end',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={t({ fr: 'Correspondance du dossier', en: 'Dossier correspondence' })}
    >
      <div
        className={cn(
          'bg-card flex flex-col shadow-xl',
          maximized ? 'h-[96vh] w-[98vw] rounded-lg border' : 'h-full w-full max-w-4xl border-l',
        )}
      >
        {/* Bandeau du conteneur : titre + actions globales + tailles */}
        <div className="flex items-center justify-between gap-2 border-b p-2.5">
          <h2 className="min-w-0 truncate pl-1 text-sm font-semibold">
            {t({ fr: 'Correspondance', en: 'Correspondence' })}
            {productName ? ` — ${productName}` : ''}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {onEdit ? (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <FolderOpen className="size-4" />{' '}
                {t({ fr: 'Modifier le dossier', en: 'Edit the dossier' })}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                maximized
                  ? t({ fr: 'Réduire la fenêtre', en: 'Minimize window' })
                  : t({ fr: 'Agrandir la fenêtre', en: 'Maximize window' })
              }
              onClick={toggleSize}
            >
              {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t({ fr: 'Fermer', en: 'Close' })}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {conversations.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <MailX className="size-8" />
            {t({ fr: 'Aucun envoi pour ce dossier.', en: 'No sends for this dossier.' })}
            <span className="text-xs">
              {t({
                fr: 'Compilez le PDF puis « Envoyer » au correspondant.',
                en: 'Compile the PDF then “Send” to the correspondent.',
              })}
            </span>
          </div>
        ) : selected ? (
          <div className="flex min-h-0 flex-1">
            {/* VOLET GAUCHE — contexte dossier + actions + Discussions (recherche, filtre, liste) */}
            <aside className="hidden w-[300px] shrink-0 flex-col border-r md:flex">
              <div className="space-y-2 border-b p-3">
                <div>
                  <div className="truncate text-sm font-semibold">{selected.productName}</div>
                  <dl className="text-muted-foreground mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                    <dt>{t({ fr: 'Pays cible', en: 'Target country' })}</dt>
                    <dd className="text-foreground truncate">
                      {countryLabel(selected.country, lang)}
                    </dd>
                    <dt>{t({ fr: 'Activité', en: 'Activity' })}</dt>
                    <dd className="text-foreground truncate">
                      {activityLabel(selected.activity, lang)}
                    </dd>
                  </dl>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {shareLink && selected.revokedAt === null ? (
                    <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                      <Copy className="size-3.5" />{' '}
                      {copied
                        ? t({ fr: 'Copié', en: 'Copied' })
                        : t({ fr: 'Copier le lien', en: 'Copy the link' })}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-expanded={showAccess}
                    onClick={() => setShowAccess((s) => !s)}
                  >
                    <History className="size-3.5" /> {t({ fr: 'Accès', en: 'Access' })}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <FileDown className="size-3.5" />{' '}
                    {t({ fr: 'Exporter (PDF)', en: 'Export (PDF)' })}
                  </Button>
                  {selected.revokedAt === null && canSubmit ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => void handleRevoke()}
                    >
                      <Ban className="size-3.5" /> {t({ fr: 'Révoquer', en: 'Revoke' })}
                    </Button>
                  ) : null}
                  {canSubmit && selected.status === 'in_review' ? (
                    <Button variant="outline" size="sm" onClick={openDecision}>
                      <Gavel className="size-3.5" />{' '}
                      {t({ fr: 'Rendre la décision', en: 'Record the decision' })}
                    </Button>
                  ) : null}
                </div>
                {showAccess ? (
                  <div className="bg-muted/40 rounded-md border">
                    <AccessLog correspondenceId={selected.id} />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-base font-semibold tracking-tight">
                  {t({ fr: 'Discussions', en: 'Discussions' })}
                </span>
                {canSubmit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t({ fr: 'Nouvel envoi', en: 'New send' })}
                    title={t({
                      fr: 'Nouvel envoi (compiler puis Envoyer)',
                      en: 'New send (compile then Send)',
                    })}
                    onClick={handleNew}
                  >
                    <Plus className="size-4" />
                  </Button>
                ) : null}
              </div>

              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <input
                    type="search"
                    placeholder={t({
                      fr: 'Rechercher un correspondant…',
                      en: 'Search for a correspondent…',
                    })}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-full border bg-transparent pr-3 pl-8 text-xs outline-none focus-visible:ring-[3px]"
                  />
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={filter === 'all'}
                    onClick={() => setFilter('all')}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      filter === 'all'
                        ? 'bg-foreground text-background border-transparent'
                        : 'hover:bg-muted',
                    )}
                  >
                    {t({ fr: 'Toutes', en: 'All' })}
                  </button>
                  <button
                    type="button"
                    aria-pressed={filter === 'unread'}
                    onClick={() => setFilter('unread')}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      filter === 'unread'
                        ? 'bg-foreground text-background border-transparent'
                        : 'hover:bg-muted',
                    )}
                  >
                    {t({ fr: 'Non lues', en: 'Unread' })}
                    {unreadConversations > 0 ? ` ${unreadConversations}` : ''}
                  </button>
                </div>
              </div>

              <ul
                className="flex-1 overflow-auto"
                aria-label={t({ fr: 'Conversations du dossier', en: 'Dossier conversations' })}
              >
                {visibleRecipients.length === 0 ? (
                  <li className="text-muted-foreground p-4 text-center text-xs">
                    {t({ fr: 'Aucune conversation.', en: 'No conversations.' })}
                  </li>
                ) : (
                  visibleRecipients.map((c) => {
                    const msgs = byConversation.get(c.id) ?? []
                    const last = msgs.at(-1)
                    const unread = groupUnread(c.recipientEmail)
                    const cycles = conv.cyclesOf(c.recipientEmail)
                    // Active si la conversation ouverte appartient à CE destinataire (un cycle
                    // antérieur sélectionné garde sa ligne en surbrillance).
                    const active = selected.recipientEmail === c.recipientEmail
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedId(c.id)}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2.5 border-b px-3 py-2.5 text-left',
                            active ? 'bg-muted/70' : 'hover:bg-muted/40',
                          )}
                        >
                          <ConversationAvatar email={c.recipientEmail} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span
                                className={cn(
                                  'truncate text-sm',
                                  unread > 0 ? 'font-semibold' : 'font-medium',
                                )}
                              >
                                {c.recipientEmail}
                              </span>
                              <span className="text-muted-foreground shrink-0 text-[11px]">
                                {last
                                  ? listTime(last.createdAt, lang)
                                  : listTime(c.createdAt, lang)}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'truncate text-xs',
                                  unread > 0
                                    ? 'text-foreground font-medium'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {last
                                  ? last.kind === 'decision'
                                    ? `${t({ fr: 'Décision', en: 'Decision' })} : ${statusLabel(last.decision ?? '', lang)}`
                                    : last.body || t({ fr: 'Pièce jointe', en: 'Attachment' })
                                  : t({ fr: 'Dossier envoyé', en: 'Dossier sent' })}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                {cycles > 1 ? (
                                  <span className="text-muted-foreground text-[10px]">
                                    {cycles} {t({ fr: 'envois', en: 'sends' })}
                                  </span>
                                ) : null}
                                {unread > 0 ? (
                                  <span className="bg-primary text-primary-foreground grid size-4.5 place-items-center rounded-full text-[10px] font-semibold">
                                    {unread}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </aside>

            {/* VOLET DROIT — conversation (en-tête destinataire + rail + fil + composeur) */}
            <ConversationPane
              conv={conv}
              onEdit={onEdit}
              recipientChips="below-md"
              header={
                <div className="bg-card flex shrink-0 items-center gap-2.5 border-b p-2.5">
                  <ConversationAvatar email={selected.recipientEmail} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{selected.recipientEmail}</div>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      {statusLabel(selected.status, lang)}
                      {waitingDays !== null && waitingDays >= 1 ? (
                        <span className={cn(waitingDays >= 7 && 'text-warning font-medium')}>
                          {' · '}
                          {t({
                            fr: `en attente depuis ${waitingDays} j`,
                            en: `waiting for ${waitingDays} d`,
                          })}
                        </span>
                      ) : null}
                      {selected.passwordHash ? (
                        <>
                          {' · '}
                          <Lock className="inline size-3" /> {t({ fr: 'protégé', en: 'protected' })}
                        </>
                      ) : null}
                      {selected.revokedAt !== null
                        ? ` · ${t({ fr: 'lien révoqué', en: 'link revoked' })}`
                        : ''}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t({
                          fr: 'Actions de la conversation',
                          en: 'Conversation actions',
                        })}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {shareLink && selected.revokedAt === null ? (
                        <DropdownMenuItem onClick={() => void handleCopy()}>
                          <Copy className="size-4" />{' '}
                          {t({ fr: 'Copier le lien', en: 'Copy the link' })}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onClick={() => setShowAccess((s) => !s)}>
                        <History className="size-4" />{' '}
                        {t({ fr: 'Journal d’accès', en: 'Access log' })}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExport}>
                        <FileDown className="size-4" />{' '}
                        {t({ fr: 'Exporter le fil (PDF)', en: 'Export the thread (PDF)' })}
                      </DropdownMenuItem>
                      {onEdit ? (
                        <DropdownMenuItem onClick={onEdit}>
                          <FolderOpen className="size-4" />{' '}
                          {t({ fr: 'Modifier le dossier', en: 'Edit the dossier' })}
                        </DropdownMenuItem>
                      ) : null}
                      {selected.revokedAt === null && canSubmit ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => void handleRevoke()}
                          >
                            <Ban className="size-4" />{' '}
                            {t({ fr: 'Révoquer le lien', en: 'Revoke the link' })}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
