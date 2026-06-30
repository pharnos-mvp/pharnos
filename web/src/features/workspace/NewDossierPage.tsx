import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  Eye,
  FilePlus,
  Info,
  Package,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxItem } from '@/components/ui/combobox'
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
import { PIECE_LABEL } from '@/features/variations/variation-catalog'
import { requestPieces, seedVariationItems } from '@/features/variations/variation-request'
import { VariationNaturesPicker } from '@/features/variations/VariationNaturesPicker'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import {
  COUNTRIES,
  countryLabel,
  DOSSIER_FORMATS,
  formatLabel,
  REG_ACTIVITIES,
} from './dossier-constants'
import { createDossier, listDossiers } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import { getModule1Tree, type CtdNodeDef, type DossierFormat } from './module1-tree'
import { dossierRef, procedureLabel } from './operations-data'
import { agencyFor, officialLanguage } from './roadmap-data'

// Métadonnées d'affichage des 4 procédures (cartes de l'étape « Opération »). Titre = `procedureLabel`.
const ACTIVITY_META: Record<
  string,
  { icon: ComponentType<{ className?: string }>; desc: Translatable }
> = {
  new_ma: { icon: FilePlus, desc: { fr: 'Nouvelle AMM', en: 'New MA' } },
  renewal: { icon: RefreshCw, desc: { fr: 'AMM existante', en: 'Existing MA' } },
  variation: { icon: SlidersHorizontal, desc: { fr: "Modification d'AMM", en: 'MA change' } },
  notif_response: {
    icon: BellRing,
    desc: { fr: "Répondre à l'autorité", en: 'Reply to authority' },
  },
}

/** Nombre de rubriques feuilles d'un arbre Module 1 (pour l'aperçu « structure générée »). */
function countLeaves(nodes: CtdNodeDef[]): number {
  return nodes.reduce((n, x) => n + (x.children?.length ? countLeaves(x.children) : 1), 0)
}

/** Code langue de soumission (`officialLanguage`) → libellé affiché. */
const LANG_LABEL: Record<string, string> = { fr: 'Français', en: 'English', pt: 'Português' }

/**
 * Création d'opération en ASSISTANT GUIDÉ (calqué sur la fiche produit, mockup validé). Stepper
 * typeform à 3 jalons :
 *   ① Produit & marché — ② Opération (cartes ; la variation déplie ses natures Annexe N°2 inline,
 *   le renouvellement/variation reprend l'AMM de la fiche SANS la ressaisir) — ③ Aperçu du dossier
 *   (n° d'opération, agence, langue de soumission, structure Module 1, pièces clés) puis création.
 * « Réponse aux notifications » ne crée PAS de dossier : elle se rattache à un dossier existant
 * (sélection → ouverture de sa correspondance). Cf. [[dossier-lifecycle]].
 */
