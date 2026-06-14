import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

const LANGS: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
]

/**
 * Sélecteur de langue FR/EN (segmenté). Branché sur le socle i18n (`useI18n`) :
 * la préférence est persistée (localStorage) et appliquée sans rechargement.
 * DA neutre (tokens), accessible (`role=group` + `aria-pressed`).
 */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div
      role="group"
      aria-label={t({ fr: 'Choisir la langue', en: 'Choose language' })}
      className={cn(
        'inline-flex items-center rounded-full border p-0.5 text-xs font-semibold',
        className,
      )}
    >
      {LANGS.map(({ code, label }) => {
        const active = lang === code
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={cn(
              'rounded-full px-2 py-0.5 transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
