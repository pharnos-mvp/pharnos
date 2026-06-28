import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useHeaderSlot } from '@/components/layout/header-slot'
import { Button } from '@/components/ui/button'
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
 * Le titre + le bouton retour vivent dans le **bandeau** (`headerSlot`, façon cockpit) → le corps
 * remonte et n'affiche que le wizard ; la recherche globale du topbar est remplacée par ce slot.
 */
export function ProductFormPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const orgId = useOrgId()
  const setHeaderSlot = useHeaderSlot()
  useCatalogueSync(orgId)

  useEffect(() => {
    if (!setHeaderSlot) return
    setHeaderSlot(
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Retour au catalogue', en: 'Back to catalogue' })}
          onClick={() => navigate('/catalogue')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-display min-w-0 truncate text-base font-bold">
          {t({ fr: 'Nouveau produit', en: 'New product' })}
        </span>
      </div>,
    )
    return () => setHeaderSlot(null)
  }, [setHeaderSlot, navigate, t])

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
