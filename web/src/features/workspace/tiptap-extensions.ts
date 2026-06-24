import type { Extensions } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'

import { LockedHeading } from './locked-heading'

/**
 * Extensions **partagées** de l'éditeur (RichTextEditor) ET de l'import HTML/docx (`generateJSON`) →
 * MÊME schéma : un document importé est validé et édité avec exactement les mêmes nœuds (titres,
 * gras/italique, listes, tableaux, images base64). Heading remplacé par LockedHeading (cf. squelettes).
 */
export function editorExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: false }),
    LockedHeading,
    Image.configure({ inline: true, allowBase64: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}
