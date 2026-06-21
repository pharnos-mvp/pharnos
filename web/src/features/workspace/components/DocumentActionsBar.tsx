// Barre d'ACTIONS horizontale COMPACTE (retour CEO) — présentation `< lg` des actions du document
// DANS la barre d'onglets (à droite), à la place du rail vertical. Consomme EXACTEMENT le même
// `DocAction[]` que l'en-tête (DocumentHeader) et le rail — une seule source de vérité. Icône seule,
// boutons réduits (size-8). 100 % tokens → dark/light. « Supprimer » = bouton rouge direct (tablette).
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { DocAction } from './document-header-model'
import { ACCENT_CLS, ACTION_ICON, MENU_ICON, SOLID_CLS } from './action-presentation'

const BTN = 'size-8 rounded-lg'
const ICON = 'size-[15px]'
const DANGER_CLS =
  'border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive'

function BarAction({ a }: { a: DocAction }) {
  const Icon = ACTION_ICON[a.key]
  const name = a.label ?? a.ariaLabel

  if (a.kind === 'menu') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={BTN}
            aria-label={name}
            title={a.title ?? name}
          >
            {Icon ? <Icon className={ICON} aria-hidden /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          {(a.menu ?? []).map((m) => {
            const MIcon = MENU_ICON[m.key]
            return (
              <DropdownMenuItem
                key={m.key}
                disabled={m.disabled}
                variant={m.destructive ? 'destructive' : 'default'}
                onSelect={() => m.onSelect()}
              >
                {MIcon ? <MIcon className="size-4" aria-hidden /> : null}
                {m.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const pressed = a.kind === 'toggle' ? !!a.pressed : undefined
  return (
    <Button
      type="button"
      size="icon"
      variant={a.variant === 'solid' || pressed ? 'default' : 'outline'}
      className={cn(
        BTN,
        a.variant === 'accent' && ACCENT_CLS,
        (a.variant === 'solid' || pressed) && SOLID_CLS,
        a.variant === 'danger' && DANGER_CLS,
      )}
      aria-pressed={pressed}
      aria-label={name}
      title={a.title ?? a.label}
      disabled={a.disabled || (a.kind === 'toggle' && !a.onClick)}
      onClick={a.onClick}
    >
      {Icon ? <Icon className={ICON} aria-hidden /> : null}
    </Button>
  )
}

export function DocumentActionsBar({
  actions,
  toolbarLabel,
}: {
  actions: DocAction[]
  /** aria-label de la barre d'outils (i18n, fourni par l'appelant). */
  toolbarLabel: string
}) {
  return (
    <div role="toolbar" aria-label={toolbarLabel} className="flex shrink-0 items-center gap-1">
      {actions.map((a) =>
        a.kind === 'separator' ? (
          <span key={a.key} className="bg-border mx-0.5 h-5 w-px" aria-hidden />
        ) : (
          <BarAction key={a.key} a={a} />
        ),
      )}
    </div>
  )
}
