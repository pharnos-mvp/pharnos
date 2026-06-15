import { getDocumentBlob } from '@/features/catalogue/documents-repository'
import { downloadDocumentBlob } from '@/features/catalogue/documents-sync'
import type { DocumentRecord } from '@/lib/db'

/** Slug sûr pour les noms de fichiers téléchargés (lettres .html, exports divers). */
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

/**
 * Nom de fichier sûr CONSERVANT espaces, casse et accents (≠ slugify) — retire uniquement les
 * caractères interdits par les systèmes de fichiers (Windows/macOS/Linux) et les caractères de
 * contrôle, puis compacte les espaces. Ex. « Gynoril ovule » → « Gynoril ovule ».
 * (Backslash exprimé en \x5c, contrôles en \x00-\x1f — préserve tirets et lettres accentuées.)
 */
export function safeFileName(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\x5c|?*\x00-\x1f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'document'
  )
}

/**
 * Base du nom de fichier d'un dossier : « {Nom produit}_M1_{sigle pays} »
 * (ex. « Gynoril ovule_M1_bj »). Le nom produit garde casse/espaces/accents ; le sigle pays est
 * mis en minuscules. Réutilisé pour le PDF compilé (point 13) et le rapport d'audit (point 14).
 */
export function dossierBaseName(productName: string, country: string): string {
  return `${safeFileName(productName)}_M1_${(country || '').toLowerCase()}`
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
