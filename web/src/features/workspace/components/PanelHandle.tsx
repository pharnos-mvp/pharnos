import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Poignée de rabat des panneaux latéraux — mockup CEO (pharnos_3.html `.handle-btn`) :
 * petite languette verticale 18×46 sur le bord INTÉRIEUR du panneau, centrée à l'écran
 * (sticky), chevron orienté selon l'état.
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
        'bg-card text-muted-foreground hover:text-foreground hover:bg-accent sticky top-[45svh] grid h-[46px] w-[18px] shrink-0 place-items-center self-start rounded-lg border shadow-sm',
        className,
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
