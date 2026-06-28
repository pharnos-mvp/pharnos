import { useNavigate } from 'react-router-dom'

import { useTopbar } from '@/components/layout/topbar'
import { Page } from '@/components/ui/page'
import { useOrgId } from '@/features/org/org-context'
import { useI18n } from '@/lib/i18n-context'
import { ProductWizard } from './ProductWizard'
import { useCatalogueSync } from './use-catalogue-sync'

/**
 * Page de **création** d'un produit (`/catalogue/nouveau`). Parcours en **wizard 3 sessions**
 * (typeform) : Identification → Documents d'information → Pièces administratives. L'édition d'un
 * produit existant se fait dans la fiche cockpit (`/catalogue/:id`), pas ici.
 *
 * Le bandeau affiche « ← Nouveau produit » (titre + retour) **en conservant langue/thème**, et
 * masque la recherche globale (la page n'en a pas besoin). Le corps ne porte qu'un sous-titre + le wizard.
 */
export function ProductFormPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  useTopbar({
    title: t({ fr: 'Nouveau produit', en: 'New product' }),
    backTo: '/catalogue',
    searchHidden: true,
  })

  return (
    <Page className="max-w-3xl">
      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Renseignez le produit en 3 étapes. Tout est enregistré localement et disponible hors-ligne.',
          en: 'Fill in the product in 3 steps. Everything is saved locally and available offline.',
        })}
      </p>
      <ProductWizard orgId={orgId} onDone={() => navigate('/catalogue')} />
    </Page>
  )
}
