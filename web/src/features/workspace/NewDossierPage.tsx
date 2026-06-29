import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  FilePlus,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { VariationTableDialog } from '@/features/variations/VariationTableDialog'
import { lookupVariation, type VariationItem } from '@/features/variations/variation-request'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import {
  COUNTRIES,
  countryLabel,
  DOSSIER_FORMATS,
  formatLabel,
  REG_ACTIVITIES,
} from './dossier-constants'
import { createDossier } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import type { DossierFormat } from './module1-tree'
import { procedureLabel } from './operations-data'

// Métadonnées d'affichage des 4 procédures (cartes de l'étape « Opération »). Le titre = `procedureLabel`.
const ACTIVITY_META: Record<
  string,
  { icon: ComponentType<{ className?: string }>; desc: Translatable }
> = {
  new_ma: { icon: FilePlus, desc: { fr: 'Nouvelle AMM', en: 'New MA' } },
  renewal: { icon: RefreshCw, desc: { fr: 'AMM existante', en: 'Existing MA' } },
  variation: { icon: SlidersHorizontal, desc: { fr: "Modification d'AMM", en: 'MA change' } },
  transfer: {
    icon: ArrowLeftRight,
    desc: { fr: 'Changement de titulaire', en: 'Change of holder' },
  },
}

/**
 * Création d'opération en ASSISTANT 3 étapes (refonte UX) — isole la complexité de la VARIATION
 * (natures + tableau comparatif + AMM) dans sa propre étape « Détails » au lieu de surcharger un
 * formulaire unique. Étape 1 Produit & marché · Étape 2 Opération (cartes) · Étape 3 Détails + création.
 */
