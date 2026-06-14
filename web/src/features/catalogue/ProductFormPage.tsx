import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useOrgId } from '@/features/org/org-context'
import { useI18n } from '@/lib/i18n-context'
import { DocumentsSection } from './DocumentsSection'
import { ProductForm } from './ProductForm'
import { createProduct, getProduct, updateProduct } from './repository'
import { syncProducts } from './sync'
import { type ProductFormValues } from './types'
import { useCatalogueSync } from './use-catalogue-sync'

export function ProductFormPage() {
  const { t } = useI18n()
  const { productId } = useParams()
  const navigate = useNavigate()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  const isEdit = Boolean(productId)
  const [submitting, setSubmitting] = useState(false)

  // `undefined` = en cours de chargement ; `null` = nouveau / introuvable ; sinon l'enregistrement.
  const existing = useLiveQuery(
    async () => (productId ? ((await getProduct(productId)) ?? null) : null),
    [productId],
  )

  async function handleSubmit(values: ProductFormValues) {
    setSubmitting(true)
    try {
      if (isEdit && productId) {
        await updateProduct(productId, values)
        toast.success(t({ fr: 'Produit mis à jour', en: 'Product updated' }))
      } else {
        await createProduct(orgId, values)
        toast.success(t({ fr: 'Produit enregistré', en: 'Product saved' }))
      }
      void syncProducts(orgId)
      navigate('/catalogue')
    } catch (error) {
      toast.error(t({ fr: "Échec de l'enregistrement", en: 'Save failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
      setSubmitting(false)
    }
  }

  const loadingExisting = isEdit && existing === undefined

  const defaults: ProductFormValues | undefined = existing
    ? {
        nomCommercial: existing.nomCommercial,
        dci: existing.dci,
        dosage: existing.dosage,
        forme: existing.forme,
        presentation: existing.presentation,
        classeTherapeutique: existing.classeTherapeutique,
        codeAtc: existing.codeAtc,
        titulaire: existing.titulaire ?? '',
        titulaireAdresse: existing.titulaireAdresse ?? '',
        fabricant: existing.fabricant ?? '',
        fabricantAdresse: existing.fabricantAdresse ?? '',
      }
    : undefined

  return (
    <section className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/catalogue')}
        className="mb-4 -ml-2"
      >
        <ArrowLeft /> {t({ fr: 'Retour au catalogue', en: 'Back to catalogue' })}
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">
        {isEdit
          ? t({ fr: 'Modifier le produit', en: 'Edit product' })
          : t({ fr: 'Nouveau produit', en: 'New product' })}
      </h1>
      <p className="text-muted-foreground mt-1 mb-6">
        {t({
          fr: "Renseignez l'identification du produit. Tout est enregistré localement et disponible hors-ligne.",
          en: 'Fill in the product identification. Everything is saved locally and available offline.',
        })}
      </p>

      {loadingExisting ? (
        <p className="text-muted-foreground text-sm">{t({ fr: 'Chargement…', en: 'Loading…' })}</p>
      ) : (
        <ProductForm
          key={existing?.id ?? 'new'}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel={
            isEdit
              ? t({ fr: 'Enregistrer les modifications', en: 'Save changes' })
              : t({ fr: 'Enregistrer le produit', en: 'Save product' })
          }
          documentsSlot={
            isEdit && productId ? (
              <DocumentsSection orgId={orgId} productId={productId} category="info" />
            ) : undefined
          }
          adminSlot={
            isEdit && productId ? (
              <DocumentsSection orgId={orgId} productId={productId} category="admin" />
            ) : undefined
          }
        />
      )}
    </section>
  )
}
