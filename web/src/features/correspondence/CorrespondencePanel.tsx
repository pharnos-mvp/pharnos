import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, Check, Copy, Loader2, MailX, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { downloadAttachmentBlob } from '@/features/workspace/dossier-attachments-sync'
import type { CorrespondenceRecord } from '@/lib/db'
import { cn } from '@/lib/utils'
import { STATUS_BADGE_CLASSES, statusLabel } from './correspondence-constants'
import {
  appendSenderMessage,
  getShareLink,
  listByDossier,
  listMessages,
  revokeCorrespondence,
} from './correspondence-repository'
import { syncCorrespondences } from './correspondence-sync'
import { MessageThread, type ThreadAttachment, type ThreadMessage } from './MessageThread'

const dateFmt = new Intl.DateTimeFormat('fr', { dateStyle: 'medium' })

/**
 * Panneau Correspondance du dossier (côté labo, jalon H) : fil type chat avec le correspondant,
 * réponse offline-first (outbox), lien de review copiable, révocation. Les messages du reviewer
 * arrivent par Realtime (hook global) ou par la sync pull — Dexie est l'unique source de l'UI.
 */
export function CorrespondencePanel({
  orgId,
  dossierId,
  senderEmail,
  onClose,
}: {
  orgId: string
  dossierId: string
  senderEmail: string
  onClose: () => void
}) {
  const correspondences = useLiveQuery(() => listByDossier(dossierId), [dossierId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected: CorrespondenceRecord | undefined = useMemo(() => {
    const list = correspondences ?? []
    return list.find((c) => c.id === selectedId) ?? list[0]
  }, [correspondences, selectedId])

  const messages = useLiveQuery(
    () => (selected ? listMessages(selected.id) : Promise.resolve([])),
    [selected?.id],
  )
  const shareLink = useLiveQuery(
    () => (selected ? getShareLink(selected.id) : Promise.resolve(undefined)),
    [selected?.id],
  )

  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const threadMessages: ThreadMessage[] = (messages ?? []).map((m) => ({
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
        void syncCorrespondences(orgId)
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-card flex h-full w-full max-w-md flex-col border-l shadow-xl">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="text-sm font-semibold">Correspondance</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {(correspondences ?? []).length === 0 ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <MailX className="size-8" />
            Aucun envoi pour ce dossier.
            <span className="text-xs">Compilez le PDF puis « Envoyer » au correspondant.</span>
          </div>
        ) : selected ? (
          <>
            {(correspondences ?? []).length > 1 ? (
              <div className="flex flex-wrap gap-1.5 border-b p-2">
                {(correspondences ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={c.id === selected.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
                      c.id === selected.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    {dateFmt.format(new Date(c.createdAt))}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="space-y-2 border-b p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="truncate font-medium">{selected.recipientEmail}</div>
                  <div className="text-muted-foreground text-xs">
                    Envoyé le {dateFmt.format(new Date(selected.createdAt))}
                    {selected.passwordHash ? ' · protégé par mot de passe' : ''}
                  </div>
                </div>
                <Badge className={cn('shrink-0', STATUS_BADGE_CLASSES[selected.status])}>
                  {statusLabel(selected.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {shareLink && selected.revokedAt === null ? (
                  <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? 'Copié' : 'Copier le lien'}
                  </Button>
                ) : null}
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
            </div>

            <div className="flex-1 overflow-auto p-3">
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
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
