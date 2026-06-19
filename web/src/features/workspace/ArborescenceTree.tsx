import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from './module1-tree'
import {
  addChildNode,
  deleteNode,
  flattenVisible,
  moveNode,
  newNode,
  renameNode,
} from './tree-utils'

interface ArborescenceTreeProps {
  tree: CtdNodeDef[]
  selectedId: string | null
  onSelect: (node: CtdNodeDef) => void
  /** Nombre de documents classés sous ce nœud (et ses descendants). */
  docCount: (node: CtdNodeDef) => number
  /** Nœud (ou ancêtre) portant un constat non résolu — surbrillance sobre d'orientation (n°6). */
  isFlagged?: (node: CtdNodeDef) => boolean
  editing: boolean
  onChange: (tree: CtdNodeDef[]) => void
}

export function ArborescenceTree({
  tree,
  selectedId,
  onSelect,
  docCount,
  isFlagged,
  editing,
  onChange,
}: ArborescenceTreeProps) {
  const { t } = useI18n()
  // État d'expansion CENTRALISÉ (vide = tout déplié, comme avant) → permet la nav clavier roving.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const treeRef = useRef<HTMLUListElement>(null)

  const visible = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])
  // Porteur du tabstop (roving) : focus mémorisé s'il est encore visible, sinon sélection, sinon 1er.
  const rovingId =
    (focusedId && visible.some((v) => v.id === focusedId) ? focusedId : null) ??
    selectedId ??
    visible[0]?.id ??
    null

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const focusNode = (id: string) => {
    setFocusedId(id)
    requestAnimationFrame(() =>
      treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)?.focus(),
    )
  }

  // Navigation clavier WAI-ARIA (M3) — désactivée en mode édition (inputs + réordonnancement).
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (editing) return
    const idx = visible.findIndex((v) => v.id === rovingId)
    const cur = idx >= 0 ? visible[idx] : undefined
    if (!cur) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (idx < visible.length - 1) focusNode(visible[idx + 1]!.id)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (idx > 0) focusNode(visible[idx - 1]!.id)
        break
      case 'Home':
        e.preventDefault()
        if (visible[0]) focusNode(visible[0].id)
        break
      case 'End':
        e.preventDefault()
        if (visible.length > 0) focusNode(visible[visible.length - 1]!.id)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (cur.hasChildren && !cur.expanded) toggle(cur.id)
        else if (cur.expanded && visible[idx + 1]?.parentId === cur.id)
          focusNode(visible[idx + 1]!.id)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (cur.expanded) toggle(cur.id)
        else if (cur.parentId) focusNode(cur.parentId)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect(cur.node)
        break
      default:
        break
    }
  }

  return (
    <ul
      ref={treeRef}
      {...(editing
        ? {}
        : { role: 'tree', 'aria-label': t({ fr: 'Arborescence du dossier', en: 'Dossier tree' }) })}
      className="space-y-0.5"
      onKeyDown={onKeyDown}
    >
      {tree.map((node) => (
        <NodeRow
          key={node.id ?? node.number}
          node={node}
          depth={0}
          level={1}
          tree={tree}
          selectedId={selectedId}
          onSelect={onSelect}
          docCount={docCount}
          isFlagged={isFlagged}
          editing={editing}
          onChange={onChange}
          collapsed={collapsed}
          toggle={toggle}
          rovingId={rovingId}
          setFocusedId={setFocusedId}
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
            <Plus className="size-4" /> {t({ fr: 'Ajouter une section', en: 'Add a section' })}
          </Button>
        </li>
      ) : null}
    </ul>
  )
}

interface NodeRowProps extends Omit<ArborescenceTreeProps, 'tree'> {
  node: CtdNodeDef
  depth: number
  level: number
  tree: CtdNodeDef[]
  collapsed: ReadonlySet<string>
  toggle: (id: string) => void
  rovingId: string | null
  setFocusedId: (id: string) => void
}

