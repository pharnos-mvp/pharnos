import { useRef, useState } from 'react'
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
  const isEditRoute = Boolean(productId)
  const [submitting, setSubmitting] = useState(false)
  // Produit créé à la volée (auto-save d'une nouvelle fiche) : on RESTE sur la page pour ajouter les docs.
  const [createdId, setCreatedId] = useState<string | null>(null)
  const createdIdRef = useRef<string | null>(null) // source synchrone (anti double-création)
  const savingRef = useRef(false)
  const effectiveId = productId ?? createdId
  const isEditing = Boolean(effectiveId)

  // `undefined` = en cours de chargement ; `null` = nouveau / introuvable ; sinon l'enregistrement.
  const existing = useLiveQuery(
    async () => (productId ? ((await getProduct(productId)) ?? null) : null),
    [productId],
  )

  async function handleSave(values: ProductFormValues, silent = false) {
    if (savingRef.current) return // une sauvegarde est déjà en cours (anti double-création)
    savingRef.current = true
    if (!silent) setSubmitting(true)
    try {
      const eid = productId ?? createdIdRef.current
      if (eid) {
        await updateProduct(eid, values)
        if (!silent) {
          toast.success(t({ fr: 'Produit mis à jour', en: 'Product updated' }))
          if (productId) navigate('/catalogue') // édition d'un produit existant → retour à la liste
        }
      } else {
        const created = await createProduct(orgId, values)
        createdIdRef.current = created.id
        setCreatedId(created.id)
        if (!silent)
          toast.success(
            t({
              fr: 'Produit enregistré — vous pouvez ajouter les documents (II / III).',
              en: 'Product saved — you can now add documents (II / III).',
            }),
          )
      }
      void syncProducts(orgId)
    } catch (error) {
      if (!silent)
        toast.error(t({ fr: "Échec de l'enregistrement", en: 'Save failed' }), {
          description: error instanceof Error ? error.message : undefined,
        })
    } finally {
      savingRef.current = false
      if (!silent) setSubmitting(false)
    }
  }

  const loadingExisting = isEditRoute && existing === undefined

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
        {isEditing
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
          onSubmit={(v) => void handleSave(v, false)}
          onAutoSave={(v) => void handleSave(v, true)}
          submitting={submitting}
          submitLabel={
            isEditing
              ? t({ fr: 'Enregistrer les modifications', en: 'Save changes' })
              : t({ fr: 'Enregistrer le produit', en: 'Save product' })
          }
          documentsSlot={
            effectiveId ? (
              <DocumentsSection orgId={orgId} productId={effectiveId} category="info" />
            ) : undefined
          }
          adminSlot={
            effectiveId ? (
              <DocumentsSection orgId={orgId} productId={effectiveId} category="admin" />
            ) : undefined
          }
        />
      )}
    </section>
  )
}
