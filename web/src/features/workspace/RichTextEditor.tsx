import { useEffect } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
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
}

/**
 * Éditeur rich-text TipTap (ProseMirror) — édition in-place des documents générés (M3).
 * Importé uniquement par le workspace (route lazy) → hors du bundle initial.
 */
export function RichTextEditor({
  docId,
  initialContent,
  editable,
  onChange,
  onReady,
}: RichTextEditorProps) {
  const editor = useEditor(
    {
      extensions: [StarterKit],
      content: initialContent,
      editable,
      editorProps: {
        attributes: {
          class: 'ProseMirror min-h-64 px-4 py-3 text-sm focus:outline-none',
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

  return <EditorContent editor={editor} />
}
