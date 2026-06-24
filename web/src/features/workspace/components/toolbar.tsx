import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Bold, Heading2, Italic, List, Redo2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'

/** Groupe de mise en forme TipTap (annuler/rétablir · gras/italique/titre/liste) — inséré dans
 *  l'en-tête de document en mode Modifier (mockup `.fmt` : groupe pastille bordé, fond marque léger). */
export function FormatToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  // Éditeur non-null garanti → l'inner peut appeler les hooks (useEditorState) sans risque d'ordre.
  return <FormatToolbarInner editor={editor} />
}

function FormatToolbarInner({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  // État Annuler/Rétablir RÉACTIF : suit l'historique (UndoRedo de StarterKit) et ne déclenche un
  // rendu que lorsque la disponibilité change réellement (sélecteur comparé en valeur).
  const { canUndo, canRedo } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ canUndo: e.can().undo(), canRedo: e.can().redo() }),
  })
  return (
    <div className="bg-brand/5 inline-flex items-center gap-[2px] rounded-[9px] border p-[2px]">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t({ fr: 'Annuler', en: 'Undo' })}
        disabled={!canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t({ fr: 'Rétablir', en: 'Redo' })}
        disabled={!canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" />
      </Button>
      <span className="bg-border mx-[2px] h-5 w-px" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t({ fr: 'Gras', en: 'Bold' })}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t({ fr: 'Italique', en: 'Italic' })}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t({ fr: 'Titre', en: 'Heading' })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t({ fr: 'Liste à puces', en: 'Bullet list' })}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </Button>
    </div>
  )
}
