import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

import { reportError } from '@/lib/sentry'

/**
 * Chargement RÉSILIENT des chunks de code-splitting — `lazyChunk` remplace `React.lazy` partout.
 *
 * ⚠️ NE JAMAIS réintroduire `event.preventDefault()` sur `vite:preloadError`.
 * Le helper de préchargement émis par Vite se termine par `return r().catch(s)`, et `s` ne relance
 * l'erreur QUE si l'événement n'a pas été neutralisé. Neutraliser faisait donc **résoudre l'import
 * avec `undefined`** : `React.lazy` lisait `undefined.default` → `TypeError` NON capturée, écran
 * mort. C'est la panne de `/` et `/admin` (Sentry JAVASCRIPT-REACT-7 / -F / -E, juillet 2026) :
 * l'ancien filet de récupération ÉTAIT la panne. Le rechargement qu'il déclenchait est asynchrone —
 * React avait le temps de rendre `undefined` avant que la page ne parte.
 *
 * Politique de récupération, du moins au plus destructeur pour l'utilisateur :
 * 1. **réessayer une fois** — un échec de préchargement de dépendance survient AVANT l'import du
 *    module (rien n'est encore inscrit dans la module map du navigateur) : sur lien instable, la
 *    2ᵉ tentative passe souvent et l'utilisateur ne perd ni sa page ni sa saisie en cours ;
 * 2. **recharger une fois** — seul recours quand le chunk a vraiment disparu (après un déploiement
 *    le hash n'existe plus) : seul un `index.html` frais connaît les nouveaux noms ;
 * 3. **rendre la main** — l'erreur remonte à l'`ErrorBoundary`, qui propose « Recharger ».
 */

/** Délai avant la 2ᵉ tentative — assez court pour rester invisible, assez long pour un micro-trou réseau. */
const RETRY_DELAY_MS = 600

/**
 * Fenêtre anti-boucle. Un échec qui persiste dans ce délai après un rechargement prouve que
 * recharger ne répare rien (asset réellement absent, réseau coupé) : on cesse et on affiche l'erreur.
 */
const RELOAD_WINDOW_MS = 10_000

/**
 * Délai au-delà duquel on considère que le rechargement demandé n'aura pas lieu (navigation
 * bloquée). Sans ce filet, la promesse jamais tenue laisserait un chargement infini à l'écran.
 */
const RELOAD_GRACE_MS = 8_000

const RELOAD_KEY = 'pharnos.chunkReloadAt'

interface ChunkModule<T> {
  default: T
}

/** Options injectables — la production utilise les valeurs par défaut, les tests les remplacent. */
export interface LoadChunkOptions {
  reload?: () => void
  retryDelayMs?: number
  reloadGraceMs?: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Un module exploitable expose un `default` non nul. Cette garde est la ceinture qui rend la panne
 * ci-dessus IMPOSSIBLE à reproduire : quoi qu'il arrive en amont, React ne reçoit jamais `undefined`.
 */
function isUsable<T>(mod: unknown): mod is ChunkModule<T> {
  return typeof mod === 'object' && mod !== null && (mod as ChunkModule<T>).default != null
}

/** Horodatage du dernier rechargement de récupération ; `null` = stockage refusé (pas de garde). */
function lastReloadAt(): number | null {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0
  } catch {
    return null
  }
}

/**
 * Déclenche le rechargement unique de récupération. Renvoie `false` s'il est INTERDIT : soit on
 * vient déjà de recharger (le rechargement n'a rien réparé), soit le stockage de session est
 * indisponible — sans garde persistante, recharger boucherait à l'infini sur l'utilisateur, et une
 * erreur visible vaut mieux qu'une boucle.
 */
export function tryRecoveryReload(reload: () => void = () => window.location.reload()): boolean {
  const last = lastReloadAt()
  const now = Date.now()
  if (last === null) return false
  if (last > 0 && now - last < RELOAD_WINDOW_MS) return false
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

/**
 * Charge un chunk en appliquant la politique de récupération. Exporté pour les tests ; le code
 * applicatif passe par `lazyChunk`.
 */
export async function loadChunk<T>(
  factory: () => Promise<ChunkModule<T>>,
  options: LoadChunkOptions = {},
  attempt = 0,
): Promise<ChunkModule<T>> {
  const {
    reload = () => window.location.reload(),
    retryDelayMs = RETRY_DELAY_MS,
    reloadGraceMs = RELOAD_GRACE_MS,
  } = options
  try {
    const mod = await factory()
    if (!isUsable<T>(mod)) {
      throw new Error('Chunk chargé mais inexploitable (module sans export par défaut).')
    }
    return mod
  } catch (error) {
    if (attempt === 0) {
      await sleep(retryDelayMs)
      return loadChunk(factory, options, 1)
    }
    if (tryRecoveryReload(reload)) {
      // La page s'en va : ne JAMAIS résoudre (React rendrait `undefined`) et ne pas rejeter non
      // plus (l'écran d'erreur clignoterait juste avant la navigation). On reste en Suspense —
      // sauf si le rechargement n'a finalement pas lieu, auquel cas on rend la main.
      return new Promise<ChunkModule<T>>((_resolve, reject) => {
        setTimeout(() => reject(asError(error)), reloadGraceMs)
      })
    }
    // Dernier recours : plus rien à tenter, l'utilisateur DOIT voir une erreur actionnable.
    reportError(error, { op: 'chunk', recovered: false })
    throw asError(error)
  }
}

/** L'`ErrorBoundary` affiche `error.message` : une valeur non-`Error` y deviendrait illisible. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Équivalent de `React.lazy` avec la politique de récupération ci-dessus. Signature identique :
 * `lazyChunk(() => import('…').then((m) => ({ default: m.Page })))`.
 */
export function lazyChunk<P extends object>(
  factory: () => Promise<ChunkModule<ComponentType<P>>>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => loadChunk(factory))
}
