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
import { COUNTRIES, DOSSIER_FORMATS, REG_ACTIVITIES } from './dossier-constants'
import { createDossier } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import type { DossierFormat } from './module1-tree'

export function NewDossierPage() {
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
      toast.error('Choisis un produit')
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
      toast.success('Dossier créé')
      navigate(`/workspace/${dossier.id}/roadmap`)
    } catch (error) {
      toast.error('Échec de la création', {
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
        <ArrowLeft /> Retour
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau dossier</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Configurez votre espace de montage Module 1.
      </p>

      <div className="space-y-4">
        <Field label="Produit">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  products?.length
                    ? 'Choisir un produit'
                    : 'Aucun produit — créez-en un dans le Catalogue'
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

        <Field label="Format du dossier">
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

        <Field label="Activité réglementaire">
          <Select value={activity} onValueChange={setActivity}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REG_ACTIVITIES.map((a) => (
                <SelectItem key={a.code} value={a.code}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Pays cible">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Button onClick={() => void handleCreate()} disabled={busy || !productId}>
          Créer le dossier
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
