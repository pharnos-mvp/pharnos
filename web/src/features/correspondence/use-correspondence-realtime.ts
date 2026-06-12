import { useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { toast } from 'sonner'

import { db } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { DECISION_LABELS } from './correspondence-constants'
import {
  rowToMessage,
  syncCorrespondences,
  type CorrespondenceMessageRow,
} from './correspondence-sync'

/**
 * Temps réel du fil de correspondance (jalon H) — ACCÉLÉRATEUR UX uniquement : les INSERTs de
 * `correspondence_messages` (org courante, RLS) arrivent par websocket → écrits en Dexie
 * (useLiveQuery met l'UI à jour) + toast quand c'est le reviewer qui parle. La sync pull reste
 * la source de vérité (rattrapage au subscribe et à chaque reconnexion).
 */
export function useCorrespondenceRealtime(orgId: string): void {
  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let disposed = false

    void (async () => {
      const supabase = await getSupabase()
      if (!supabase || disposed) return
      channel = supabase
        .channel(`correspondence-messages-${orgId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'correspondence_messages',
            filter: `org_id=eq.${orgId}`,
          },
          (payload) => {
            const row = payload.new as CorrespondenceMessageRow
            void db.correspondenceMessages.put(rowToMessage(row))
            if (row.author !== 'recipient') return
            // Une décision change le statut de la correspondance → rapatrie l'entête à jour.
            if (row.kind === 'decision') void syncCorrespondences(orgId)
            void db.correspondences.get(row.correspondence_id).then((corr) => {
              const product = corr ? ` — ${corr.productName}` : ''
              const decision =
                row.kind === 'decision' && row.decision && row.decision in DECISION_LABELS
                  ? DECISION_LABELS[row.decision as keyof typeof DECISION_LABELS]
                  : null
              toast.info(
                decision ? `${decision}${product}` : `Nouveau message du correspondant${product}`,
                { description: row.body ? row.body.slice(0, 140) : undefined },
              )
            })
          },
        )
        .subscribe((status) => {
          // Rattrapage à l'établissement du canal : ce qui est arrivé pendant l'absence.
          if (status === 'SUBSCRIBED') void syncCorrespondences(orgId)
        })
    })()

    return () => {
      disposed = true
      if (channel) void channel.unsubscribe()
    }
  }, [orgId])
}
