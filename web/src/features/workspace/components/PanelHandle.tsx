import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Poignée de rabat des panneaux latéraux — petite languette verticale 18×46 posée SUR la
 * bordure du panneau (pass 2 fidélité mockup : l'appelant la positionne en `absolute` sur le
 * bord, centrée verticalement, plutôt que flottante dans un gap). Le décalage `-left/-right-[9px]`
 * = moitié de la largeur (18 px) → la languette chevauche la bordure d'1 px. Chevron selon l'état.
 */
export function PanelHandle({
  side,
  open,
  onClick,
  label,
  className,
}: {
  side: 'left' | 'right'
  open: boolean
  onClick: () => void
  label: string
  className?: string
}) {
  // Panneau gauche ouvert → chevron vers la gauche (replier) ; fermé → vers la droite.
  const pointsLeft = side === 'left' ? open : !open
  const Icon = pointsLeft ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      title={label}
      onClick={onClick}
      className={cn(
        'bg-card text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 grid h-[46px] w-[18px] shrink-0 place-items-center rounded-md border shadow-sm transition-colors outline-none focus-visible:ring-[3px]',
        className,
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
