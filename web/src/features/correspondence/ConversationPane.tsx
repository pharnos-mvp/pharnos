import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, Loader2, Lock, RotateCw, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RoadmapMini } from '@/features/workspace/RoadmapMini'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import './correspondence-chat.css'

import { AccessLog } from './AccessLog'
import { autoGrow } from './auto-grow'
import { statusLabel } from './correspondence-constants'
import { MessageThread } from './MessageThread'
import type { UseDossierConversation } from './use-dossier-conversation'

const fmtDate = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr', { dateStyle: 'medium' }).format(d)

/**
 * Volet CONVERSATION d'un dossier (présentation) — partagé par le panneau overlay du dossier et
 * la Boîte de réception (mockup C). Toute la donnée/logique vient de `useDossierConversation`
 * (instancié par le parent, qui garde la main sur la sélection et son propre chrome). De haut en
 * bas : en-tête (slot), **rail Parcours permanent**, bandeau « Action requise », sélecteurs de
 * cycle/destinataire, journal d'accès, fil WhatsApp (préservé), composeur.
 */
export function ConversationPane({
  conv,
  header,
  onEdit,
  recipientChips = 'below-md',
  className,
}: {
  conv: UseDossierConversation
  /** En-tête au-dessus du rail — panneau : destinataire+menu ; inbox : identité du dossier. */
  header: ReactNode
  /** Ouvre le montage du dossier (CTA « Corriger et renvoyer », renvoi après rejet). */
  onEdit?: () => void
  /** Chips destinataires : `below-md` = fallback mobile du panneau (l'aside liste déjà) ; `always` = inbox. */
  recipientChips?: 'always' | 'below-md'
  className?: string
}) {
  const { t, lang } = useI18n()
  const {
    selected,
    selectedGroup,
    recipients,
    setSelectedId,
    threadMessages,
    messages,
    lifecycle,
    waitingDays,
    canSubmit,
    showAccess,
    reply,
    setReply,
    sending,
    handleReply,
    handleDownloadAttachment,
  } = conv

  const paneRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll en bas du fil (WhatsApp) à l'ouverture et à chaque nouveau message.
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selected?.id, messages.length])

  // Composeur auto-extensible : hauteur max = moitié du volet. Sans tableau de deps À DESSEIN :
  // la borne dépend de la hauteur rendue du volet (maximisation du panneau, resize…) — un
  // recalcul idempotent par rendu suit toutes ces causes sans les énumérer.
  useEffect(() => {
    autoGrow(composerRef.current, (paneRef.current?.clientHeight ?? 480) / 2)
  })

  if (!selected) return null

  return (
    <section ref={paneRef} className={cn('flex min-w-0 flex-1 flex-col', className)}>
      {header}

      {/* Rail Parcours PERMANENT (mockup C) : où en est le dossier, à tout moment — zéro clic. */}
      {lifecycle ? (
        <div className="bg-muted/40 shrink-0 border-b px-4 pt-2.5 pb-1.5">
          <RoadmapMini lifecycle={lifecycle} waitingDays={waitingDays} />
        </div>
      ) : null}

      {/* Bandeau ACTION REQUISE : quand le dossier attend l'utilisateur, l'info devient action. */}
      {lifecycle ? (
        <ActionBanner
          status={lifecycle.status}
          canSubmit={canSubmit}
          onReply={() => composerRef.current?.focus()}
          onEdit={onEdit}
        />
      ) : null}

      {/* Sélecteur de CYCLE — plusieurs envois à la MÊME agence (renvoi après rejet) :
          une icône par destinataire dans la liste, mais chaque cycle reste joignable ici. */}
      {selectedGroup.length > 1 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
          <span className="text-muted-foreground mr-1 text-[11px] font-medium">
            {t({ fr: 'Envois :', en: 'Sends:' })}
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
              {fmtDate(new Date(c.createdAt), lang)} · {statusLabel(c.status, lang)}
              {i === 0 ? ` ${t({ fr: '(actuel)', en: '(current)' })}` : ''}
            </button>
          ))}
        </div>
      ) : null}

      {/* Journal d'accès — panneau (`below-md`) : l'aside desktop l'affiche déjà, on ne rend la
          copie du volet que < md (sinon DOUBLE journal + double fetch — revue CTO) ; inbox : ici. */}
      {showAccess ? (
        <div className={cn('bg-muted/40 border-b', recipientChips === 'below-md' && 'md:hidden')}>
          <AccessLog correspondenceId={selected.id} />
        </div>
      ) : null}

      {/* Sélecteur de conversation — inbox : toujours ; panneau : < md (l'aside liste déjà).
          Surbrillance par DESTINATAIRE (pas par cycle) : un cycle antérieur sélectionné garde la
          chip de son agence allumée — même sémantique que la liste de l'aside. */}
      {recipients.length > 1 ? (
        <div
          className={cn(
            'flex flex-wrap gap-1.5 border-b p-2',
            recipientChips === 'below-md' && 'md:hidden',
          )}
        >
          {recipients.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.recipientEmail === selected.recipientEmail}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
                c.recipientEmail === selected.recipientEmail
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

      {canSubmit ? (
        <div className="bg-card flex items-end gap-2 border-t p-2.5">
          <textarea
            ref={composerRef}
            rows={1}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-10 flex-1 resize-none rounded-2xl border bg-transparent px-4 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
            placeholder={t({ fr: 'Écrivez un message…', en: 'Write a message…' })}
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
            aria-label={t({ fr: 'Envoyer la réponse', en: 'Send the reply' })}
            onClick={() => void handleReply()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      ) : (
        <div className="bg-card text-muted-foreground flex items-center gap-2 border-t p-3 text-xs">
          <Lock className="size-3.5 shrink-0" />
          <span>
            {t({
              fr: 'Lecture seule — seuls les gestionnaires de soumission (Admin, Agence, Expert RA) peuvent répondre.',
              en: 'Read-only — only submission managers (Admin, Agency, RA Expert) can reply.',
            })}
          </span>
        </div>
      )}

      <DecisionDialog conv={conv} />
    </section>
  )
}

/**
 * « Le dossier vous attend » : complément demandé (répondre dans le fil) ou rejet (corriger puis
 * renvoyer — nouveau cycle). Dérivé du statut global ; les états qui n'attendent PERSONNE côté
 * labo (revue, instruction, enregistré…) n'affichent rien — zéro bruit.
 */
function ActionBanner({
  status,
  canSubmit,
  onReply,
  onEdit,
}: {
  status: NonNullable<UseDossierConversation['lifecycle']>['status']
  canSubmit: boolean
  onReply: () => void
  onEdit?: () => void
}) {
  const { t } = useI18n()
  if (status === 'suspended') {
    return (
      <div className="bg-warning-subtle text-warning-subtle-foreground flex shrink-0 items-center gap-2.5 border-b px-4 py-2 text-xs font-medium">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {t({
            fr: 'Complément demandé — répondez dans le fil, pièces à l’appui.',
            en: 'Additional info requested — reply in the thread with supporting documents.',
          })}
        </span>
        {canSubmit ? (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onReply}>
            {t({ fr: 'Répondre', en: 'Reply' })}
          </Button>
        ) : null}
      </div>
    )
  }
  if (status === 'rejected') {
    return (
      <div className="bg-danger-subtle text-danger-subtle-foreground flex shrink-0 items-center gap-2.5 border-b px-4 py-2 text-xs font-medium">
        <RotateCw className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {t({
            fr: 'Dossier rejeté — corrigez puis renvoyez (nouveau cycle, l’historique reste).',
            en: 'Dossier rejected — fix then resend (new cycle, history is kept).',
          })}
        </span>
        {canSubmit && onEdit ? (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onEdit}>
            {t({ fr: 'Corriger et renvoyer', en: 'Fix and resend' })}
          </Button>
        ) : null}
      </div>
    )
  }
  return null
}

