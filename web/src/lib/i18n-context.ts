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
