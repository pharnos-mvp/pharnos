import { Building2, FlaskConical, Landmark } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { pillVariants } from '@/components/ui/pill'
import { useI18n } from '@/lib/i18n-context'

/**
 * Sous-navigation du hub Catalogue (référentiel maître RIM) : Produits · Organisations · Autorités
 * (les 3 surfaces de `/catalogue`). Statique et léger (rendu dans le bundle d'entrée via CataloguePage).
 * Pilules = pattern partagé du DS (`components/ui/pill`) — NavLink pose `aria-current` sur l'active.
 */
export function CatalogueTabs() {
  const { t } = useI18n()
  return (
    <nav
      aria-label={t({ fr: 'Sections du catalogue', en: 'Catalogue sections' })}
      className="flex flex-wrap items-center gap-1.5"
    >
      <NavLink to="/catalogue" end className={({ isActive }) => pillVariants({ active: isActive })}>
        <FlaskConical className="size-4" /> {t({ fr: 'Produits', en: 'Products' })}
      </NavLink>
      <NavLink
        to="/catalogue/organisations"
        className={({ isActive }) => pillVariants({ active: isActive })}
      >
        <Building2 className="size-4" /> {t({ fr: 'Organisations', en: 'Organizations' })}
      </NavLink>
      <NavLink
        to="/catalogue/autorites"
        className={({ isActive }) => pillVariants({ active: isActive })}
      >
        <Landmark className="size-4" /> {t({ fr: 'Autorités', en: 'Authorities' })}
      </NavLink>
    </nav>
  )
}
