import * as React from 'react'
import { Link, type LinkProps } from 'react-router-dom'

import { cn } from '@/lib/utils'

/**
 * Ligne-carte premium du design-system (DA Dashboard/cockpit) : carte cliquable avec hover-lift.
 * Source UNIQUE remplaçant les `.doc-row` / `.cat-row` / `.alert-row` dupliqués par surface.
 * Tokens sémantiques uniquement (premium = neutre, cf. `index.css` où `--card`/`--border` == `--pd-*`).
 *
 * Composition : `ListRow` > [`ListRowIcon`] + contenu principal (`ListRowLink` = lien étiré) + asides
 * (badges/drapeaux, non interactifs) + [`ListRowActions`] (au-dessus du lien étiré via z-index).
 */
function ListRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        'group bg-card relative flex items-center gap-3.5 rounded-xl border px-4 py-3',
        'hover:border-muted-foreground/25 transition-all duration-150 hover:-translate-y-px hover:shadow-md',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  )
}

/** Pastille d'icône (dégradé bleu de la DA, cf. `.prod-ico`). Surchargeable via `className`. */
function ListRowIcon({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl',
        'bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700',
        'dark:from-[#14233b] dark:to-[#1c3a5e] dark:text-sky-300',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Lien principal de la ligne = **lien étiré** : son `::after` couvre toute la carte (`ListRow` est
 * `relative`) → toute la ligne est cliquable. Un seul lien accessible par carte. Les actions
 * (`ListRowActions`) repassent au-dessus via z-index. Anneau de focus dessiné sur le `::after`.
 */
function ListRowLink({ className, ...props }: LinkProps) {
  return (
    <Link
      data-slot="list-row-link"
      className={cn(
        'font-display text-foreground block truncate text-sm font-semibold transition-colors',
        'group-hover:text-info outline-none',
        'after:absolute after:inset-0 after:rounded-xl after:content-[""]',
        'focus-visible:after:ring-ring/60 focus-visible:after:ring-2 focus-visible:after:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Variante BOUTON du lien étiré (mêmes style + zone cliquable que `ListRowLink`) — pour une action
 * qui n'est PAS une navigation (ex. ouvrir un panneau). Accessible : le texte du bouton = son nom.
 */
function ListRowButton({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      data-slot="list-row-button"
      className={cn(
        'font-display text-foreground block w-full truncate text-left text-sm font-semibold transition-colors',
        'group-hover:text-info cursor-pointer outline-none',
        'after:absolute after:inset-0 after:rounded-xl after:content-[""]',
        'focus-visible:after:ring-ring/60 focus-visible:after:ring-2 focus-visible:after:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
}

/** Zone d'actions : repasse AU-DESSUS du lien étiré (sinon le clic naviguerait). */
function ListRowActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-row-actions"
      className={cn('relative z-10 flex shrink-0 items-center gap-1', className)}
      {...props}
    />
  )
}

export { ListRow, ListRowIcon, ListRowLink, ListRowButton, ListRowActions }
