import { useRef, useState } from 'react'
import { Check, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import type { DocumentCategory } from '@/lib/db'
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
} from '@/lib/files'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { docTypesFor, requiresExpiry, type DocTypeOption } from './doc-types'

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
}: {
  category: DocumentCategory
  drafts: DraftDocument[]
  onAdd: (d: DraftDocument) => void
  onRemove: (id: string) => void
}) {
  const types = docTypesFor(category)
  const [openType, setOpenType] = useState<string | null>(null)

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {types.map((type) => (
        <DocCard
          key={type.code}
          type={type}
          category={category}
          drafts={drafts.filter((d) => d.docType === type.code)}
          onAdd={onAdd}
          onRemove={onRemove}
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
  open,
  onToggle,
}: {
  type: DocTypeOption
  category: DocumentCategory
  drafts: DraftDocument[]
  onAdd: (d: DraftDocument) => void
  onRemove: (id: string) => void
  open: boolean
  onToggle: () => void
}) {
  const { t, lang } = useI18n()
  const isAdmin = category === 'admin'
  const isAmm = type.code === 'amm'
  const isCoa = type.code === 'coa'
  const needsExpiry = requiresExpiry(type.code)
  const count = drafts.length

  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [holder, setHolder] = useState('')
  const [country, setCountry] = useState('')
  const [reference, setReference] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // « + Ajouter » ouvre la carte ET déclenche directement l'explorateur de fichiers.
  function openAndPick() {
    if (!open) onToggle()
    fileRef.current?.click()
  }

  function reset() {
    setFile(null)
    setIssueDate('')
    setExpiryDate('')
    setHolder('')
    setCountry('')
    setReference('')
    setBatchNumber('')
    setResetKey((k) => k + 1)
  }

  function handleAdd() {
    if (!file) {
      toast.error(t({ fr: 'Sélectionne un fichier', en: 'Select a file' }))
      return
    }
    if (!isAllowedUpload(file)) {
      toast.error(UPLOAD_TYPE_ERROR)
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(UPLOAD_SIZE_ERROR)
      return
    }
    if (needsExpiry && !expiryDate) {
      toast.error(
        t({
          fr: 'Date d’expiration requise pour cette pièce (vérifiée par Monitor).',
          en: 'Expiry date required for this document (checked by Monitor).',
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
  }

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
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="bg-info-subtle text-info-subtle-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {t({ fr: type.label, en: type.en ?? type.label })}
          </span>
          <span className="text-muted-foreground text-xs">
            {count > 0
              ? t({ fr: `${count} pièce(s) ajoutée(s)`, en: `${count} added` })
              : t({ fr: 'Aucune pièce', en: 'None yet' })}
          </span>
        </span>
        {count > 0 ? (
          <StatusBadge tone="success" className="shrink-0">
            <Check /> {count}
          </StatusBadge>
        ) : null}
        {/* Bouton « + Ajouter » explicite sur chaque carte (ouvre l'explorateur + déplie le form). */}
        <Button
          type="button"
          variant={open ? 'ghost' : 'outline'}
          size="sm"
          onClick={open ? onToggle : openAndPick}
          aria-expanded={open}
        >
          {open ? (
            <>
              <X /> {t({ fr: 'Fermer', en: 'Close' })}
            </>
          ) : (
            <>
              <Plus /> {t({ fr: 'Ajouter', en: 'Add' })}
            </>
          )}
        </Button>
      </div>

      {open ? (
        <div className="space-y-4 border-t px-4 py-4">
          {drafts.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {drafts.map((d) => (
                <li key={d.id} className="flex items-center gap-2 p-2.5 text-sm">
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={d.file.name}>
                    {d.file.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t({ fr: 'Retirer', en: 'Remove' })}
                    onClick={() => onRemove(d.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

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
                />
              </Field>
            ) : null}

            {isAdmin ? (
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

          <Button type="button" variant="primary" onClick={handleAdd}>
            <Plus /> {t({ fr: 'Ajouter la pièce', en: 'Add document' })}
          </Button>
        </div>
      ) : null}
    </div>
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
