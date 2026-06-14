import { useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { toast } from 'sonner'

import { db } from '@/lib/db'
import { readLang } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'
import { DECISION_LABELS, decisionLabel } from './correspondence-constants'
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
      // postgres_changes + RLS : le serveur ne pousse les lignes QUE si le socket porte le JWT
      // de session (sinon SUBSCRIBED « propre »… et zéro évènement). On le positionne
      // explicitement — la resynchronisation au refresh du token est gérée par supabase-js.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)
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
              // Langue lue à l'arrivée de l'évènement (websocket hors React) — défaut FR.
              const lang = readLang()
              const product = corr ? ` — ${corr.productName}` : ''
              const decision =
                row.kind === 'decision' && row.decision && row.decision in DECISION_LABELS
                  ? decisionLabel(row.decision as keyof typeof DECISION_LABELS, lang)
                  : null
              const newMessage =
                lang === 'en'
                  ? `New message from the correspondent${product}`
                  : `Nouveau message du correspondant${product}`
              toast.info(decision ? `${decision}${product}` : newMessage, {
                description: row.body ? row.body.slice(0, 140) : undefined,
              })
            })
          },
        )
        .subscribe((status, err) => {
          // Rattrapage à l'établissement du canal : ce qui est arrivé pendant l'absence.
          if (status === 'SUBSCRIBED') void syncCorrespondences(orgId)
          // Observabilité : un canal en échec est silencieux par défaut — le pull couvre la
          // fonction, mais on veut VOIR la dégradation (console + Sentry via console hook).
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[realtime] correspondance :', status, err?.message ?? '')
          }
        })
    })()

    return () => {
      disposed = true
      if (channel) void channel.unsubscribe()
    }
  }, [orgId])
}
