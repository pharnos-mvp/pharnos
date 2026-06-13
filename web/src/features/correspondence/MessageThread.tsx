import { Check, Download, FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { authorTextColor } from './avatar-colors'
import { ConversationAvatar } from './correspondence-avatar'
import { DECISION_LABELS, STATUS_BADGE_CLASSES } from './correspondence-constants'

/**
 * Fil de correspondance type chat (jalon H, habillage WhatsApp v3) — commun à la page publique
 * (reviewer) et au panneau labo. Bulles `viewpoint` vertes à droite, reçues à gauche ; décisions
 * et notes système en pastille centrée (acte fort du flux) ; pièces jointes en carte document.
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

const timeFmt = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' })
const formatTime = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d)
}

// Séparateurs de jour (groupage type WhatsApp) : « Aujourd'hui », « Hier », sinon date longue.
const dayFmt = new Intl.DateTimeFormat('fr', { weekday: 'long', day: 'numeric', month: 'long' })
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Aujourd’hui'
  if (sameDay(d, yesterday)) return 'Hier'
  return dayFmt.format(d)
}

const formatSize = (bytes: number) => {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`
}

/** Carte document type WhatsApp : icône, nom, taille + « Ouvrir / Enregistrer ». */
function AttachmentCards({
  attachments,
  onDownload,
}: {
  attachments: ThreadAttachment[]
  onDownload?: (a: ThreadAttachment) => void
}) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-1.5 space-y-1.5">
      {attachments.map((a, i) => {
        // « Ouvrir » : pièce signée (page publique). « Enregistrer » : seulement si un vrai
        // handler de téléchargement est fourni (panneau labo). Ni l'un ni l'autre → indisponible
        // (jamais de bouton mort : la signature peut échouer côté reviewer).
        const canOpen = Boolean(a.url)
        const canSave = Boolean(onDownload)
        return (
          <div key={i} className="rounded-md bg-black/5 p-2 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
                <FileText className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{a.name}</div>
                <div className="text-[11px] opacity-70">
                  {(a.mime?.split('/')?.pop() ?? 'fichier').toUpperCase()} · {formatSize(a.size)}
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-3 border-t border-black/10 pt-1.5 text-[11px] font-medium dark:border-white/10">
              {canOpen ? (
                <a
                  href={a.url ?? undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-foreground font-semibold hover:underline"
                >
                  Ouvrir
                </a>
              ) : null}
              {canSave ? (
                <button
                  type="button"
                  className="text-foreground inline-flex cursor-pointer items-center gap-1 font-semibold hover:underline"
                  onClick={() => onDownload?.(a)}
                >
                  <Download className="size-3" /> Enregistrer
                </button>
              ) : null}
              {!canOpen && !canSave ? <span className="opacity-70">Pièce indisponible</span> : null}
            </div>
          </div>
        )
      })}
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
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Aucun échange pour l’instant.
      </p>
    )
  }
  return (
    <ol className="space-y-1.5" aria-label="Fil de correspondance">
      {messages.map((m, i) => {
        const day = dayLabel(m.createdAt)
        const prevDay = i > 0 ? dayLabel(messages[i - 1]?.createdAt ?? '') : ''
        const daySeparator =
          day && day !== prevDay ? (
            <div className="my-2.5 flex justify-center" aria-hidden>
              <span className="wa-chip rounded-md px-2.5 py-0.5 text-[11px] shadow-sm">{day}</span>
            </div>
          ) : null

        // Décision : pastille centrée (acte fort) — uniquement pour une valeur connue.
        if (m.kind === 'decision' && m.decision && m.decision in DECISION_LABELS) {
          return (
            <li key={m.id} className="text-center">
              {daySeparator}
              <div className="py-1">
                <Badge className={cn('px-2.5 py-0.5', STATUS_BADGE_CLASSES[m.decision])}>
                  {DECISION_LABELS[m.decision]}
                </Badge>
                <div className="text-muted-foreground mt-1 text-[11px]">
                  {m.authorLabel} · {formatTime(m.createdAt)}
                </div>
                {m.body || m.attachments.length > 0 ? (
                  <div className="wa-chip mx-auto mt-2 max-w-sm rounded-lg px-3 py-2 text-left text-sm whitespace-pre-wrap shadow-sm">
                    {m.body}
                    <AttachmentCards
                      attachments={m.attachments}
                      onDownload={onDownloadAttachment}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          )
        }

        const mine = m.author === viewpoint
        // Identité par auteur (style chat de groupe) : sur les messages REÇUS, on affiche
        // l'avatar + le nom du correspondant. Regroupé par auteur consécutif (avatar/nom sur
        // le 1er d'une série) → « chaque icône par correspondant » quand plusieurs personnes
        // écrivent (membres du labo côté agence, ou inversement).
        const prev = messages[i - 1]
        const firstOfRun =
          !prev || prev.author !== m.author || prev.authorLabel !== m.authorLabel || !!daySeparator
        return (
          <li key={m.id}>
            {daySeparator}
            <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
              {!mine ? (
                firstOfRun ? (
                  <ConversationAvatar email={m.authorLabel} size="sm" />
                ) : (
                  <span className="w-9 shrink-0" aria-hidden />
                )
              ) : null}
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm sm:max-w-[75%]',
                  mine ? 'wa-out rounded-tr-sm' : 'wa-in rounded-tl-sm',
                )}
              >
                {!mine && firstOfRun ? (
                  <div
                    className={cn(
                      'mb-0.5 text-[11px] font-semibold',
                      authorTextColor(m.authorLabel),
                    )}
                  >
                    {m.authorLabel}
                  </div>
                ) : null}
                {m.kind === 'note' ? (
                  <div className="mb-0.5 text-[11px] font-medium opacity-70">Note d’envoi</div>
                ) : null}
                {m.body ? <div className="whitespace-pre-wrap">{m.body}</div> : null}
                <AttachmentCards attachments={m.attachments} onDownload={onDownloadAttachment} />
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-75">
                  {formatTime(m.createdAt)}
                  {/* Accusé HONNÊTE : ✓✓ gris = envoyé/synchronisé (jamais « lu » bleu — on ne
                      peut pas le prouver côté reviewer). */}
                  {mine ? (
                    <span title="Envoyé" className="inline-flex -space-x-1">
                      <Check className="size-3" />
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
