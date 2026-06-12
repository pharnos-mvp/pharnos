import { useEffect } from 'react'

import { syncCorrespondences } from './correspondence-sync'

/** Synchronise correspondances + messages au montage et à chaque reconnexion réseau. */
export function useCorrespondenceSync(orgId: string): void {
  useEffect(() => {
    void syncCorrespondences(orgId)
    const onOnline = () => void syncCorrespondences(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
