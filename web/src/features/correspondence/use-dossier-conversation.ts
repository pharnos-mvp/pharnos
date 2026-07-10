import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'

import { useCurrentOrg } from '@/features/org/use-current-org'
import { canManageSubmission } from '@/features/team/team-api'
import { downloadAttachmentBlob } from '@/features/workspace/dossier-attachments-sync'
import { getDossier } from '@/features/workspace/dossier-repository'
import { deriveLifecycle, type LifecycleState } from '@/features/workspace/lifecycle-constants'
import { listLifecycleEvents } from '@/features/workspace/lifecycle-repository'
import {
  db,
  type CorrespondenceDecision,
  type CorrespondenceMessageRecord,
  type CorrespondenceRecord,
} from '@/lib/db'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { reportError } from '@/lib/sentry'

import {
  uploadSenderAttachments,
  validateAttachmentFiles,
  type MessageAttachment,
} from './correspondence-attachments'
import { printThreadExport } from './correspondence-export'
import { countUnread, markConversationRead } from './correspondence-reads'
import {
  appendSenderMessage,
  decideCorrespondenceInApp,
  getShareLink,
  listByDossier,
  revokeCorrespondence,
} from './correspondence-repository'
import { syncCorrespondences } from './correspondence-sync'
import type { ThreadAttachment, ThreadMessage } from './MessageThread'
import { notifyRecipient } from './share-send'

export type UseDossierConversation = ReturnType<typeof useDossierConversation>

/**
 * État + actions de la correspondance d'UN dossier — extraction 1:1 du `CorrespondencePanel`
 * (UX validée CEO, en prod) pour partager la conversation entre le panneau overlay et la
 * Boîte de réception (mockup C) SANS dupliquer la logique. Offline-first : Dexie est l'unique
 * source de l'UI ; les écritures (réponse, décision, révocation) poussent via la sync.
 */
