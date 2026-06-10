import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from '@/App'
import { initSentry } from '@/lib/sentry'

// Observabilité : no-op si VITE_SENTRY_DSN absent ; sinon charge Sentry en chunk séparé.
void initSentry()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Élément racine #root introuvable')
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA — application fiable des mises à jour. `vite-plugin-pwa` (autoUpdate + skipWaiting) installe
// la nouvelle version mais ne recharge PAS la page : l'onglet ouvert continue de servir l'ancien
// bundle jusqu'à un vidage manuel du cache. On force un rechargement unique dès que le nouveau
// service worker prend le contrôle → le déploiement le plus récent est toujours servi.
// Garde : on n'attache l'écouteur que si la page est DÉJÀ contrôlée (visite de retour) — évite le
// rechargement parasite au tout premier passage quand le 1er SW prend la main (clientsClaim).
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}
