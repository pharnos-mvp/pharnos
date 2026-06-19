// Panneau de VALIDATION FLOTTANT (handoff CEO) — chrome `< lg` qui remplace le panneau Copilote
// latéral. Petite carte ancrée en haut-droite (au-dessus du document), repliable ‹/›, portant le
// donut de complétude + 3 compteurs OK/⚠/✗ cliquables → pop-over des remarques (clic = navigue vers
// la section). Intègre le constat Regafy actif (carte NonConformCard). 100 % tokens → dark/light.
//
// CONTRAT DE POSITIONNEMENT : le parent direct DOIT être `position: relative` ET non défilant
// (sinon le panneau défile avec le document). Les overlays restent dans ses bornes (pas de portail).
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  XCircle,
} from 'lucide-react'

import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { CtdNodeDef } from '../module1-tree'
import type { RegafyFinding } from '../regafy'
import { Donut } from './Donut'
import { NonConformCard } from './NonConformCard'
import type { RailFinding } from './CompletionPanel'

type Severity = 'ok' | 'warn' | 'error'

const SEV_META: Record<
  Severity,
  { label: Translatable; dot: string; text: string; icon: typeof CheckCircle2 }
> = {
  ok: {
    label: { fr: 'Validés', en: 'Validated' },
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: CheckCircle2,
  },
  warn: {
    label: { fr: 'Avertissements', en: 'Warnings' },
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    icon: AlertTriangle,
  },
  error: {
    label: { fr: 'Erreurs', en: 'Errors' },
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-500',
    icon: XCircle,
  },
}

export function ValidationPanel({
  pct,
  okCount,
  total,
  warnCount,
  errCount,
  allFindings,
  flatNodes,
  onSelectNode,
  finding,
}: {
  pct: number
  /** Sections prêtes (complétude) — légende sous le donut (distinct des constats « Validés »). */
  okCount: number
  total: number
  warnCount: number
  errCount: number
  allFindings: RegafyFinding[]
  flatNodes: CtdNodeDef[]
  onSelectNode: (node: CtdNodeDef) => void
  /** Constat Regafy de l'élément affiché (carte amber) — null si aucun / masqué. */
  finding?: RailFinding | null
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [open, setOpen] = useState<Severity | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const buckets: Record<Severity, RegafyFinding[]> = {
    ok: allFindings.filter((f) => f.ok),
    warn: allFindings.filter((f) => !f.ok && f.severity === 'warning'),
    error: allFindings.filter((f) => !f.ok && f.severity === 'error'),
  }
  const counts: Record<Severity, number> = {
    ok: buckets.ok.length,
    warn: warnCount,
    error: errCount,
  }

  // Échap ferme le pop-over (le focus peut être resté sur le compteur déclencheur → écoute globale).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    // Focus le pop-over à l'ouverture (navigation clavier directe dans la liste).
    popRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label={t({ fr: 'Afficher la validation', en: 'Show validation' })}
        aria-expanded={false}
        onClick={() => setCollapsed(false)}
        className="bg-card text-muted-foreground hover:text-foreground absolute top-3 right-0 z-20 grid h-12 w-6 place-items-center rounded-l-lg border border-r-0 shadow-sm"
      >
        <ChevronLeft className="size-4" />
      </button>
    )
  }

  const meta = open ? SEV_META[open] : null
  const list = open ? buckets[open] : []

  return (
    <>
      <aside
        aria-label={t({ fr: 'Validation et complétude', en: 'Validation and completeness' })}
        className="bg-card absolute top-3 right-3 z-20 flex w-[88px] flex-col items-center gap-3 rounded-2xl border p-3 shadow-lg"
      >
        {/* Languette de repli (‹) sur le bord gauche. */}
        <button
          type="button"
          aria-label={t({ fr: 'Réduire le panneau', en: 'Collapse panel' })}
          aria-expanded
          onClick={() => setCollapsed(true)}
          className="bg-card text-muted-foreground hover:text-foreground absolute top-1/2 -left-3 grid h-10 w-5 -translate-y-1/2 place-items-center rounded-l-md border border-r-0 shadow-sm"
        >
          <ChevronRight className="size-3.5" />
        </button>

        <Donut value={pct} size={56} />
        <p className="text-muted-foreground -mt-1 text-center text-[10px] leading-tight">
          {t({ fr: `${okCount}/${total} prêtes`, en: `${okCount}/${total} ready` })}
        </p>

        {(['ok', 'warn', 'error'] as const).map((sev) => {
          const m = SEV_META[sev]
          const Icon = m.icon
          const n = counts[sev]
          const isOpen = open === sev
          return (
            <button
              key={sev}
              type="button"
              aria-expanded={isOpen}
              aria-controls="validation-remarks"
              aria-label={`${n} ${t(m.label)}`}
              onClick={() => setOpen((o) => (o === sev ? null : sev))}
              className={cn(
                'focus-visible:ring-ring/50 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold outline-none focus-visible:ring-[3px]',
                m.text,
                isOpen ? 'bg-accent' : 'hover:bg-accent',
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              <span className="tabular-nums">{n}</span>
            </button>
          )
        })}
      </aside>

      {/* Constat Regafy actif (carte amber) — sous le panneau, dans les bornes du corps. */}
      {finding ? (
        <div className="absolute top-3 right-[108px] z-20 w-[266px] max-w-[calc(100%-7.5rem)]">
          <NonConformCard {...finding} />
        </div>
      ) : null}

      {/* Pop-over des remarques (clic sur un compteur) : overlay de fermeture + carte ancrée. */}
      {open && meta ? (
        <>
          <button
            type="button"
            aria-label={t({ fr: 'Fermer', en: 'Close' })}
            tabIndex={-1}
            onClick={() => setOpen(null)}
            className="absolute inset-0 z-30 cursor-default"
          />
          <div
            ref={popRef}
            id="validation-remarks"
            role="dialog"
            aria-label={t(meta.label)}
            tabIndex={-1}
            className="bg-card absolute top-3 right-[108px] z-40 flex max-h-[min(60vh,340px)] w-[280px] max-w-[calc(100%-7.5rem)] flex-col rounded-xl border p-3 shadow-xl outline-none"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className={cn('size-2.5 shrink-0 rounded-full', meta.dot)} />
              <span className="text-sm font-semibold">{t(meta.label)}</span>
              <span className="text-muted-foreground text-xs">· {list.length}</span>
            </div>
            {list.length === 0 ? (
              <p className="text-muted-foreground flex items-center gap-1.5 px-1 py-2 text-xs italic">
                <ListChecks className="size-4 shrink-0" />
                {t({ fr: 'Aucune remarque relevée.', en: 'No remarks found.' })}
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto">
                {list.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={!f.nodeNumber}
                      onClick={() => {
                        const n = flatNodes.find((x) => x.number === f.nodeNumber)
                        setOpen(null)
                        if (n) onSelectNode(n)
                      }}
                      className="hover:bg-accent focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded p-1.5 text-left outline-none focus-visible:ring-[3px] disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className={cn('mt-1 size-2 shrink-0 rounded-full', meta.dot)} />
                      {/* f.nodeNumber + f.message = contenu réglementaire Regafy — NON traduit. */}
                      <span className="min-w-0">
                        {f.nodeNumber ? (
                          <span className="text-muted-foreground block text-[11px] font-bold">
                            § {f.nodeNumber}
                          </span>
                        ) : null}
                        <span className="block text-xs leading-snug">{f.message}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </>
  )
}
