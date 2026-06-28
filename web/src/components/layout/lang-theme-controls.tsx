import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useI18n } from '@/lib/i18n-context'

/**
 * Sélecteurs **Langue** (🇫🇷 FR / 🇬🇧 EN) + **Thème** (clair/sombre) — paire de boutons réutilisable
 * du bandeau. SOURCE UNIQUE (DRY) : utilisée par l'app-shell (en-tête par défaut) ET par les pages
 * qui posent leur propre `headerSlot` (ex. fiche produit-cockpit), qui sinon perdaient ces contrôles.
 * Fragment sans wrapper → s'insère dans n'importe quel conteneur `flex gap-*`.
 */
export function LangThemeControls() {
  const { t, lang, setLang } = useI18n()
  const { setTheme, resolvedTheme } = useTheme()
  return (
    <>
      <button
        type="button"
        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        aria-label={t({ fr: 'Changer de langue', en: 'Change language' })}
        className="hover:bg-accent rounded-md border px-2.5 py-1 text-xs font-medium"
      >
        {lang === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
      </button>
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label={t({ fr: 'Changer de thème', en: 'Toggle theme' })}
        title={t({ fr: 'Thème clair / sombre', en: 'Light / dark theme' })}
        className="text-muted-foreground hover:bg-accent inline-flex size-9 items-center justify-center rounded-md border"
      >
        {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </>
  )
}
