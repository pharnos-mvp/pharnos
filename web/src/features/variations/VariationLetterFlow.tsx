import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, FileDown, FileText, Languages, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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

const MINEURES = VARIATIONS.filter((v) => v.class === 'mineure')
const MAJEURES = VARIATIONS.filter((v) => v.class === 'majeure')

/**
 * Flux Bibliothèque « Lettre de variation » (classique RIM) :
 *  - **Header** : sessions alignées — produit (catalogue) · pays · N°/date d'AMM · **sélecteur de
 *    variation** (liste déroulante mineure/majeure ; le choix ouvre la **popup tableau** à remplir).
 *  - **Corps en deux onglets** : « Lettre » (= `VariationLetterEditor`, **formulaire à cases sur
 *    feuille A4**, auto-rempli par le header — comme les autres lettres) et « Tableau » (tableau
 *    comparatif). Le formulaire **reflète à l'identique** l'export → affiché = exporté.
 *  - **Download** = la lettre **et** le tableau en annexe, **combinés** dans un seul PDF/DOCX.
 * N°/date d'AMM pré-remplis depuis le doc AMM du produit. Self-contained, hors-ligne.
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

  // Ajoute une variation (depuis la liste déroulante) → réamorce le tableau + ouvre la popup à remplir.
  function addVariation(n: number) {
    const next = refs.includes(n) ? refs : [...refs, n]
    setRefs(next)
    setItems((cur) => seedVariationItems(next, product, cur))
    setPopupOpen(true)
  }
  function removeVariation(n: number) {
    const next = refs.filter((r) => r !== n)
    setRefs(next)
    setItems((cur) => seedVariationItems(next, product, cur))
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

      {/* Header de configuration COMPACT sur UNE SEULE LIGNE (comme les autres templates) : barre
          `bg-muted/40 p-3`, `<select>` NATIFS `h-8` (a11y-excellents, picker natif mobile, focus-ring
          du design system), `flex-nowrap` + `overflow-x-auto`. Variables : produit · pays · DEUX
          sélecteurs de variation (mineure | majeure). Le N° d'AMM et la date se saisissent dans les
          cases du formulaire (pré-remplies par le choix du produit). Tout n'est que RACCOURCI. */}
      <div className="bg-muted/40 flex flex-nowrap items-end gap-2 overflow-x-auto rounded-lg border p-3">
        <label className="flex shrink-0 flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Produit', en: 'Product' })}
          </span>
          <select
            value={productId}
            onChange={(e) => void pickProduct(e.target.value)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-40 cursor-pointer rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
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
          </select>
        </label>

        <label className="flex shrink-0 flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Pays cible', en: 'Target country' })}
          </span>
          <select
            value={fields.country}
            onChange={(e) => setField('country', e.target.value)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-36 cursor-pointer rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
            aria-label={t({ fr: 'Pays cible', en: 'Target country' })}
          >
            <option value="">{t({ fr: 'Choisir un pays', en: 'Choose a country' })}</option>
            {UEMOA_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex shrink-0 flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Variation mineure', en: 'Minor variation' })}
          </span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addVariation(Number(e.target.value))
            }}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-40 cursor-pointer rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
            aria-label={t({ fr: 'Ajouter une variation mineure', en: 'Add a minor variation' })}
          >
            <option value="">{t({ fr: 'Choisir…', en: 'Choose…' })}</option>
            {MINEURES.map((v) => (
              <option key={v.n} value={v.n!} disabled={refs.includes(v.n!)}>
                {v.n}. {t(v.nature)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex shrink-0 flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Variation majeure', en: 'Major variation' })}
          </span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addVariation(Number(e.target.value))
            }}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-40 cursor-pointer rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
            aria-label={t({ fr: 'Ajouter une variation majeure', en: 'Add a major variation' })}
          >
            <option value="">{t({ fr: 'Choisir…', en: 'Choose…' })}</option>
            {MAJEURES.map((v) => (
              <option key={v.n} value={v.n!} disabled={refs.includes(v.n!)}>
                {v.n}. {t(v.nature)}
              </option>
            ))}
            <optgroup label={t({ fr: 'Autre', en: 'Other' })}>
              <option value={OTHER_REF} disabled={refs.includes(OTHER_REF)}>
                {t({ fr: 'Variation non répertoriée', en: 'Unlisted variation' })}
              </option>
            </optgroup>
          </select>
        </label>
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
                onClick={() => removeVariation(r)}
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