function NodeRow({
  node,
  depth,
  level,
  tree,
  selectedId,
  onSelect,
  docCount,
  isFlagged,
  editing,
  onChange,
  collapsed,
  toggle,
  rovingId,
  setFocusedId,
}: NodeRowProps) {
  const { t } = useI18n()
  const nodeId = node.id
  const id = node.id ?? node.number
  const hasChildren = Boolean(node.children?.length)
  const expanded = hasChildren && !collapsed.has(id)
  const count = docCount(node)
  const isSelected = selectedId === node.id

  return (
    <li
      {...(!editing
        ? {
            role: 'treeitem' as const,
            'aria-level': level,
            'aria-selected': isSelected,
            'aria-expanded': hasChildren ? expanded : undefined,
            'data-tree-id': id,
            tabIndex: rovingId === id ? 0 : -1,
            onFocus: (e: FocusEvent<HTMLLIElement>) => {
              if (e.target === e.currentTarget) setFocusedId(id)
            },
          }
        : {})}
      className="focus-visible:ring-ring rounded-[9px] outline-none focus-visible:ring-2"
    >
      {/* Rangée VISUELLE : clic = sélection (la souris) ; le clavier passe par le treeitem (li). */}
      <div
        className={cn(
          'group flex items-center gap-1 rounded-[9px] py-1 pr-1 text-sm',
          !editing && 'cursor-pointer',
          isSelected ? 'bg-brand/10 shadow-[inset_2px_0_0_var(--brand)]' : 'hover:bg-brand/5',
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={editing ? undefined : () => onSelect(node)}
      >
        {hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={(e) => {
              e.stopPropagation()
              toggle(id)
            }}
            className="text-muted-foreground shrink-0"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {editing && nodeId ? (
          <input
            className="border-input bg-background h-7 flex-1 rounded border px-2 text-sm"
            // node.label = libellé de structure CTD (réglementaire) — la valeur n'est pas traduite.
            defaultValue={node.label}
            aria-label={t({ fr: 'Renommer la section', en: 'Rename the section' })}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== node.label) {
                onChange(renameNode(tree, nodeId, e.target.value.trim()))
              }
            }}
          />
        ) : (
          <span className="flex min-w-0 flex-1 flex-col text-left">
            {node.number ? (
              <span className="text-muted-foreground text-[11px] tabular-nums">{node.number}</span>
            ) : null}
            <span className="truncate text-[13px] leading-tight">{node.label}</span>
          </span>
        )}

        {!editing && isFlagged?.(node) ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-amber-400"
            title={t({ fr: 'Section à vérifier', en: 'Section to review' })}
          />
        ) : null}

        {!editing && count > 0 ? (
          <Badge variant="secondary" className="shrink-0">
            {count}
          </Badge>
        ) : null}

        {!editing && isSelected ? (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        ) : null}

        {editing && nodeId ? (
          <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
            <EditIcon
              label={t({ fr: 'Monter', en: 'Move up' })}
              onClick={() => onChange(moveNode(tree, nodeId, -1))}
            >
              <ChevronUp className="size-3.5" />
            </EditIcon>
            <EditIcon
              label={t({ fr: 'Descendre', en: 'Move down' })}
              onClick={() => onChange(moveNode(tree, nodeId, 1))}
            >
              <ChevronDown className="size-3.5" />
            </EditIcon>
            <EditIcon
              label={t({ fr: 'Ajouter un sous-nœud', en: 'Add a sub-node' })}
              onClick={() => onChange(addChildNode(tree, nodeId, newNode()))}
            >
              <Plus className="size-3.5" />
            </EditIcon>
            <EditIcon
              label={t({ fr: 'Supprimer', en: 'Delete' })}
              onClick={() => onChange(deleteNode(tree, nodeId))}
            >
              <Trash2 className="size-3.5" />
            </EditIcon>
          </span>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <ul {...(!editing ? { role: 'group' as const } : {})}>
          {node.children?.map((child) => (
            <NodeRow
              key={child.id ?? child.number}
              node={child}
              depth={depth + 1}
              level={level + 1}
              tree={tree}
              selectedId={selectedId}
              onSelect={onSelect}
              docCount={docCount}
              isFlagged={isFlagged}
              editing={editing}
              onChange={onChange}
              collapsed={collapsed}
              toggle={toggle}
              rovingId={rovingId}
              setFocusedId={setFocusedId}
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
