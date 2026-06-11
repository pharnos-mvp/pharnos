import { getDocumentBlob } from '@/features/catalogue/documents-repository'
import { downloadDocumentBlob } from '@/features/catalogue/documents-sync'
import type { DocumentRecord } from '@/lib/db'

/** Slug sûr pour les noms de fichiers téléchargés (PDF compilé, lettres .html). */
export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  )
}

/** Télécharge un document produit : blob local d'abord (offline-first), sinon URL signée. */
export async function downloadDoc(d: DocumentRecord): Promise<void> {
  const blob = await getDocumentBlob(d.id)
  if (blob) {
    triggerDownload(URL.createObjectURL(blob), d.fileName, true)
    return
  }
  if (d.filePath) {
    const remote = await downloadDocumentBlob(d.filePath)
    if (remote) triggerDownload(URL.createObjectURL(remote), d.fileName, true)
  }
}

/** Déclenche un téléchargement navigateur (révoque l'object URL si demandé). */
export function triggerDownload(url: string, name: string, revoke: boolean): void {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (revoke) URL.revokeObjectURL(url)
}
