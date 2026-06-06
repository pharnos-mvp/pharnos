import { useEffect } from 'react'

import { syncDocuments } from './documents-sync'
import { syncProducts } from './sync'

/** Synchronise produits + documents au montage et à chaque reconnexion réseau. */
export function useCatalogueSync(orgId: string): void {
  useEffect(() => {
    const run = () => {
      void syncProducts(orgId)
      void syncDocuments(orgId)
    }
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [orgId])
}
