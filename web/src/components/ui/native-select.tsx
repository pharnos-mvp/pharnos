import { type ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Classe d'un `<select>` — CALQUÉE sur le trigger du DS `Select` (bordure + fond + focus identiques)
 * pour que les sélecteurs se voient comme les autres champs. `appearance-none` retire le chevron
 * natif (peu visible / non thématisable) ; on en repose un clair via `NativeSelect` (`pr-9` = sa place).
 */
export const SELECT_CLASS =
  'border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none rounded-md border bg-transparent px-3 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50'

/** `<select>` natif habillé DS + chevron visible (léger, sans le coût bundle de Radix Select). */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select className={cn(SELECT_CLASS, className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-60"
        aria-hidden
      />
    </div>
  )
}
