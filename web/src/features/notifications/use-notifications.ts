import { useLiveQuery } from 'dexie-react-hooks'

import {
  buildActions,
  type ActionItem,
  type DashboardInput,
} from '@/features/dashboard/dashboard-data'
import { db } from '@/lib/db'
import {
  buildEnvoye,
  NOTIF_READ_ID,
  sortRecuByRecency,
  unreadCount,
  type NotifEnvoye,
} from './notifications-data'

export interface NotificationsVm {
  /** À traiter (entrant actionnable) — pilote le badge. */
  recu: ActionItem[]
  /** Envoyé (relances + jalons sortants) — traçabilité, non badgé. */
  envoye: NotifEnvoye[]
  /** Nombre d'items Reçu non acquittés (badge). */
  unread: number
}

/**
 * Vue du centre de notifications de l'org active — recalcul LIVE offline-first (Dexie), zéro fetch.
 * Reçu dérivé de `buildActions` (source unique des « actions requises ») ; Envoyé du journal de la
 * spine. `undefined` pendant le chargement Dexie initial.
 */
export function useNotifications(orgId: string): NotificationsVm | undefined {
  return useLiveQuery(async () => {
    const [
      products,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      lifecycleEvents,
      notifRead,
      parties,
    ] = await Promise.all([
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.correspondences.where('orgId').equals(orgId).toArray(),
      db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
      db.correspondenceReads.toArray(),
      db.docAnalysis.toArray(),
      db.lifecycleEvents.where('orgId').equals(orgId).toArray(),
      db.notificationReads.get(NOTIF_READ_ID),
      // Nomme/route les alertes des documents ORG-scopés (pièces propres d'un MAH/fabricant, 0069).
      db.parties.where('orgId').equals(orgId).toArray(),
    ])
    const now = new Date()
    const input: DashboardInput = {
      products,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      parties,
    }
    // Cloche : ordre chronologique (plus récent d'abord), ≠ ordre par urgence du panneau Dashboard.
    const recu = sortRecuByRecency(buildActions(input, now))
    const dossierName = new Map(dossiers.map((d) => [d.id, d.productName]))
    const envoye = buildEnvoye(lifecycleEvents, dossierName)
    return { recu, envoye, unread: unreadCount(recu, notifRead?.seenIds ?? []) }
  }, [orgId])
}

/** Acquitte les items Reçu courants (badge → 0) — marqueur LOCAL par appareil. */
export async function markNotificationsRead(recu: ActionItem[]): Promise<void> {
  await db.notificationReads.put({
    id: NOTIF_READ_ID,
    lastSeenAt: new Date().toISOString(),
    seenIds: recu.map((i) => i.id),
  })
}
