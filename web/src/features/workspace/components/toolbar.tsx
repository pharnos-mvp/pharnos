import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Columns3,
  Heading2,
  Italic,
  List,
  Redo2,
  Rows3,
  Table as TableIcon,
  Trash2,
  Undo2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/lib/i18n-context'

/** Groupe de mise en forme TipTap (annuler/rétablir · gras/italique/titre/liste · tableau) — inséré
 *  dans l'en-tête de document en mode Modifier (mockup `.fmt` : groupe pastille bordé, fond marque léger). */
export function FormatToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  // Éditeur non-null garanti → l'inner peut appeler les hooks (useEditorState) sans risque d'ordre.
  return <FormatToolbarInner editor={editor} />
}

function FormatToolbarInner({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  // États RÉACTIFS : Annuler/Rétablir suivent l'historique (UndoRedo de StarterKit) ; `inTable`
  // pilote les actions de tableau. Re-render uniquement quand l'une de ces valeurs change.
  // GUARD : pendant un changement de document (upload, navigation), l'éditeur peut être détruit/null
  // au moment où le sélecteur s'exécute → `e.can()` planterait (« reading 'can' » → écran noir).
  const { canUndo, canRedo, inTable } = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && !e.isDestroyed
        ? { canUndo: e.can().undo(), canRedo: e.can().redo(), inTable: e.isActive('table') }
        : { canUndo: false, canRedo: false, inTable: false },
  }) ?? { canUndo: false, canRedo: false, inTable: false }
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
      <span className="bg-border mx-[2px] h-5 w-px" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t({ fr: 'Tableau', en: 'Table' })}
          >
            <TableIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={inTable}
            onSelect={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <TableIcon className="size-4" aria-hidden />
            {t({ fr: 'Insérer un tableau', en: 'Insert table' })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={() => editor.chain().focus().addColumnAfter().run()}
          >
            <Columns3 className="size-4" aria-hidden />
            {t({ fr: 'Ajouter une colonne', en: 'Add column' })}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={() => editor.chain().focus().addRowAfter().run()}
          >
            <Rows3 className="size-4" aria-hidden />
            {t({ fr: 'Ajouter une ligne', en: 'Add row' })}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={() => editor.chain().focus().deleteColumn().run()}
          >
            <Columns3 className="size-4" aria-hidden />
            {t({ fr: 'Supprimer la colonne', en: 'Delete column' })}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={() => editor.chain().focus().deleteRow().run()}
          >
            <Rows3 className="size-4" aria-hidden />
            {t({ fr: 'Supprimer la ligne', en: 'Delete row' })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!inTable}
            onSelect={() => editor.chain().focus().deleteTable().run()}
          >
            <Trash2 className="size-4" aria-hidden />
            {t({ fr: 'Supprimer le tableau', en: 'Delete table' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
