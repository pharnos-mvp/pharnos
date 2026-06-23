import { lazy, Suspense, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { JSONContent } from '@tiptap/core'
import { ArrowLeft, FileDown, FileText, Languages, PencilLine, Table } from 'lucide-react'
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
import { lookupVariation, type VariationItem, type VariationRequest } from './variation-request'
import { buildComparisonTable } from './variation-table'
import { buildVariationLetterDoc } from './variation-letter'
import { VariationPicker } from './VariationPicker'

const RichTextEditor = lazy(() =>
  import('@/features/workspace/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
)

const sanitize = (s: string) =>
  (s || 'variation')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)

/**
 * Flux Bibliothèque « Lettre de variation ». Deux phases :
 *  1. **Formulaire** : sélecteur de natures + produit (catalogue) + pays + N°/date d'octroi d'AMM ;
 *     un **aperçu compact** du tableau comparatif (annexe) avec les natures déjà renseignées, à
 *     **télécharger** puis compléter (ancien/nouveau) dans le document. (L'édition en place du tableau
 *     vit dans le dossier — nœud 1.4.1.)
 *  2. **Lettre ÉDITABLE in-place** (TipTap, feuille A4) → export PDF/DOCX (moteur de lettres partagé).
 * N°/date d'AMM pré-remplis depuis le doc AMM du produit. Self-contained.
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
  const [refs, setRefs] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  // Phase 2 : édition in-place de la lettre générée.
  const [letterDoc, setLetterDoc] = useState<JSONContent | null>(null)
  const [genId, setGenId] = useState(0)

  // Items du tableau : natures cochées (l'ancien/nouveau se complète dans le document téléchargé).
  const items: VariationItem[] = refs.map((r) => {
    const v = lookupVariation(r)
    return {
      ref: r,
      nature: v ? v.nature[docLang] : '',
      class: v?.class ?? 'majeure',
      rubrique: '',
      before: '',
      after: '',
      justification: '',
    }
  })

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

  const base = () => sanitize(fields.nomCommercial)
  const ready =
    refs.length > 0 && fields.nomCommercial.trim().length > 0 && fields.country.length > 0
  const table = refs.length ? buildComparisonTable(request(), docLang) : null

  const setField = (k: keyof LetterFields, v: string) => setFields((f) => ({ ...f, [k]: v }))

  async function pickProduct(id: string) {
    const p = products?.find((x) => x.id === id)
    if (p) setFields((f) => ({ ...f, ...productToLetterFields(p) }))
    const ammDoc = await getAmmDocument(id)
    if (ammDoc)
      setFields((f) => ({
        ...f,
        ammNumero: ammDoc.reference ?? f.ammNumero,
        ammDateDelivrance: ammDoc.issueDate ?? f.ammDateDelivrance,
      }))
  }

  function openLetter() {
    setLetterDoc(buildVariationLetterDoc(request(), docLang))
    setGenId((g) => g + 1)
  }

  async function exportTable(kind: 'pdf' | 'docx') {
    setBusy(true)
    try {
      const built = buildComparisonTable(request(), docLang)
      if (kind === 'pdf') {
        const { comparisonPdfBytes } = await import('./variation-table-pdf')
        const bytes = await comparisonPdfBytes(built)
        triggerDownload(
          URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })),
          `${base()}_tableau_comparatif.pdf`,
          true,
        )
      } else {
        const { comparisonDocxBlob } = await import('./variation-table-docx')
        triggerDownload(
          URL.createObjectURL(await comparisonDocxBlob(built)),
          `${base()}_tableau_comparatif.docx`,
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

  async function exportLetter(kind: 'pdf' | 'docx') {
    if (!letterDoc) return
    setBusy(true)
    try {
      if (kind === 'pdf') {
        const { letterPdfBytes } = await import('@/features/workspace/letter-pdf')
        const bytes = await letterPdfBytes(letterDoc, letterBrand())
        triggerDownload(
          URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })),
          `${base()}_lettre_variation.pdf`,
          true,
        )
      } else {
        const { letterDocxBlob } = await import('@/features/workspace/letter-docx')
        triggerDownload(
          URL.createObjectURL(await letterDocxBlob(letterDoc, letterBrand())),
          `${base()}_lettre_variation.docx`,
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

  // ───────────────────────── Phase 2 : lettre éditable in-place ─────────────────────────
  if (letterDoc) {
    return (
      <div className="flex flex-col gap-3 pt-4">
        <div className="bg-background sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b py-2">
          <button
            type="button"
            onClick={() => setLetterDoc(null)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> {t({ fr: 'Formulaire', en: 'Form' })}
          </button>
          <span className="text-sm font-medium">
            {t({ fr: 'Lettre de variation (édition)', en: 'Variation letter (editing)' })}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => void exportLetter('pdf')}
            >
              <FileText className="size-4" /> PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => void exportLetter('docx')}
            >
              <FileDown className="size-4" /> DOCX
            </Button>
          </div>
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
            initialContent={letterDoc}
            editable
            onChange={setLetterDoc}
            header={branding?.headerImage ?? null}
            footer={branding?.footerImage ?? null}
          />
        </Suspense>
      </div>
    )
  }

  // ───────────────────────── Phase 1 : formulaire + aperçu de l'annexe ─────────────────────────
  return (
    <div className="flex flex-col gap-4 pt-4">
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
          <div className="inline-flex items-center gap-1 rounded-md border p-0.5" role="group">
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
            disabled={busy || !ready}
            onClick={() => void exportTable('pdf')}
            title={t({ fr: 'Annexe : tableau comparatif', en: 'Annex: comparison table' })}
          >
            <Table className="size-4" /> {t({ fr: 'Annexe', en: 'Annex' })}
          </Button>
          <Button size="sm" className="h-8" disabled={!ready} onClick={openLetter}>
            <PencilLine className="size-4" /> {t({ fr: 'Ouvrir la lettre', en: 'Open letter' })}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Cochez la (les) variation(s), choisissez le produit, le pays et le N° d’AMM, puis ouvrez la lettre pour l’éditer et l’exporter. Le tableau comparatif (annexe) se télécharge pré-rempli des natures ; complétez l’ancien/nouveau dans le document.',
          en: 'Tick the variation(s), choose the product, country and MA number, then open the letter to edit and export it. The comparison table (annex) downloads pre-filled with the variation natures; complete the old/new values in the document.',
        })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t({ fr: 'Produit', en: 'Product' })}>
          <Select value="" onValueChange={(id) => void pickProduct(id)}>
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
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t({ fr: 'Natures de variation', en: 'Variation types' })}
          </h2>
          <span className="text-muted-foreground text-xs">
            {refs.length} {t({ fr: 'sélectionnée(s)', en: 'selected' })}
          </span>
        </div>
        <VariationPicker value={refs} onChange={setRefs} />
      </div>

      {table ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {t({ fr: 'Tableau comparatif (annexe)', en: 'Comparison table (annex)' })}
            </h2>
            <span className="text-muted-foreground text-xs">
              {t({
                fr: 'Aperçu — ancien/nouveau à compléter dans le document téléchargé',
                en: 'Preview — old/new to complete in the downloaded document',
              })}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-[11px] leading-tight">
              <thead>
                <tr>
                  {table.headers.map((h) => (
                    <th
                      key={h}
                      className="bg-muted text-foreground border px-2 py-1 text-left font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="border px-2 py-1 align-top whitespace-pre-wrap">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'Choisissez un produit, un pays et au moins une variation pour continuer.',
            en: 'Pick a product, a country and at least one variation to continue.',
          })}
        </p>
      )}
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
