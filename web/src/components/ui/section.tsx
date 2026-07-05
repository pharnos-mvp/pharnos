import * as React from 'react'

import { cn } from '@/lib/utils'

interface SectionProps extends Omit<React.ComponentProps<'section'>, 'title'> {
  /** Titre du bloc (h2). */
  title: React.ReactNode
  /** Explication courte sous le titre (optionnel). */
  description?: React.ReactNode
  /** Actions du bloc (ex. bouton Enregistrer), alignées à droite (optionnel). */
  actions?: React.ReactNode
}

/**
 * Bloc titré STANDARD du design-system (primitive « Section » prévue au LOT 1, 1er consommateur =
 * LOT 7 Compte) : carte `bg-card` + en-tête h2 (Syne) / description / actions + contenu. Toute
 * page de réglages ou de regroupement compose des `Section` au lieu d'improviser cartes + titres
 * ad-hoc. Le rythme interne (16 px) est porté par la carte ; le rythme entre blocs par la page.
 */
function Section({ title, description, actions, className, children, ...props }: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn('bg-card space-y-4 rounded-xl border p-5', className)}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export { Section }
