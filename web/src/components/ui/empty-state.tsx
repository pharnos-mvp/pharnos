import * as React from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** Icône décorative (optionnelle), affichée en 2 rem. */
  icon?: React.ReactNode
  /** Titre court de l'état vide. */
  title: React.ReactNode
  /** Explication + ce que ça débloque (optionnel). */
  description?: React.ReactNode
  /** Action principale pour sortir de l'état vide (optionnel). */
  action?: React.ReactNode
}

/**
 * État vide STANDARD : icône + titre + explication + action. Un seul rendu pour toute l'app
 * (avant : chaque page improvisait son « aucun élément »).
 */
function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="text-muted-foreground mb-3 [&_svg]:size-8" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-medium">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
