import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useOrgId } from '@/features/org/org-context'
import { DocumentsSection } from './DocumentsSection'
import { ProductForm } from './ProductForm'
import { createProduct, getProduct, updateProduct } from './repository'
import { syncProducts } from './sync'
import { type ProductFormValues } from './types'
import { useCatalogueSync } from './use-catalogue-sync'

export function ProductFormPage() {
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
        toast.success('Produit mis à jour')
      } else {
        await createProduct(orgId, values)
        toast.success('Produit enregistré')
      }
      void syncProducts(orgId)
      navigate('/catalogue')
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
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
        <ArrowLeft /> Retour au catalogue
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">
        {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
      </h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Renseignez l'identification du produit. Tout est enregistré localement et disponible
        hors-ligne.
      </p>

      {loadingExisting ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : (
        <ProductForm
          key={existing?.id ?? 'new'}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel={isEdit ? 'Enregistrer les modifications' : 'Enregistrer le produit'}
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
