import { useEffect } from 'react'

import { syncGeneratedDocs } from './generated-docs-sync'

/** Synchronise les documents générés au montage et à chaque reconnexion réseau. */
export function useGeneratedDocsSync(orgId: string): void {
  useEffect(() => {
    void syncGeneratedDocs(orgId)
    const onOnline = () => void syncGeneratedDocs(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
