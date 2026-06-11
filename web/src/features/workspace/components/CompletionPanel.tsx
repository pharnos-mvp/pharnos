import {
  CheckCircle2,
  Languages,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from '../module1-tree'
import type { RegafyFinding } from '../regafy'
import { Donut } from './Donut'

/** Panneau droit du workspace : complétude (donut) + remarques Regafy — move-only T7. */
export function CompletionPanel({
  collapsed,
  setCollapsed,
  pct,
  okCount,
  warnCount,
  errCount,
  allFindings,
  aiBusy,
  translating,
  upgrading,
  targetLangLabel,
  flatNodes,
  onSelectNode,
  onTranslate,
  onUpgrade,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  pct: number
  okCount: number
  warnCount: number
  errCount: number
  allFindings: RegafyFinding[]
  aiBusy: boolean
  translating: string | null
  upgrading: string | null
  targetLangLabel: string
  flatNodes: CtdNodeDef[]
  onSelectNode: (node: CtdNodeDef) => void
  onTranslate: (f: RegafyFinding) => void
  onUpgrade: (f: RegafyFinding) => void
}) {
  if (collapsed) {
    return (
      <div className="bg-card sticky top-12 hidden max-h-[calc(100svh-9rem)] w-14 shrink-0 flex-col items-center gap-3 overflow-auto rounded-lg border py-3 lg:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Afficher la complétude"
          onClick={() => setCollapsed(false)}
        >
          <PanelRightOpen className="size-4" />
        </Button>
        <Donut value={pct} size={44} />
        <div className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="size-4" /> {okCount}
        </div>
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <span className="text-sm leading-none">⚠</span> {warnCount}
        </div>
        <div className="flex items-center gap-1 text-xs text-red-600">
          <XCircle className="size-4" /> {errCount}
        </div>
      </div>
    )
  }
  return (
    <aside className="sticky top-12 hidden max-h-[calc(100svh-9rem)] w-72 shrink-0 flex-col gap-3 overflow-auto pb-2 lg:flex">
      <div className="flex flex-col items-center rounded-lg border p-4">
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-medium">État d'avancement</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Replier"
            onClick={() => setCollapsed(true)}
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
        <Donut value={pct} size={96} />
        <p className="text-muted-foreground mt-1 text-xs">Conformité UEMOA en direct</p>
      </div>
      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Remarques pour la session</h3>
          <span className="text-muted-foreground text-xs">{allFindings.length}</span>
        </div>
        {aiBusy ? (
          <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1.5 text-xs italic">
            <Sparkles className="size-3 animate-pulse" /> Analyse en cours…
          </p>
        ) : null}
        {allFindings.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-center text-xs italic">Aucun constat. ✓</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {allFindings.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  disabled={!f.nodeNumber}
                  onClick={() => {
                    const n = flatNodes.find((x) => x.number === f.nodeNumber)
                    if (n) onSelectNode(n)
                  }}
                  className="hover:bg-accent flex w-full items-start gap-2 rounded p-1 text-left text-xs disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span
                    className={cn(
                      'mt-1 size-2 shrink-0 rounded-full',
                      f.severity === 'error'
                        ? 'bg-red-500'
                        : f.severity === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-sky-500',
                    )}
                  />
                  <span className="min-w-0">
                    {f.nodeNumber ? <span className="font-medium">{f.nodeNumber} </span> : null}
                    {f.message}
                  </span>
                </button>
                {f.translate && f.pieceId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 ml-4 h-6 gap-1 border-amber-400 text-amber-700 hover:bg-amber-50"
                    disabled={translating === f.pieceId}
                    onClick={() => onTranslate(f)}
                  >
                    <Languages className="size-3" />
                    {translating === f.pieceId ? 'Traduction…' : `Traduire en ${targetLangLabel}`}
                  </Button>
                ) : null}
                {f.upgrade && f.pieceId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 ml-4 h-6 gap-1 border-violet-400 text-violet-700 hover:bg-violet-50"
                    disabled={upgrading === f.pieceId}
                    onClick={() => onUpgrade(f)}
                  >
                    <Wand2 className="size-3" />
                    {upgrading === f.pieceId ? 'Mise en conformité…' : 'Upgrader'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
