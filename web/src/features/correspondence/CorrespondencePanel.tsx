import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Ban,
  Copy,
  FolderOpen,
  History,
  Loader2,
  Lock,
  MailX,
  Maximize2,
  Minimize2,
  MoreVertical,
  Plus,
  Search,
  Send,
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
import { downloadAttachmentBlob } from '@/features/workspace/dossier-attachments-sync'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import { db, type CorrespondenceRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import './correspondence-chat.css'
import { autoGrow } from './auto-grow'
import { ConversationAvatar } from './correspondence-avatar'
import { statusLabel } from './correspondence-constants'
import { countUnread, markConversationRead } from './correspondence-reads'
import {
  appendSenderMessage,
  getShareLink,
  listByDossier,
  revokeCorrespondence,
} from './correspondence-repository'
import { syncCorrespondences } from './correspondence-sync'
import { MessageThread, type ThreadAttachment, type ThreadMessage } from './MessageThread'
import { notifyRecipient } from './share-send'

const dateFmt = new Intl.DateTimeFormat('fr', { dateStyle: 'medium' })
const timeFmt = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' })
const accessFmt = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' })
const SIZE_KEY = 'pharnos.corr.maximized'

const ACCESS_LABELS: Record<string, string> = {
  open: 'Ouverture du dossier',
  decide: 'Décision rendue',
  reply: 'Message envoyé',
}

const listTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  return sameDay ? timeFmt.format(d) : dateFmt.format(d)
}

interface AccessRow {
  action: string
  ip_hash: string
  user_agent: string | null
  at: string
}

/**
 * Journal d'accès du lien (L1) — qui a consulté/agi, quand, depuis où (IP hashée). Lecture
 * seule via RLS org ; écrit exclusivement par l'Edge `share`. Online-only (traçabilité).
 */
