import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PdfViewer } from '@/features/workspace/PdfViewer'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import type { DocumentCategory, DocumentRecord } from '@/lib/db'
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
} from '@/lib/files'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { isIssueAfterExpiry } from './doc-dates'
import { categoryForDocType, docTypesFor, requiresExpiry, type DocTypeOption } from './doc-types'
import { SOURCE_BLOB_UNAVAILABLE, sourceDocFile } from './documents-reuse'
import { SourceDocPicker, type SourceDocEntry } from './SourceDocPicker'

/**
 * Pièce en attente (buffer du wizard) — AJOUTÉE sans produit. La persistance (création du produit
 * + `addDocument`) se fait à l'enregistrement. `id` = clé locale (suppression du buffer).
 */
export interface DraftDocument {
  id: string
  category: DocumentCategory
  docType: string
  file: File
  issueDate: string | null
  expiryDate: string | null
  holder: string | null
  country: string | null
  reference: string | null
  batchNumber: string | null
  /** Pioché « depuis la base » d'une org (§2) : provenance de la copie liée, persistée à la fin. */
  sourceDocId?: string | null
  /** Langue héritée de la source piochée — un upload manuel n'en a pas (défaut 'fr' au save). */
  language?: string | null
}

/**
 * Cartes « un type = une carte » (wizard). Composant CONTRÔLÉ : l'ajout d'une pièce alimente un
 * buffer (`onAdd`) sans dépendre d'un produit ; rien n'est persisté ici. Clic « + Ajouter » →
 * ouvre la carte ET l'explorateur de fichiers.
 */
export function DocTypeCards({
  category,
  drafts,
  onAdd,
  onRemove,
  types,
  hideHolder,
  sources,
}: {
  category: DocumentCategory
  drafts: DraftDocument[]
  onAdd: (d: DraftDocument) => void
  onRemove: (id: string) => void
  /** Sous-ensemble de types proposés (matrice par rôle des orgs) — défaut : toute la catégorie. */
  types?: DocTypeOption[]
  /** Contexte ORGANISATION : le champ « Titulaire » est masqué (on est déjà chez le propriétaire). */
  hideHolder?: boolean
  /**
   * Base « piochable » (§2) : pièces org-scopées des parties sélectionnées (titulaire/fabricant).
   * Dès qu'une carte a des sources de son type, « + » propose « Depuis la base » ou « Depuis mon
   * poste ». Absent (wizard org) → comportement upload inchangé.
   */
  sources?: SourceDocEntry[]
}) {
  const shown = types ?? docTypesFor(category)
  const [openType, setOpenType] = useState<string | null>(null)

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {shown.map((type) => (
        <DocCard
          key={type.code}
          type={type}
          category={category}
          drafts={drafts.filter((d) => d.docType === type.code)}
          onAdd={onAdd}
          onRemove={onRemove}
          hideHolder={hideHolder}
          sources={sources?.filter((s) => s.doc.docType === type.code) ?? []}
          open={openType === type.code}
          onToggle={() => setOpenType((o) => (o === type.code ? null : type.code))}
        />
      ))}
    </div>
  )
}

