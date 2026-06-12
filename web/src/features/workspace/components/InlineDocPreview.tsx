import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cacheDocumentBlob, getDocumentBlob } from '@/features/catalogue/documents-repository'
import { downloadDocumentBlob } from '@/features/catalogue/documents-sync'
import { cacheAttachmentBlob, getAttachmentBlob } from '../dossier-attachments-repository'
import { downloadAttachmentBlob } from '../dossier-attachments-sync'
import { PdfViewer } from '../PdfViewer'

/**
 * Aperçu in-place d'un document du nœud (pièce jointe ou document produit) : blob local d'abord
 * (offline-first), sinon téléchargement réseau + épinglage local pour les aperçus suivants.
 */
export function InlineDocPreview({
  kind,
  docId,
  filePath,
  fileName,
}: {
  kind: 'attachment' | 'doc'
  docId: string
  filePath: string | null
  fileName: string
}) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Composant remonté (key=docId) à chaque changement → état initial déjà correct.
    let alive = true
    let created: string | null = null
    void (async () => {
      let b =
        (kind === 'attachment' ? await getAttachmentBlob(docId) : await getDocumentBlob(docId)) ??
        null
      if (!b && filePath) {
        // API download (encodage des chemins géré) — l'ancienne URL signée + fetch cassait sur
        // les noms à caractères spéciaux (COPP invisible en navigation privée).
        b =
          kind === 'attachment'
            ? await downloadAttachmentBlob(filePath)
            : await downloadDocumentBlob(filePath)
        if (b) {
          // Offline-first : épingle le fichier en local pour les aperçus hors-ligne suivants.
          void (kind === 'attachment' ? cacheAttachmentBlob(docId, b) : cacheDocumentBlob(docId, b))
        }
      }
      if (!alive) return
      if (b) {
        created = URL.createObjectURL(b)
        setBlob(b)
        setUrl(created)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [kind, docId, filePath])

  const isPdf = blob?.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
  const isImage =
    (blob?.type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName)

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-card flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="truncate text-xs font-medium">{fileName}</span>
        {url ? (
          <a
            href={url}
            download={fileName}
            aria-label="Télécharger"
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          >
            <Download className="size-4" />
          </a>
        ) : null}
      </div>
      {loading ? (
        <div className="text-muted-foreground flex min-h-[20rem] items-center justify-center text-sm">
          Chargement…
        </div>
      ) : blob && isPdf ? (
        <PdfViewer blob={blob} flow />
      ) : blob && isImage && url ? (
        <div className="bg-muted p-3">
          <img
            src={url}
            alt={fileName}
            className="mx-auto max-w-full rounded border bg-white shadow"
          />
        </div>
      ) : url ? (
        <div className="text-muted-foreground flex min-h-[20rem] flex-col items-center justify-center gap-2 text-sm">
          <FileText className="size-8" />
          Aperçu non disponible pour ce format — téléchargez le fichier.
        </div>
      ) : (
        <div className="text-muted-foreground flex min-h-[20rem] items-center justify-center text-sm">
          Aperçu indisponible hors-ligne.
        </div>
      )}
    </div>
  )
}
