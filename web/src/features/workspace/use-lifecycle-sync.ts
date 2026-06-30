import { useEffect } from 'react'

import { syncLifecycle } from './lifecycle-sync'

/** Synchronise le journal du cycle de vie au montage et à chaque reconnexion réseau. */
export function useLifecycleSync(orgId: string): void {
  useEffect(() => {
    void syncLifecycle(orgId)
    const onOnline = () => void syncLifecycle(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
