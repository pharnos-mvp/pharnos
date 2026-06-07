import { useEffect } from 'react'

import { syncAudit } from './audit-sync'

/** Synchronise le journal d'audit au montage et à chaque reconnexion réseau. */
export function useAuditSync(orgId: string): void {
  useEffect(() => {
    void syncAudit(orgId)
    const onOnline = () => void syncAudit(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
