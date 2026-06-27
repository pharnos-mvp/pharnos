import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, Download, FileText, Loader2, Trash2 } from 'lucide-react'
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
import { StatusBadge } from '@/components/ui/status-badge'
import { renewalLeadDays } from '@/features/dashboard/dashboard-data'
import type { DocumentCategory } from '@/lib/db'
import { UPLOAD_ACCEPT } from '@/lib/files'
import { useI18n } from '@/lib/i18n-context'
import { docTypeLabel, docTypesFor, requiresExpiry } from './doc-types'
import { addDocument, deleteDocument, getDocumentBlob, listDocuments } from './documents-repository'
import { downloadDocumentBlob, syncDocuments } from './documents-sync'

/** Étiquette de validité d'une pièce réglementaire datée (réutilise la fenêtre de renouvellement par type). */
function validity(
  docType: string,
  expiryDate: string | null,
  now: Date,
): { tone: 'success' | 'warning' | 'danger'; fr: string; en: string } | null {
  if (!requiresExpiry(docType) || !expiryDate) return null
  const daysLeft = Math.round((new Date(expiryDate).getTime() - now.getTime()) / 86_400_000)
  if (daysLeft < 0) return { tone: 'danger', fr: 'Expiré', en: 'Expired' }
  if (daysLeft <= renewalLeadDays(docType))
    return { tone: 'warning', fr: 'À renouveler', en: 'To renew' }
  return { tone: 'success', fr: 'Valide', en: 'Valid' }
}

interface DocumentsSectionProps {
  orgId: string
  productId: string
  category: DocumentCategory
}

function triggerDownload(url: string, fileName: string, revoke: boolean) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (revoke) URL.revokeObjectURL(url)
}

export function DocumentsSection({ orgId, productId, category }: DocumentsSectionProps) {
  const { t, lang } = useI18n()
  const docs = useLiveQuery(() => listDocuments(productId, category), [productId, category])
  const types = docTypesFor(category)
  const [docType, setDocType] = useState(types[0]?.code ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  // AMM : N° + date d'émission (octroi) requis — synchronisés ensuite vers le CTD builder (Renew/Variation).
  const isAmm = docType === 'amm'

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
    setBusy(true)
    try {
      await addDocument(orgId, productId, {
        category,
        docType,
        file,
        language: 'fr',
        expiryDate: expiryDate || null,
        issueDate: isAmm ? issueDate || null : null,
        reference: isAmm ? reference.trim() || null : null,
      })
      void syncDocuments(orgId)
      toast.success(t({ fr: 'Document ajouté', en: 'Document added' }))
      setFile(null)
      setExpiryDate('')
      setIssueDate('')
      setReference('')
      setResetKey((k) => k + 1)
    } catch (error) {
      toast.error(t({ fr: "Échec de l'ajout", en: 'Upload failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload(id: string, fileName: string, filePath: string | null) {
    const blob = await getDocumentBlob(id)
    if (blob) {
      triggerDownload(URL.createObjectURL(blob), fileName, true)
      return
    }
    if (filePath) {
      const remote = await downloadDocumentBlob(filePath)
      if (remote) {
        triggerDownload(URL.createObjectURL(remote), fileName, true)
        return
      }
    }
    toast.error(t({ fr: 'Fichier indisponible hors-ligne', en: 'File unavailable offline' }))
  }

  async function handleDelete(id: string) {
    await deleteDocument(id)
    void syncDocuments(orgId)
    toast.success(t({ fr: 'Document supprimé', en: 'Document deleted' }))
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t({ fr: 'Type de document', en: 'Document type' })}</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-full">
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
            <Label>{t({ fr: 'Date d’émission (octroi) *', en: 'Issue date (grant) *' })}</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
        ) : null}

        {requiresExpiry(docType) ? (
          <div className="space-y-1.5">
            <Label>{t({ fr: "Date d'expiration *", en: 'Expiry date *' })}</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
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
          <Button type="button" onClick={() => void handleAdd()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t({ fr: 'Ajouter le document', en: 'Add document' })}
          </Button>
        </div>
      </div>

      {docs === undefined ? (
        <p className="text-muted-foreground text-sm">{t({ fr: 'Chargement…', en: 'Loading…' })}</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t({ fr: "Aucun document pour l'instant.", en: 'No document yet.' })}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => {
            const v = validity(d.docType, d.expiryDate, new Date())
            return (
              <li key={d.id} className="flex items-center gap-3 p-3">
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {docTypeLabel(d.docType, lang)}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {d.fileName}
                    {d.reference ? ` · N° ${d.reference}` : ''}
                    {d.issueDate
                      ? t({ fr: ` · émise le ${d.issueDate}`, en: ` · issued ${d.issueDate}` })
                      : ''}
                    {d.expiryDate
                      ? t({ fr: ` · expire le ${d.expiryDate}`, en: ` · expires ${d.expiryDate}` })
                      : ''}
                  </div>
                </div>
                {v ? (
                  <StatusBadge tone={v.tone} className="shrink-0">
                    {t({ fr: v.fr, en: v.en })}
                  </StatusBadge>
                ) : null}
                <span
                  className="text-muted-foreground/70 shrink-0"
                  title={
                    d.uploaded
                      ? t({ fr: 'Sauvegardé dans le cloud', en: 'Saved to cloud' })
                      : t({ fr: 'Synchronisation en attente', en: 'Sync pending' })
                  }
                  aria-label={
                    d.uploaded
                      ? t({ fr: 'Sauvegardé dans le cloud', en: 'Saved to cloud' })
                      : t({ fr: 'Synchronisation en attente', en: 'Sync pending' })
                  }
                >
                  {d.uploaded ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t({ fr: 'Télécharger', en: 'Download' })}
                  onClick={() => void handleDownload(d.id, d.fileName, d.filePath)}
                >
                  <Download className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t({ fr: 'Supprimer', en: 'Delete' })}
                  onClick={() => void handleDelete(d.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
