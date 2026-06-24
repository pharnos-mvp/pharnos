import { useEffect } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'

import { useI18n } from '@/lib/i18n-context'
import { editorExtensions } from './tiptap-extensions'

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
  const { t } = useI18n()
  const editor = useEditor(
    {
      // Extensions partagées avec l'import docx (même schéma) : StarterKit (Heading→LockedHeading),
      // Image base64, TextAlign, tableaux non redimensionnables. Export DOCX + compilation PDF rendent
      // tous ces nœuds → aucune perte.
      extensions: editorExtensions(),
      // Garde-fou : un contenu non-ProseMirror ferait planter TipTap au montage.
      content:
        initialContent && (initialContent as { type?: string }).type === 'doc'
          ? initialContent
          : { type: 'doc', content: [] },
      editable,
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
          'aria-label': t({ fr: 'Éditeur de document', en: 'Document editor' }),
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

  // Attribut `brand` du document (défaut true) → affiche/masque le papier à en-tête/pied. Réactif :
  // le toggle « En-tête/Pied » (1 clic) hide/show instantanément. Guard null/détruit (cf. barre).
  const brand =
    useEditorState({
      editor,
      selector: ({ editor: e }) => (e && !e.isDestroyed ? (e.state.doc.attrs.brand ?? true) : true),
    }) ?? true

  return (
    <div className="editor-page-wrap">
      <div className="editor-page">
        {header && brand ? (
          <img src={header} alt={t({ fr: 'En-tête', en: 'Header' })} className="editor-band" />
        ) : null}
        <EditorContent editor={editor} />
        {footer && brand ? (
          <img
            src={footer}
            alt={t({ fr: 'Pied de page', en: 'Footer' })}
            className="editor-band editor-band-footer"
          />
        ) : null}
      </div>
    </div>
  )
}
