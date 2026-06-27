import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Conteneur de page standard du design-system : largeur de lecture maîtrisée + rythme vertical
 * unifié (densité « équilibrée-pro » = 1,5 rem entre blocs). Toute page applique `<Page>` pour un
 * gabarit identique d'une surface à l'autre. Surcharger `className` au besoin (ex. `max-w-3xl`).
 */
function Page({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="page" className={cn('mx-auto max-w-5xl space-y-6', className)} {...props} />
  )
}

export { Page }
