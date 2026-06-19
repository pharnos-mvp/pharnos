import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'

// jsdom n'expose pas `localStorage` de façon fiable selon le worker/la version de Node
// (« localStorage is not available… »). Plusieurs composants le lisent (app-shell, prefs) →
// polyfill mémoire déterministe pour les tests, sinon `localStorage` est undefined → crash.
if (!globalThis.localStorage) {
  const store = new Map<string, string>()
  const mem: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k)
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    writable: true,
    configurable: true,
    value: mem,
  })
}

// jsdom n'implémente pas les API de défilement d'éléments (scrollIntoView / scrollBy) — utilisées
// par les barres défilables (SectionChips…). Sans stub, jsdom journalise « Not implemented » à
// chaque appel (bruit de test). No-op déterministe.
// Affectation inconditionnelle : jsdom peut fournir un stub « notImplemented » (qui journalise).
Element.prototype.scrollIntoView = () => {}
Element.prototype.scrollBy = () => {}

// jsdom ne fournit pas matchMedia (utilisé par sonner / next-themes pour le thème).
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
