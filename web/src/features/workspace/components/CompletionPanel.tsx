import { CheckCircle2, ClipboardList, Languages, Sparkles, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from '../module1-tree'
import type { RegafyFinding } from '../regafy'
import { Donut } from './Donut'

/** Panneau droit du workspace : complétude (donut) + remarques Regafy — move-only T7. */
export function CompletionPanel({
  collapsed,
  pct,
  okCount,
  warnCount,
  errCount,
  allFindings,
  aiBusy,
  translating,
  targetLangLabel,
  flatNodes,
  onSelectNode,
  onTranslate,
  onFillTemplate,
}: {
  collapsed: boolean
  pct: number
  okCount: number
  warnCount: number
  errCount: number
  allFindings: RegafyFinding[]
  aiBusy: boolean
  translating: string | null
  targetLangLabel: string
  flatNodes: CtdNodeDef[]
  onSelectNode: (node: CtdNodeDef) => void
  onTranslate: (f: RegafyFinding) => void
  onFillTemplate: (f: RegafyFinding) => void
}) {
  const { t } = useI18n()
  if (collapsed) {
    return (
      <div className="bg-card sticky top-2 hidden max-h-[calc(100svh-6rem)] w-14 shrink-0 flex-col items-center gap-3 overflow-auto rounded-2xl border py-3 shadow-sm lg:flex">
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
    <aside className="sticky top-2 hidden max-h-[calc(100svh-6rem)] w-80 shrink-0 flex-col gap-3 overflow-auto pb-2 lg:flex">
      <div className="bg-card flex flex-col items-center rounded-2xl border p-4 shadow-sm">
        <span className="w-full text-center text-sm font-medium">
          {t({ fr: 'Tableau de complétude', en: 'Completeness dashboard' })}
        </span>
        <Donut value={pct} size={110} />
      </div>
      <div className="bg-card rounded-2xl border p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t({ fr: 'Remarques pour la session', en: 'Notes for this session' })}
          </h3>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
            {allFindings.length}
          </span>
        </div>
        {aiBusy ? (
          <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1.5 text-xs italic">
            <Sparkles className="size-3 animate-pulse" />{' '}
            {t({ fr: 'Analyse en cours…', en: 'Analyzing…' })}
          </p>
        ) : null}
        {allFindings.length === 0 ? (
          // Plus d'analyse automatique (recette n°6) : le panneau consigne les analyses de
          // l'utilisateur — vide tant qu'aucune n'a été lancée.
          <p className="text-muted-foreground mt-3 text-center text-xs italic">
            {t({ fr: 'Aucune analyse pour cette session.', en: 'No analysis for this session.' })}
            <br />
            {t({
              fr: 'Sélectionnez une pièce puis cliquez « Analyser ».',
              en: 'Select an item then click “Analyze”.',
            })}
          </p>
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
                      f.ok
                        ? 'bg-emerald-500'
                        : f.severity === 'error'
                          ? 'bg-red-500'
                          : f.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-sky-500',
                    )}
                  />
                  {/* f.nodeNumber + f.message = contenu réglementaire Regafy — NON traduit. */}
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
                    {translating === f.pieceId
                      ? t({ fr: 'Traduction…', en: 'Translating…' })
                      : t({
                          fr: `Traduire en ${targetLangLabel}`,
                          en: `Translate to ${targetLangLabel}`,
                        })}
                  </Button>
                ) : null}
                {f.upgrade && f.pieceId ? (
                  // « Générer » (mise en conformité IA) est désactivé pour l'instant (décision
                  // CEO recette) — seul le remplissage manuel du template officiel est proposé.
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 ml-4 h-6 gap-1 border-violet-400 text-violet-700 hover:bg-violet-50"
                    onClick={() => onFillTemplate(f)}
                  >
                    <ClipboardList className="size-3" />
                    {t({ fr: 'Remplir le template', en: 'Fill the template' })}
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
