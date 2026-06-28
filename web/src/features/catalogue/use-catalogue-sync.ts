import { useEffect } from 'react'

import { syncDocuments } from './documents-sync'
import { syncParties } from './parties-sync'
import { syncProducts } from './sync'

/**
 * Synchronise organisations + produits + documents au montage et à chaque reconnexion réseau.
 * Ordre SÉQUENTIEL imposé par les clés étrangères : `parties` (référencée par products.titulaire_id /
 * fabricant_id) → `products` (référencée par documents.product_id) → `documents`. Pousser un enfant
 * avant son parent déclencherait une violation de FK (drainée comme erreur permanente).
 */
export function useCatalogueSync(orgId: string): void {
  useEffect(() => {
    const run = async () => {
      await syncParties(orgId)
      await syncProducts(orgId)
      await syncDocuments(orgId)
    }
    void run()
    const onOnline = () => void run()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
