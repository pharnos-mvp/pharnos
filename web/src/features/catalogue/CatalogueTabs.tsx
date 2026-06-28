import { Building2, FlaskConical, Landmark } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { toast } from 'sonner'

import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

const base =
  'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium transition-colors'
const inactive = 'text-muted-foreground hover:bg-accent'
const activeCls = 'bg-info text-white'

/**
 * Sous-navigation du hub Catalogue (référentiel maître RIM) : Produits · Organisations · Autorités.
 * Les onglets partagent la surface `/catalogue` ; « Autorités » est un emplacement honnête (M5) →
 * toast « bientôt ». Statique et léger (rendu dans le bundle d'entrée via CataloguePage).
 */
export function CatalogueTabs() {
  const { t } = useI18n()
  return (
    <nav
      aria-label={t({ fr: 'Sections du catalogue', en: 'Catalogue sections' })}
      className="flex flex-wrap items-center gap-1.5"
    >
      <NavLink
        to="/catalogue"
        end
        className={({ isActive }) => cn(base, isActive ? activeCls : inactive)}
      >
        <FlaskConical className="size-4" /> {t({ fr: 'Produits', en: 'Products' })}
      </NavLink>
      <NavLink
        to="/catalogue/organisations"
        className={({ isActive }) => cn(base, isActive ? activeCls : inactive)}
      >
        <Building2 className="size-4" /> {t({ fr: 'Organisations', en: 'Organizations' })}
      </NavLink>
      <button
        type="button"
        onClick={() =>
          toast(t({ fr: 'Autorités — bientôt disponible.', en: 'Authorities — coming soon.' }))
        }
        className={cn(base, 'text-muted-foreground/60 hover:bg-accent')}
      >
        <Landmark className="size-4" /> {t({ fr: 'Autorités', en: 'Authorities' })}
      </button>
    </nav>
  )
}
