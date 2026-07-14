import { useEffect } from 'react'

import { reportError } from '@/lib/sentry'
import { syncCatalogue } from './catalogue-sync'
import { backfillProductParties } from './parties-repository'

/**
 * Synchronise organisations + produits + documents au montage et à chaque reconnexion réseau.
 * L'ordre imposé par les clés étrangères (parties → products → documents) est garanti par
 * `syncCatalogue`, qui sérialise aussi les cycles concurrents.
 *
 * Au montage, un backfill idempotent (local-first) lie d'abord les produits existants à leurs
 * organisations — après le 1er passage il est no-op, donc relancé sans coût.
 */
export function useCatalogueSync(orgId: string): void {
  useEffect(() => {
    const start = async () => {
      try {
        await backfillProductParties(orgId)
      } catch (error) {
        // Non bloquant : la sync suit quoi qu'il arrive (les liens se feront aussi à l'édition).
        reportError(error, { op: 'backfill', entity: 'parties' })
      }
      await syncCatalogue(orgId)
    }
    void start()
    const onOnline = () => void syncCatalogue(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
