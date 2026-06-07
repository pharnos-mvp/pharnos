import { useEffect } from 'react'

import { syncProSettings } from './pro-settings-sync'

/** Synchronise le profil pro au montage et à chaque reconnexion réseau. */
export function useProSettingsSync(orgId: string): void {
  useEffect(() => {
    void syncProSettings(orgId)
    const onOnline = () => void syncProSettings(orgId)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [orgId])
}
