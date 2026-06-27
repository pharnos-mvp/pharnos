import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const statusBadgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        success: 'bg-success-subtle text-success-subtle-foreground',
        warning: 'bg-warning-subtle text-warning-subtle-foreground',
        danger: 'bg-danger-subtle text-danger-subtle-foreground',
        info: 'bg-info-subtle text-info-subtle-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

/**
 * Badge de STATUT sémantique (RA : approuvé / à renouveler / expiré / en cours…). Style « subtle »
 * (fond teinté clair + texte foncé AA). Porte le sens par la couleur ET le texte — jamais la couleur
 * seule (a11y 1.4.1). Tokens sémantiques de `index.css` (clair + dark). Distinct de `Badge` (chrome).
 */
function StatusBadge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusBadgeVariants>) {
  return (
    <span
      data-slot="status-badge"
      className={cn(statusBadgeVariants({ tone }), className)}
      {...props}
    />
  )
}

export { StatusBadge, statusBadgeVariants }
