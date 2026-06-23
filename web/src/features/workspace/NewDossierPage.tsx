import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getAmmDocument } from '@/features/catalogue/documents-repository'
import { listProducts } from '@/features/catalogue/repository'
import { useOrgId } from '@/features/org/org-context'
import { VariationPicker } from '@/features/variations/VariationPicker'
import { VariationTableDialog } from '@/features/variations/VariationTableDialog'
import type { VariationItem } from '@/features/variations/variation-request'
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
  const [country, setCountry] = useState('')
  const [variations, setVariations] = useState<number[]>([])
  const [tableItems, setTableItems] = useState<VariationItem[]>([])
  const [tableOpen, setTableOpen] = useState(false)
  const [amm, setAmm] = useState('')
  const [ammDate, setAmmDate] = useState('')
  const [busy, setBusy] = useState(false)

  const isVariation = activity === 'variation'
  // Renouvellement & variation portent sur une AMM existante : on capte son n° + date d'octroi
  // (réf. de la lettre + RCP §8/§9), pré-remplis depuis le doc AMM de la fiche produit.
  const needsAmm = isVariation || activity === 'renewal'

  // Choix d'un produit → synchro du N° + date d'octroi depuis son doc AMM (modifiables ensuite).
  async function pickProduct(id: string) {
    setProductId(id)
    const ammDoc = await getAmmDocument(id)
    if (ammDoc?.reference) setAmm(ammDoc.reference)
    if (ammDoc?.issueDate) setAmmDate(ammDoc.issueDate)
  }

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
        variations: isVariation ? variations : undefined,
        variationItems: isVariation && tableItems.length ? tableItems : undefined,
        ammNumero: needsAmm ? amm.trim() || undefined : undefined,
        ammDate: needsAmm ? ammDate || undefined : undefined,
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
    <section className={isVariation ? 'mx-auto max-w-3xl' : 'mx-auto max-w-xl'}>
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
          <Select value={productId} onValueChange={(id) => void pickProduct(id)}>
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
          {/* Raccourci : un user sans produit est redirigé en un clic vers la fiche produit
              (proéminent si aucun produit, discret sinon). */}
          {products && products.length === 0 ? (
            <div className="bg-muted/40 mt-2 flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
              <span className="text-muted-foreground">
                {t({
                  fr: "Vous n'avez pas encore de produit. Créez-en un pour démarrer un dossier.",
                  en: "You don't have any product yet. Create one to start a dossier.",
                })}
              </span>
              <Button type="button" size="sm" onClick={() => navigate('/catalogue/nouveau')}>
                <Plus className="size-4" /> {t({ fr: 'Créer un produit', en: 'Create a product' })}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/catalogue/nouveau')}
              className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1 text-xs"
            >
              <Plus className="size-3.5" /> {t({ fr: 'Créer un produit', en: 'Create a product' })}
            </button>
          )}
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

        {/* Opération Variation : sélecteur deux colonnes → pilote l'arbre Module 1. Juste après le
            choix, le tableau comparatif se remplit dans un popup (Sheet). */}
        {isVariation ? (
          <Field label={t({ fr: 'Natures de variation', en: 'Variation types' })}>
            <VariationPicker value={variations} onChange={setVariations} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">
                {variations.length
                  ? t({
                      fr: `${variations.length} variation(s) cochée(s) — l’arbre Module 1 sera adapté.`,
                      en: `${variations.length} variation(s) selected — the Module 1 tree will be tailored.`,
                    })
                  : t({
                      fr: 'Cochez au moins une variation.',
                      en: 'Check at least one variation.',
                    })}
              </p>
              {variations.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setTableOpen(true)}
                >
                  {tableItems.length
                    ? t({
                        fr: `Tableau comparatif rempli (${tableItems.length}) — modifier`,
                        en: `Comparison table filled (${tableItems.length}) — edit`,
                      })
                    : t({ fr: 'Remplir le tableau comparatif', en: 'Fill the comparison table' })}
                </Button>
              ) : null}
            </div>
            <VariationTableDialog
              open={tableOpen}
              onOpenChange={setTableOpen}
              refs={variations}
              product={products?.find((p) => p.id === productId)}
              initialItems={tableItems}
              onSave={setTableItems}
            />
          </Field>
        ) : null}

        <Field label={t({ fr: 'Pays cible', en: 'Target country' })}>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t({ fr: 'Choisir un pays', en: 'Choose a country' })} />
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

        {needsAmm ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t({ fr: 'N° d’AMM existante', en: 'Existing MA number' })}>
              <Input
                value={amm}
                onChange={(e) => setAmm(e.target.value)}
                placeholder={t({ fr: 'Ex. AMM_2015_7457', en: 'e.g. MA_2015_7457' })}
              />
            </Field>
            <Field label={t({ fr: 'Date d’octroi de l’AMM', en: 'MA grant date' })}>
              <Input type="date" value={ammDate} onChange={(e) => setAmmDate(e.target.value)} />
            </Field>
            <p className="text-muted-foreground -mt-1 text-xs sm:col-span-2">
              {t({
                fr: 'Pré-remplis depuis la fiche produit (doc AMM) si disponibles ; modifiables.',
                en: 'Pre-filled from the product (MA document) if available; editable.',
              })}
            </p>
          </div>
        ) : null}

        <Button
          onClick={() => void handleCreate()}
          disabled={busy || !productId || !country || (isVariation && variations.length === 0)}
        >
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
