import { deriveLifecycle, type LifecycleState } from '@/features/workspace/lifecycle-constants'
import type {
  CorrespondenceMessageRecord,
  CorrespondenceRecord,
  LifecycleEventRecord,
  LifecycleEventType,
} from '@/lib/db'

import type { LifecycleBlock } from './review-api'

/**
 * Vue Agent local (M7, LOT 10b) — mapping PUR du bloc `lifecycle` renvoyé par l'Edge `share`
 * vers les entrées de `deriveLifecycle` : la page tokenisée dérive la timeline avec LE MÊME
 * code que la Roadmap du labo (un seul dérivateur, zéro divergence possible).
 *
 * Les DTO serveur sont minimaux (l'Edge strippe les chemins Storage et les champs inutiles) :
 * on reconstruit des enregistrements typés avec des PLACEHOLDERS explicites pour les champs
 * que la dérivation n'utilise pas — jamais de cast aveugle.
 */

export function eventsFromBlock(block: LifecycleBlock): LifecycleEventRecord[] {
  return block.events.map((e) => ({
    id: e.id,
    orgId: '', // hors périmètre page publique (dérivation : jamais lu)
    dossierId: block.dossier.id,
    type: e.type as LifecycleEventType,
    actorId: e.actorId,
    actorEmail: '',
    occurredAt: e.occurredAt,
    payload: e.payload ?? {},
    // Chemins strippés par l'Edge : nom/taille/type suffisent à l'affichage (jamais d'URL).
    docRefs: (e.docRefs ?? []).map((d) => ({ path: '', name: d.name, size: d.size, mime: d.mime })),
    createdAt: e.createdAt,
  }))
}

function correspondencesFromBlock(block: LifecycleBlock): CorrespondenceRecord[] {
  return block.correspondences.map((c) => ({
    id: c.id,
    orgId: '',
    dossierId: block.dossier.id,
    productName: '',
    country: '',
    activity: '',
    senderEmail: '',
    recipientEmail: '',
    note: null,
    pdfPath: '',
    pdfSize: 0,
    tokenHash: '',
    passwordHash: null,
    status: c.status as CorrespondenceRecord['status'],
    decidedAt: c.decidedAt,
    revokedAt: c.revokedAt,
    expiresAt: null,
    autoRevokeOnDecision: false,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: null, // l'Edge ne renvoie que les correspondances vivantes
  }))
}

function decisionMessagesFromBlock(block: LifecycleBlock): CorrespondenceMessageRecord[] {
  return block.decisionMessages.map((m) => ({
    id: m.id,
    orgId: '',
    correspondenceId: m.correspondenceId,
    author: m.author === 'sender' ? 'sender' : 'recipient',
    authorLabel: '',
    kind: 'decision',
    decision: (m.decision ?? null) as CorrespondenceMessageRecord['decision'],
    body: '',
    attachments: [],
    createdAt: m.createdAt,
  }))
}

/** État complet du cycle de vie côté agent — strictement le même dérivateur que le labo. */
export function lifecycleStateFromBlock(block: LifecycleBlock): LifecycleState {
  return deriveLifecycle({
    dossierId: block.dossier.id,
    dossierCreatedAt: block.dossier.createdAt,
    events: eventsFromBlock(block),
    correspondences: correspondencesFromBlock(block),
    messages: decisionMessagesFromBlock(block),
  })
}