export function NewDossierPage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const products = useLiveQuery(() => listProducts(orgId), [orgId])

  // Pré-sélection depuis la fiche produit (« Lancer une opération » → ?produit=<id>). Le produit est
  // pré-rempli, MAIS la configuration obligatoire (format, procédure, pays, variations) reste à saisir.
  const [productId, setProductId] = useState(() => searchParams.get('produit') ?? '')
  const [format, setFormat] = useState<DossierFormat>('ctd')
  const [activity, setActivity] = useState(REG_ACTIVITIES[0]?.code ?? 'new_ma')
  const [country, setCountry] = useState('')
  const [variations, setVariations] = useState<number[]>([])
  const [tableItems, setTableItems] = useState<VariationItem[]>([])
  const [tableOpen, setTableOpen] = useState(false)
  const [amm, setAmm] = useState('')
  const [ammDate, setAmmDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)

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

  // Produit pré-sélectionné par l'URL → même pré-remplissage AMM que pickProduct (fetch async).
  useEffect(() => {
    const id = searchParams.get('produit')
    if (!id) return
    let cancelled = false
    void getAmmDocument(id).then((doc) => {
      if (cancelled || !doc) return
      if (doc.reference) setAmm(doc.reference)
      if (doc.issueDate) setAmmDate(doc.issueDate)
    })
    return () => {
      cancelled = true
    }
  }, [searchParams])

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

  const product = products?.find((p) => p.id === productId)
  const steps: Translatable[] = [
    { fr: 'Produit & marché', en: 'Product & market' },
    { fr: 'Opération', en: 'Operation' },
    { fr: 'Détails', en: 'Details' },
  ]
  const canNext = step === 0 ? !!productId && !!country : true
  const canCreate = !!productId && !!country && (!isVariation || variations.length > 0)

  return (
    <section className="mx-auto max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/workspace')}
        className="mb-4 -ml-2"
      >
        <ArrowLeft /> {t({ fr: 'Retour', en: 'Back' })}
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t({ fr: 'Nouvelle opération', en: 'New operation' })}
      </h1>
      <p className="text-muted-foreground mt-1 mb-5">
        {t({
          fr: 'Configurez votre espace de montage Module 1.',
          en: 'Configure your Module 1 workspace.',
        })}
      </p>

      {/* Fil d'étapes */}
      <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 ? <ArrowRight className="text-muted-foreground size-3.5" aria-hidden /> : null}
            <span
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5',
                i === step
                  ? 'text-info font-medium'
                  : i < step
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/60',
              )}
            >
              {i < step ? (
                <Check className="text-success size-3.5" aria-hidden />
              ) : (
                <span
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded-full text-[10px] tabular-nums',
                    i === step ? 'bg-info text-white' : 'bg-muted',
                  )}
                >
                  {i + 1}
                </span>
              )}
              {t(s)}
            </span>
          </li>
        ))}
      </ol>

      {/* ── Étape 1 : Produit & marché ── */}
      {step === 0 ? (
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
            {products && products.length === 0 ? (
              <div className="bg-muted/40 mt-2 flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
                <span className="text-muted-foreground">
                  {t({
                    fr: "Vous n'avez pas encore de produit. Créez-en un pour démarrer un dossier.",
                    en: "You don't have any product yet. Create one to start a dossier.",
                  })}
                </span>
                <Button type="button" size="sm" onClick={() => navigate('/catalogue/nouveau')}>
                  <Plus className="size-4" />{' '}
                  {t({ fr: 'Créer un produit', en: 'Create a product' })}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/catalogue/nouveau')}
                className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1 text-xs"
              >
                <Plus className="size-3.5" />{' '}
                {t({ fr: 'Créer un produit', en: 'Create a product' })}
              </button>
            )}
          </Field>

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
        </div>
      ) : null}

      {/* ── Étape 2 : Type d'opération (cartes) ── */}
      {step === 1 ? (
        <div
          role="group"
          aria-label={t({ fr: "Type d'opération", en: 'Operation type' })}
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {REG_ACTIVITIES.map((a) => {
            const meta = ACTIVITY_META[a.code]
            const Icon = meta?.icon ?? FilePlus
            const selected = activity === a.code
            return (
              // Boutons-bascule `aria-pressed` (clavier-natifs Tab+Entrée/Espace) plutôt qu'un
              // role=radio sans navigation flèches — sémantique honnête, zéro JS de roving tabindex.
              <button
                key={a.code}
                type="button"
                aria-pressed={selected}
                onClick={() => setActivity(a.code)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                  selected
                    ? 'border-info bg-info-subtle'
                    : 'bg-card hover:border-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                    selected ? 'bg-info text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium">
                    {procedureLabel(a.code, lang)}
                    {selected ? <Check className="text-info size-4" aria-hidden /> : null}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {t(meta?.desc ?? { fr: '', en: '' })}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* ── Étape 3 : Détails + création ── */}
      {step === 2 ? (
        <div className="space-y-4">
          {/* Récapitulatif */}
          <dl className="bg-muted/40 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-3.5 text-sm">
            <Recap
              label={t({ fr: 'Produit', en: 'Product' })}
              value={product?.nomCommercial ?? '—'}
            />
            <Recap
              label={t({ fr: 'Marché', en: 'Market' })}
              value={country ? countryLabel(country, lang) : '—'}
            />
            <Recap
              label={t({ fr: 'Opération', en: 'Operation' })}
              value={procedureLabel(activity, lang)}
            />
            <Recap label={t({ fr: 'Format', en: 'Format' })} value={formatLabel(format)} />
          </dl>

          {isVariation ? (
            <Field label={t({ fr: 'Natures de variation', en: 'Variation types' })}>
              {variations.length ? (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {variations.map((r) => (
                    <li
                      key={r}
                      className="bg-primary/5 border-primary/30 inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                    >
                      <span className="text-muted-foreground tabular-nums">{r || '+'}.</span>
                      <span className="truncate">
                        {t(lookupVariation(r)?.nature ?? { fr: '', en: '' })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setTableOpen(true)}
              >
                {variations.length
                  ? t({
                      fr: `Modifier les natures & le tableau (${variations.length})`,
                      en: `Edit types & table (${variations.length})`,
                    })
                  : t({
                      fr: 'Choisir les natures & remplir le tableau',
                      en: 'Pick types & fill the table',
                    })}
              </Button>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {variations.length
                  ? t({
                      fr: 'L’arbre Module 1 sera adapté à ces variations.',
                      en: 'The Module 1 tree will be tailored to these variations.',
                    })
                  : t({
                      fr: 'Cochez au moins une variation pour continuer.',
                      en: 'Tick at least one variation to continue.',
                    })}
              </p>
            </Field>
          ) : null}

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

          {!isVariation && !needsAmm ? (
            <p className="text-muted-foreground text-sm">
              {t({
                fr: 'Tout est prêt — créez le dossier pour ouvrir l’espace de montage Module 1.',
                en: 'All set — create the dossier to open the Module 1 workspace.',
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
          </Button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button variant="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            {t({ fr: 'Continuer', en: 'Continue' })} <ArrowRight />
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={busy || !canCreate}
          >
            {t({ fr: 'Créer le dossier', en: 'Create dossier' })}
          </Button>
        )}
      </div>

      <VariationTableDialog
        open={tableOpen}
        onOpenChange={setTableOpen}
        refs={variations}
        product={product}
        initialItems={tableItems}
        onCommit={(refs, items) => {
          setVariations(refs)
          setTableItems(items)
        }}
      />
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

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}
