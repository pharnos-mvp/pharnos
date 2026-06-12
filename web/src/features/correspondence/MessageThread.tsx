import { Paperclip } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DECISION_LABELS, STATUS_BADGE_CLASSES } from './correspondence-constants'

/**
 * Fil de correspondance type chat (jalon H) — commun à la page publique (reviewer) et au
 * panneau labo. Les bulles de `viewpoint` s'alignent à droite ; les décisions s'affichent en
 * jalon central (acte fort du flux), le reste en bulles.
 */

export interface ThreadAttachment {
  name: string
  size: number
  mime: string
  /** URL résolue (signée côté public) — sinon le clic passe par `onDownloadAttachment`. */
  url?: string | null
  path?: string
}

export interface ThreadMessage {
  id: string
  author: 'sender' | 'recipient'
  authorLabel: string
  kind: 'note' | 'decision' | 'comment'
  decision: 'accepted' | 'suspended' | 'rejected' | null
  body: string
  createdAt: string
  attachments: ThreadAttachment[]
}

const dateFmt = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d)
}

const formatSize = (bytes: number) => {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`
}

function AttachmentChips({
  attachments,
  onDownload,
}: {
  attachments: ThreadAttachment[]
  onDownload?: (a: ThreadAttachment) => void
}) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a, i) =>
        a.url ? (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer noopener"
            className="bg-background/60 hover:bg-background inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Paperclip className="size-3 shrink-0" />
            <span className="truncate">{a.name}</span>
            <span className="text-muted-foreground shrink-0">· {formatSize(a.size)}</span>
          </a>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onDownload?.(a)}
            className="bg-background/60 hover:bg-background inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Paperclip className="size-3 shrink-0" />
            <span className="truncate">{a.name}</span>
            <span className="text-muted-foreground shrink-0">· {formatSize(a.size)}</span>
          </button>
        ),
      )}
    </div>
  )
}

export function MessageThread({
  messages,
  viewpoint,
  onDownloadAttachment,
}: {
  messages: ThreadMessage[]
  viewpoint: 'sender' | 'recipient'
  onDownloadAttachment?: (a: ThreadAttachment) => void
}) {
  if (messages.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Aucun échange.</p>
  }
  return (
    <ol className="space-y-3" aria-label="Fil de correspondance">
      {messages.map((m) => {
        // Jalon décision : uniquement pour une valeur connue (payload réseau → garde runtime).
        if (m.kind === 'decision' && m.decision && m.decision in DECISION_LABELS) {
          return (
            <li key={m.id} className="py-1 text-center">
              <Badge className={cn('px-2.5 py-0.5', STATUS_BADGE_CLASSES[m.decision])}>
                {DECISION_LABELS[m.decision]}
              </Badge>
              <div className="text-muted-foreground mt-1 text-xs">
                {m.authorLabel} · {formatDate(m.createdAt)}
              </div>
              {m.body ? (
                <div className="bg-muted/50 mx-auto mt-2 max-w-md rounded-lg border px-3 py-2 text-left text-sm whitespace-pre-wrap">
                  {m.body}
                  <AttachmentChips attachments={m.attachments} onDownload={onDownloadAttachment} />
                </div>
              ) : (
                <div className="mx-auto max-w-md text-left">
                  <AttachmentChips attachments={m.attachments} onDownload={onDownloadAttachment} />
                </div>
              )}
            </li>
          )
        }
        const mine = m.author === viewpoint
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-lg border px-3 py-2 text-sm sm:max-w-[70%]',
                mine ? 'bg-primary/10 border-primary/20' : 'bg-muted/50',
              )}
            >
              <div className="text-muted-foreground mb-0.5 text-xs">
                {m.kind === 'note' ? 'Note d’envoi — ' : ''}
                {m.authorLabel} · {formatDate(m.createdAt)}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
              <AttachmentChips attachments={m.attachments} onDownload={onDownloadAttachment} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
