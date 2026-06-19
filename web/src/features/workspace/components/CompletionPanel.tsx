import { CheckCircle2, ClipboardList, Languages, Sparkles, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from '../module1-tree'
import type { RegafyFinding } from '../regafy'
import { Donut } from './Donut'
import { NonConformCard } from './NonConformCard'

/** Carte de constat (Regafy) active du document affiché, rendue dans le rail (pass 2 fidélité). */
export interface RailFinding {
  finding: RegafyFinding
  docType: string
  showReplace?: boolean
  translating?: boolean
  onFill: () => void
  onTranslate: () => void
  onReplace: () => void
  onDismiss: () => void
}

/**
 * Panneau droit du workspace (mockup `.rail`) : carte **Complétude du dossier** (donut + « X / Y
 * sections prêtes ») FIXE en haut → reste visible au scroll ; en dessous, zone défilante avec le
 * **Constat Regafy** (carte amber) EN PREMIER, puis **Notes de session**.
 */
export function CompletionPanel({
  collapsed,
  pct,
  okCount,
  total,
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
  finding,
  drawer = false,
}: {
  collapsed: boolean
  pct: number
  okCount: number
  /** Nombre total de feuilles (sections) — pour le sous-titre « X / Y sections prêtes » du mockup. */
  total: number
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
  /** Constat de l'élément affiché (carte amber du mockup) — null si aucun / masqué. */
  finding?: RailFinding | null
  /** Rendu dans un tiroir mobile (Sheet) : pleine largeur, toujours visible (M2 responsive). */
  drawer?: boolean
}) {
  const { t } = useI18n()
  if (collapsed) {
    return (
      <div className="bg-card hidden h-full w-14 shrink-0 flex-col items-center gap-3 overflow-auto border-l py-3 lg:flex">
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
    <aside
      aria-label={t({ fr: 'Complétude et copilote', en: 'Completeness and copilot' })}
      className={cn(
        'bg-card h-full flex-col',
        drawer ? 'flex w-full' : 'hidden w-[274px] shrink-0 border-l lg:flex',
      )}
    >
      {/* Complétude du dossier — FIXE en haut : reste visible quand la liste défile (mockup). */}
      <div className="shrink-0 p-3.5 pb-0">
        <div className="flex flex-col items-center rounded-xl border p-4 text-center">
          <h3 className="mb-2.5 text-[13px] font-semibold">
            {t({ fr: 'Complétude du dossier', en: 'Dossier completeness' })}
          </h3>
          <Donut value={pct} size={96} />
          <p className="text-muted-foreground mt-1.5 text-[12px]">
            {t({
              fr: `${okCount} / ${total} sections prêtes`,
              en: `${okCount} / ${total} sections ready`,
            })}
          </p>
        </div>
      </div>

      {/* Zone défilante : Constat Regafy (carte amber) EN PREMIER, puis Notes de session. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
        {finding ? <NonConformCard {...finding} /> : null}
        <div className="rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">
              {t({ fr: 'Notes de session', en: 'Session notes' })}
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
                fr: 'Sélectionnez une pièce puis cliquez « Analyser ».',
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
      </div>
    </aside>
  )
}
