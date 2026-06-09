import { useEffect } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface RichTextEditorProps {
  /** Identité du document : un changement recrée l'éditeur avec le nouveau contenu. */
  docId: string
  /** Contenu initial (ProseMirror/TipTap JSON). */
  initialContent: JSONContent
  editable: boolean
  /** Appelé à chaque édition (à débouncer côté appelant). */
  onChange: (json: JSONContent) => void
  /** Expose l'instance éditeur **avec son docId** (téléchargement, régénération, mise en forme). */
  onReady?: (editor: Editor, docId: string) => void
  /** En-tête (papier à en-tête) affiché en haut de la page A4 — data URL. */
  header?: string | null
  /** Pied de page affiché en bas de la page A4 — data URL. */
  footer?: string | null
}

/**
 * Éditeur rich-text TipTap (ProseMirror) — édition in-place des documents générés (M3).
 * Rendu sur une **page A4** (Times New Roman 12, marges 2,5 cm) avec en-tête/pied de page
 * optionnels. Importé uniquement par le workspace (route lazy) → hors du bundle initial.
 */
export function RichTextEditor({
  docId,
  initialContent,
  editable,
  onChange,
  onReady,
  header,
  footer,
}: RichTextEditorProps) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Image.configure({ inline: true, allowBase64: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ],
      // Garde-fou : un contenu non-ProseMirror ferait planter TipTap au montage.
      content:
        initialContent && (initialContent as { type?: string }).type === 'doc'
          ? initialContent
          : { type: 'doc', content: [] },
      editable,
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
          'aria-label': 'Éditeur de document',
        },
      },
      onUpdate: ({ editor: ed }) => onChange(ed.getJSON()),
    },
    // Recrée proprement l'éditeur quand on change de document.
    [docId],
  )

  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  useEffect(() => {
    if (editor && onReady) onReady(editor, docId)
  }, [editor, onReady, docId])

  return (
    <div className="editor-page-wrap">
      <div className="editor-page">
        {header ? <img src={header} alt="En-tête" className="editor-band" /> : null}
        <EditorContent editor={editor} />
        {footer ? (
          <img src={footer} alt="Pied de page" className="editor-band editor-band-footer" />
        ) : null}
      </div>
    </div>
  )
}
