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
import { setOverrideSyncHook } from '@/features/catalogue/ref-overrides'
import { syncRefOverrides } from '@/features/catalogue/ref-overrides-sync'
import { captureInviteCodeFromUrl } from '@/lib/invite-code'
import { initSentry } from '@/lib/sentry'

// Les adaptations locales du référentiel s'écrivent sans connaître la synchronisation : leur
// module ne peut pas importer Supabase, sous peine de le faire entrer dans `dossier-repository` —
// donc dans l'édition autonome, qui se vend sur l'absence de sortie réseau (cf. `ref-overrides`).
// C'est la PLATEFORME qui branche les deux, ici, avant tout rendu.
//
// ⚠️ Ici et pas dans `catalogue-sync.ts` : ce module n'est chargé qu'avec les écrans du catalogue.
// Une adaptation posée avant ce chargement ne partirait jamais — perte silencieuse après un toast
// de succès. L'entrée est le seul endroit dont l'exécution est garantie avant toute écriture.
setOverrideSyncHook(syncRefOverrides)

// Observabilité : no-op si VITE_SENTRY_DSN absent ; sinon charge Sentry en chunk séparé. Un chunk
// injoignable (lien coupé) ne doit pas laisser un rejet non traité au démarrage — et Sentry ne peut,
// par construction, pas remonter sa propre panne de chargement.
void initSentry().catch(() => {})

// Accès sur invitation : capturer `?invite=CODE` AVANT l'OAuth (la redirection Google perd la
// query string) — l'onboarding le relira depuis localStorage.
captureInviteCodeFromUrl()

// Le filet des chunks lazy vit désormais DANS le chargement lui-même (`lazyChunk`, cf.
// `lib/lazy-chunk.ts`) : réessayer, puis recharger, puis rendre la main à l'`ErrorBoundary`.
// L'ancien écouteur `vite:preloadError` neutralisait l'événement — ce qui faisait résoudre
// l'import avec `undefined` et tuait l'app au lieu de la sauver.

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
