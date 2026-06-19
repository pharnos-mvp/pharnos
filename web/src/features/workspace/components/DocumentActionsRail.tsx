// Rail d'ACTIONS vertical (handoff CEO) — présentation `< lg` des actions du document. Consomme
// EXACTEMENT le même `DocAction[]` que l'en-tête horizontal (DocumentHeader, ≥ lg), produit par
// `buildDocActions` : une seule source de vérité, deux rendus. Icône seule (cibles tactiles 44 px),
// menus en `DropdownMenu`. 100 % tokens → dark/light.
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

const RAIL_BTN = 'size-11 rounded-xl'
const RAIL_ICON = 'size-[19px]'

function RailAction({ a }: { a: DocAction }) {
  const Icon = ACTION_ICON[a.key]
  // Icône seule → le nom accessible vient du libellé (ou de l'aria-label fourni par le modèle).
  const name = a.label ?? a.ariaLabel

  if (a.kind === 'menu') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={RAIL_BTN}
            aria-label={name}
            title={a.title ?? name}
          >
            {Icon ? <Icon className={RAIL_ICON} aria-hidden /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
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
        RAIL_BTN,
        a.variant === 'accent' && ACCENT_CLS,
        (a.variant === 'solid' || pressed) && SOLID_CLS,
      )}
      aria-pressed={pressed}
      aria-label={name}
      title={a.title ?? a.label}
      disabled={a.disabled || (a.kind === 'toggle' && !a.onClick)}
      onClick={a.onClick}
    >
      {Icon ? <Icon className={RAIL_ICON} aria-hidden /> : null}
    </Button>
  )
}

export function DocumentActionsRail({
  actions,
  toolbarLabel,
}: {
  actions: DocAction[]
  /** aria-label de la barre d'outils (i18n, fourni par l'appelant). */
  toolbarLabel: string
}) {
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={toolbarLabel}
      className="bg-card flex w-[54px] shrink-0 [scrollbar-width:none] flex-col items-center gap-1.5 overflow-y-auto border-r py-2 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {actions.map((a) =>
        a.kind === 'separator' ? (
          <span key={a.key} className="bg-border my-0.5 h-px w-6" aria-hidden />
        ) : (
          <RailAction key={a.key} a={a} />
        ),
      )}
    </div>
  )
}
