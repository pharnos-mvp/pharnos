import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, Check, Copy, FolderOpen, History, Loader2, Lock, MailX, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { downloadAttachmentBlob } from '@/features/workspace/dossier-attachments-sync'
import { db, type CorrespondenceRecord } from '@/lib/db'
import { initials } from '@/lib/initials'
import { getSupabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { STATUS_BADGE_CLASSES, statusLabel } from './correspondence-constants'
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

const ACCESS_LABELS: Record<string, string> = {
  open: 'Ouverture du dossier',
  decide: 'Décision rendue',
  reply: 'Message envoyé',
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

/**
 * Boîte de correspondance DU DOSSIER (v2) — « Gmail des RA × WhatsApp », scopée au produit :
 * volet gauche = conversations de ce dossier (une par correspondant : dernier message, non-lus,
 * état), volet droit = fil type chat (séparateurs de jour, auto-scroll, composer). Le classement
 * inter-dossiers reste sur la home du CTD Workspace (pastilles d'état).
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

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Correspondance du dossier"
    >
      <div className="bg-card flex h-full w-full max-w-3xl flex-col border-l shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <h2 className="min-w-0 truncate text-sm font-semibold">
            Correspondance{productName ? ` — ${productName}` : ''}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {onEdit ? (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <FolderOpen className="size-4" /> Modifier le dossier
              </Button>
            ) : null}
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
            {/* Volet conversations (type Gmail/WhatsApp) — masqué s'il n'y a qu'un correspondant */}
            {conversations.length > 1 ? (
              <aside className="hidden w-64 shrink-0 overflow-auto border-r md:block">
                <ul aria-label="Conversations du dossier">
                  {conversations.map((c) => {
                    const msgs = byConversation.get(c.id) ?? []
                    const last = msgs.at(-1)
                    const unread = countUnread(msgs, lastSeen.get(c.id))
                    const active = c.id === selected.id
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedId(c.id)}
                          className={cn(
                            'flex w-full cursor-pointer items-start gap-2.5 border-b px-3 py-2.5 text-left',
                            active ? 'bg-muted/70' : 'hover:bg-muted/40',
                          )}
                        >
                          <span className="bg-primary/15 text-primary mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
                            {initials(c.recipientEmail)}
                          </span>
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
                                {last ? last.body || 'Pièce jointe' : 'Dossier envoyé'}
                              </span>
                              {unread > 0 ? (
                                <span className="bg-primary text-primary-foreground grid size-4.5 shrink-0 place-items-center rounded-full text-[10px] font-semibold">
                                  {unread}
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    'size-2 shrink-0 rounded-full',
                                    STATUS_BADGE_CLASSES[c.status],
                                  )}
                                  title={statusLabel(c.status)}
                                />
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </aside>
            ) : null}

            {/* Conversation : bande info + fil + composer */}
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="space-y-2 border-b p-3">
                {conversations.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5 md:hidden">
                    {conversations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={c.id === selected.id}
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
                          c.id === selected.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted',
                        )}
                      >
                        {c.recipientEmail}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">{selected.recipientEmail}</div>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      Envoyé le {dateFmt.format(new Date(selected.createdAt))}
                      {selected.passwordHash ? (
                        <>
                          {' '}
                          · <Lock className="inline size-3" /> protégé
                        </>
                      ) : null}
                    </div>
                  </div>
                  <Badge className={cn('shrink-0', STATUS_BADGE_CLASSES[selected.status])}>
                    {statusLabel(selected.status)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {shareLink && selected.revokedAt === null ? (
                    <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? 'Copié' : 'Copier le lien'}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-expanded={showAccess}
                    onClick={() => setShowAccess((s) => !s)}
                  >
                    <History className="size-4" /> Accès
                  </Button>
                  {selected.revokedAt === null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => void handleRevoke()}
                    >
                      <Ban className="size-4" /> Révoquer
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Lien révoqué — renvoyez le dossier pour rouvrir l’accès.
                    </span>
                  )}
                </div>
                {showAccess ? (
                  <div className="bg-muted/40 rounded-md border">
                    <AccessLog correspondenceId={selected.id} />
                  </div>
                ) : null}
              </div>

              <div ref={threadRef} className="flex-1 overflow-auto p-3">
                <MessageThread
                  messages={threadMessages}
                  viewpoint="sender"
                  onDownloadAttachment={(a) => void handleDownloadAttachment(a)}
                />
              </div>

              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    placeholder="Répondre au correspondant…"
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
                    size="sm"
                    className="shrink-0"
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
                <p className="text-muted-foreground mt-1.5 text-[11px]">
                  Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne · le correspondant est
                  prévenu par e-mail.
                </p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
