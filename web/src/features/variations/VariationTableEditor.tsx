import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'
import { FileDown, FileText, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { ProductRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { triggerDownload } from '@/features/workspace/download-utils'
import { updateDossierVariation } from '@/features/workspace/dossier-repository'
import { emptyLetterFields, type LetterFields } from '@/features/workspace/letter-context'
import { seedVariationItems, type VariationItem, type VariationRequest } from './variation-request'
import { buildComparisonTable } from './variation-table'
import { VariationTableSheet } from './VariationTableSheet'

const sanitize = (s: string) =>
  (s || 'variation')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)

/** Dossier minimal consommé par l'éditeur (sous-ensemble de DossierRecord). */
interface DossierLike {
  id: string
  productName: string
  country: string
  variations?: number[]
  variationItems?: unknown
  ammNumero?: string
}

/** Contrôles remontés dans la barre d'actions du dossier (parité lettre — `controlsInBar`). */
export interface VariationTableHandle {
  pdf: () => void
  docx: () => Promise<void>
  save: () => Promise<void>
}

/**
 * Éditeur **inline** du tableau comparatif (nœud 1.4.1 d'un dossier de variation) : lignes = variations
 * cochées, colonne « ancien » préremplie si Pharnos a la donnée, « nouveau »/justification à saisir.
 * Persiste sur le dossier et télécharge l'**annexe** PDF/DOCX (vrai A4, renderers partagés). Le moteur
 * de compilation n'est pas touché. `controlsInBar` : PDF/DOCX/Enregistrer remontés dans l'en-tête de
 * document (mêmes boutons que la lettre) → la feuille ne porte plus de case-formulaire (AMM édité inline).
 */
export function VariationTableEditor({
  dossier,
  product,
  controlsInBar = false,
  ref,
}: {
  dossier: DossierLike
  product?: ProductRecord
  controlsInBar?: boolean
  ref?: Ref<VariationTableHandle>
}) {
  const { t } = useI18n()
  const refs = dossier.variations ?? []
  const [items, setItems] = useState<VariationItem[]>(() =>
    seedVariationItems(refs, product, dossier.variationItems as VariationItem[] | undefined),
  )
  const [amm, setAmm] = useState(dossier.ammNumero ?? '')
  const [busy, setBusy] = useState(false)

  const fields: LetterFields = useMemo(
    () => ({
      ...emptyLetterFields(dossier.country),
      nomCommercial: product?.nomCommercial ?? dossier.productName,
      dci: product?.dci ?? '',
      ammNumero: amm,
    }),
    [dossier.country, dossier.productName, product, amm],
  )
  const request: VariationRequest = useMemo(
    () => ({ title: '', fields, items, groupingRuleIndex: null }),
    [fields, items],
  )

  // Auto-save (offline-first) : l'utilisateur édite DIRECTEMENT la feuille (cellules + AMM inline) →
  // sauvegarde débouncée + flush au démontage, comme TemplateFillForm. Aucune saisie perdue au
  // changement d'onglet/section. Le bouton « Enregistrer » force une sauvegarde immédiate (+ toast).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ items: VariationItem[]; amm: string } | null>(null)
  const busyRef = useRef(false) // garde anti-réentrance (double-clic sur les boutons de l'en-tête).

  const persist = useCallback(
    async (its: VariationItem[], a: string) => {
      pending.current = null
      try {
        await updateDossierVariation(dossier.id, { variationItems: its, ammNumero: a })
      } catch (e) {
        console.error(e)
      }
    },
    [dossier.id],
  )

  // Débounce sur chaque édition (700 ms) — saute le rendu initial (seed depuis le dossier).
  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true
      return
    }
    pending.current = { items, amm }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (pending.current) void persist(pending.current.items, pending.current.amm)
    }, 700)
  }, [items, amm, persist])

  // Flush au démontage (changement de section/onglet, navigation) — zéro saisie perdue.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pending.current) void persist(pending.current.items, pending.current.amm)
    },
    [persist],
  )

  // Sauvegarde immédiate (bouton d'en-tête) : annule l'auto-save en attente puis confirme (toast).
  const save = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pending.current = null
    setBusy(true)
    try {
      await updateDossierVariation(dossier.id, { variationItems: items, ammNumero: amm })
      toast.success(t({ fr: 'Tableau enregistré', en: 'Table saved' }))
    } catch (e) {
      console.error(e)
      toast.error(t({ fr: 'Échec de l’enregistrement', en: 'Save failed' }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [dossier.id, items, amm, t])

  const download = useCallback(
    async (kind: 'pdf' | 'docx') => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      const name = sanitize(product?.nomCommercial ?? dossier.productName)
      try {
        if (kind === 'pdf') {
          const { comparisonPdfBytes } = await import('./variation-table-pdf')
          const bytes = await comparisonPdfBytes(buildComparisonTable(request, 'fr'))
          triggerDownload(
            URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })),
            `${name}_tableau_comparatif.pdf`,
            true,
          )
        } else {
          const { comparisonDocxBlob } = await import('./variation-table-docx')
          const blob = await comparisonDocxBlob(buildComparisonTable(request, 'fr'))
          triggerDownload(URL.createObjectURL(blob), `${name}_tableau_comparatif.docx`, true)
        }
      } catch (e) {
        console.error(e)
        toast.error(t({ fr: 'Échec du téléchargement', en: 'Download failed' }))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [request, product, dossier.productName, t],
  )

  // Remonte PDF/DOCX/Enregistrer au parent (en-tête de document) — recréé à chaque rendu pour
  // capturer l'état frais (items/amm). Cf. `controlsInBar`.
  useImperativeHandle(
    ref,
    () => ({
      pdf: () => void download('pdf'),
      docx: () => download('docx'),
      save,
    }),
    [download, save],
  )

  if (refs.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({
          fr: 'Aucune variation cochée sur ce dossier — revenez à la création pour en sélectionner.',
          en: 'No variation selected on this dossier — go back to creation to pick some.',
        })}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Repli (sans `controlsInBar`) : barre locale PDF/DOCX/Enregistrer. Dans le CTD builder, ces
          actions vivent dans l'en-tête de document (mêmes boutons que la lettre) → barre masquée. */}
      {!controlsInBar ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={busy}
            onClick={() => void download('pdf')}
          >
            <FileText className="size-4" /> PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={busy}
            onClick={() => void download('docx')}
          >
            <FileDown className="size-4" /> DOCX
          </Button>
          <Button size="sm" className="h-8" disabled={busy} onClick={() => void save()}>
            <Save className="size-4" /> {t({ fr: 'Enregistrer', en: 'Save' })}
          </Button>
        </div>
      ) : null}

      {/* Document A4 éditable du tableau comparatif (annexe) — cellules ancien/nouveau/justif + N°
          d'AMM saisis directement sur la feuille (pas de case-formulaire séparée). */}
      <VariationTableSheet
        items={items}
        natures={items.map((it) => it.nature)}
        onChange={setItems}
        fields={fields}
        title="ANNEXE — TABLEAU DE VARIATION"
        lang="fr"
        onAmmChange={setAmm}
      />
    </div>
  )
}
