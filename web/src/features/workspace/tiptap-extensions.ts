import type { Extensions } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'

import { LockedHeading } from './locked-heading'

/**
 * Document avec attribut `brand` (défaut **true**) : pilote l'affichage du papier à en-tête/pied —
 * toggle « En-tête/Pied » EN UN CLIC (insérer/retirer), instantané, persisté dans le contenu et lu
 * par la compilation. `true`/absent = en-tête/pied affichés (comportement historique).
 */
const BrandedDocument = Document.extend({
  addAttributes() {
    return { brand: { default: true } }
  },
})

/**
 * Extensions **partagées** de l'éditeur (RichTextEditor) ET de l'import HTML/docx (`generateJSON`) →
 * MÊME schéma : un document importé est validé et édité avec exactement les mêmes nœuds (titres,
 * gras/italique, listes, tableaux, images base64). Heading remplacé par LockedHeading (cf. squelettes).
 */
export function editorExtensions(): Extensions {
  return [
    // heading→LockedHeading ; link/underline DÉSACTIVÉS : le schéma de validation (tiptap-schema) ne
    // connaît QUE bold/italic/strike/code → une marque link/underline ferait rejeter (EMPTY_DOC) le
    // document au pull cross-client = PERTE dans le livrable métré. On garde « affiché = compilé ».
    StarterKit.configure({ heading: false, link: false, underline: false, document: false }),
    BrandedDocument,
    LockedHeading,
    Image.configure({ inline: true, allowBase64: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}
