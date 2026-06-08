import type { Editor } from '@tiptap/core'

/**
 * Insertion / retrait de la signature dans une lettre générée (TipTap/ProseMirror).
 *
 * La signature est une **image inline** marquée par son `alt` (→ identifiable pour le toggle).
 * Elle est placée à l'emplacement réservé du modèle — le paragraphe « [Signature et cachet] »
 * (entre « [Poste] » et « [Nom…] ») — afin de ne jamais écraser de texte. Repli : fin du document.
 * Taille officielle : la compilation PDF borne l'image inline (~6 cm) ; aucune mise à l'échelle ici.
 */

export const SIGNATURE_ALT = 'Signature'
const PLACEHOLDER = '[Signature et cachet]'

/** Vrai si la lettre contient déjà une signature insérée. */
export function hasSignature(editor: Editor): boolean {
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image' && node.attrs.alt === SIGNATURE_ALT) found = true
    return !found
  })
  return found
}

/** Insère la signature au marqueur « [Signature et cachet] » (sinon en fin de document). */
export function insertSignature(editor: Editor, src: string): void {
  if (hasSignature(editor)) return
  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (range) return false
    if (node.isText && (node.text ?? '').includes(PLACEHOLDER)) {
      range = { from: pos, to: pos + node.nodeSize }
      return false
    }
    return true
  })
  const image = { type: 'image', attrs: { src, alt: SIGNATURE_ALT } }
  if (range) editor.chain().focus().insertContentAt(range, image).run()
  else editor.chain().focus().insertContent(image).run()
}

/** Retire la signature insérée et restaure le marqueur « [Signature et cachet] ». */
export function removeSignature(editor: Editor): void {
  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (range) return false
    if (node.type.name === 'image' && node.attrs.alt === SIGNATURE_ALT) {
      range = { from: pos, to: pos + node.nodeSize }
      return false
    }
    return true
  })
  if (range) {
    editor.chain().focus().insertContentAt(range, { type: 'text', text: PLACEHOLDER }).run()
  }
}
