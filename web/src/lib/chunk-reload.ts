import { reportError } from '@/lib/sentry'

/**
 * Récupération d'un chunk lazy périmé après un déploiement.
 *
 * Le SW (`autoUpdate` + `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches`) prend la main dès
 * qu'une nouvelle version est installée et PURGE l'ancien cache. `main.tsx` recharge alors sur
 * `controllerchange` — mais il reste une fenêtre de course : si l'utilisateur navigue vers une route
 * lazy AVANT ce rechargement, l'ancien bundle demande un chunk dont le hash n'existe plus (ni en
 * cache, ni sur Pages) → « Failed to fetch dynamically imported module » et écran mort.
 * Vite émet `vite:preloadError` : on recharge une fois, l'index frais repart du précache (qui
 * contient TOUS les JS → fonctionne même hors-ligne) et l'utilisateur ne voit qu'un clignotement.
 */

/**
 * Fenêtre anti-boucle. Un 2ᵉ échec DANS ce délai prouve que le rechargement n'a rien réparé (asset
 * réellement absent, réseau coupé au tout premier chargement avant précache) : on cesse de
 * recharger et on laisse l'erreur remonter, plutôt que de boucler à l'infini sur l'utilisateur.
 */
const WINDOW_MS = 10_000
const KEY = 'pharnos.chunkReloadAt'

/** Horodatage du dernier rechargement ; `null` = stockage indisponible (pas de garde possible). */
function lastReloadAt(): number | null {
  try {
    return Number(sessionStorage.getItem(KEY)) || 0
  } catch {
    return null
  }
}

/**
 * Installe le filet de récupération. `reload` est injectable pour les tests (jsdom interdit de
 * remplacer `window.location.reload`). Renvoie une fonction de désinstallation.
 */
export function installChunkReloadHandler(
  reload: () => void = () => window.location.reload(),
): () => void {
  const onPreloadError = (event: WindowEventMap['vite:preloadError']) => {
    const last = lastReloadAt()
    const now = Date.now()

    // Sans garde persistante (stockage refusé), un rechargement pourrait boucler sans fin →
    // on s'abstient. Idem si l'on vient DÉJÀ de recharger : le rechargement n'a pas suffi.
    if (last === null || (last > 0 && now - last < WINDOW_MS)) {
      reportError(event.payload, { op: 'preload', recovered: false })
      return // pas de preventDefault : l'erreur suit son cours normal
    }

    try {
      sessionStorage.setItem(KEY, String(now))
    } catch {
      reportError(event.payload, { op: 'preload', recovered: false })
      return
    }

    // Récupération SILENCIEUSE : après un déploiement, cet échec est attendu — et il est réparé.
    // Le remonter à Sentry ne ferait que du bruit ; seul l'échec PERSISTANT (ci-dessus) est un bug.
    event.preventDefault()
    reload()
  }

  window.addEventListener('vite:preloadError', onPreloadError)
  return () => window.removeEventListener('vite:preloadError', onPreloadError)
}
