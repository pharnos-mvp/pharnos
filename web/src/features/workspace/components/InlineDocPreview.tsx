import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
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
  const { t } = useI18n()
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

  // Cadre A4 UNIQUE (= éditeur/annexe) → aucun décalage en changeant d'onglet/nœud. Le nom du fichier
  // et le bouton Télécharger vivent dans la barre d'actions du document (plus d'en-tête redondant ici).
  return (
    <div className="editor-page-wrap">
      {loading ? (
        <div className="editor-page text-muted-foreground flex min-h-[20rem] items-center justify-center text-sm">
          {t({ fr: 'Chargement…', en: 'Loading…' })}
        </div>
      ) : blob && isPdf ? (
        <div className="w-full max-w-[62rem]">
          <PdfViewer blob={blob} flow />
        </div>
      ) : blob && isImage && url ? (
        <div className="editor-page">
          <img src={url} alt={fileName} className="mx-auto max-w-full" />
        </div>
      ) : url ? (
        <div className="editor-page text-muted-foreground flex min-h-[20rem] flex-col items-center justify-center gap-2 text-sm">
          <FileText className="size-8" />
          {t({
            fr: 'Aperçu non disponible pour ce format — téléchargez le fichier.',
            en: 'Preview not available for this format — download the file.',
          })}
        </div>
      ) : (
        <div className="editor-page text-muted-foreground flex min-h-[20rem] items-center justify-center text-sm">
          {t({ fr: 'Aperçu indisponible hors-ligne.', en: 'Preview unavailable offline.' })}
        </div>
      )}
    </div>
  )
}
