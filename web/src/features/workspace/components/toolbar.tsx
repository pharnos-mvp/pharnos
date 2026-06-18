import type { Editor } from '@tiptap/core'
import { Bold, Heading2, Italic, List } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'

/** Barre de mise en forme TipTap (gras/italique/titre/liste) — affichée en mode Modifier. */
export function FormatToolbar({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  if (!editor) return null
  return (
    <div className="bg-card flex items-center gap-1 border-b p-1.5">
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
