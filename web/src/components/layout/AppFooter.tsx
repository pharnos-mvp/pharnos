import { Link } from 'react-router-dom'

import { useI18n, type Translatable } from '@/lib/i18n-context'

const NAV: { to: string; label: Translatable }[] = [
  { to: '/catalogue', label: { fr: 'Catalogue', en: 'Catalogue' } },
  { to: '/workspace', label: { fr: 'CTD Workspace', en: 'CTD Workspace' } },
  { to: '/templates', label: { fr: 'Bibliothèque', en: 'Templates' } },
  { to: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
  { to: '/compte', label: { fr: 'Paramètres', en: 'Settings' } },
]

/**
 * Pied de page de l'application — généreux, présent sur toutes les pages SAUF le montage CTD
 * plein écran (rendu conditionnel dans app-shell). Full-bleed (annule le padding de `<main>`),
 * 100 % tokens → dark/light. Liens = routes réelles de l'app (aucun lien mort).
 */
export function AppFooter() {
  const { t } = useI18n()
  const year = new Date().getFullYear()
  return (
    <footer className="bg-card text-muted-foreground -mx-4 mt-10 border-t px-4 py-8 md:-mx-6 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs space-y-2">
          <div className="text-foreground flex items-center gap-2">
            <img src="/brand/pharnos-logo.svg" alt="" aria-hidden className="size-7 dark:hidden" />
            <img
              src="/brand/pharnos-logo-dark.svg"
              alt=""
              aria-hidden
              className="hidden size-7 dark:block"
            />
            <span className="text-base font-semibold">Pharnos</span>
          </div>
          <p className="text-xs leading-relaxed">
            {t({
              fr: "L'usine du Module 1 régional UEMOA/CEDEAO — montage CTD, conformité assistée et compilation eCTD-ready.",
              en: 'The regional WAEMU/ECOWAS Module 1 factory — CTD assembly, assisted compliance and eCTD-ready compilation.',
            })}
          </p>
          <p className="text-xs">
            {t({
              fr: '🇪🇺 Données hébergées dans l’UE (Paris)',
              en: '🇪🇺 Data hosted in the EU (Paris)',
            })}
          </p>
        </div>

        <nav
          aria-label={t({ fr: 'Liens de pied de page', en: 'Footer links' })}
          className="grid grid-cols-2 gap-x-12 gap-y-2 text-xs sm:grid-cols-3"
        >
          {NAV.map(({ to, label }) => (
            <Link key={to} to={to} className="hover:text-foreground w-fit transition-colors">
              {t(label)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-1 border-t pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {year} Pharnos · {t({ fr: 'Tous droits réservés', en: 'All rights reserved' })}
        </span>
        <span>
          {t({
            fr: 'Affaires réglementaires pharmaceutiques',
            en: 'Pharmaceutical regulatory affairs',
          })}
        </span>
      </div>
    </footer>
  )
}
