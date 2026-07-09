import { deriveLifecycle, type LifecycleState } from '@/features/workspace/lifecycle-constants'
import { listLifecycleEvents } from '@/features/workspace/lifecycle-repository'
import { db, type CorrespondenceMessageRecord, type CorrespondenceRecord } from '@/lib/db'

import { countUnread } from './correspondence-reads'
import { listCorrespondences } from './correspondence-repository'
import { isInboxDossier } from './correspondence-unread'

/**
 * « Action requise » : le dossier attend l'UTILISATEUR — complément demandé (répondre dans le
 * fil) ou rejet (corriger puis renvoyer). Même règle que le bandeau du `ConversationPane` ;
 * les états qui attendent l'agence/l'agent (revue, instruction…) ne comptent pas.
 */
export const isActionNeeded = (lifecycle: Pick<LifecycleState, 'status'>): boolean =>
  lifecycle.status === 'suspended' || lifecycle.status === 'rejected'

export interface InboxRow {
  dossierId: string
  productName: string
  country: string
  activity: string
  /** État DÉRIVÉ (`deriveLifecycle`, même source que la Roadmap) → alimente la mini-roadmap. */
  lifecycle: LifecycleState
  /** Dernière activité (message le plus récent, sinon dernier envoi) — tri + horodatage de ligne. */
  lastActivityAt: string
  lastMessage: Pick<CorrespondenceMessageRecord, 'kind' | 'decision' | 'body'> | null
  unread: number
  /** Nombre d'envois (destinataires/cycles) du dossier. */
  sends: number
  /** La dernière activité est un ENVOI (≥ dernier message) → l'aperçu affiche « Dossier envoyé ». */
  lastActivityIsSend: boolean
}

/**
 * Lignes de l'inbox Correspondance (surface GLOBALE, tous dossiers) : une par DOSSIER ayant au
 * moins un envoi, avec l'état DÉRIVÉ (`deriveLifecycle` — même source que la Roadmap) pour la
 * mini-roadmap « où en est chaque dossier ». Lecture 100 % locale (Dexie) → déjà bornée au
 * périmètre RLS synchronisé : un membre scopé CS1 n'a QUE ses dossiers en base, donc l'inbox est
 * intrinsèquement scopée (aucune donnée hors-périmètre à filtrer ici). Volumes pilotes faibles :
 * agrégation en mémoire (une requête par table + une par dossier pour le journal indexé).
 */
export async function listInboxRows(orgId: string): Promise<InboxRow[]> {
  const correspondences = await listCorrespondences(orgId) // non supprimées, triées desc
  if (correspondences.length === 0) return []

  const byDossier = new Map<string, CorrespondenceRecord[]>()
  for (const c of correspondences) {
    const arr = byDossier.get(c.dossierId)
    if (arr) arr.push(c)
    else byDossier.set(c.dossierId, [c])
  }
  const dossierIds = [...byDossier.keys()]

  const [dossiers, eventsPerDossier, messages, reads] = await Promise.all([
    db.dossiers.bulkGet(dossierIds),
    // Journal via l'index composite `[dossierId+occurredAt]` (une requête bornée par dossier) —
    // évite de supposer un index `dossierId` seul, et reste petit aux volumes pilotes.
    Promise.all(dossierIds.map((id) => listLifecycleEvents(id))),
    db.correspondenceMessages
      .where('correspondenceId')
      .anyOf(correspondences.map((c) => c.id))
      .toArray(),
    db.correspondenceReads.toArray(),
  ])

  const dossierById = new Map(dossiers.flatMap((d, i) => (d ? [[dossierIds[i]!, d] as const] : [])))
  const eventsByDossier = new Map(dossierIds.map((id, i) => [id, eventsPerDossier[i] ?? []]))
  const messagesByCorr = new Map<string, CorrespondenceMessageRecord[]>()
  for (const m of messages) {
    const arr = messagesByCorr.get(m.correspondenceId)
    if (arr) arr.push(m)
    else messagesByCorr.set(m.correspondenceId, [m])
  }
  const lastSeen = new Map(reads.map((r) => [r.id, r.lastSeenAt]))

  const rows: InboxRow[] = []
  for (const [dossierId, corrs] of byDossier) {
    const dossier = dossierById.get(dossierId)
    // Dossier jamais synchronisé, en corbeille ou purgé (tombstone) → pas de ligne d'inbox. Les
    // dossiers ARCHIVÉS (soumis/enregistrés) restent VOLONTAIREMENT visibles : une inbox est une
    // « boîte mail » — le fil d'un dossier enregistré reste consultable (rail « Enregistré · 7/7 »).
    if (!isInboxDossier(dossier)) continue

    const dossierMessages = corrs.flatMap((c) => messagesByCorr.get(c.id) ?? [])
    // La mini-roadmap n'affiche que les étapes/statut/avancement — INDÉPENDANTS des messages (ceux-ci
    // ne servent qu'au journal, non rendu ici) → on ne passe pas `messages`, ce qui évite un
    // buildJournal « décisions » par ligne sur cette requête chaude (perf, à volume qui grandit).
    const lifecycle = deriveLifecycle({
      dossierId,
      dossierCreatedAt: dossier.createdAt,
      events: eventsByDossier.get(dossierId) ?? [],
      correspondences: corrs,
    })

    let lastMessage: CorrespondenceMessageRecord | null = null
    for (const m of dossierMessages) {
      if (!lastMessage || m.createdAt > lastMessage.createdAt) lastMessage = m
    }
    // `corrs` héritent de l'ordre desc de `listCorrespondences` → corrs[0] = envoi le plus récent.
    const mostRecentSend = corrs[0]!
    // Dernière activité = ENVOI si aucun message, ou si le dernier envoi postdate le dernier message
    // (renvoi d'une nouvelle version) → l'aperçu dira « Dossier envoyé » plutôt qu'un vieux message.
    // Le if/else (plutôt qu'un ternaire) narrow `lastMessage` en non-null dans la branche « message ».
    let lastActivityAt: string
    let lastActivityIsSend: boolean
    if (!lastMessage || mostRecentSend.createdAt >= lastMessage.createdAt) {
      lastActivityIsSend = true
      lastActivityAt = mostRecentSend.createdAt
    } else {
      lastActivityIsSend = false
      lastActivityAt = lastMessage.createdAt
    }
    const unread = corrs.reduce(
      (n, c) => n + countUnread(messagesByCorr.get(c.id) ?? [], lastSeen.get(c.id)),
      0,
    )

    rows.push({
      dossierId,
      productName: dossier.productName,
      country: dossier.country,
      activity: dossier.activity,
      lifecycle,
      lastActivityAt,
      lastMessage: lastMessage
        ? { kind: lastMessage.kind, decision: lastMessage.decision, body: lastMessage.body }
        : null,
      unread,
      sends: corrs.length,
      lastActivityIsSend,
    })
  }

  // Non-lus d'abord, puis activité la plus récente.
  rows.sort(
    (a, b) =>
      (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) ||
      b.lastActivityAt.localeCompare(a.lastActivityAt),
  )
  return rows
}
