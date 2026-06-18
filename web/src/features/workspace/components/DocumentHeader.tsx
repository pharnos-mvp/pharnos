// EN-TÊTE DE DOCUMENT UNIQUE du CTD builder (mockup docs/mockups/ctd-builder-unified-header.html).
// Cadre CONSTANT : identité du document à gauche, barre d'actions à droite — seules les actions
// changent selon le type (pilotées par `buildDocActions`). Remplace l'empilement pilule + barre
// d'actions + bandeau navy + barre de format. 100 % tokens de thème → dark/light automatiques.
import type { ReactNode } from 'react'
import {
  ChevronDown,
  Download,
  FileDown,
  FileText,
  MoreHorizontal,
  PanelTop,
  Pencil,
  Replace,
  RotateCcw,
  ScanSearch,
  Signature,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { DocAction, DocHeaderStatus, DocStatusTone } from './document-header-model'

/** Icône par clé d'action (présentation — le modèle reste agnostique du jeu d'icônes). */
const ACTION_ICON: Record<string, LucideIcon> = {
  edit: Pencil,
  regenerate: Sparkles,
  sign: Signature,
  branding: PanelTop,
  download: Download,
  upload: Upload,
  reset: RotateCcw,
  settings: SlidersHorizontal,
  analyze: ScanSearch,
  replace: Replace,
  generate: Sparkles,
  auto: Sparkles,
  more: MoreHorizontal,
}
const MENU_ICON: Record<string, LucideIcon> = { pdf: FileText, docx: FileDown, remove: Trash2 }

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

const ACCENT_CLS =
  'border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/60 dark:text-emerald-300 dark:hover:bg-emerald-500/10'
const SOLID_CLS = 'bg-brand text-brand-foreground hover:bg-brand/90 border-transparent'

function ActionButton({ a }: { a: DocAction }) {
  const Icon = ACTION_ICON[a.key]
  const label = a.label ? <span className={cn(a.collapsible && 'dh-label')}>{a.label}</span> : null

  if (a.kind === 'menu') {
    const iconOnly = !a.label
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={iconOnly ? 'icon' : 'sm'}
            className={cn('h-8', iconOnly && 'size-8')}
            aria-label={a.ariaLabel}
            title={a.title ?? a.ariaLabel}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {label}
            {!iconOnly ? (
              <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
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
        'h-8',
        a.variant === 'accent' && ACCENT_CLS,
        (a.variant === 'solid' || pressed) && SOLID_CLS,
      )}
      aria-pressed={pressed}
      aria-label={a.label ? undefined : a.ariaLabel}
      title={a.title}
      disabled={a.disabled || (a.kind === 'toggle' && !a.onClick)}
      onClick={a.onClick}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
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
    <div className="bg-card flex min-h-[3.25rem] flex-wrap items-center gap-3 border-b px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex min-w-0 flex-col">
          {/* Identité = titre de niveau 2 du document (numéro CTD + intitulé) : repère de
              navigation pour les lecteurs d'écran, source de vérité du fil d'Ariane. */}
          <h2 className="m-0 flex min-w-0 items-center gap-2 text-[15px] leading-tight font-medium">
            {number ? (
              <span className="bg-brand/10 text-brand border-brand/20 rounded-md border px-2 py-0.5 text-[13px] font-bold tabular-nums">
                {number}
              </span>
            ) : null}{' '}
            <span className="truncate" title={title}>
              {title}
            </span>
          </h2>
          {subtitle ? (
            <span className="text-muted-foreground mt-0.5 text-xs">{subtitle}</span>
          ) : null}
        </span>
        {status ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
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
        className="ml-auto flex flex-wrap items-center justify-end gap-1.5"
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
