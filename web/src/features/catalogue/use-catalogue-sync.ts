import { useEffect } from 'react'

import { reportError } from '@/lib/sentry'
import { syncDocuments } from './documents-sync'
import { syncParties } from './parties-sync'
import { backfillProductParties } from './parties-repository'
import { syncProducts } from './sync'

/**
 * Synchronise organisations + produits + documents au montage et à chaque reconnexion réseau.
 * Ordre SÉQUENTIEL imposé par les clés étrangères : `parties` (référencée par products.titulaire_id /
 * fabricant_id) → `products` (référencée par documents.product_id) → `documents`. Pousser un enfant
 * avant son parent déclencherait une violation de FK (drainée comme erreur permanente).
 *
 * Au montage, un backfill idempotent (local-first) lie d'abord les produits existants à leurs
 * organisations — après le 1er passage il est no-op, donc relancé sans coût.
 */
export function useCatalogueSync(orgId: string): void {
  useEffect(() => {
    const run = async () => {
      await syncParties(orgId)
      await syncProducts(orgId)
      await syncDocuments(orgId)
    }
    const start = async () => {
      try {
        await backfillProductParties(orgId)
      } catch (error) {
        // Non bloquant : la sync suit quoi qu'il arrive (les liens se feront aussi à l'édition).
        reportError(error, { op: 'backfill', entity: 'parties' })
      }
      await run()
    }
    void start()
    const onOnline = () => void run()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
