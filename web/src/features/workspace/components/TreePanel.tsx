import { Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { ArborescenceTree } from '../ArborescenceTree'
import type { CtdNodeDef } from '../module1-tree'

/** Panneau gauche du workspace : arborescence Module 1 (repliable, éditable) — move-only T7. */
export function TreePanel({
  collapsed,
  treeEditing,
  setTreeEditing,
  structureOutdated,
  onUpdateStructure,
  tree,
  flatNodes,
  selected,
  onSelectNode,
  countFor,
  flaggedNodes,
  onTreeChange,
  drawer = false,
}: {
  collapsed: boolean
  treeEditing: boolean
  setTreeEditing: (v: boolean) => void
  structureOutdated: boolean
  onUpdateStructure: () => void
  tree: CtdNodeDef[]
  flatNodes: CtdNodeDef[]
  selected: CtdNodeDef | null
  onSelectNode: (node: CtdNodeDef) => void
  countFor: (node: CtdNodeDef) => number
  /** Numéros de nœuds (et ancêtres) portant un constat non résolu — surbrillance sobre (n°6). */
  flaggedNodes?: Set<string>
  onTreeChange: (tree: CtdNodeDef[]) => void
  /** Rendu dans un tiroir mobile (Sheet) : pleine largeur, sans bordure latérale (M2 responsive). */
  drawer?: boolean
}) {
  const { t } = useI18n()
  if (collapsed) {
    return (
      <div className="bg-card flex h-full w-14 shrink-0 flex-col items-center gap-1.5 overflow-auto border-r py-2">
        {flatNodes.map((n) => (
          <button
            key={n.id ?? n.number}
            type="button"
            // n.label = libellé de structure CTD (réglementaire) — non traduit.
            title={`${n.number} ${n.label}`}
            onClick={() => onSelectNode(n)}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums',
              selected?.id === n.id
                ? 'border-primary bg-primary/10 text-primary'
                : flaggedNodes?.has(n.number)
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
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
    <aside
      aria-label={t({ fr: 'Structure du dossier', en: 'Dossier structure' })}
      className={cn(
        'bg-card flex h-full flex-col overflow-hidden',
        drawer ? 'w-full' : 'w-[286px] shrink-0 border-r',
      )}
    >
      <div className="flex items-start justify-between border-b p-3">
        <div>
          <div className="text-sm font-semibold">{t({ fr: 'Arborescence', en: 'Structure' })}</div>
          <div className="text-muted-foreground text-xs">
            {t({ fr: 'Séquence 0001', en: 'Sequence 0001' })}
          </div>
        </div>
        <span className="flex items-center">
          <Button
            variant={treeEditing ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label={t({ fr: "Éditer l'arborescence", en: 'Edit the structure' })}
            onClick={() => setTreeEditing(!treeEditing)}
          >
            <Settings2 className="size-4" />
          </Button>
        </span>
      </div>
      {structureOutdated ? (
        <button
          type="button"
          onClick={onUpdateStructure}
          className="border-b bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100"
        >
          {t({
            fr: 'Nouvelle structure disponible — Mettre à jour',
            en: 'New structure available — Update',
          })}
        </button>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="text-muted-foreground px-1 pb-1 text-[11px] font-semibold tracking-wide">
          {t({ fr: 'MODULE 1 — ADMINISTRATIF', en: 'MODULE 1 — ADMINISTRATIVE' })}
        </div>
        <ArborescenceTree
          tree={tree}
          selectedId={selected?.id ?? null}
          onSelect={onSelectNode}
          docCount={countFor}
          isFlagged={(n) => flaggedNodes?.has(n.number) ?? false}
          editing={treeEditing}
          onChange={onTreeChange}
        />
      </div>
      {treeEditing ? (
        <p className="text-muted-foreground border-t p-2 text-xs">
          {t({
            fr: 'Mode édition : renommez, repositionnez (▲▼), ajoutez ou supprimez des sections.',
            en: 'Edit mode: rename, reorder (▲▼), add or remove sections.',
          })}
        </p>
      ) : null}
    </aside>
  )
}
