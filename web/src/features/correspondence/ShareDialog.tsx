import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, Loader2, Lock, RefreshCw, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CorrespondenceRecord, DossierRecord } from '@/lib/db'
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
      toast.error('Adresse e-mail du correspondant invalide.')
      return
    }
    if (withPassword && password.trim().length < 8) {
      toast.error('Mot de passe trop court (8 caractères minimum).')
      return
    }
    if (!navigator.onLine) {
      toast.error('Hors-ligne : l’envoi nécessite une connexion (téléversement du PDF).')
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
      toast.error((e as Error)?.message ?? 'Échec de l’envoi du dossier.')
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
      toast.error('Copie impossible — sélectionnez le lien manuellement.')
    }
  }

  /** Mise à jour d'un envoi existant : même lien/fil, nouveau PDF, correspondant prévenu. */
  async function handleUpdate(corr: CorrespondenceRecord) {
    if (!navigator.onLine) {
      toast.error('Hors-ligne : l’envoi nécessite une connexion (téléversement du PDF).')
      return
    }
    setSending(true)
    try {
      await resendCompiledDossier({ orgId, correspondence: corr, pdfBlob, senderEmail })
      setUpdatedFor(corr)
      onSent?.(corr)
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Échec de la mise à jour du dossier.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Envoyer le dossier au correspondant"
    >
      <div className="bg-card w-full max-w-lg rounded-lg border shadow-lg">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Send className="size-4" /> Envoyer le dossier — {dossier.productName}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {updatedFor ? (
          <div className="space-y-4 p-4">
            <p className="text-sm">
              Dossier mis à jour. <span className="font-medium">{updatedFor.recipientEmail}</span>{' '}
              garde le même lien et tout l’historique des échanges — la nouvelle version du document
              s’affichera à sa prochaine ouverture. Un e-mail de notification lui a été envoyé (si
              la messagerie est joignable).
            </p>
            <div className="flex justify-end border-t pt-3">
              <Button size="sm" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : sentUrl === null ? (
          <div className="space-y-4 p-4">
            {activeSends.length > 0 ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Ce dossier a déjà été envoyé.</p>
                <p className="text-muted-foreground text-xs">
                  Mettre à jour remplace le document — le correspondant garde le même lien et tout
                  le fil d’échanges.
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
                        Mettre à jour l’envoi à {corr.recipientEmail}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">Ou créez un nouvel envoi :</p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="share-email">E-mail du correspondant (agence locale)</Label>
              <Input
                id="share-email"
                type="email"
                autoFocus
                placeholder="agence@representant.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="share-note">Note d’accompagnement (optionnel)</Label>
              <textarea
                id="share-note"
                rows={3}
                className={textareaClass}
                placeholder="Ex. : merci de procéder au dépôt auprès de l’autorité…"
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
                <Lock className="size-3.5" /> Protéger le lien par mot de passe
              </label>
              {withPassword && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      aria-label="Mot de passe du lien"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8 caractères minimum"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setPassword(suggestSharePassword())}
                    >
                      Proposer
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    À transmettre par un canal séparé (téléphone, WhatsApp…). Il n’est jamais stocké
                    en clair et n’apparaîtra plus.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="share-ttl">Validité du lien</Label>
                <select
                  id="share-ttl"
                  className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  value={ttlDays}
                  onChange={(e) => setTtlDays(e.target.value)}
                >
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                  <option value="0">Sans expiration</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={autoRevoke}
                  onChange={(e) => setAutoRevoke(e.target.checked)}
                />
                Révoquer le lien après la décision
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>
                Annuler
              </Button>
              <Button size="sm" onClick={() => void handleSend()} disabled={sending}>
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {sending ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <p className="text-sm">
              Dossier envoyé. Ce lien de review permet à{' '}
              <span className="font-medium">{recipientEmail.trim()}</span> de prévisualiser,
              télécharger et rendre une décision, sans compte Pharnos.
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
                ? 'Notification e-mail en cours d’envoi…'
                : emailState === 'sent'
                  ? 'E-mail de notification envoyé au correspondant.'
                  : 'E-mail non envoyé — transmettez le lien ci-dessous vous-même.'}
            </p>
            <div className="flex gap-2">
              <Input readOnly value={sentUrl} aria-label="Lien de review" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copié' : 'Copier'}
              </Button>
            </div>
            {withPassword && (
              <p className="text-muted-foreground text-xs">
                <Lock className="mr-1 inline size-3" /> Lien protégé : communiquez le mot de passe
                par un canal séparé — il ne sera plus affiché.
              </p>
            )}
            <div className="flex justify-end border-t pt-3">
              <Button size="sm" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
