import { PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArborescenceTree } from '../ArborescenceTree'
import type { CtdNodeDef } from '../module1-tree'

/** Panneau gauche du workspace : arborescence Module 1 (repliable, éditable) — move-only T7. */
export function TreePanel({
  collapsed,
  setCollapsed,
  treeEditing,
  setTreeEditing,
  structureOutdated,
  onUpdateStructure,
  tree,
  flatNodes,
  selected,
  onSelectNode,
  countFor,
  onTreeChange,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  treeEditing: boolean
  setTreeEditing: (v: boolean) => void
  structureOutdated: boolean
  onUpdateStructure: () => void
  tree: CtdNodeDef[]
  flatNodes: CtdNodeDef[]
  selected: CtdNodeDef | null
  onSelectNode: (node: CtdNodeDef) => void
  countFor: (node: CtdNodeDef) => number
  onTreeChange: (tree: CtdNodeDef[]) => void
}) {
  if (collapsed) {
    return (
      <div className="bg-card sticky top-2 flex max-h-[calc(100svh-6rem)] w-14 shrink-0 flex-col items-center gap-1.5 overflow-auto rounded-2xl border py-2 shadow-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Déplier l'arborescence"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        {flatNodes.map((n) => (
          <button
            key={n.id ?? n.number}
            type="button"
            title={`${n.number} ${n.label}`}
            onClick={() => onSelectNode(n)}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums',
              selected?.id === n.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {n.number || '•'}
          </button>
        ))}
      </div>
    )
  }
  return (
    <aside className="bg-card sticky top-2 flex max-h-[calc(100svh-6rem)] w-80 shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex items-start justify-between border-b p-3">
        <div>
          <div className="text-sm font-semibold">Arborescence</div>
          <div className="text-muted-foreground text-xs">Séquence 0001</div>
        </div>
        <span className="flex items-center">
          <Button
            variant={treeEditing ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Éditer l'arborescence"
            onClick={() => setTreeEditing(!treeEditing)}
          >
            <Settings2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Replier le panneau"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </span>
      </div>
      {structureOutdated ? (
        <button
          type="button"
          onClick={onUpdateStructure}
          className="border-b bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100"
        >
          Nouvelle structure disponible — Mettre à jour
        </button>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="text-muted-foreground px-1 pb-1 text-[11px] font-semibold tracking-wide">
          MODULE 1 — ADMINISTRATIF
        </div>
        <ArborescenceTree
          tree={tree}
          selectedId={selected?.id ?? null}
          onSelect={onSelectNode}
          docCount={countFor}
          editing={treeEditing}
          onChange={onTreeChange}
        />
      </div>
      {treeEditing ? (
        <p className="text-muted-foreground border-t p-2 text-xs">
          Mode édition : renommez, repositionnez (▲▼), ajoutez ou supprimez des sections.
        </p>
      ) : null}
    </aside>
  )
}
