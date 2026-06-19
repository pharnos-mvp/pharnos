// Barre de SECTIONS (pastilles rondes) — navigation du dossier sous `lg` (refonte responsive
// tablette/mobile, handoff CEO). Remplace l'arborescence latérale pour la NAVIGATION (l'édition
// de structure reste desktop-only). Ordre croissant (flattenTree) ; chaque pastille porte le
// numéro de section + un point de statut (ambré « à vérifier » si constat non résolu, sinon
// emeraude si la section contient au moins une pièce) + l'état actif. 100 % tokens → dark/light.
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from '../module1-tree'
import type { SectionChip } from './section-chips-model'

export function SectionChips({
  chips,
  onSelect,
}: {
  chips: SectionChip[]
  onSelect: (node: CtdNodeDef) => void
}) {
  const { t } = useI18n()
  const railRef = useRef<HTMLDivElement>(null)
  const activeId = chips.find((c) => c.active)?.id ?? null

  // La pastille active se recentre dans la vue quand la sélection change (clic, remarque, clavier).
  useEffect(() => {
    if (!activeId) return
    railRef.current
      ?.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  const scrollByDir = (dir: -1 | 1) =>
    railRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' })

  // Roving focus clavier (←/→/Début/Fin) : déplace le focus entre pastilles SANS sélectionner
  // (Entrée/Espace/clic sélectionne) → pas de re-rendu coûteux à chaque flèche.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      railRef.current?.querySelectorAll<HTMLButtonElement>('[data-chip-id]') ?? [],
    )
    if (buttons.length === 0) return
    const cur = buttons.findIndex((b) => b === document.activeElement)
    let next: number
    switch (e.key) {
      case 'ArrowRight':
        next = cur < 0 ? 0 : (cur + 1) % buttons.length
        break
      case 'ArrowLeft':
        next = cur < 0 ? 0 : (cur - 1 + buttons.length) % buttons.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = buttons.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    const target = buttons[next]
    target?.focus()
    target?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }

  return (
    <nav
      aria-label={t({ fr: 'Sections du dossier', en: 'Dossier sections' })}
      className="bg-muted/40 flex shrink-0 items-center gap-1 border-t px-1 py-1.5"
    >
      {/* Flèches de défilement — affordance souris/tactile (le clavier utilise ←/→ sur les pastilles). */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => scrollByDir(-1)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full"
      >
        <ChevronLeft className="size-5" />
      </button>

      <div
        ref={railRef}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-2 overflow-x-auto scroll-smooth py-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            data-chip-id={c.id}
            // c.number + c.label = structure CTD réglementaire → non traduits. Le statut « à
            // vérifier » est annoncé en toutes lettres (pas seulement par la couleur du point — 1.4.1).
            aria-label={`${c.number} ${c.label}${
              c.flagged ? ` — ${t({ fr: 'à vérifier', en: 'to review' })}` : ''
            }`}
            aria-current={c.active ? 'true' : undefined}
            title={`${c.number} ${c.label}`}
            tabIndex={c.active || (!activeId && c === chips[0]) ? 0 : -1}
            onClick={() => onSelect(c.node)}
            className={cn(
              'focus-visible:ring-ring/60 bg-card relative grid shrink-0 snap-center place-items-center rounded-full border font-medium tabular-nums transition-all outline-none focus-visible:ring-[3px]',
              c.active
                ? 'border-brand text-brand size-[50px] border-2 text-[13.5px] font-bold shadow-md'
                : 'border-border text-foreground hover:bg-accent size-11 text-[12px]',
            )}
          >
            {c.number}
            {c.flagged ? (
              <span
                aria-hidden
                className="ring-card absolute top-0.5 right-0.5 size-2 rounded-full bg-amber-500 ring-2"
              />
            ) : c.hasContent ? (
              <span
                aria-hidden
                className="ring-card absolute top-0.5 right-0.5 size-2 rounded-full bg-emerald-500 ring-2"
              />
            ) : null}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => scrollByDir(1)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full"
      >
        <ChevronRight className="size-5" />
      </button>
    </nav>
  )
}
