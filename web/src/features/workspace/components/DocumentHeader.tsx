// EN-TÊTE DE DOCUMENT UNIQUE du CTD builder (mockup docs/mockups/ctd-builder-unified-header.html).
// Cadre CONSTANT : identité du document à gauche, barre d'actions à droite — seules les actions
// changent selon le type (pilotées par `buildDocActions`). Remplace l'empilement pilule + barre
// d'actions + bandeau navy + barre de format. 100 % tokens de thème → dark/light automatiques.
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { DocAction, DocHeaderStatus, DocStatusTone } from './document-header-model'
import { ACCENT_CLS, ACTION_ICON, MENU_ICON, SOLID_CLS } from './action-presentation'

const STATUS_TONE: Record<DocStatusTone, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  auto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  file: 'bg-brand/10 text-brand',
  todo: 'bg-muted text-muted-foreground',
}

export interface DocumentHeaderProps {
  number?: string
  title: string
  subtitle?: string
  status?: DocHeaderStatus
  actions: DocAction[]
  /** Mise en forme (lettre en édition) insérée juste après la bascule « Modifier ». */
  formatSlot?: ReactNode
  /** aria-label de la barre d'actions (i18n, fourni par l'appelant). */
  toolbarLabel: string
}

// Métriques EXACTES du mockup (.act) : h 34, padding 0 11, radius 9, font 13, gap 6, icône 17.
// M2 responsive : sous une largeur d'en-tête de 48rem (conteneur `dh`), passage à 44px (cible
// tactile) ; les libellés repliables passent en icône seule (cf. `label` + `@max-[48rem]/dh:sr-only`).
const ACT_BASE =
  'h-[34px] gap-[6px] rounded-[9px] px-[11px] text-[13px] font-medium @max-[48rem]/dh:h-11'
const ACT_ICON = 'size-[17px]'

function ActionButton({ a }: { a: DocAction }) {
  const Icon = ACTION_ICON[a.key]
  // Libellé repliable : icône seule sous 48rem (sr-only → garde le nom accessible du bouton).
  const label = a.label ? (
    <span className={cn(a.collapsible && '@max-[48rem]/dh:sr-only')}>{a.label}</span>
  ) : null

  if (a.kind === 'menu') {
    const iconOnly = !a.label
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={iconOnly ? 'icon' : 'sm'}
            className={cn(ACT_BASE, iconOnly && 'size-[34px] px-0 @max-[48rem]/dh:size-11')}
            aria-label={a.ariaLabel}
            title={a.title ?? a.ariaLabel}
          >
            {Icon ? <Icon className={ACT_ICON} aria-hidden /> : null}
            {label}
            {!iconOnly ? (
              <ChevronDown className="text-muted-foreground size-4" aria-hidden />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
      size="sm"
      variant={a.variant === 'solid' || pressed ? 'default' : 'outline'}
      className={cn(
        ACT_BASE,
        a.variant === 'accent' && ACCENT_CLS,
        (a.variant === 'solid' || pressed) && SOLID_CLS,
      )}
      aria-pressed={pressed}
      aria-label={a.label ? undefined : a.ariaLabel}
      title={a.title}
      disabled={a.disabled || (a.kind === 'toggle' && !a.onClick)}
      onClick={a.onClick}
    >
      {Icon ? <Icon className={ACT_ICON} aria-hidden /> : null}
      {label}
    </Button>
  )
}

export function DocumentHeader({
  number,
  title,
  subtitle,
  status,
  actions,
  formatSlot,
  toolbarLabel,
}: DocumentHeaderProps) {
  const StatusIcon = status?.icon
  return (
    <div className="bg-card @container/dh flex min-h-[54px] flex-wrap items-center gap-[14px] border-b px-4 py-2">
      <div className="flex min-w-0 items-center gap-[11px]">
        {/* Mockup .docid : numéro (badge) · titre+sous-titre (colonne) · statut. Le sous-titre
            s'aligne sous le TITRE, pas sous le numéro. Le numéro reste dans le nom accessible du
            titre h2 (sr-only) → repère de navigation des lecteurs d'écran + fil d'Ariane. */}
        {number ? (
          <span className="bg-brand/10 text-brand border-brand/20 rounded-[8px] border px-[9px] py-[4px] text-[13px] font-bold whitespace-nowrap tabular-nums">
            {number}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col">
          <h2 className="m-0 truncate text-[15px] leading-tight font-semibold" title={title}>
            {number ? <span className="sr-only">{number} </span> : null}
            <span>{title}</span>
          </h2>
          {subtitle ? (
            <span className="text-muted-foreground text-[12px] leading-tight">{subtitle}</span>
          ) : null}
        </span>
        {status ? (
          <span
            className={cn(
              'inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11.5px] font-semibold',
              STATUS_TONE[status.tone],
            )}
          >
            {StatusIcon ? <StatusIcon className="size-3.5" aria-hidden /> : null}
            {status.label}
          </span>
        ) : null}
      </div>

      <div
        role="toolbar"
        aria-label={toolbarLabel}
        className="ml-auto flex flex-wrap items-center justify-end gap-[7px]"
      >
        {actions.map((a) => {
          if (a.kind === 'separator')
            return <span key={a.key} className="bg-border mx-1 h-6 w-px" aria-hidden />
          return (
            <span key={a.key} className="contents">
              <ActionButton a={a} />
              {a.key === 'edit' && formatSlot ? (
                <>
                  <span className="bg-border mx-1 h-6 w-px" aria-hidden />
                  {formatSlot}
                </>
              ) : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}
