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
import type { DocumentCategory } from '@/lib/db'
import { docTypeLabel, docTypesFor } from './doc-types'
import { addDocument, deleteDocument, getDocumentBlob, listDocuments } from './documents-repository'
import { getDocumentDownloadUrl, syncDocuments } from './documents-sync'

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
  const docs = useLiveQuery(() => listDocuments(productId, category), [productId, category])
  const types = docTypesFor(category)
  const [docType, setDocType] = useState(types[0]?.code ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  async function handleAdd() {
    if (!file) {
      toast.error('Sélectionne un fichier')
      return
    }
    if (!docType) {
      toast.error('Choisis un type de document')
      return
    }
    setBusy(true)
    try {
      await addDocument(orgId, productId, {
        category,
        docType,
        file,
        language: 'fr',
        expiryDate: category === 'admin' && expiryDate ? expiryDate : null,
      })
      void syncDocuments(orgId)
      toast.success('Document ajouté')
      setFile(null)
      setExpiryDate('')
      setResetKey((k) => k + 1)
    } catch (error) {
      toast.error("Échec de l'ajout", {
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
      const url = await getDocumentDownloadUrl(filePath)
      if (url) {
        triggerDownload(url, fileName, false)
        return
      }
    }
    toast.error('Fichier indisponible hors-ligne')
  }

  async function handleDelete(id: string) {
    await deleteDocument(id)
    void syncDocuments(orgId)
    toast.success('Document supprimé')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type de document</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.code} value={t.code}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {category === 'admin' ? (
          <div className="space-y-1.5">
            <Label>Date de validité</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Fichier</Label>
          <Input
            key={resetKey}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="sm:col-span-2">
          <Button type="button" onClick={() => void handleAdd()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Ajouter le document
          </Button>
        </div>
      </div>

      {docs === undefined ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun document pour l'instant.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-3">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{docTypeLabel(d.docType)}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {d.fileName}
                  {d.expiryDate ? ` · expire le ${d.expiryDate}` : ''}
                </div>
              </div>
              <span
                className="text-muted-foreground/70 shrink-0"
                title={d.uploaded ? 'Sauvegardé dans le cloud' : 'Synchronisation en attente'}
                aria-label={d.uploaded ? 'Sauvegardé dans le cloud' : 'Synchronisation en attente'}
              >
                {d.uploaded ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Télécharger"
                onClick={() => void handleDownload(d.id, d.fileName, d.filePath)}
              >
                <Download className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Supprimer"
                onClick={() => void handleDelete(d.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
