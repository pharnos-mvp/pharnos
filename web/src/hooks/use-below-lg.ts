import { useSyncExternalStore } from 'react'

// Point de rupture `lg` de Tailwind = 1024px. « Sous lg » = < 1024 (tablette / mobile).
const QUERY = '(max-width: 1023.98px)'

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

/**
 * Vrai sous le point de rupture `lg` (1024px) — pilote la bascule de mise en page du CTD builder
 * (≥ lg : 3 colonnes desktop ; < lg : rail d'actions + carte document + validation flottante +
 * pastilles). On choisit la disposition en JS (et non en CSS `lg:hidden`) pour ne monter QU'UNE
 * arborescence à la fois : pas d'éléments interactifs dupliqués (a11y) et lecture déterministe en
 * test (jsdom → `matches: false` → desktop). Modèle `useSyncExternalStore` (cf. useOnlineStatus).
 */
export function useBelowLg(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // SSR / pré-hydratation : desktop par défaut
  )
}
