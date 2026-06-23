import { lazy, Suspense, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { JSONContent } from '@tiptap/core'
import { ArrowLeft, FileDown, FileText, Languages, Plus, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  seedVariationItems,
  type VariationItem,
  type VariationRequest,
} from './variation-request'
import { buildComparisonTable } from './variation-table'
import { buildVariationLetterDoc } from './variation-letter'
import { VariationTableDialog } from './VariationTableDialog'
import { VariationTableForm } from './VariationTableForm'

const RichTextEditor = lazy(() =>
  import('@/features/workspace/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
)

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
 *  - **Corps en deux onglets** : « Lettre » (éditable in-place, TipTap A4 — onglet par défaut) et
 *    « Tableau » (formulaire du tableau comparatif).
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
  // Lettre éditable in-place : `letterDoc` = contenu courant (null → (re)généré depuis les champs).
  const [letterDoc, setLetterDoc] = useState<JSONContent | null>(null)
  const [genId, setGenId] = useState(0)

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
  const request = (): VariationRequest => ({
    title: '',
    fields: effectiveFields(),
    items,
    groupingRuleIndex: null,
  })
  // Tableau d'annexe = tableau comparatif, titré « Annexe — Tableau de variation ».
  const annexTable = () => ({
    ...buildComparisonTable(request(), docLang),
    title: docLang === 'en' ? 'ANNEX — VARIATION TABLE' : 'ANNEXE — TABLEAU DE VARIATION',
  })

  const base = () => sanitize(fields.nomCommercial)
  const ready =
    refs.length > 0 && fields.nomCommercial.trim().length > 0 && fields.country.length > 0

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

  // (Re)génère la lettre depuis les champs courants (langue active) — repart d'un document neuf.
  function regenLetter() {
    setLetterDoc(null)
    setGenId((g) => g + 1)
  }
  function changeLang(l: Lang) {
    setDocLang(l)
    // Ne régénère QUE si la lettre n'a pas été éditée (sinon on préserve les saisies — le bouton
    // « Régénérer » reste la voie explicite pour reconstruire dans la nouvelle langue).
    if (letterDoc === null) setGenId((g) => g + 1)
  }

  // Document de la lettre affiché = document exporté (source unique) : édité si présent, sinon généré.
  function initialDoc(): JSONContent {
    return letterDoc ?? buildVariationLetterDoc(request(), docLang)
  }

  async function downloadCombined(kind: 'pdf' | 'docx') {
    setBusy(true)
    try {
      const doc = initialDoc()
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
                onClick={() => changeLang(l)}
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
            disabled={busy || !ready}
            onClick={() => void downloadCombined('pdf')}
            title={t({ fr: 'Lettre + tableau en annexe', en: 'Letter + table annex' })}
          >
            <FileText className="size-4" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy || !ready}
            onClick={() => void downloadCombined('docx')}
            title={t({ fr: 'Lettre + tableau en annexe', en: 'Letter + table annex' })}
          >
            <FileDown className="size-4" /> DOCX
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Renseignez le produit, le pays, le N° d’AMM et la (les) variation(s) ci-dessous, puis éditez la lettre. Le téléchargement exporte la lettre suivie du tableau comparatif en annexe.',
          en: 'Fill the product, country, MA number and variation(s) below, then edit the letter. The download exports the letter followed by the comparison table as an annex.',
        })}
      </p>

      {/* Sessions alignées : produit · pays · AMM · sélecteur de variation. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t({ fr: 'Produit', en: 'Product' })}>
          <Select value={productId} onValueChange={(id) => void pickProduct(id)}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={fields.nomCommercial || t({ fr: 'Choisir…', en: 'Choose…' })}
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
        <Field label={t({ fr: 'Pays cible', en: 'Target country' })}>
          <Select value={fields.country} onValueChange={(v) => setField('country', v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t({ fr: 'Choisir un pays', en: 'Choose a country' })} />
            </SelectTrigger>
            <SelectContent>
              {UEMOA_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t({ fr: 'N° d’AMM', en: 'MA number' })}>
          <Input
            value={fields.ammNumero}
            onChange={(e) => setField('ammNumero', e.target.value)}
            placeholder="AMM_2015_7457"
          />
        </Field>
        <Field label={t({ fr: 'Date d’octroi', en: 'Grant date' })}>
          <Input
            type="date"
            value={fields.ammDateDelivrance}
            onChange={(e) => setField('ammDateDelivrance', e.target.value)}
          />
        </Field>
        <Field label={t({ fr: 'Ajouter une variation', en: 'Add a variation' })}>
          <Select value="" onValueChange={(v) => addVariation(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t({ fr: 'Choisir une nature…', en: 'Choose a type…' })} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t({ fr: 'Variation mineure', en: 'Minor variation' })}</SelectLabel>
                {MINEURES.map((v) => (
                  <SelectItem key={v.n} value={String(v.n)} disabled={refs.includes(v.n!)}>
                    {v.n}. {t(v.nature)}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{t({ fr: 'Variation majeure', en: 'Major variation' })}</SelectLabel>
                {MAJEURES.map((v) => (
                  <SelectItem key={v.n} value={String(v.n)} disabled={refs.includes(v.n!)}>
                    {v.n}. {t(v.nature)}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectItem value={String(OTHER_REF)} disabled={refs.includes(OTHER_REF)}>
                  {t({ fr: 'Autre — variation non répertoriée', en: 'Other — unlisted variation' })}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
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

      {/* Corps : deux onglets — Lettre (éditable) | Tableau comparatif. */}
      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <TabsList>
          <TabsTrigger value="lettre">{t({ fr: 'Lettre', en: 'Letter' })}</TabsTrigger>
          <TabsTrigger value="tableau">
            {t({ fr: 'Tableau', en: 'Table' })}
            {items.length ? ` (${items.length})` : ''}
          </TabsTrigger>
        </TabsList>

        {/* forceMount : l'éditeur reste monté en changeant d'onglet (curseur / défilement / undo préservés). */}
        <TabsContent value="lettre" forceMount>
          {ready ? (
            <div className="flex flex-col gap-2">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={regenLetter}
                  title={t({
                    fr: 'Régénérer la lettre depuis les champs',
                    en: 'Regenerate the letter from the fields',
                  })}
                >
                  <RotateCcw className="size-3.5" /> {t({ fr: 'Régénérer', en: 'Regenerate' })}
                </Button>
              </div>
              <Suspense
                fallback={
                  <p className="text-muted-foreground p-2 text-sm">
                    {t({ fr: 'Chargement…', en: 'Loading…' })}
                  </p>
                }
              >
                <RichTextEditor
                  docId={`var-letter-${genId}`}
                  initialContent={initialDoc()}
                  editable
                  onChange={setLetterDoc}
                  header={branding?.headerImage ?? null}
                  footer={branding?.footerImage ?? null}
                />
              </Suspense>
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              {t({
                fr: 'Choisissez un produit, un pays et au moins une variation pour éditer la lettre.',
                en: 'Pick a product, a country and at least one variation to edit the letter.',
              })}
            </p>
          )}
        </TabsContent>

        <TabsContent value="tableau">
          <VariationTableForm
            items={items}
            onChange={setItems}
            emptyHint={t({
              fr: 'Ajoutez une variation ci-dessus pour remplir le tableau comparatif.',
              en: 'Add a variation above to fill the comparison table.',
            })}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
