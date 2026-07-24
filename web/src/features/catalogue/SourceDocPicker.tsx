import { useState } from 'react'
import { Building2, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DocumentRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { docTypeLabel } from './doc-types'

/** Une pièce « piochable » de la base d'une organisation + le nom de l'org propriétaire. */
export interface SourceDocEntry {
  doc: DocumentRecord
  orgName: string
}

/**
 * Picker « Depuis la base de ‹org› » (PLAN-ORG-REFERENTIEL §2) : liste les pièces ORG-scopées du
 * type demandé ; en choisir une déclenche `onPick` (copie liée côté fiche produit, brouillon côté
 * wizard). PARTAGÉ wizard produit / fiche produit — une seule UX de pioche.
 */
export function SourceDocPicker({
  entries,
  title,
  onPick,
  onOpenChange,
}: {
  /** Pièces proposées — `null` = dialog fermé. */
  entries: SourceDocEntry[] | null
  title: string
  /**
   * Résout la pioche (async). `true` = succès → le dialog se ferme ; `false` = échec (l'appelant a
   * déjà signalé l'erreur, ex. blob hors-ligne) → le dialog reste ouvert pour choisir une autre pièce.
   */
  onPick: (doc: DocumentRecord) => Promise<boolean>
  onOpenChange: (open: boolean) => void
}) {
  const { t, lang } = useI18n()
  // Id de la pièce en cours de résolution (blob local ou téléchargement Storage) — verrouille la liste.
  const [busyId, setBusyId] = useState<string | null>(null)

  async function pick(doc: DocumentRecord) {
    setBusyId(doc.id)
    try {
      if (await onPick(doc)) onOpenChange(false)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={!!entries} onOpenChange={(o) => !busyId && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
          {(entries ?? []).map(({ doc, orgName }) => (
            <li key={doc.id}>
              <Button
                type="button"
                variant="ghost"
                disabled={!!busyId}
                onClick={() => void pick(doc)}
                className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left"
              >
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{doc.fileName}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {docTypeLabel(doc.docType, lang)}
                    {doc.reference ? ` · N° ${doc.reference}` : ''}
                    {doc.expiryDate
                      ? t({
                          fr: ` · expire le ${doc.expiryDate}`,
                          en: ` · expires ${doc.expiryDate}`,
                        })
                      : ''}
                  </span>
                  <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                    <Building2 className="size-3 shrink-0" />
                    <span className="truncate">{orgName}</span>
                  </span>
                </span>
                {busyId === doc.id ? <Loader2 className="size-4 shrink-0 animate-spin" /> : null}
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'La pièce est copiée vers le produit (photographie) — la base de l’organisation reste la source.',
            en: 'The document is copied to the product (snapshot) — the organization base remains the source.',
          })}
        </p>
      </DialogContent>
    </Dialog>
  )
}
