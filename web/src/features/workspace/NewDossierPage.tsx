import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listProducts } from '@/features/catalogue/repository'
import { useOrgId } from '@/features/org/org-context'
import { useI18n } from '@/lib/i18n-context'
import { COUNTRIES, DOSSIER_FORMATS, REG_ACTIVITIES } from './dossier-constants'
import { createDossier } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import type { DossierFormat } from './module1-tree'

export function NewDossierPage() {
  const { t } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const products = useLiveQuery(() => listProducts(orgId), [orgId])

  const [productId, setProductId] = useState('')
  const [format, setFormat] = useState<DossierFormat>('ctd')
  const [activity, setActivity] = useState(REG_ACTIVITIES[0]?.code ?? 'new_ma')
  const [country, setCountry] = useState(COUNTRIES[0]?.code ?? 'CI')
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    const product = products?.find((p) => p.id === productId)
    if (!product) {
      toast.error(t({ fr: 'Choisis un produit', en: 'Choose a product' }))
      return
    }
    setBusy(true)
    try {
      const dossier = await createDossier(orgId, {
        productId: product.id,
        productName: product.nomCommercial,
        format,
        activity,
        country,
      })
      void syncDossiers(orgId)
      toast.success(t({ fr: 'Dossier créé', en: 'Dossier created' }))
      navigate(`/workspace/${dossier.id}/roadmap`)
    } catch (error) {
      toast.error(t({ fr: 'Échec de la création', en: 'Creation failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/workspace')}
        className="mb-4 -ml-2"
      >
        <ArrowLeft /> {t({ fr: 'Retour', en: 'Back' })}
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t({ fr: 'Nouveau dossier', en: 'New dossier' })}
      </h1>
      <p className="text-muted-foreground mt-1 mb-6">
        {t({
          fr: 'Configurez votre espace de montage Module 1.',
          en: 'Configure your Module 1 workspace.',
        })}
      </p>

      <div className="space-y-4">
        <Field label={t({ fr: 'Produit', en: 'Product' })}>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  products?.length
                    ? t({ fr: 'Choisir un produit', en: 'Choose a product' })
                    : t({
                        fr: 'Aucun produit — créez-en un dans le Catalogue',
                        en: 'No product — create one in the Catalogue',
                      })
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(products ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nomCommercial}
                  {p.dci ? ` (${p.dci})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t({ fr: 'Format du dossier', en: 'Dossier format' })}>
          <Select value={format} onValueChange={(v) => setFormat(v as DossierFormat)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOSSIER_FORMATS.map((f) => (
                <SelectItem key={f.code} value={f.code}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t({ fr: 'Activité réglementaire', en: 'Regulatory activity' })}>
          <Select value={activity} onValueChange={setActivity}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REG_ACTIVITIES.map((a) => (
                <SelectItem key={a.code} value={a.code}>
                  {t({ fr: a.label, en: a.en ?? a.label })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t({ fr: 'Pays cible', en: 'Target country' })}>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {t({ fr: c.label, en: c.en ?? c.label })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Button onClick={() => void handleCreate()} disabled={busy || !productId}>
          {t({ fr: 'Créer le dossier', en: 'Create dossier' })}
        </Button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