export function NewDossierPage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const products = useLiveQuery(() => listProducts(orgId), [orgId])
  const dossiers = useLiveQuery(() => listDossiers(orgId), [orgId])

  // Pré-sélection depuis la fiche produit (« Lancer une opération » → ?produit=<id>).
  const [productId, setProductId] = useState(() => searchParams.get('produit') ?? '')
  const [format, setFormat] = useState<DossierFormat>('ctd')
  const [activity, setActivity] = useState(REG_ACTIVITIES[0]?.code ?? 'new_ma')
  const [country, setCountry] = useState('')
  const [variations, setVariations] = useState<number[]>([])
  // AMM repris SILENCIEUSEMENT de la fiche produit (plus de saisie dans le formulaire) — sert à la
  // création + à l'invite non bloquante si absent.
  const [amm, setAmm] = useState('')
  const [ammDate, setAmmDate] = useState('')
  const [targetDossierId, setTargetDossierId] = useState('')
  const [busy, setBusy] = useState(false)
  const [screen, setScreen] = useState(0)

  const isVariation = activity === 'variation'
  const isNotif = activity === 'notif_response'
  const needsAmm = isVariation || activity === 'renewal'
  const product = products?.find((p) => p.id === productId)
  const ammMissing = needsAmm && !amm.trim()

  // Liste produits triée A-Z (par nom commercial, accents/casse ignorés) pour le combobox cherchable ;
  // la DCI sert de mot-clé de recherche secondaire.
  const productItems: ComboboxItem[] = useMemo(
    () =>
      [...(products ?? [])]
        .sort((a, b) =>
          a.nomCommercial.localeCompare(b.nomCommercial, 'fr', { sensitivity: 'base' }),
        )
        .map((p) => ({
          value: p.id,
          label: p.dci ? `${p.nomCommercial} (${p.dci})` : p.nomCommercial,
          keywords: p.dci ?? undefined,
        })),
    [products],
  )

  // Dossiers existants éligibles à une réponse (même produit + marché que les choix de l'étape 1).
  const notifTargets = (dossiers ?? []).filter(
    (d) => d.productId === productId && d.country === country,
  )

  // Aperçu : structure Module 1 réellement générée pour cette opération.
  const sectionCount = useMemo(
    () => countLeaves(getModule1Tree(format, activity, isVariation ? variations : undefined)),
    [format, activity, isVariation, variations],
  )
  // Lignes de variation semées (colonne « ancien » pré-remplie) — mémoïsées, réutilisées par
  // l'aperçu (pièces) ET la création (évite un double calcul).
  const seededItems = useMemo(
    () => (isVariation && variations.length ? seedVariationItems(variations, product) : []),
    [isVariation, variations, product],
  )
  // Pièces clés exigées (variation : dérivées des natures cochées).
  const pieceLabels = useMemo(
    () => (seededItems.length ? requestPieces(seededItems).map((p) => t(PIECE_LABEL[p])) : []),
    [seededItems, t],
  )

  // Choix d'un produit → reprend le N° + date d'octroi depuis son doc AMM (pour la création/l'invite).
  async function pickProduct(id: string) {
    setProductId(id)
    setTargetDossierId('')
    const ammDoc = await getAmmDocument(id)
    setAmm(ammDoc?.reference ?? '')
    setAmmDate(ammDoc?.issueDate ?? '')
  }

  // Produit pré-sélectionné par l'URL → même reprise AMM (fetch async).
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
        // Lignes du tableau comparatif semées des natures (colonne « ancien » pré-remplie depuis la
        // fiche) — éditées ensuite dans l'atelier (annexe de variation).
        variationItems: seededItems.length ? seededItems : undefined,
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

  // « Réponse aux notifications » ne crée pas de dossier → pas de jalon « Aperçu » (l'action est
  // « Ouvrir la réponse » depuis l'étape Opération).
  const steps: Translatable[] = [
    { fr: 'Produit & marché', en: 'Product & market' },
    { fr: 'Opération', en: 'Operation' },
    ...(isNotif ? [] : [{ fr: 'Aperçu', en: 'Preview' }]),
  ]
  const canContinue0 = !!productId && !!country
  const canContinue1 = isNotif ? !!targetDossierId : !isVariation || variations.length > 0

  return (
    <section className="mx-auto max-w-2xl">
      {/* Icône retour à GAUCHE du titre. Le titre reste à SA position : horizontalement l'icône est
          tirée dans la gouttière (`md:-ml-11` = taille bouton + gap, `-ml-2` en mobile pour ne pas
          rogner) ; verticalement `mt-12` restitue l'espace de l'ancienne ligne « Retour » (h-8 + mb-4). */}
      <div className="mt-12 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          aria-label={t({ fr: 'Retour', en: 'Back' })}
          className="text-muted-foreground hover:text-foreground hover:bg-muted -ml-2 grid size-9 shrink-0 place-items-center rounded-md transition-colors md:-ml-11"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t({ fr: 'Nouvelle opération', en: 'New operation' })}
        </h1>
      </div>
      <p className="text-muted-foreground mt-1 mb-6">
        {t({
          fr: 'Configurez votre espace de montage Module 1.',
          en: 'Configure your Module 1 workspace.',
        })}
      </p>

      {/* Stepper typeform (jalons cliquables pour revenir en arrière). */}
      <ol className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => {
          const state = i < screen ? 'done' : i === screen ? 'active' : 'todo'
          return (
            <li key={i} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => i < screen && setScreen(i)}
                disabled={i >= screen}
                aria-current={state === 'active' ? 'step' : undefined}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    state === 'done'
                      ? 'bg-success text-white'
                      : state === 'active'
                        ? 'bg-info text-white'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {state === 'done' ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    state === 'active' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(s)}
                </span>
              </button>
              {i < steps.length - 1 ? <span className="bg-border h-px flex-1" /> : null}
            </li>
          )
        })}
      </ol>

      {/* Barre résumé Produit & marché (écrans 2-3) — « Changer » revient à l'étape 1. */}
      {screen > 0 ? (
        <div className="bg-muted/40 mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <Package className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="truncate font-medium">{product?.nomCommercial ?? '—'}</span>
          <span className="text-muted-foreground truncate">
            · {country ? countryLabel(country, lang) : '—'}
            {country ? ` (${agencyFor(country).name})` : ''}
          </span>
          <button
            type="button"
            onClick={() => setScreen(0)}
            className="text-info ml-auto shrink-0 font-medium hover:underline"
          >
            {t({ fr: 'Changer', en: 'Change' })}
          </button>
        </div>
      ) : null}

      {/* ── Étape 1 : Produit & marché ── */}
      {screen === 0 ? (
        <div className="space-y-4">
          <Field label={t({ fr: 'Produit', en: 'Product' })} htmlFor="op-product">
            {/* Combobox cherchable (clic → liste complète ; frappe → filtre par nom/DCI) — indispensable
                aux portefeuilles de centaines de produits. */}
            <Combobox
              id="op-product"
              value={productId}
              onChange={(id) => void pickProduct(id)}
              items={productItems}
              ariaLabel={t({ fr: 'Produit', en: 'Product' })}
              placeholder={
                products?.length
                  ? t({ fr: 'Rechercher ou choisir un produit', en: 'Search or choose a product' })
                  : t({
                      fr: 'Aucun produit — créez-en un dans le Catalogue',
                      en: 'No product — create one in the Catalogue',
                    })
              }
              emptyText={t({ fr: 'Aucun produit ne correspond.', en: 'No matching product.' })}
            />
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

      {/* ── Étape 2 : Opération + détails inline ── */}
      {screen === 1 ? (
        <div className="space-y-3">
          <div className="text-sm font-medium">
            {t({ fr: "Type d'opération", en: 'Operation type' })}
          </div>
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

          {/* Variation : natures Annexe N°2 inline (sans AMM — repris de la fiche). */}
          {isVariation ? (
            <div className="border-info/40 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-medium">
                <SlidersHorizontal className="text-info size-4" aria-hidden />
                {t({ fr: 'Natures concernées', en: 'Affected types' })}
                <span className="text-muted-foreground text-xs font-normal">· Annexe N°2</span>
              </div>
              <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
                {t({
                  fr: 'Cochez les natures. Le tableau comparatif se remplira dans l’atelier.',
                  en: 'Tick the types. The comparison table is filled later in the workspace.',
                })}
              </p>
              <VariationNaturesPicker value={variations} onChange={setVariations} />
            </div>
          ) : null}

          {/* Réponse aux notifications : rattachée à un dossier déjà soumis. */}
          {isNotif ? (
            <div className="border-info/40 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-medium">
                <BellRing className="text-info size-4" aria-hidden />
                {t({ fr: 'Dossier concerné', en: 'Concerned dossier' })}
              </div>
              <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
                {t({
                  fr: 'Le dossier qui a reçu la notification. La réponse sera rattachée à sa correspondance (e-mail ou dépôt physique selon le pays).',
                  en: 'The dossier that received the notification. The reply attaches to its correspondence (email or physical filing depending on the country).',
                })}
              </p>
              {notifTargets.length ? (
                <Select value={targetDossierId} onValueChange={setTargetDossierId}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t({ fr: 'Choisir un dossier', en: 'Choose a dossier' })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {notifTargets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.productName} · {countryLabel(d.country, lang)} ·{' '}
                        {dossierRef(d) ?? t({ fr: 'n° en attente', en: 'pending no.' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t({
                    fr: 'Aucun dossier pour ce produit et ce marché.',
                    en: 'No dossier for this product and market.',
                  })}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Étape 3 : Aperçu du dossier ── */}
      {screen === 2 ? (
        <div className="border-info/40 rounded-xl border p-4">
          <div className="mb-4 flex items-center gap-2 font-medium">
            <Eye className="text-info size-4" aria-hidden />
            {t({ fr: 'Aperçu du dossier', en: 'Dossier preview' })}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-muted-foreground text-[11px]">
                {t({ fr: "Numéro d'opération", en: 'Operation number' })}
              </div>
              <div className="font-mono font-medium tracking-wide">
                OP-{new Date().getFullYear()}-<span className="text-muted-foreground">••</span>
              </div>
              <div className="text-muted-foreground text-[11px]">
                {t({ fr: 'attribué à la création', en: 'assigned on creation' })}
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-muted-foreground text-[11px]">
                {t({ fr: 'Structure générée', en: 'Generated structure' })}
              </div>
              <div className="font-medium">
                {t({
                  fr: `Module 1 · ${sectionCount} rubriques`,
                  en: `Module 1 · ${sectionCount} sections`,
                })}
              </div>
            </div>
          </div>

          <dl className="flex flex-col gap-2.5 text-sm">
            <ApercuRow
              label={t({ fr: 'Marché', en: 'Market' })}
              value={country ? `${countryLabel(country, lang)} · ${agencyFor(country).name}` : '—'}
            />
            <ApercuRow
              label={t({ fr: 'Langue de soumission', en: 'Submission language' })}
              value={
                country ? (LANG_LABEL[officialLanguage(country)] ?? officialLanguage(country)) : '—'
              }
            />
            <ApercuRow
              label={t({ fr: 'Opération', en: 'Operation' })}
              value={
                isVariation
                  ? `${procedureLabel(activity, lang)} · ${variations.length} ${t({ fr: 'natures', en: 'types' })}`
                  : procedureLabel(activity, lang)
              }
            />
            <ApercuRow label={t({ fr: 'Format', en: 'Format' })} value={formatLabel(format)} />
          </dl>

          {pieceLabels.length ? (
            <div className="mt-3 border-t pt-3">
              <div className="text-muted-foreground mb-2 text-[11px]">
                {t({ fr: 'Pièces clés exigées', en: 'Key required documents' })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pieceLabels.map((p) => (
                  <span key={p} className="bg-muted rounded-full px-2.5 py-1 text-xs">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Invite AMM NON BLOQUANTE (si absente de la fiche). */}
          {ammMissing ? (
            <div className="bg-warning-subtle mt-4 flex items-start gap-2 rounded-lg p-3 text-xs">
              <Info className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <span className="text-warning font-medium">
                  {t({
                    fr: "N° d'AMM absent de la fiche produit.",
                    en: 'MA number missing from the product.',
                  })}
                </span>{' '}
                <span className="text-muted-foreground">
                  {t({
                    fr: 'Recommandé pour la lettre de demande —',
                    en: 'Recommended for the request letter —',
                  })}
                </span>{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/catalogue/${productId}`)}
                  className="text-warning font-medium underline"
                >
                  {t({ fr: 'l’ajouter à la fiche', en: 'add it to the product' })}
                </button>
                <span className="text-muted-foreground">
                  {t({ fr: '. Vous pouvez créer sans.', en: '. You can create without it.' })}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        {screen > 0 ? (
          <Button variant="ghost" onClick={() => setScreen((s) => s - 1)}>
            <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
          </Button>
        ) : (
          <span />
        )}
        {screen === 0 ? (
          <Button variant="primary" disabled={!canContinue0} onClick={() => setScreen(1)}>
            {t({ fr: 'Continuer', en: 'Continue' })} <ArrowRight />
          </Button>
        ) : screen === 1 && isNotif ? (
          <Button
            variant="primary"
            disabled={!canContinue1}
            onClick={() => navigate(`/workspace/${targetDossierId}`)}
          >
            {t({ fr: 'Ouvrir la réponse', en: 'Open the reply' })} <ArrowRight />
          </Button>
        ) : screen === 1 ? (
          <Button variant="primary" disabled={!canContinue1} onClick={() => setScreen(2)}>
            {t({ fr: 'Continuer', en: 'Continue' })} <ArrowRight />
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={busy || !canContinue0}
          >
            {t({ fr: 'Créer le dossier', en: 'Create dossier' })}
          </Button>
        )}
      </div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function ApercuRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}
