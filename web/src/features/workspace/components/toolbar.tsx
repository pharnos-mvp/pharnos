import type { Editor } from '@tiptap/core'
import { Bold, Heading2, Italic, List } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Barre de mise en forme TipTap (gras/italique/titre/liste) — affichée en mode Modifier. */
export function FormatToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  return (
    <div className="bg-card flex items-center gap-1 border-b p-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Gras"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Italique"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Titre"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Liste à puces"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </Button>
    </div>
  )
}

/** Bouton pilule de la barre de menus du workspace (Modifier/Signer/Télécharger…). */
export function ToolbarBtn({
  label,
  disabled,
  active,
  hint,
  onClick,
}: {
  label: string
  disabled?: boolean
  active?: boolean
  hint?: string
  onClick?: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className="rounded-full"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? (hint ?? 'Bientôt disponible') : label}
    >
      {label}
    </Button>
  )
}
