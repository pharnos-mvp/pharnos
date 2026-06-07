import { useEffect } from 'react'

import { syncDossierAttachments } from './dossier-attachments-sync'

/** Synchronise les pièces jointes des dossiers au montage et à chaque reconnexion réseau. */
export function useDossierAttachmentsSync(orgId: string): void {
  useEffect(() => {
    void syncDossierAttachments(orgId)
    const onOnline = () => void syncDossierAttachments(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
