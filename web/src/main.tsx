import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Polices de marque AUTO-HÉBERGÉES (offline-first) : les woff2 sont émis dans dist/assets → précachés
// par le service worker (vite.config globPatterns inclut `woff2`). Importées AVANT index.css, qui les
// référence via les tokens --font-sans / --font-display. Aucune dépendance réseau (≠ Google Fonts CDN).
// DM Sans = variante `standard` (axes opsz + wght) = MÊME import que le mockup (`opsz,wght`) → le
// navigateur applique l'optical-sizing auto aux petites tailles (rendu identique au mockup).
import '@fontsource-variable/dm-sans/standard.css'
import '@fontsource-variable/syne'
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