function AccessLog({ correspondenceId }: { correspondenceId: string }) {
  const [rows, setRows] = useState<AccessRow[] | 'loading' | 'error'>('loading')
  useEffect(() => {
    let cancelled = false
    // Chargement async (fetch on mount) : setState uniquement post-await — exception légitime.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows('loading')
    void (async () => {
      const supabase = await getSupabase()
      if (!supabase) {
        if (!cancelled) setRows('error')
        return
      }
      const { data, error } = await supabase
        .from('share_access_log')
        .select('action, ip_hash, user_agent, at')
        .eq('correspondence_id', correspondenceId)
        .order('at', { ascending: false })
        .limit(50)
      if (!cancelled) setRows(error ? 'error' : ((data ?? []) as AccessRow[]))
    })()
    return () => {
      cancelled = true
    }
  }, [correspondenceId])

  if (rows === 'loading') {
    return <p className="text-muted-foreground p-2 text-xs">Chargement du journal…</p>
  }
  if (rows === 'error') {
    return <p className="text-muted-foreground p-2 text-xs">Journal indisponible hors-ligne.</p>
  }
  if (rows.length === 0) {
    return <p className="text-muted-foreground p-2 text-xs">Aucun accès enregistré.</p>
  }
  return (
    <ul className="max-h-40 space-y-1 overflow-auto p-2" aria-label="Journal d'accès">
      {rows.map((r, i) => (
        <li key={i} className="text-muted-foreground flex items-baseline gap-2 text-xs">
          <span className="text-foreground shrink-0 font-medium">
            {ACCESS_LABELS[r.action] ?? r.action}
          </span>
          <span className="shrink-0">{accessFmt.format(new Date(r.at))}</span>
          <span className="truncate">
            IP {r.ip_hash}
            {r.user_agent ? ` · ${r.user_agent.split(' ')[0]}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Boîte de correspondance DU DOSSIER (v3 — habillage WhatsApp, mockups CEO) : deux volets
 * (conversations du dossier à gauche : recherche, filtre Toutes/Non lues, aperçus, non-lus ;
 * chat à droite : fond à motifs, bulles, composeur), deux tailles (défaut docké / large
 * maximisé). Le classement inter-dossiers reste sur la home du CTD Workspace.
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
  const correspondences = useLiveQuery(() => listByDossier(dossierId), [dossierId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected: CorrespondenceRecord | undefined = useMemo(() => {
    const list = correspondences ?? []
    return list.find((c) => c.id === selectedId) ?? list[0]
  }, [correspondences, selectedId])

  // Tous les messages du dossier en une requête : fil de la conversation ouverte + extraits
  // et compteurs non-lus de la liste (volumes pilotes faibles, agrégation en mémoire).
  const allMessages = useLiveQuery(async () => {
    const ids = (correspondences ?? []).map((c) => c.id)
    if (ids.length === 0) return []
    return db.correspondenceMessages.where('correspondenceId').anyOf(ids).sortBy('createdAt')
  }, [correspondences])
  const reads = useLiveQuery(() => db.correspondenceReads.toArray(), [])

  const byConversation = useMemo(() => {
    const map = new Map<string, NonNullable<typeof allMessages>>()
    for (const m of allMessages ?? []) {
      const list = map.get(m.correspondenceId)
      if (list) list.push(m)
      else map.set(m.correspondenceId, [m])
    }
    return map
  }, [allMessages])
  const lastSeen = useMemo(() => new Map((reads ?? []).map((r) => [r.id, r.lastSeenAt])), [reads])

  const messages = selected ? (byConversation.get(selected.id) ?? []) : []
  const shareLink = useLiveQuery(
    () => (selected ? getShareLink(selected.id) : Promise.resolve(undefined)),
    [selected?.id],
  )

  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [maximized, setMaximized] = useState(() => localStorage.getItem(SIZE_KEY) === '1')
  const boxRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  function toggleSize() {
    setMaximized((m) => {
      localStorage.setItem(SIZE_KEY, m ? '0' : '1')
      return !m
    })
  }

  // Conversation affichée = lue (marqueur local). Re-marquée à chaque nouveau message reçu.
  const lastMessageAt = messages.at(-1)?.createdAt
  useEffect(() => {
    if (selected) void markConversationRead(selected.id)
  }, [selected?.id, lastMessageAt, selected])

  // Auto-scroll en bas du fil (WhatsApp) à l'ouverture et à chaque nouveau message.
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selected?.id, messages.length])

  // Composeur auto-extensible : hauteur max = moitié de la boîte (recalcul si taille change).
  useEffect(() => {
    autoGrow(composerRef.current, (boxRef.current?.clientHeight ?? 480) / 2)
  }, [reply, maximized, selected?.id])

  const threadMessages: ThreadMessage[] = messages.map((m) => ({
    id: m.id,
    author: m.author,
    authorLabel: m.authorLabel,
    kind: m.kind,
    decision: m.decision,
    body: m.body,
    createdAt: m.createdAt,
    attachments: m.attachments.map((a) => ({ ...a, url: null })),
  }))

  async function handleReply() {
    if (!selected || !reply.trim()) return
    setSending(true)
    try {
      await appendSenderMessage(selected, senderEmail, reply)
      setReply('')
      if (navigator.onLine) {
        const link = shareLink
        void syncCorrespondences(orgId).then(() => {
          // Le reviewer est prévenu par e-mail (best-effort) — même lien, fil complet retrouvé.
          // Pas de garde revoked côté client : l'Edge `notify` re-vérifie révocation/expiration
          // (état FRAIS) et répond 410 — c'est lui qui fait autorité.
          if (link) void notifyRecipient(selected.id, link.url)
        })
      } else {
        toast.info('Hors-ligne : la réponse partira à la reconnexion.')
      }
    } finally {
      setSending(false)
    }
  }

  async function handleCopy() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copie impossible — sélectionnez le lien manuellement.')
    }
  }

  async function handleRevoke() {
    if (!selected) return
    await revokeCorrespondence(selected.id)
    void syncCorrespondences(orgId)
    toast.success('Lien révoqué — le correspondant n’y a plus accès.')
  }

  function handleNew() {
    // Un nouvel envoi exige le PDF compilé : on renvoie l'utilisateur au montage.
    if (onEdit) onEdit()
    else toast.info('Pour un nouvel envoi : compilez le PDF puis « Envoyer ».')
  }

  async function handleDownloadAttachment(a: ThreadAttachment) {
    if (!a.path) return
    const blob = await downloadAttachmentBlob(a.path)
    if (!blob) {
      toast.error('Pièce indisponible (hors-ligne ?).')
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = a.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  const conversations = correspondences ?? []
  const productName = conversations[0]?.productName
  // Une icône par DESTINATAIRE (brief CEO) : on GROUPE par e-mail (liste déjà triée par createdAt
  // décroissant) → le représentant de la ligne = le cycle le plus récent. Les cycles antérieurs
  // (« renvoi après rejet » = nouvelle correspondance même agence) restent JOIGNABLES via le
  // sélecteur de cycle de la conversation — jamais perdus (audit réglementaire).
  const recipientGroups = new Map<string, CorrespondenceRecord[]>()
  for (const c of conversations) {
    const arr = recipientGroups.get(c.recipientEmail)
    if (arr) arr.push(c)
    else recipientGroups.set(c.recipientEmail, [c])
  }
  const recipients = [...recipientGroups.values()].map((g) => g[0]!)
  const groupUnread = (email: string) =>
    (recipientGroups.get(email) ?? []).reduce(
      (n, c) => n + countUnread(byConversation.get(c.id) ?? [], lastSeen.get(c.id)),
      0,
    )
  const visibleRecipients = recipients.filter((c) => {
    if (filter === 'unread' && groupUnread(c.recipientEmail) === 0) return false
    const q = search.trim().toLowerCase()
    return !q || c.recipientEmail.toLowerCase().includes(q)
  })
  const unreadConversations = recipients.filter((c) => groupUnread(c.recipientEmail) > 0).length
  // Cycles du destinataire sélectionné (≥ 2 → sélecteur de cycle dans la conversation).
  const selectedGroup = selected ? (recipientGroups.get(selected.recipientEmail) ?? [selected]) : []

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-black/50',
        maximized ? 'items-center justify-center p-2 sm:p-4' : 'justify-end',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Correspondance du dossier"
    >
      <div
        ref={boxRef}
        className={cn(
          'bg-card flex flex-col shadow-xl',
          maximized ? 'h-[96vh] w-[98vw] rounded-lg border' : 'h-full w-full max-w-4xl border-l',
        )}
      >
        {/* Bandeau du conteneur : titre + actions globales + tailles */}
        <div className="flex items-center justify-between gap-2 border-b p-2.5">
          <h2 className="min-w-0 truncate pl-1 text-sm font-semibold">
            Correspondance{productName ? ` — ${productName}` : ''}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {onEdit ? (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <FolderOpen className="size-4" /> Modifier le dossier
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={maximized ? 'Réduire la fenêtre' : 'Agrandir la fenêtre'}
              onClick={toggleSize}
            >
              {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {conversations.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <MailX className="size-8" />
            Aucun envoi pour ce dossier.
            <span className="text-xs">Compilez le PDF puis « Envoyer » au correspondant.</span>
          </div>
        ) : selected ? (
          <div className="flex min-h-0 flex-1">
            {/* VOLET GAUCHE — contexte dossier + actions + Discussions (recherche, filtre, liste) */}
            <aside className="hidden w-[300px] shrink-0 flex-col border-r md:flex">
              <div className="space-y-2 border-b p-3">
                <div>
                  <div className="truncate text-sm font-semibold">{selected.productName}</div>
                  <dl className="text-muted-foreground mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                    <dt>Pays cible</dt>
                    <dd className="text-foreground truncate">{countryLabel(selected.country)}</dd>
                    <dt>Activité</dt>
                    <dd className="text-foreground truncate">{activityLabel(selected.activity)}</dd>
                  </dl>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {shareLink && selected.revokedAt === null ? (
                    <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                      <Copy className="size-3.5" /> {copied ? 'Copié' : 'Copier le lien'}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-expanded={showAccess}
                    onClick={() => setShowAccess((s) => !s)}
                  >
                    <History className="size-3.5" /> Accès
                  </Button>
                  {selected.revokedAt === null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => void handleRevoke()}
                    >
                      <Ban className="size-3.5" /> Révoquer
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
                <span className="text-base font-semibold tracking-tight">Discussions</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Nouvel envoi"
                  title="Nouvel envoi (compiler puis Envoyer)"
                  onClick={handleNew}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <input
                    type="search"
                    placeholder="Rechercher un correspondant…"
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
                        ? 'border-transparent bg-emerald-600 text-white'
                        : 'hover:bg-muted',
                    )}
                  >
                    Toutes
                  </button>
                  <button
                    type="button"
                    aria-pressed={filter === 'unread'}
                    onClick={() => setFilter('unread')}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      filter === 'unread'
                        ? 'border-transparent bg-emerald-600 text-white'
                        : 'hover:bg-muted',
                    )}
                  >
                    Non lues{unreadConversations > 0 ? ` ${unreadConversations}` : ''}
                  </button>
                </div>
              </div>

              <ul className="flex-1 overflow-auto" aria-label="Conversations du dossier">
                {visibleRecipients.length === 0 ? (
                  <li className="text-muted-foreground p-4 text-center text-xs">
                    Aucune conversation.
                  </li>
                ) : (
                  visibleRecipients.map((c) => {
                    const msgs = byConversation.get(c.id) ?? []
                    const last = msgs.at(-1)
                    const unread = groupUnread(c.recipientEmail)
                    const cycles = recipientGroups.get(c.recipientEmail)?.length ?? 1
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
                                {last ? listTime(last.createdAt) : listTime(c.createdAt)}
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
                                    ? `Décision : ${statusLabel(last.decision ?? '')}`
                                    : last.body || 'Pièce jointe'
                                  : 'Dossier envoyé'}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                {cycles > 1 ? (
                                  <span className="text-muted-foreground text-[10px]">
                                    {cycles} envois
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

            {/* VOLET DROIT — conversation (en-tête + fil doodle + composeur) */}
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="bg-card flex shrink-0 items-center gap-2.5 border-b p-2.5">
                <ConversationAvatar email={selected.recipientEmail} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{selected.recipientEmail}</div>
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    {statusLabel(selected.status)}
                    {selected.passwordHash ? (
                      <>
                        {' · '}
                        <Lock className="inline size-3" /> protégé
                      </>
                    ) : null}
                    {selected.revokedAt !== null ? ' · lien révoqué' : ''}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Actions de la conversation">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {shareLink && selected.revokedAt === null ? (
                      <DropdownMenuItem onClick={() => void handleCopy()}>
                        <Copy className="size-4" /> Copier le lien
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => setShowAccess((s) => !s)}>
                      <History className="size-4" /> Journal d’accès
                    </DropdownMenuItem>
                    {onEdit ? (
                      <DropdownMenuItem onClick={onEdit}>
                        <FolderOpen className="size-4" /> Modifier le dossier
                      </DropdownMenuItem>
                    ) : null}
                    {selected.revokedAt === null ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => void handleRevoke()}>
                          <Ban className="size-4" /> Révoquer le lien
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Sélecteur de CYCLE — plusieurs envois à la MÊME agence (renvoi après rejet) :
                  une icône par destinataire dans la liste, mais chaque cycle reste joignable ici. */}
              {selectedGroup.length > 1 ? (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
                  <span className="text-muted-foreground mr-1 text-[11px] font-medium">
                    Envois :
                  </span>
                  {selectedGroup.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={c.id === selected.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px]',
                        c.id === selected.id
                          ? 'bg-primary text-primary-foreground border-transparent'
                          : 'hover:bg-muted',
                      )}
                    >
                      {dateFmt.format(new Date(c.createdAt))} · {statusLabel(c.status)}
                      {i === 0 ? ' (actuel)' : ''}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Journal d'accès en mobile (le volet gauche qui l'héberge est masqué < md) */}
              {showAccess ? (
                <div className="bg-muted/40 border-b md:hidden">
                  <AccessLog correspondenceId={selected.id} />
                </div>
              ) : null}

              {/* Sélecteur de conversation en mobile (le volet liste est masqué < md) */}
              {recipients.length > 1 ? (
                <div className="flex flex-wrap gap-1.5 border-b p-2 md:hidden">
                  {recipients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={c.id === selected.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
                        c.id === selected.id
                          ? 'bg-primary text-primary-foreground border-transparent'
                          : 'hover:bg-muted',
                      )}
                    >
                      {c.recipientEmail}
                    </button>
                  ))}
                </div>
              ) : null}

              <div ref={threadRef} className="wa-pane flex-1 overflow-auto p-3 sm:px-6">
                <MessageThread
                  messages={threadMessages}
                  viewpoint="sender"
                  onDownloadAttachment={(a) => void handleDownloadAttachment(a)}
                />
              </div>

              <div className="bg-card flex items-end gap-2 border-t p-2.5">
                <textarea
                  ref={composerRef}
                  rows={1}
                  className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-10 flex-1 resize-none rounded-2xl border bg-transparent px-4 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                  placeholder="Écrivez un message…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleReply()
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="size-10 shrink-0 rounded-full"
                  disabled={sending || !reply.trim()}
                  aria-label="Envoyer la réponse"
                  onClick={() => void handleReply()}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
