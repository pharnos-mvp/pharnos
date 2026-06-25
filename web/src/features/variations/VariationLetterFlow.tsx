import { useState, type SelectHTMLAttributes } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ChevronDown,
  FileDown,
  FileText,
  Languages,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import { getAmmDocument } from '@/features/catalogue/documents-repository'
import { listProducts } from '@/features/catalogue/repository'
import { getOrgBranding, getUserSignature } from '@/features/profile/pro-settings-repository'
import { triggerDownload } from '@/features/workspace/download-utils'
import {
  emptyLetterFields,
  productToLetterFields,
  UEMOA_COUNTRIES,
  type LetterFields,
} from '@/features/workspace/letter-context'
import type { LetterBrand } from '@/features/workspace/letter-render'
import { VARIATIONS } from './variation-catalog'
import {
  lookupVariation,
  OTHER_REF,
  requestClass,
  seedVariationItems,
  type VariationItem,
  type VariationRequest,
} from './variation-request'
import { buildComparisonTable } from './variation-table'
import { buildVariationLetterDoc } from './variation-letter'
import { VariationLetterEditor } from './VariationLetterEditor'
import { VariationTableDialog } from './VariationTableDialog'
import { VariationTableSheet } from './VariationTableSheet'

const sanitize = (s: string) =>
  (s || 'variation')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)

type VariantOption = { n: number; nature: { fr: string; en: string } }
const MINEURE_OPTS: VariantOption[] = VARIATIONS.filter((v) => v.class === 'mineure').map((v) => ({
  n: v.n!,
  nature: v.nature,
}))
const MAJEURE_OPTS: VariantOption[] = [
  ...VARIATIONS.filter((v) => v.class === 'majeure').map((v) => ({ n: v.n!, nature: v.nature })),
  // Filet « Autre » : variation non répertoriée (l'annexe N°2 est non exhaustive).
  { n: OTHER_REF, nature: { fr: 'Variation non répertoriée', en: 'Unlisted variation' } },
]

/**
 * `<select>` natif PREMIUM : on GARDE l'UX liste déroulante (a11y-excellente, picker natif mobile,
 * la liste ouverte est gérée par l'OS — jamais de débordement dans la page) mais on neutralise la
 * flèche système (`appearance-none`) au profit d'un chevron maison cohérent avec le design system.
 * Largeur portée par le parent (`w-full` ici) → triggers compacts et alignés. La place du chevron
 * est réservée par `pr-7`.
 */
function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full cursor-pointer appearance-none rounded-md border py-0 pr-7 pl-2 text-sm outline-none focus-visible:ring-[3px]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
        aria-hidden
      />
    </div>
  )
}

/**
 * Multi-sélecteur de variations : MENU DÉROULANT À CASES À COCHER (Radix DropdownMenu). Conserve
 * l'UX liste déroulante (clic → la liste se déroule) MAIS permet de cocher UNE OU PLUSIEURS natures
 * d'un coup — le menu RESTE OUVERT entre les coches (`onSelect` preventDefault). Liste BORNÉE
 * (largeur fixe ≤ écran, `max-h` scrollable, texte enroulé) → jamais de débordement. Trigger =
 * bouton premium (même style que `NativeSelect`) affichant le nombre de sélections de CE type.
 */
