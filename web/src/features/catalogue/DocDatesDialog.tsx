import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useI18n } from '@/lib/i18n-context'
import { isIssueAfterExpiry } from './doc-dates'
import { docTypeLabel, requiresExpiry } from './doc-types'
import { updateDocumentDates } from './documents-repository'

export interface EditableDoc {
  id: string
  docType: string
  fileName: string
  issueDate: string | null
  expiryDate: string | null
  /** Pays de l'AMM (éditable ici pour les AMM déjà saisies sans pays → cartes AMM par pays). */
  country: string | null
}

/**
 * Correction des DATES d'une pièce administrative déjà déposée (une date se corrige, un fichier se
 * remplace). Le formulaire est monté `key={doc.id}` → l'état repart de la pièce ouverte, jamais de
 * la précédente.
 */
export function DocDatesDialog({
  doc,
  onOpenChange,
}: {
  doc: EditableDoc | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t({ fr: 'Modifier les dates', en: 'Edit dates' })}</DialogTitle>
        </DialogHeader>
        {doc ? <DatesForm key={doc.id} doc={doc} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function DatesForm({ doc, onDone }: { doc: EditableDoc; onDone: () => void }) {
  const { t, lang } = useI18n()
  const [issueDate, setIssueDate] = useState(doc.issueDate ?? '')
  const [expiryDate, setExpiryDate] = useState(doc.expiryDate ?? '')
  const [country, setCountry] = useState(doc.country ?? '')
  const [busy, setBusy] = useState(false)
  // MÊME garde-fou que la saisie initiale (source unique `isIssueAfterExpiry`) et MÊME règle
  // d'affichage : on ne signale qu'une fois le champ quitté, pas pendant la frappe.
  const [touched, setTouched] = useState(false)
  const dateError = isIssueAfterExpiry(issueDate, expiryDate)
  const showDateError = dateError && touched
  const needsExpiry = requiresExpiry(doc.docType)
  const isAmm = doc.docType === 'amm'

  async function save() {
    if (dateError) {
      setTouched(true)
      toast.error(
        t({
          fr: 'La date de délivrance ne peut pas être postérieure à la date d’expiration.',
          en: 'The issue date cannot be later than the expiry date.',
        }),
      )
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
    setBusy(true)
    try {
      await updateDocumentDates(doc.id, {
        issueDate: issueDate || null,
        expiryDate: expiryDate || null,
        // `country` n'est envoyé que pour une AMM → les autres pièces ne sont jamais touchées.
        ...(isAmm ? { country: country || null } : {}),
      })
      toast.success(t({ fr: 'Dates mises à jour', en: 'Dates updated' }))
      onDone()
    } catch (error) {
      toast.error(t({ fr: 'Échec de la mise à jour', en: 'Update failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground truncate text-sm" title={doc.fileName}>
        {docTypeLabel(doc.docType, lang)} · {doc.fileName}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-issue">{t({ fr: 'Date de délivrance', en: 'Issue date' })}</Label>
          <Input
            id="doc-issue"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showDateError || undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-expiry">
            {t({
              fr: needsExpiry ? "Date d'expiration *" : "Date d'expiration",
              en: needsExpiry ? 'Expiry date *' : 'Expiry date',
            })}
          </Label>
          <Input
            id="doc-expiry"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showDateError || undefined}
          />
        </div>
        {showDateError ? (
          <p className="text-destructive text-xs sm:col-span-2" role="alert">
            {t({
              fr: 'La date de délivrance est postérieure à la date d’expiration.',
              en: 'The issue date is later than the expiry date.',
            })}
          </p>
        ) : null}
        {isAmm ? (
          <div className="space-y-1.5 sm:col-span-2">
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
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          {t({ fr: 'Annuler', en: 'Cancel' })}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={busy || showDateError}
        >
          {t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
      </DialogFooter>
    </div>
  )
}
