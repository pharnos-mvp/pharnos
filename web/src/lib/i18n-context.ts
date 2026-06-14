import { createContext, useContext } from 'react'

export type Lang = 'fr' | 'en'

/** Chaîne traduisible co-localisée (pas de dictionnaire de clés). */
export interface Translatable {
  fr: string
  en: string
}

export interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  /** Renvoie la chaîne dans la langue courante : `t({ fr: '…', en: '…' })`. */
  t: (s: Translatable) => string
}

export const I18nContext = createContext<I18nValue | undefined>(undefined)

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n doit être utilisé à l’intérieur de <I18nProvider>')
  return ctx
}

/** Clé de persistance de la langue (partagée avec le provider et les modules non-React). */
export const LANG_KEY = 'pharnos.lang'

/**
 * Langue courante HORS React (modules non-composants : websocket realtime, helpers async).
 * Lit la préférence persistée — défaut FR. Les composants doivent utiliser `useI18n()`.
 */
export function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

/**
 * Équivalent de `t()` pour les modules NON-React (libs, hooks dans des callbacks async) :
 * résout une chaîne traduisible selon la langue persistée AU MOMENT de l'appel. À réserver aux
 * messages d'erreur/toasts produits hors rendu (Edge clients, throws) ; en composant, `useI18n()`.
 */
export function tStatic(s: Translatable): string {
  return s[readLang()]
}