function MultiVariantSelect({
  ariaLabel,
  options,
  selected,
  onToggle,
}: {
  ariaLabel: string
  options: VariantOption[]
  selected: number[]
  onToggle: (n: number) => void
}) {
  const { t } = useI18n()
  const count = options.filter((o) => selected.includes(o.n)).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
        >
          <span className={cn('truncate', !count && 'text-muted-foreground')}>
            {count
              ? t({ fr: `${count} choisie(s)`, en: `${count} selected` })
              : t({ fr: 'Choisir…', en: 'Choose…' })}
          </span>
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-72 max-w-[calc(100vw-1rem)]">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.n}
            checked={selected.includes(o.n)}
            onCheckedChange={() => onToggle(o.n)}
            onSelect={(e) => e.preventDefault()}
            className="items-start text-xs leading-snug whitespace-normal"
          >
            <span className="text-muted-foreground tabular-nums">{o.n || '+'}. </span>
            {t(o.nature)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Flux Bibliothèque « Lettre de variation » (classique RIM) :
 *  - **Header compact + responsive** (aligné sur `LetterEditor`) : Catalogue · Pays cible · variation
 *    mineure | majeure (`MultiVariantSelect`, multi-coche) · En-tête & signature — tout sur UNE ligne.
 *    Bouton **Réinitialiser**. N°/date d'AMM + Ville/Date = cases REMPLISSABLES du formulaire.
 *  - **Corps en deux onglets** : « Lettre » (= `VariationLetterEditor`, formulaire à cases A4) et
 *    « Tableau » (tableau comparatif). Le formulaire **reflète à l'identique** l'export.
 *  - **Download** = lettre **+** tableau en annexe, combinés dans un seul PDF/DOCX.
 * Réinitialiser ne touche QUE l'état LOCAL (jamais la fiche produit). Self-contained, hors-ligne.
 */
export function VariationLetterFlow({ onBack }: { onBack: () => void }) {
  const { t, lang: appLang } = useI18n()
  const orgId = useOrgId()
  const { user } = useAuth()
  const userId = user?.id ?? 'local'
  const products = useLiveQuery(() => listProducts(orgId), [orgId])
  const branding = useLiveQuery(() => getOrgBranding(orgId), [orgId])
  const signature = useLiveQuery(() => getUserSignature(userId), [userId])

  const [docLang, setDocLang] = useState<Lang>(appLang)
  const [fields, setFields] = useState<LetterFields>(emptyLetterFields())
  const [productId, setProductId] = useState('')
  const [refs, setRefs] = useState<number[]>([])
  const [items, setItems] = useState<VariationItem[]>([])
  const [tab, setTab] = useState('lettre')
  const [popupOpen, setPopupOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const product = products?.find((p) => p.id === productId)

  const effectiveFields = (): LetterFields => ({
    ...fields,
    poste: fields.poste || branding?.poste || '',
    signataire: fields.signataire || branding?.signataire || '',
  })
  const letterBrand = (): LetterBrand => ({
    headerImage: branding?.headerImage ?? null,
    footerImage: branding?.footerImage ?? null,
    signatureImage: signature?.signatureImage ?? null,
  })
  // Natures localisées (docLang) — l'éditeur ET l'export lisent la même source → affiché = exporté.
  const langItems = (): VariationItem[] =>
    items.map((it) => {
      const v = lookupVariation(it.ref)
      return v ? { ...it, nature: v.nature[docLang] } : it
    })
  const request = (): VariationRequest => ({
    title: '',
    fields: effectiveFields(),
    items: langItems(),
    groupingRuleIndex: null,
  })
  // Tableau d'annexe = tableau comparatif, titré « Annexe — Tableau de variation ».
  const annexTable = () => ({
    ...buildComparisonTable(request(), docLang),
    title: docLang === 'en' ? 'ANNEX — VARIATION TABLE' : 'ANNEXE — TABLEAU DE VARIATION',
  })

  const base = () => sanitize(fields.nomCommercial)

  const setField = (k: keyof LetterFields, v: string) => setFields((f) => ({ ...f, [k]: v }))

  async function pickProduct(id: string) {
    setProductId(id)
    const p = products?.find((x) => x.id === id)
    if (p) {
      setFields((f) => ({ ...f, ...productToLetterFields(p) }))
      // Réamorce la colonne « ancien » du tableau depuis la fiche produit (saisies préservées).
      setItems((cur) => seedVariationItems(refs, p, cur))
    }
    const ammDoc = await getAmmDocument(id)
    if (ammDoc)
      setFields((f) => ({
        ...f,
        ammNumero: ammDoc.reference ?? f.ammNumero,
        ammDateDelivrance: ammDoc.issueDate ?? f.ammDateDelivrance,
      }))
  }

  // Coche/décoche une variation (multi-sélection) → réamorce la colonne « ancien » du tableau
  // comparatif depuis la fiche produit (saisies existantes préservées). PAS de popup auto (≠ l'ancien
  // « ajouter » 1-par-1) : l'utilisateur coche librement UNE OU PLUSIEURS natures, puis remplit.
  function toggleVariation(n: number) {
    const next = refs.includes(n) ? refs.filter((r) => r !== n) : [...refs, n]
    setRefs(next)
    setItems((cur) => seedVariationItems(next, product, cur))
  }

  // Bascule en-tête / pied / signature (insertion 1-clic depuis le profil) — flags stockés dans
  // `fields`, lus par l'éditeur pour afficher les images. Bouton désactivé si l'image manque.
  const flag = (k: keyof LetterFields) => fields[k] === '1'
  const toggleFlag = (k: keyof LetterFields) => setField(k, fields[k] === '1' ? '' : '1')
  const insertBtn = (
    k: keyof LetterFields,
    img: string | null | undefined,
    label: { fr: string; en: string },
  ) => (
    <button
      type="button"
      disabled={!img && !flag(k)}
      onClick={() => toggleFlag(k)}
      aria-pressed={flag(k)}
      title={img ? undefined : t({ fr: 'À définir dans le profil', en: 'Set in profile' })}
      className={cn(
        'h-8 rounded-md border px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
        flag(k) && img
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground',
      )}
    >
      {t(label)}
    </button>
  )

  // Réinitialiser le formulaire (champs + variants + tableau) → état vide LOCAL. N'altère JAMAIS la
  // fiche produit du catalogue : les formulaires LISENT le produit (productToLetterFields) et n'y
  // écrivent rien (contrainte #5 CEO). Le choix produit est aussi remis à zéro.
  function resetForm() {
    if (
      !window.confirm(
        t({
          fr: 'Tout effacer le contenu de cette lettre ?',
          en: 'Clear all content in this letter?',
        }),
      )
    )
      return
    setFields(emptyLetterFields())
    setProductId('')
    setRefs([])
    setItems([])
    toast.success(t({ fr: 'Lettre réinitialisée', en: 'Letter reset' }), {
      description: t({ fr: 'Tous les champs ont été vidés.', en: 'All fields cleared.' }),
    })
  }

  async function downloadCombined(kind: 'pdf' | 'docx') {
    setBusy(true)
    try {
      const doc = buildVariationLetterDoc(request(), docLang)
      const table = annexTable()
      if (kind === 'pdf') {
        const { combinedVariationPdfBytes } = await import('./variation-combined')
        const bytes = await combinedVariationPdfBytes(doc, table, letterBrand())
        triggerDownload(
          URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })),
          `${base()}_variation.pdf`,
          true,
        )
      } else {
        const { combinedVariationDocxBlob } = await import('./variation-combined')
        triggerDownload(
          URL.createObjectURL(await combinedVariationDocxBlob(doc, table, letterBrand())),
          `${base()}_variation.docx`,
          true,
        )
      }
    } catch (e) {
      console.error(e)
      toast.error(t({ fr: 'Échec du téléchargement', en: 'Download failed' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      {/* Header : retour + titre + langue + Download combiné (lettre + annexe). */}
      <div className="bg-background sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b py-2">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> {t({ fr: 'Bibliothèque', en: 'Library' })}
        </button>
        <span className="text-sm font-medium">
          {t({ fr: 'Lettre de variation', en: 'Variation Letter' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center gap-1 rounded-md border p-0.5"
            role="group"
            aria-label={t({ fr: 'Langue du document', en: 'Document language' })}
          >
            <Languages className="text-muted-foreground ml-1 size-3.5" aria-hidden />
            {(['fr', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setDocLang(l)}
                aria-pressed={docLang === l}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium uppercase transition',
                  docLang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={resetForm}
            title={t({ fr: 'Tout effacer', en: 'Clear all' })}
          >
            <RotateCcw className="size-4" />
            <span className="hidden sm:inline">{t({ fr: 'Réinitialiser', en: 'Reset' })}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={() => void downloadCombined('pdf')}
            title={t({ fr: 'Lettre + tableau en annexe', en: 'Letter + table annex' })}
          >
            <FileText className="size-4" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={() => void downloadCombined('docx')}
            title={t({ fr: 'Lettre + tableau en annexe', en: 'Letter + table annex' })}
          >
            <FileDown className="size-4" /> DOCX
          </Button>
        </div>
      </div>

      {/* Header de configuration COMPACT + RESPONSIVE (comme les autres templates) : barre
          `bg-muted/40 p-3`, GRILLE 2 colonnes sur mobile → rangée `flex-wrap` sur desktop (≥sm) ;
          chaque contrôle REMPLIT sa cellule (`w-full` + label `min-w-0`) → NE DÉBORDE JAMAIS.
          Produit · pays = `<select>` natifs PREMIUM (un seul choix). Variation mineure | majeure =
          `MultiVariantSelect` (menu déroulant À CASES → cocher UNE OU PLUSIEURS natures d'un coup,
          de différents types). Tout n'est que RACCOURCI ; N° d'AMM/date = cases du formulaire. */}
      <div className="bg-muted/40 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-col gap-1 text-xs sm:w-36">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Catalogue', en: 'Catalogue' })}
          </span>
          <NativeSelect
            value={productId}
            onChange={(e) => void pickProduct(e.target.value)}
            aria-label={t({ fr: 'Choisir un produit', en: 'Choose a product' })}
          >
            <option value="">
              {(products ?? []).length
                ? t({ fr: 'Choisir…', en: 'Choose…' })
                : t({ fr: 'Aucun produit', en: 'No product' })}
            </option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomCommercial}
                {p.dci ? ` (${p.dci})` : ''}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs sm:w-32">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Pays cible', en: 'Target country' })}
          </span>
          <NativeSelect
            value={fields.country}
            onChange={(e) => setField('country', e.target.value)}
            aria-label={t({ fr: 'Pays cible', en: 'Target country' })}
          >
            <option value="">{t({ fr: 'Choisir un pays', en: 'Choose a country' })}</option>
            {UEMOA_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs sm:w-32">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Variation mineure', en: 'Minor variation' })}
          </span>
          <MultiVariantSelect
            ariaLabel={t({
              fr: 'Choisir une ou plusieurs variations mineures',
              en: 'Select one or more minor variations',
            })}
            options={MINEURE_OPTS}
            selected={refs}
            onToggle={toggleVariation}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs sm:w-32">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Variation majeure', en: 'Major variation' })}
          </span>
          <MultiVariantSelect
            ariaLabel={t({
              fr: 'Choisir une ou plusieurs variations majeures',
              en: 'Select one or more major variations',
            })}
            options={MAJEURE_OPTS}
            selected={refs}
            onToggle={toggleVariation}
          />
        </label>

        {/* En-tête & signature : sur la MÊME ligne que les autres contrôles (comme LetterEditor),
            boutons `h-8` → même hauteur que les selects. Bascule les flags useHeader/Pied/Signature
            (insertion 1-clic des images du profil). Pleine largeur sur mobile (col-span-2). */}
        <div className="col-span-2 flex min-w-0 flex-col gap-1 text-xs sm:w-auto">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'En-tête & signature', en: 'Letterhead & signature' })}
          </span>
          <div className="flex h-8 items-center gap-1">
            {insertBtn('useHeader', branding?.headerImage, { fr: 'En-tête', en: 'Header' })}
            {insertBtn('useFooter', branding?.footerImage, { fr: 'Pied', en: 'Footer' })}
            {insertBtn('useSignature', signature?.signatureImage, {
              fr: 'Signature',
              en: 'Signature',
            })}
          </div>
        </div>
      </div>

      {/* Variations choisies (chips, suppression) + raccourci pour rouvrir la popup. */}
      {refs.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {refs.map((r) => (
            <span
              key={r}
              className="bg-primary/5 border-primary/30 inline-flex max-w-full items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-xs"
            >
              <span className="text-muted-foreground tabular-nums">{r || '+'}.</span>
              <span className="max-w-[16rem] truncate">
                {t(lookupVariation(r)?.nature ?? { fr: '', en: '' })}
              </span>
              <button
                type="button"
                onClick={() => toggleVariation(r)}
                aria-label={t({ fr: 'Retirer', en: 'Remove' })}
                className="hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring rounded-full p-0.5 focus-visible:ring-2 focus-visible:outline-none"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setPopupOpen(true)}
          >
            <Plus className="size-3.5" /> {t({ fr: 'Remplir le tableau', en: 'Fill the table' })}
          </Button>
        </div>
      ) : null}

      {/* Corps : deux onglets — Lettre (formulaire A4 à cases) | Tableau comparatif. */}
      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <TabsList>
          <TabsTrigger value="lettre">{t({ fr: 'Lettre', en: 'Letter' })}</TabsTrigger>
          <TabsTrigger value="tableau">
            {t({ fr: 'Tableau', en: 'Table' })}
            {items.length ? ` (${items.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lettre">
          {/* Formulaire à cases TOUJOURS affiché (≠ dépendre d'un produit/variation) : l'utilisateur
              remplit à la main, ou les boutons/sélecteurs du header pré-remplissent pour aller vite. */}
          <VariationLetterEditor
            fields={effectiveFields()}
            natures={langItems().map((i) => i.nature)}
            variationClass={requestClass(items)}
            lang={docLang}
            onChange={setFields}
            headerImage={branding?.headerImage}
            footerImage={branding?.footerImage}
            signatureImage={signature?.signatureImage}
          />
        </TabsContent>

        <TabsContent value="tableau">
          <VariationTableSheet
            items={items}
            natures={langItems().map((i) => i.nature)}
            onChange={setItems}
            fields={effectiveFields()}
            title={docLang === 'en' ? 'ANNEX — VARIATION TABLE' : 'ANNEXE — TABLEAU DE VARIATION'}
            lang={docLang}
          />
        </TabsContent>
      </Tabs>

      {/* Popup tableau (sans picker) — ouverte au choix d'une variation dans la liste déroulante. */}
      <VariationTableDialog
        open={popupOpen}
        onOpenChange={setPopupOpen}
        refs={refs}
        product={product}
        initialItems={items}
        showPicker={false}
        onCommit={(_refs, next) => setItems(next)}
      />
    </div>
  )
}
