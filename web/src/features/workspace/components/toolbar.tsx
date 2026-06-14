import type { Editor } from '@tiptap/core'
import { Bold, Heading2, Italic, List } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

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

/** Bouton de la pilule d'actions SOMBRE du workspace (mockup CEO) : libellé clair sur fond
 *  sombre, l'état actif s'inverse en pastille claire. */
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
  const { t } = useI18n()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 rounded-full px-3 text-xs',
        active
          ? 'bg-background text-foreground hover:bg-background/90'
          : 'text-background/85 hover:bg-background/15 hover:text-background',
      )}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? (hint ?? t({ fr: 'Bientôt disponible', en: 'Coming soon' })) : label}
    >
      {label}
    </Button>
  )
}
