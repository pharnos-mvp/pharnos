import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from './module1-tree'
import { addChildNode, deleteNode, moveNode, newNode, renameNode } from './tree-utils'

interface ArborescenceTreeProps {
  tree: CtdNodeDef[]
  selectedId: string | null
  onSelect: (node: CtdNodeDef) => void
  /** Nombre de documents classés sous ce nœud (et ses descendants). */
  docCount: (node: CtdNodeDef) => number
  editing: boolean
  onChange: (tree: CtdNodeDef[]) => void
}

export function ArborescenceTree({
  tree,
  selectedId,
  onSelect,
  docCount,
  editing,
  onChange,
}: ArborescenceTreeProps) {
  return (
    <ul className="space-y-0.5">
      {tree.map((node) => (
        <NodeRow
          key={node.id ?? node.number}
          node={node}
          depth={0}
          tree={tree}
          selectedId={selectedId}
          onSelect={onSelect}
          docCount={docCount}
          editing={editing}
          onChange={onChange}
        />
      ))}
      {editing ? (
        <li className="pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => onChange(addChildNode(tree, null, newNode()))}
          >
            <Plus className="size-4" /> Ajouter une section
          </Button>
        </li>
      ) : null}
    </ul>
  )
}

interface NodeRowProps extends Omit<ArborescenceTreeProps, 'tree'> {
  node: CtdNodeDef
  depth: number
  tree: CtdNodeDef[]
}

function NodeRow({
  node,
  depth,
  tree,
  selectedId,
  onSelect,
  docCount,
  editing,
  onChange,
}: NodeRowProps) {
  const [open, setOpen] = useState(true) // déplié par défaut : toutes les sous-sections visibles
  const nodeId = node.id
  const hasChildren = Boolean(node.children?.length)
  const count = docCount(node)

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md py-1 pr-1 text-sm',
          selectedId === node.id ? 'bg-secondary' : 'hover:bg-accent',
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? 'Replier' : 'Déplier'}
            onClick={() => setOpen(!open)}
            className="text-muted-foreground shrink-0"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {editing && nodeId ? (
          <input
            className="border-input bg-background h-7 flex-1 rounded border px-2 text-sm"
            defaultValue={node.label}
            aria-label="Renommer la section"
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== node.label) {
                onChange(renameNode(tree, nodeId, e.target.value.trim()))
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col text-left"
            onClick={() => onSelect(node)}
          >
            {node.number ? (
              <span className="text-muted-foreground text-[11px] tabular-nums">{node.number}</span>
            ) : null}
            <span className="truncate text-sm">{node.label}</span>
          </button>
        )}

        {!editing && count > 0 ? (
          <Badge variant="secondary" className="shrink-0">
            {count}
          </Badge>
        ) : null}

        {!editing && selectedId === node.id ? (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        ) : null}

        {editing && nodeId ? (
          <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
            <EditIcon label="Monter" onClick={() => onChange(moveNode(tree, nodeId, -1))}>
              <ChevronUp className="size-3.5" />
            </EditIcon>
            <EditIcon label="Descendre" onClick={() => onChange(moveNode(tree, nodeId, 1))}>
              <ChevronDown className="size-3.5" />
            </EditIcon>
            <EditIcon
              label="Ajouter un sous-nœud"
              onClick={() => onChange(addChildNode(tree, nodeId, newNode()))}
            >
              <Plus className="size-3.5" />
            </EditIcon>
            <EditIcon label="Supprimer" onClick={() => onChange(deleteNode(tree, nodeId))}>
              <Trash2 className="size-3.5" />
            </EditIcon>
          </span>
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul>
          {node.children?.map((child) => (
            <NodeRow
              key={child.id ?? child.number}
              node={child}
              depth={depth + 1}
              tree={tree}
              selectedId={selectedId}
              onSelect={onSelect}
              docCount={docCount}
              editing={editing}
              onChange={onChange}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function EditIcon({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  )
}
