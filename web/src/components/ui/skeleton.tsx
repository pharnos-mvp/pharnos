import * as React from 'react'

import { cn } from '@/lib/utils'

/** Bloc de chargement (placeholder animé) — remplace les « Chargement… » textuels ad-hoc. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
