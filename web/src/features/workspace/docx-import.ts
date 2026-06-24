import type { JSONContent } from '@tiptap/core'

import { editorExtensions } from './tiptap-extensions'
import { parseTiptapContent } from './tiptap-schema'

/**
 * Import d'un **.docx** en document **éditable nativement** : `mammoth` (docx → HTML) puis
 * `@tiptap/html` (HTML → ProseMirror, MÊMES extensions que l'éditeur) puis validation de schéma
 * (anti-quarantaine). Titres/gras/italique/listes/tableaux/images base64 préservés ; mises en page
 * Word complexes simplifiées. **Tout en import dynamique** → mammoth/@tiptap/html hors du chunk
 * d'entrée. Renvoie `null` si la conversion échoue (ex. ancien `.doc` binaire, non géré par mammoth).
 */

/** HTML → contenu TipTap validé (exposé pour test, sans dépendre de mammoth). */
export async function htmlToTiptap(html: string): Promise<JSONContent | null> {
  if (!html || !html.trim()) return null
  const { generateJSON } = await import('@tiptap/html')
  try {
    const json = generateJSON(html, editorExtensions())
    return parseTiptapContent(json)
  } catch (e) {
    console.error(e)
    return null
  }
}

export async function docxToTiptap(file: File): Promise<JSONContent | null> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
    return await htmlToTiptap(html)
  } catch (e) {
    console.error(e)
    return null
  }
}