function DocCard({
  type,
  category,
  drafts,
  onAdd,
  onRemove,
  hideHolder,
  sources,
  open,
  onToggle,
}: {
  type: DocTypeOption
  category: DocumentCategory
  drafts: DraftDocument[]
  onAdd: (d: DraftDocument) => void
  onRemove: (id: string) => void
  hideHolder?: boolean
  /** Pièces de la base DU type de cette carte (déjà filtrées par l'appelant). */
  sources: SourceDocEntry[]
  open: boolean
  onToggle: () => void
}) {
  const { t, lang } = useI18n()
  const isAdmin = category === 'admin'
  const isAmm = type.code === 'amm'
  const isCoa = type.code === 'coa'
  const needsExpiry = requiresExpiry(type.code)
  const count = drafts.length
  // Les pièces ADMIN portent des métadonnées réglementaires (expiration, titulaire…) → formulaire.
  // Les documents d'INFO (RCP, notice, étiquetage…) n'ont AUCUN champ hors fichier → ajout DIRECT
  // à la sélection du fichier, sans formulaire (un clic + un choix = fini).
  const hasMeta = isAdmin

  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [holder, setHolder] = useState('')
  const [country, setCountry] = useState('')
  const [reference, setReference] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  // Pièce dont on prévisualise le fichier (null = dialog fermé).
  const [preview, setPreview] = useState<File | null>(null)
  // Picker « Depuis la base de ‹org› » ouvert (§2) — les entrées viennent de la prop `sources`.
  const [picking, setPicking] = useState(false)
  // Remplacement d'un fichier existant : input dédié + pièce ciblée (métadonnées à conserver).
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<DraftDocument | null>(null)
  // Garde-fou Monitor : délivrance postérieure à l'expiration = incohérent. On ne le SIGNALE qu'une
  // fois le champ QUITTÉ (blur) — pas pendant la frappe/le choix de date (retour CEO).
  const dateError = isIssueAfterExpiry(issueDate, expiryDate)
  const [datesTouched, setDatesTouched] = useState(false)
  const showDateError = dateError && datesTouched

  // « + Ajouter » déclenche directement l'explorateur de fichiers ; le formulaire ne se déplie
  // que pour les pièces à métadonnées (admin) — un document d'info s'ajoute sans formulaire.
  function openAndPick() {
    if (hasMeta && !open) onToggle()
    fileRef.current?.click()
  }

  /** Contrôles communs type/taille — partagés entre ajout direct (info) et formulaire (admin). */
  function fileOk(f: File): boolean {
    if (!isAllowedUpload(f)) {
      toast.error(t(UPLOAD_TYPE_ERROR))
      return false
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error(t(UPLOAD_SIZE_ERROR))
      return false
    }
    return true
  }

  function handlePick(f: File | null) {
    if (!f) return
    if (!hasMeta) {
      // Document d'info : ajout immédiat (aucune métadonnée à saisir).
      if (!fileOk(f)) {
        reset()
        return
      }
      onAdd({
        id: crypto.randomUUID(),
        category,
        docType: type.code,
        file: f,
        issueDate: null,
        expiryDate: null,
        holder: null,
        country: null,
        reference: null,
        batchNumber: null,
      })
      toast.success(t({ fr: 'Pièce ajoutée', en: 'Document added' }))
      reset()
      return
    }
    setFile(f)
  }

  /**
   * Pioche une pièce de la base (§2) : File résolu (blob local, sinon Storage) + métadonnées
   * HÉRITÉES de la source + provenance `sourceDocId` — aucun formulaire, la pièce est déjà
   * qualifiée dans la base. La copie réelle se fait à l'enregistrement du wizard (buffer).
   */
  async function pickFromBase(src: DocumentRecord): Promise<boolean> {
    const file = await sourceDocFile(src)
    if (!file) {
      toast.error(t(SOURCE_BLOB_UNAVAILABLE))
      return false
    }
    onAdd({
      id: crypto.randomUUID(),
      // Catégorie CANONIQUE du type (une COA legacy `info` redevient admin à la copie).
      category: categoryForDocType(src.docType, category),
      docType: src.docType,
      file,
      issueDate: src.issueDate ?? null,
      expiryDate: src.expiryDate,
      holder: src.holder ?? null,
      country: src.country ?? null,
      reference: src.reference ?? null,
      batchNumber: src.batchNumber ?? null,
      sourceDocId: src.id,
      language: src.language,
    })
    toast.success(t({ fr: 'Pièce reprise de la base', en: 'Document picked from base' }))
    return true
  }

  /** Cible la pièce à remplacer puis ouvre l'explorateur (handler stable → pas d'accès ref au rendu). */
  function startReplace(d: DraftDocument) {
    replaceTarget.current = d
    replaceRef.current?.click()
  }

  /** Remplace le fichier d'une pièce déjà ajoutée en CONSERVANT ses métadonnées (retrait + réajout). */
  function handleReplace(f: File | null) {
    const target = replaceTarget.current
    replaceTarget.current = null
    if (!f || !target) return
    if (!fileOk(f)) return
    onRemove(target.id)
    onAdd({ ...target, id: crypto.randomUUID(), file: f })
    toast.success(t({ fr: 'Fichier remplacé', en: 'File replaced' }))
  }

  function reset() {
    setFile(null)
    setIssueDate('')
    setExpiryDate('')
    setHolder('')
    setCountry('')
    setReference('')
    setBatchNumber('')
    setDatesTouched(false)
    setResetKey((k) => k + 1)
  }

  function handleAdd() {
    if (!file) {
      toast.error(t({ fr: 'Sélectionne un fichier', en: 'Select a file' }))
      return
    }
    if (!fileOk(file)) return
    if (needsExpiry && !expiryDate) {
      toast.error(
        t({
          fr: 'Date d’expiration requise pour cette pièce (vérifiée par Monitor).',
          en: 'Expiry date required for this document (checked by Monitor).',
        }),
      )
      return
    }
    if (dateError) {
      setDatesTouched(true)
      toast.error(
        t({
          fr: 'La date de délivrance ne peut pas être postérieure à la date d’expiration.',
          en: 'The issue date cannot be later than the expiry date.',
        }),
      )
      return
    }
    onAdd({
      id: crypto.randomUUID(),
      category,
      docType: type.code,
      file,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      holder: isAdmin ? holder.trim() || null : null,
      country: isAmm ? country || null : null,
      reference: isAmm ? reference.trim() || null : null,
      batchNumber: isCoa ? batchNumber.trim() || null : null,
    })
    toast.success(t({ fr: 'Pièce ajoutée', en: 'Document added' }))
    reset()
    // Pièce ajoutée → le formulaire se REFERME (point CEO) ; « + Ajouter » le rouvre pour la suivante.
    if (open) onToggle()
  }

  const typeLabel = t({ fr: type.label, en: type.en ?? type.label })
  // 1 seule pièce = cas courant : nom + actions sur la MÊME ligne que l'en-tête (pas de trait).
  const only = count === 1 ? drafts[0]! : null

  /** Actions d'un fichier (aperçu · remplacer · retirer) — mêmes icônes en en-tête (1 pièce) et en liste. */
  function fileActions(d: DraftDocument) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Prévisualiser', en: 'Preview' })}
          title={t({ fr: 'Prévisualiser', en: 'Preview' })}
          onClick={() => setPreview(d.file)}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Remplacer le fichier', en: 'Replace file' })}
          title={t({ fr: 'Remplacer le fichier', en: 'Replace file' })}
          onClick={() => startReplace(d)}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Retirer', en: 'Remove' })}
          title={t({ fr: 'Retirer', en: 'Remove' })}
          onClick={() => onRemove(d.id)}
        >
          <Trash2 className="size-4" />
        </Button>
      </>
    )
  }

  // « + » = icône d'action (comme les autres). Info : ouvre l'explorateur. Admin : déplie/replie le
  // formulaire à métadonnées (× quand ouvert). UN SEUL « + » par carte. Dès que la base des parties
  // sélectionnées a des pièces de ce type, « + » propose les DEUX chemins (§2) : pioche ou upload.
  const baseNames = [...new Set(sources.map((s) => s.orgName).filter(Boolean))]
  const baseLabel =
    baseNames.length === 1
      ? t({ fr: `Depuis la base de ${baseNames[0]}`, en: `From ${baseNames[0]}'s base` })
      : t({ fr: 'Depuis la base', en: 'From the base' })
  const addBtn =
    sources.length > 0 && !open ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t({ fr: 'Ajouter', en: 'Add' })}
            title={t({ fr: 'Ajouter un fichier', en: 'Add a file' })}
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setPicking(true)}>
            <FolderOpen className="size-4" /> {baseLabel}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openAndPick}>
            <Upload className="size-4" /> {t({ fr: 'Depuis mon poste', en: 'From my computer' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={open ? t({ fr: 'Fermer', en: 'Close' }) : t({ fr: 'Ajouter', en: 'Add' })}
        title={
          open
            ? t({ fr: 'Fermer', en: 'Close' })
            : t({ fr: 'Ajouter un fichier', en: 'Add a file' })
        }
        aria-expanded={hasMeta ? open : undefined}
        onClick={open ? onToggle : openAndPick}
      >
        {open ? <X className="size-4" /> : <Plus className="size-4" />}
      </Button>
    )

  return (
    <div
      className={cn(
        'bg-card rounded-xl border transition-all',
        open ? 'shadow-md md:col-span-2' : 'hover:border-muted-foreground/25 hover:shadow-sm',
      )}
    >
      {/* Input fichier TOUJOURS monté (caché) → « + Ajouter » ouvre l'explorateur directement. */}
      <input
        ref={fileRef}
        key={resetKey}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
      />
      {/* Input dédié au REMPLACEMENT d'un fichier existant (value vidée → même nom re-sélectionnable). */}
      <input
        ref={replaceRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          handleReplace(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="bg-info-subtle text-info-subtle-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{typeLabel}</span>
          {only ? (
            // Point 2 : le NOM du fichier remplace « N pièce(s) ajoutée(s) » (cliquable → aperçu).
            <button
              type="button"
              onClick={() => setPreview(only.file)}
              className="focus-visible:ring-ring/50 text-muted-foreground block max-w-full truncate rounded text-left text-xs outline-none hover:underline focus-visible:ring-[3px]"
              title={only.file.name}
            >
              {only.file.name}
            </button>
          ) : (
            <span className="text-muted-foreground text-xs">
              {count === 0
                ? t({ fr: 'Aucune pièce', en: 'None yet' })
                : t({ fr: `${count} fichiers`, en: `${count} files` })}
            </span>
          )}
        </div>
        {/* Toutes les icônes d'action sur la même ligne : (1 pièce → ses actions) + « + ». */}
        {only ? fileActions(only) : null}
        {addBtn}
      </div>

      {/* Plusieurs pièces du MÊME type → traits + un jeu d'actions (aperçu/remplacer/retirer) PAR fichier. */}
      {count > 1 ? (
        <ul className="divide-y border-t">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center gap-1 px-4 py-2 text-sm">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <button
                type="button"
                onClick={() => setPreview(d.file)}
                className="focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-md text-left outline-none hover:underline focus-visible:ring-[3px]"
                title={d.file.name}
              >
                {d.file.name}
              </button>
              {fileActions(d)}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Formulaire à métadonnées (admin uniquement, quand déplié). */}
      {hasMeta && open ? (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {isAmm ? (
              <Field label={t({ fr: 'N° d’AMM', en: 'MA number' })}>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t({ fr: 'Ex. AMM_2015_7457', en: 'e.g. MA_2015_7457' })}
                />
              </Field>
            ) : null}

            {isAmm ? (
              <Field label={t({ fr: 'Pays', en: 'Country' })}>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="">{t({ fr: 'Sélectionner…', en: 'Select…' })}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {countryLabel(c.code, lang)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {isCoa ? (
              <Field label={t({ fr: 'Batch N°', en: 'Batch No.' })}>
                <Input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder={t({ fr: 'Ex. LOT-2026-014', en: 'e.g. LOT-2026-014' })}
                />
              </Field>
            ) : null}

            {isAdmin ? (
              <Field label={t({ fr: 'Date de délivrance', en: 'Issue date' })}>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  onBlur={() => setDatesTouched(true)}
                  aria-invalid={showDateError || undefined}
                />
              </Field>
            ) : null}

            {isAdmin ? (
              <Field
                label={t({
                  fr: needsExpiry ? "Date d'expiration *" : "Date d'expiration",
                  en: needsExpiry ? 'Expiry date *' : 'Expiry date',
                })}
              >
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  onBlur={() => setDatesTouched(true)}
                  aria-invalid={showDateError || undefined}
                />
              </Field>
            ) : null}

            {showDateError ? (
              <p className="text-destructive text-xs sm:col-span-2" role="alert">
                {t({
                  fr: 'La date de délivrance est postérieure à la date d’expiration.',
                  en: 'The issue date is later than the expiry date.',
                })}
              </p>
            ) : null}

            {/* Masqué en contexte ORG (`hideHolder`) : la fiche appartient déjà au titulaire. */}
            {isAdmin && !hideHolder ? (
              <Field label={t({ fr: 'Titulaire', en: 'Holder' })}>
                <Input
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                  placeholder={t({ fr: 'Ex. Sahel Pharma SARL', en: 'e.g. Sahel Pharma SARL' })}
                />
              </Field>
            ) : null}

            <Field label={t({ fr: 'Fichier', en: 'File' })} className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload />
                  {file
                    ? t({ fr: 'Changer le fichier', en: 'Change file' })
                    : t({ fr: 'Choisir un fichier', en: 'Choose a file' })}
                </Button>
                <span className="text-muted-foreground min-w-0 truncate text-sm" title={file?.name}>
                  {file ? file.name : t({ fr: 'Aucun fichier choisi', en: 'No file chosen' })}
                </span>
              </div>
            </Field>
          </div>

          <Button type="button" variant="primary" onClick={handleAdd} disabled={showDateError}>
            <Plus /> {t({ fr: 'Ajouter la pièce', en: 'Add document' })}
          </Button>
        </div>
      ) : null}

      <DraftPreviewDialog file={preview} onOpenChange={(o) => !o && setPreview(null)} />
      <SourceDocPicker
        entries={picking ? sources : null}
        title={baseLabel}
        takenIds={new Set(drafts.flatMap((d) => (d.sourceDocId ? [d.sourceDocId] : [])))}
        onPick={pickFromBase}
        onOpenChange={(o) => setPicking(o)}
      />
    </div>
  )
}

/**
 * Aperçu **au premier plan** d'une pièce du buffer (fichier `File` local, pas encore stocké) :
 * PDF via la visionneuse PDF.js (chargée à la demande), image en ligne, sinon repli « ouvrir dans
 * un onglet ». L'URL objet est créée à l'ouverture et **révoquée** à la fermeture (pas de fuite).
 */
function DraftPreviewDialog({
  file,
  onOpenChange,
}: {
  file: File | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const name = file?.name ?? ''
  const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(name)
  // URL objet dérivée du fichier pour l'aperçu image / le repli « nouvel onglet ». INUTILE pour un
  // PDF (la visionneuse consomme le File directement) → on ne l'alloue pas. Révoquée au changement /
  // à la fermeture (le cleanup suit `url`), donc pas de fuite.
  const url = useMemo(() => (file && !isPdf ? URL.createObjectURL(file) : null), [file, isPdf])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])
  const isImage = (file?.type ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)

  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8" title={name}>
            {name}
          </DialogTitle>
        </DialogHeader>
        {file && isPdf ? (
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-lg border">
            <PdfViewer blob={file} />
          </div>
        ) : file && isImage && url ? (
          <div className="bg-muted flex max-h-[70vh] items-center justify-center overflow-auto rounded-lg border p-3">
            <img src={url} alt={name} className="max-w-full" />
          </div>
        ) : url ? (
          <div className="text-muted-foreground flex min-h-[14rem] flex-col items-center justify-center gap-3 py-8 text-sm">
            <FileText className="size-8" />
            <p>
              {t({
                fr: 'Aperçu non disponible pour ce format.',
                en: 'Preview not available for this format.',
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink /> {t({ fr: 'Ouvrir dans un nouvel onglet', en: 'Open in a new tab' })}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
