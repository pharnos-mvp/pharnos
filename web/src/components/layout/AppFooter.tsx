import { useI18n } from '@/lib/i18n-context'

/**
 * Pied de page SOBRE — fine barre persistante en bas du shell, présente sur TOUTES les pages (y
 * compris le montage CTD plein écran) : landmark `contentinfo` cohérent (a11y maximale) et évite
 * l'effet « app collée au bas de l'écran ». 100 % tokens → dark/light. Volontairement minimal
 * (pas de liens de nav, repris par la barre latérale).
 */
export function AppFooter() {
  const { t } = useI18n()
  const year = new Date().getFullYear()
  return (
    <footer className="bg-card text-muted-foreground flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-0.5 border-t px-4 py-2 text-[11px] md:px-6">
      <span>
        © {year} Pharnos ·{' '}
        {t({ fr: 'Affaires réglementaires UEMOA/CEDEAO', en: 'WAEMU/ECOWAS regulatory affairs' })}
      </span>
      <span>
        {t({
          fr: '🇪🇺 Données hébergées dans l’UE (Paris)',
          en: '🇪🇺 Data hosted in the EU (Paris)',
        })}
      </span>
    </footer>
  )
}
