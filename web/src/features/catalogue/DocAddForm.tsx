import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import type { DocumentCategory } from '@/lib/db'
import { UPLOAD_ACCEPT } from '@/lib/files'
import { useI18n } from '@/lib/i18n-context'
import { isIssueAfterExpiry } from './doc-dates'
import { requiresExpiry, type DocTypeOption } from './doc-types'
import type { AddDocumentInput } from './documents-repository'

/**
 * Formulaire d'ajout d'une pièce (type + métadonnées AMM/expiration + fichier) — EXTRAIT de
 * `DocumentsSection` pour être PARTAGÉ avec la fiche org (`OrgDocAddButton`, §3) : mêmes règles
 * métier partout (AMM = N° + émission requis, expiration requise pour les pièces à validité,
 * garde-fou Monitor émission ≤ expiration signalé au blur). Le propriétaire (produit OU org) est
 * l'affaire de l'appelant via `onSubmit`.
 */
export function DocAddForm({
  types,
  category,
  onSubmit,
  onDone,
  renderExtra,
}: {
  /** Types proposés (catégorie entière côté produit, sous-ensemble matrice §1 côté org). */
  types: DocTypeOption[]
  /** Catégorie portée par la pièce créée (celle de l'onglet/section appelant). */
  category: DocumentCategory
  /** Persiste la pièce (produit : `addDocument` · org : `addPartyDocument`) + sync. Peut lever. */
  onSubmit: (input: AddDocumentInput) => Promise<void>
  /** Appelé après un ajout réussi (refermer le panneau/dialog appelant). */
  onDone?: () => void
  /** Emplacement libre à côté du type (fiche produit : bouton « Depuis la base », §2). */
  renderExtra?: (docType: string) => React.ReactNode
}) {
  const { t, lang } = useI18n()
  const [docType, setDocType] = useState(types[0]?.code ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [reference, setReference] = useState('')
  // Pays de l'AMM (liste au choix) : alimente les cartes AMM par pays de la fiche Organisation.
  const [country, setCountry] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  // AMM : N° + date d'émission (octroi) requis — synchronisés ensuite vers le CTD builder (Renew/Variation).
  const isAmm = docType === 'amm'
  // Garde-fou Monitor : émission postérieure à l'expiration = incohérent (signalé en rouge, ajout bloqué).
  // Borné à l'AMM — SEUL type où la date d'émission se saisit : sinon, changer de type après avoir
  // saisi une émission figerait le formulaire sur un champ devenu invisible (erreur + bouton mort).
  // Signalé seulement une fois le champ QUITTÉ (blur), pas pendant la frappe (retour CEO).
  const dateError = isAmm && isIssueAfterExpiry(issueDate, expiryDate)
  const [datesTouched, setDatesTouched] = useState(false)
  const showDateError = dateError && datesTouched

  async function handleAdd() {
    if (!file) {
      toast.error(t({ fr: 'Sélectionne un fichier', en: 'Select a file' }))
      return
    }
    if (!docType) {
      toast.error(t({ fr: 'Choisis un type de document', en: 'Choose a document type' }))
      return
    }
    // Monitor (jalon O) : la date d'expiration est obligatoire pour les pièces à validité (COA + admin).
    if (requiresExpiry(docType) && !expiryDate) {
      toast.error(
        t({
          fr: 'Date d’expiration requise pour cette pièce (vérifiée par Monitor).',
          en: 'Expiry date required for this document (checked by Monitor).',
        }),
      )
      return
    }
    // AMM : N° + date d'émission obligatoires (réf. de la lettre + RCP §8/§9 au renouvellement/variation).
    if (isAmm && (!reference.trim() || !issueDate)) {
      toast.error(
        t({
          fr: 'N° d’AMM et date d’émission requis pour une AMM.',
          en: 'MA number and issue date are required for an MA.',
        }),
      )
      return
    }
    if (dateError) {
      setDatesTouched(true)
      toast.error(
        t({
          fr: 'La date d’émission ne peut pas être postérieure à la date d’expiration.',
          en: 'The issue date cannot be later than the expiry date.',
        }),
      )
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        category,
        docType,
        file,
        language: 'fr',
        expiryDate: expiryDate || null,
        issueDate: isAmm ? issueDate || null : null,
        reference: isAmm ? reference.trim() || null : null,
        country: isAmm ? country || null : null,
      })
      toast.success(t({ fr: 'Document ajouté', en: 'Document added' }))
      // Reset in-place : conservé pour un appelant qui GARDE le formulaire monté après `onDone`
      // (les consommateurs actuels le démontent — dialog fermé / panneau replié).
      setFile(null)
      setExpiryDate('')
      setIssueDate('')
      setReference('')
      setCountry('')
      setDatesTouched(false)
      setResetKey((k) => k + 1)
      onDone?.()
    } catch (error) {
      toast.error(t({ fr: "Échec de l'ajout", en: 'Upload failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t({ fr: 'Type de document', en: 'Document type' })}</Label>
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger
            className="w-full"
            aria-label={t({ fr: 'Type de document', en: 'Document type' })}
          >
            <SelectValue placeholder={t({ fr: 'Type', en: 'Type' })} />
          </SelectTrigger>
          <SelectContent>
            {types.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {t({ fr: opt.label, en: opt.en ?? opt.label })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {renderExtra?.(docType)}

      {isAmm ? (
        <div className="space-y-1.5">
          <Label>{t({ fr: 'N° d’AMM *', en: 'MA number *' })}</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t({ fr: 'Ex. AMM_2015_7457', en: 'e.g. MA_2015_7457' })}
          />
        </div>
      ) : null}

      {isAmm ? (
        <div className="space-y-1.5">
          <Label>{t({ fr: 'Pays', en: 'Country' })}</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-full" aria-label={t({ fr: 'Pays', en: 'Country' })}>
              <SelectValue placeholder={t({ fr: 'Sélectionner…', en: 'Select…' })} />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {countryLabel(c.code, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isAmm ? (
        <div className="space-y-1.5">
          <Label>{t({ fr: 'Date d’émission (octroi) *', en: 'Issue date (grant) *' })}</Label>
          <Input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            onBlur={() => setDatesTouched(true)}
            aria-invalid={showDateError || undefined}
          />
        </div>
      ) : null}

      {requiresExpiry(docType) ? (
        <div className="space-y-1.5">
          <Label>{t({ fr: "Date d'expiration *", en: 'Expiry date *' })}</Label>
          <Input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            onBlur={() => setDatesTouched(true)}
            aria-invalid={showDateError || undefined}
          />
        </div>
      ) : null}

      {showDateError ? (
        <p className="text-destructive text-xs sm:col-span-2" role="alert">
          {t({
            fr: 'La date d’émission est postérieure à la date d’expiration.',
            en: 'The issue date is later than the expiry date.',
          })}
        </p>
      ) : null}

      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t({ fr: 'Fichier', en: 'File' })}</Label>
        <Input
          key={resetKey}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="sm:col-span-2">
        <Button type="button" onClick={() => void handleAdd()} disabled={busy || showDateError}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {t({ fr: 'Ajouter le document', en: 'Add document' })}
        </Button>
      </div>
    </div>
  )
}
