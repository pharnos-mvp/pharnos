import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, Loader2, Lock, RefreshCw, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CorrespondenceRecord, DossierRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { listByDossier } from './correspondence-repository'
import {
  notifyRecipient,
  resendCompiledDossier,
  sendCompiledDossier,
  suggestSharePassword,
} from './share-send'

interface ShareDialogProps {
  orgId: string
  dossier: DossierRecord
  /** PDF compilé (Module 1) tel qu'affiché dans la preview. */
  pdfBlob: Blob
  senderEmail: string
  onClose: () => void
  onSent?: (correspondence: CorrespondenceRecord) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const textareaClass = cn(
  'border-input placeholder:text-muted-foreground dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
)

/**
 * « Envoyer le dossier » (jalon H) — recueille destinataire / note / mot de passe optionnel,
 * téléverse le PDF compilé et produit le lien de review `/r/{token}`. Le lien (et le mot de
 * passe, jamais stocké en clair) ne sont affichés qu'ICI, côté expéditeur.
 */
export function ShareDialog({
  orgId,
  dossier,
  pdfBlob,
  senderEmail,
  onClose,
  onSent,
}: ShareDialogProps) {
  const { t } = useI18n()
  const [recipientEmail, setRecipientEmail] = useState('')
  const [note, setNote] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [password, setPassword] = useState('')
  // L1 : validité du lien (jours, '0' = sans expiration) + révocation auto après décision.
  const [ttlDays, setTtlDays] = useState('30')
  const [autoRevoke, setAutoRevoke] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentUrl, setSentUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // E-mail de notification : best-effort (le lien copiable reste le chemin nominal).
  const [emailState, setEmailState] = useState<'sending' | 'sent' | 'failed'>('sending')
  // Mise à jour d'un envoi EXISTANT (dossier recompilé) : même lien, même fil, nouveau PDF.
  const [updatedFor, setUpdatedFor] = useState<CorrespondenceRecord | null>(null)
  const activeSends = (useLiveQuery(() => listByDossier(dossier.id), [dossier.id]) ?? []).filter(
    (corr) => corr.revokedAt === null,
  )

  async function handleSend() {
    const email = recipientEmail.trim()
    if (!EMAIL_RE.test(email)) {
      toast.error(
        t({
          fr: 'Adresse e-mail du correspondant invalide.',
          en: 'Invalid correspondent e-mail address.',
        }),
      )
      return
    }
    if (withPassword && password.trim().length < 8) {
      toast.error(
        t({
          fr: 'Mot de passe trop court (8 caractères minimum).',
          en: 'Password too short (8 characters minimum).',
        }),
      )
      return
    }
    if (!navigator.onLine) {
      toast.error(
        t({
          fr: 'Hors-ligne : l’envoi nécessite une connexion (téléversement du PDF).',
          en: 'Offline: sending requires a connection (PDF upload).',
        }),
      )
      return
    }
    setSending(true)
    try {
      const days = Number(ttlDays)
      const { correspondence, url } = await sendCompiledDossier({
        orgId,
        dossier,
        pdfBlob,
        senderEmail,
        recipientEmail: email,
        note,
        password: withPassword ? password.trim() : null,
        expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        autoRevokeOnDecision: autoRevoke,
      })
      setSentUrl(url)
      onSent?.(correspondence)
      void notifyRecipient(correspondence.id, url).then((sent) =>
        setEmailState(sent ? 'sent' : 'failed'),
      )
    } catch (e) {
      toast.error(
        (e as Error)?.message ??
          t({ fr: 'Échec de l’envoi du dossier.', en: 'Failed to send the dossier.' }),
      )
    } finally {
      setSending(false)
    }
  }

  async function handleCopy() {
    if (!sentUrl) return
    try {
      await navigator.clipboard.writeText(sentUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(
        t({
          fr: 'Copie impossible — sélectionnez le lien manuellement.',
          en: 'Copy failed — select the link manually.',
        }),
      )
    }
  }

  /** Mise à jour d'un envoi existant : même lien/fil, nouveau PDF, correspondant prévenu. */
  async function handleUpdate(corr: CorrespondenceRecord) {
    if (!navigator.onLine) {
      toast.error(
        t({
          fr: 'Hors-ligne : l’envoi nécessite une connexion (téléversement du PDF).',
          en: 'Offline: sending requires a connection (PDF upload).',
        }),
      )
      return
    }
    setSending(true)
    try {
      await resendCompiledDossier({ orgId, correspondence: corr, pdfBlob, senderEmail })
      setUpdatedFor(corr)
      onSent?.(corr)
    } catch (e) {
      toast.error(
        (e as Error)?.message ??
          t({ fr: 'Échec de la mise à jour du dossier.', en: 'Failed to update the dossier.' }),
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t({
        fr: 'Envoyer le dossier au correspondant',
        en: 'Send the dossier to the correspondent',
      })}
    >
      <div className="bg-card w-full max-w-lg rounded-lg border shadow-lg">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Send className="size-4" /> {t({ fr: 'Envoyer le dossier', en: 'Send the dossier' })} —{' '}
            {dossier.productName}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t({ fr: 'Fermer', en: 'Close' })}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        {updatedFor ? (
          <div className="space-y-4 p-4">
            <p className="text-sm">
              {t({ fr: 'Dossier mis à jour.', en: 'Dossier updated.' })}{' '}
              <span className="font-medium">{updatedFor.recipientEmail}</span>{' '}
              {t({
                fr: 'garde le même lien et tout l’historique des échanges — la nouvelle version du document s’affichera à sa prochaine ouverture. Un e-mail de notification lui a été envoyé (si la messagerie est joignable).',
                en: 'keeps the same link and the full exchange history — the new version of the document will appear the next time they open it. A notification e-mail has been sent to them (if their mailbox is reachable).',
              })}
            </p>
            <div className="flex justify-end border-t pt-3">
              <Button size="sm" onClick={onClose}>
                {t({ fr: 'Fermer', en: 'Close' })}
              </Button>
            </div>
          </div>
        ) : sentUrl === null ? (
          <div className="space-y-4 p-4">
            {activeSends.length > 0 ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">
                  {t({
                    fr: 'Ce dossier a déjà été envoyé.',
                    en: 'This dossier has already been sent.',
                  })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t({
                    fr: 'Mettre à jour remplace le document — le correspondant garde le même lien et tout le fil d’échanges.',
                    en: 'Updating replaces the document — the correspondent keeps the same link and the entire exchange thread.',
                  })}
                </p>
                <div className="space-y-1.5">
                  {activeSends.map((corr) => (
                    <Button
                      key={corr.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      disabled={sending}
                      onClick={() => void handleUpdate(corr)}
                    >
                      {sending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      <span className="truncate">
                        {t({ fr: 'Mettre à jour l’envoi à', en: 'Update the send to' })}{' '}
                        {corr.recipientEmail}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t({ fr: 'Ou créez un nouvel envoi :', en: 'Or create a new send:' })}
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="share-email">
                {t({
                  fr: 'E-mail du correspondant (agence locale)',
                  en: 'Correspondent e-mail (local agency)',
                })}
              </Label>
              <Input
                id="share-email"
                type="email"
                autoFocus
                placeholder={t({ fr: 'agence@representant.com', en: 'agency@representative.com' })}
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="share-note">
                {t({ fr: 'Note d’accompagnement (optionnel)', en: 'Cover note (optional)' })}
              </Label>
              <textarea
                id="share-note"
                rows={3}
                className={textareaClass}
                placeholder={t({
                  fr: 'Ex. : merci de procéder au dépôt auprès de l’autorité…',
                  en: 'E.g. please proceed with the submission to the authority…',
                })}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={withPassword}
                  onChange={(e) => setWithPassword(e.target.checked)}
                />
                <Lock className="size-3.5" />{' '}
                {t({ fr: 'Protéger le lien par mot de passe', en: 'Password-protect the link' })}
              </label>
              {withPassword && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      aria-label={t({ fr: 'Mot de passe du lien', en: 'Link password' })}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t({ fr: '8 caractères minimum', en: '8 characters minimum' })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setPassword(suggestSharePassword())}
                    >
                      {t({ fr: 'Proposer', en: 'Suggest' })}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t({
                      fr: 'À transmettre par un canal séparé (téléphone, WhatsApp…). Il n’est jamais stocké en clair et n’apparaîtra plus.',
                      en: 'Share it through a separate channel (phone, WhatsApp…). It is never stored in clear text and will not be shown again.',
                    })}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="share-ttl">
                  {t({ fr: 'Validité du lien', en: 'Link validity' })}
                </Label>
                <select
                  id="share-ttl"
                  className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  value={ttlDays}
                  onChange={(e) => setTtlDays(e.target.value)}
                >
                  <option value="7">{t({ fr: '7 jours', en: '7 days' })}</option>
                  <option value="30">{t({ fr: '30 jours', en: '30 days' })}</option>
                  <option value="90">{t({ fr: '90 jours', en: '90 days' })}</option>
                  <option value="0">{t({ fr: 'Sans expiration', en: 'No expiry' })}</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={autoRevoke}
                  onChange={(e) => setAutoRevoke(e.target.checked)}
                />
                {t({
                  fr: 'Révoquer le lien après la décision',
                  en: 'Revoke the link after the decision',
                })}
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>
                {t({ fr: 'Annuler', en: 'Cancel' })}
              </Button>
              <Button size="sm" onClick={() => void handleSend()} disabled={sending}>
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {sending ? t({ fr: 'Envoi…', en: 'Sending…' }) : t({ fr: 'Envoyer', en: 'Send' })}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <p className="text-sm">
              {t({
                fr: 'Dossier envoyé. Ce lien de review permet à',
                en: 'Dossier sent. This review link lets',
              })}{' '}
              <span className="font-medium">{recipientEmail.trim()}</span>{' '}
              {t({
                fr: 'de prévisualiser, télécharger et rendre une décision, sans compte Pharnos.',
                en: 'preview, download and return a decision, with no Pharnos account.',
              })}
            </p>
            <p
              className={cn(
                'text-xs',
                emailState === 'failed'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
              role="status"
            >
              {emailState === 'sending'
                ? t({
                    fr: 'Notification e-mail en cours d’envoi…',
                    en: 'Sending e-mail notification…',
                  })
                : emailState === 'sent'
                  ? t({
                      fr: 'E-mail de notification envoyé au correspondant.',
                      en: 'Notification e-mail sent to the correspondent.',
                    })
                  : t({
                      fr: 'E-mail non envoyé — transmettez le lien ci-dessous vous-même.',
                      en: 'E-mail not sent — share the link below yourself.',
                    })}
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={sentUrl}
                aria-label={t({ fr: 'Lien de review', en: 'Review link' })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t({ fr: 'Copié', en: 'Copied' }) : t({ fr: 'Copier', en: 'Copy' })}
              </Button>
            </div>
            {withPassword && (
              <p className="text-muted-foreground text-xs">
                <Lock className="mr-1 inline size-3" />{' '}
                {t({
                  fr: 'Lien protégé : communiquez le mot de passe par un canal séparé — il ne sera plus affiché.',
                  en: 'Protected link: share the password through a separate channel — it will not be shown again.',
                })}
              </p>
            )}
            <div className="flex justify-end border-t pt-3">
              <Button size="sm" onClick={onClose}>
                {t({ fr: 'Fermer', en: 'Close' })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
