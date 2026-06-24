import type { JSONContent } from '@tiptap/core'

import { editorExtensions } from './tiptap-extensions'
import { parseTiptapContent } from './tiptap-schema'

// Images conservées : data URL PNG/JPEG (ce que la compilation pdf-lib sait embarquer). Word colle
// souvent de l'EMF/WMF/GIF/webp : on les RETIRE (dégradation) plutôt que de rejeter tout le document.
const SUPPORTED_IMG = /^data:image\/(png|jpeg);base64,/

/** Retire récursivement les nœuds image au format non supporté → le reste du document est importé. */
function stripUnsupportedImages(node: JSONContent): JSONContent {
  const content = node.content
  if (!Array.isArray(content)) return node
  return {
    ...node,
    content: content
      .filter((c) => !(c.type === 'image' && !SUPPORTED_IMG.test(String(c.attrs?.src ?? ''))))
      .map(stripUnsupportedImages),
  }
}

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
    const json = stripUnsupportedImages(generateJSON(html, editorExtensions()))
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