/** Décision in-app (M4-T3) : Accepter / Demander un complément / Rejeter + note optionnelle. */
function DecisionDialog({ conv }: { conv: UseDossierConversation }) {
  const { t } = useI18n()
  const {
    decisionOpen,
    setDecisionOpen,
    decisionChoice,
    setDecisionChoice,
    decisionNote,
    setDecisionNote,
    deciding,
    handleDecide,
  } = conv
  return (
    <Dialog open={decisionOpen} onOpenChange={(o) => !o && !deciding && setDecisionOpen(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t({ fr: 'Rendre la décision', en: 'Record the decision' })}</DialogTitle>
          <DialogDescription>
            {t({
              fr: 'La décision est ajoutée au fil (traçable) et le statut du dossier suit. Pour la réviser ensuite : « Renvoyer en revue ».',
              en: 'The decision is added to the thread (traceable) and the dossier status follows. To revise it later: “Send back for review”.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Boutons-bascule (aria-pressed) plutôt qu'un faux radiogroup : la navigation
              clavier native (Tab) reste correcte sans roving tabindex. */}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t({ fr: 'Décision', en: 'Decision' })}
          >
            {(
              [
                { value: 'accepted', label: { fr: 'Accepter', en: 'Accept' } },
                {
                  value: 'suspended',
                  label: { fr: 'Demander un complément', en: 'Request additional info' },
                },
                { value: 'rejected', label: { fr: 'Rejeter', en: 'Reject' } },
              ] as const
            ).map((o) => (
              <Button
                key={o.value}
                aria-pressed={decisionChoice === o.value}
                variant={
                  decisionChoice === o.value
                    ? o.value === 'rejected'
                      ? 'destructive'
                      : 'primary'
                    : 'outline'
                }
                size="sm"
                onClick={() => setDecisionChoice(o.value)}
              >
                {t(o.label)}
              </Button>
            ))}
          </div>
          <textarea
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t({
              fr: 'Note (facultatif) — ex. pièces attendues pour le complément…',
              en: 'Note (optional) — e.g. documents expected for the request…',
            })}
            aria-label={t({ fr: 'Note de décision', en: 'Decision note' })}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-none rounded-md border bg-transparent p-2.5 text-sm outline-none focus-visible:ring-[3px]"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDecisionOpen(false)} disabled={deciding}>
            {t({ fr: 'Annuler', en: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleDecide()}
            disabled={deciding || !decisionChoice}
          >
            {deciding ? <Loader2 className="size-4 animate-spin" /> : null}
            {t({ fr: 'Confirmer', en: 'Confirm' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
