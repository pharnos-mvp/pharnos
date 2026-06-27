import * as React from 'react'
import { TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ErrorStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** QUOI : ce qui n'a pas fonctionné. */
  title: React.ReactNode
  /** POURQUOI : la cause, en clair (optionnel). */
  reason?: React.ReactNode
  /** QUE FAIRE : action de remédiation / réessai + CTA (optionnel). */
  action?: React.ReactNode
}

/**
 * État d'erreur ACTIONNABLE — le pattern unique de l'app : **quoi** (titre) / **pourquoi** (reason)
 * / **que faire** (action + CTA). Standardise tous les messages d'erreur (= absorbe le backlog
 * « erreurs actionnables »). Pour une erreur bloquante de surface (≠ toast transitoire).
 */
function ErrorState({ title, reason, action, className, ...props }: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 flex flex-col items-center rounded-lg border px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      <TriangleAlert className="text-destructive mb-3 size-8" aria-hidden="true" />
      <h2 className="text-base font-medium">{title}</h2>
      {reason ? (
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">{reason}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export { ErrorState }
