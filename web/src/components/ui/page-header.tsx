import * as React from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** Titre de la page (h1). */
  title: React.ReactNode
  /** Sous-titre explicatif (optionnel). */
  description?: React.ReactNode
  /** Actions de page (boutons), alignées à droite (optionnel). */
  actions?: React.ReactNode
}

/**
 * En-tête de page UNIFIÉ : titre + sous-titre + actions à droite. Remplace les en-têtes ad-hoc
 * (chaque page avait sa taille/graisse de h1) → un seul traitement partout. Échelle typo arrêtée :
 * h1 = `font-display text-2xl font-semibold tracking-tight` (Syne), sous-titre = `text-sm
 * text-muted-foreground`.
 */
function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn('flex flex-wrap items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export { PageHeader }
