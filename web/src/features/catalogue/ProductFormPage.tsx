import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { useOrgId } from '@/features/org/org-context'
import { useI18n } from '@/lib/i18n-context'
import { ProductWizard } from './ProductWizard'
import { useCatalogueSync } from './use-catalogue-sync'

/**
 * Page de **création** d'un produit (`/catalogue/nouveau`). Parcours en **wizard 3 sessions**
 * (typeform) : Identification → Documents d'information → Pièces administratives. L'édition d'un
 * produit existant se fait dans la fiche cockpit (`/catalogue/:id`), pas ici.
 */
export function ProductFormPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const orgId = useOrgId()
  useCatalogueSync(orgId)

  return (
    <Page className="max-w-3xl">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/catalogue')}
          className="mb-2 -ml-2"
        >
          <ArrowLeft /> {t({ fr: 'Retour au catalogue', en: 'Back to catalogue' })}
        </Button>
        <PageHeader
          title={t({ fr: 'Nouveau produit', en: 'New product' })}
          description={t({
            fr: 'Renseignez le produit en 3 étapes. Tout est enregistré localement et disponible hors-ligne.',
            en: 'Fill in the product in 3 steps. Everything is saved locally and available offline.',
          })}
        />
      </div>

      <ProductWizard orgId={orgId} onDone={() => navigate('/catalogue')} />
    </Page>
  )
}
