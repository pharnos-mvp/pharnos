import { useEffect } from 'react'

import { syncDossiers } from './dossier-sync'

/** Synchronise les dossiers au montage et à chaque reconnexion réseau. */
export function useDossierSync(orgId: string): void {
  useEffect(() => {
    void syncDossiers(orgId)
    const onOnline = () => void syncDossiers(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