export function useDossierConversation(orgId: string, dossierId: string, senderEmail: string) {
  const { t, lang } = useI18n()
  // Gestion des soumissions (répondre au correspondant) réservée à Admin + agence/expert (RLS 0028).
  // On gate par l'org EXACTE de la surface ; la RLS reste la vraie barrière (évite un 42501 visible).
  const { memberships } = useCurrentOrg()
  const canSubmit = canManageSubmission(memberships.find((m) => m.orgId === orgId)?.role)
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

  // Rail Parcours (sous l'en-tête de chaque conversation) : dérivé de `deriveLifecycle` — même
  // source que la Roadmap. Le dossier + son journal complètent les correspondances/messages déjà
  // chargés (tout offline-first Dexie ; volumes pilotes faibles).
  const dossier = useLiveQuery(() => getDossier(dossierId), [dossierId])
  const lifecycleEvents = useLiveQuery(() => listLifecycleEvents(dossierId), [dossierId])
  const lifecycle: LifecycleState | null = useMemo(
    () =>
      dossier
        ? deriveLifecycle({
            dossierId,
            dossierCreatedAt: dossier.createdAt,
            events: lifecycleEvents ?? [],
            correspondences: correspondences ?? [],
            messages: allMessages ?? [],
          })
        : null,
    [dossier, dossierId, lifecycleEvents, correspondences, allMessages],
  )

  const byConversation = useMemo(() => {
    const map = new Map<string, CorrespondenceMessageRecord[]>()
    for (const m of allMessages ?? []) {
      const list = map.get(m.correspondenceId)
      if (list) list.push(m)
      else map.set(m.correspondenceId, [m])
    }
    return map
  }, [allMessages])
  const lastSeen = useMemo(() => new Map((reads ?? []).map((r) => [r.id, r.lastSeenAt])), [reads])

  const messages = useMemo(
    () => (selected ? (byConversation.get(selected.id) ?? []) : []),
    [selected, byConversation],
  )
  const shareLink = useLiveQuery(
    () => (selected ? getShareLink(selected.id) : Promise.resolve(undefined)),
    [selected?.id],
  )

  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  // Décision in-app (M4-T3) : choix + note du gestionnaire, modale de confirmation.
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [decisionChoice, setDecisionChoice] = useState<CorrespondenceDecision | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)
  // Pièces jointes EN ATTENTE du composeur (trombone, mockup C) — téléversées à l'ENVOI
  // seulement (uploadSenderAttachments, online par nature) ; purgées au changement de fil.
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // Conversation affichée = lue (marqueur local). Re-marquée à chaque nouveau message reçu.
  const lastMessageAt = messages.at(-1)?.createdAt
  useEffect(() => {
    if (selected) void markConversationRead(selected.id)
  }, [selected?.id, lastMessageAt, selected])

  // Changer de conversation abandonne la sélection de pièces (jamais de PJ envoyées au
  // mauvais fil) — le brouillon TEXTE, lui, suit le comportement historique du panneau.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- purge pilotée par la sélection
    setPendingFiles([])
  }, [selected?.id])

  function addPendingFiles(files: File[]) {
    if (files.length === 0) return
    const verdict = validateAttachmentFiles(files, pendingFiles.length)
    if (!verdict.ok) {
      toast.error(verdict.error)
      return
    }
    setPendingFiles((prev) => [...prev, ...files])
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

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
    // Garde anti double-envoi : Entrée dans le textarea contourne le bouton désactivé — sans
    // elle, un 2ᵉ Entrée pendant l'upload dupliquerait pièces ET message (revue CTO).
    if (sending) return
    if (!selected || (!reply.trim() && pendingFiles.length === 0)) return
    setSending(true)
    try {
      // Les pièces d'abord (online par nature — un échec N'ENVOIE PAS le message : rien de
      // partiel dans le fil, les fichiers restent en attente pour réessayer).
      let attachments: MessageAttachment[] = []
      if (pendingFiles.length > 0) {
        try {
          attachments = await uploadSenderAttachments(orgId, selected.id, pendingFiles)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error))
          return
        }
      }
      try {
        await appendSenderMessage(selected, senderEmail, reply, attachments)
      } catch (error) {
        // Écriture locale échouée APRÈS l'upload : les fichiers restent en attente (un nouvel
        // essai re-téléverse — orphelins Storage possibles, même compromis que l'Edge).
        reportError(error, { op: 'appendSenderMessage' })
        toast.error(t({ fr: 'Échec de l’envoi du message.', en: 'Failed to send the message.' }))
        return
      }
      setReply('')
      setPendingFiles([])
      if (navigator.onLine) {
        const link = shareLink
        void syncCorrespondences(orgId).then(() => {
          // Le reviewer est prévenu par e-mail (best-effort) — même lien, fil complet retrouvé.
          // Pas de garde revoked côté client : l'Edge `notify` re-vérifie révocation/expiration
          // (état FRAIS) et répond 410 — c'est lui qui fait autorité.
          if (link) void notifyRecipient(selected.id, link.url)
        })
      } else {
        toast.info(
          t({
            fr: 'Hors-ligne : la réponse partira à la reconnexion.',
            en: 'Offline: your reply will be sent when you reconnect.',
          }),
        )
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
      toast.error(
        t({
          fr: 'Copie impossible — sélectionnez le lien manuellement.',
          en: 'Copy failed — select the link manually.',
        }),
      )
    }
  }

  async function handleRevoke() {
    if (!selected) return
    await revokeCorrespondence(selected.id)
    void syncCorrespondences(orgId)
    toast.success(
      t({
        fr: 'Lien révoqué — le correspondant n’y a plus accès.',
        en: 'Link revoked — the correspondent no longer has access.',
      }),
    )
  }

  // Décision in-app (gestionnaire) : miroir offline-first du chemin tokenisé — le fil reçoit la
  // pastille décision, le statut dérivé du dossier suit, la sync pousse à la reconnexion.
  async function handleDecide() {
    if (!selected || !decisionChoice || deciding) return
    setDeciding(true)
    try {
      await decideCorrespondenceInApp(selected.id, senderEmail, decisionChoice, decisionNote)
      void syncCorrespondences(orgId)
      toast.success(t({ fr: 'Décision enregistrée.', en: 'Decision recorded.' }))
      setDecisionOpen(false)
      setDecisionChoice(null)
      setDecisionNote('')
    } catch (error) {
      reportError(error, { op: 'decideCorrespondenceInApp' })
      toast.error(
        t({
          fr: 'Échec de l’enregistrement de la décision.',
          en: 'Failed to record the decision.',
        }),
      )
    } finally {
      setDeciding(false)
    }
  }

  /** Ouvre la modale décision (état remis à zéro) — bouton aside du panneau + menu du pane. */
  function openDecision() {
    setDecisionChoice(null)
    setDecisionNote('')
    setDecisionOpen(true)
  }

  // Export d'audit du fil (v3) : iframe srcdoc cachée + print() (CSP-safe, aucun pop-up à
  // autoriser — revue LOT 10), données déjà en mémoire (Dexie). Lecture seule → tout membre.
  function handleExport() {
    if (!selected) return
    printThreadExport({ correspondence: selected, messages, lang, exportedBy: senderEmail })
  }

  async function handleDownloadAttachment(a: ThreadAttachment) {
    if (!a.path) return
    const blob = await downloadAttachmentBlob(a.path)
    if (!blob) {
      toast.error(
        t({ fr: 'Pièce indisponible (hors-ligne ?).', en: 'Attachment unavailable (offline?).' }),
      )
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
  // Délai d'attente de la conversation (v3) : jours depuis la DERNIÈRE activité du fil quand la
  // revue est en cours — même sémantique que le badge M5 de la Roadmap (ton warning ≥ 7 j) : le
  // compteur repart sur TOUTE dernière activité, y compris un message du labo (une relance/nudge
  // réinitialise l'attente — décision produit M5, « Relancé il y a N j »). Horloge lue au rendu
  // comme la Roadmap (`deriveStageWaiting(…, new Date())`) — la précision « jour » se recale à
  // chaque re-rendu, aucun tic en direct nécessaire.
  const waitingDays =
    selected && selected.status === 'in_review' && selected.revokedAt === null
      ? Math.max(
          0,
          Math.floor(
            (new Date().getTime() - Date.parse(messages.at(-1)?.createdAt ?? selected.createdAt)) /
              86_400_000,
          ),
        )
      : null
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
  /** Nombre d'envois (cycles) d'un destinataire — libellé « N envois » de la liste. */
  const cyclesOf = (email: string) => recipientGroups.get(email)?.length ?? 1
  const unreadConversations = recipients.filter((c) => groupUnread(c.recipientEmail) > 0).length
  // Cycles du destinataire sélectionné (≥ 2 → sélecteur de cycle dans la conversation).
  const selectedGroup = selected ? (recipientGroups.get(selected.recipientEmail) ?? [selected]) : []

  return {
    lang: lang as Lang,
    canSubmit,
    conversations,
    dossier,
    productName,
    selected,
    setSelectedId,
    messages,
    byConversation,
    threadMessages,
    lifecycle,
    waitingDays,
    shareLink,
    recipients,
    selectedGroup,
    groupUnread,
    cyclesOf,
    unreadConversations,
    reply,
    setReply,
    sending,
    handleReply,
    pendingFiles,
    addPendingFiles,
    removePendingFile,
    copied,
    handleCopy,
    handleRevoke,
    handleExport,
    handleDownloadAttachment,
    showAccess,
    setShowAccess,
    decisionOpen,
    setDecisionOpen,
    decisionChoice,
    setDecisionChoice,
    decisionNote,
    setDecisionNote,
    deciding,
    handleDecide,
    openDecision,
  }
}
