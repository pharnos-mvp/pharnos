import { AlertTriangle, ChevronRight, Loader2, ScanSearch } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { RegafyFinding } from '../regafy'

/**
 * Rappel AVANT compilation : analyses de la session non satisfaites (ou aucune analyse
 * effectuée) + lancement de l'« Audit Global » (rapport de conformité complet). L'utilisateur
 * peut corriger d'abord, ou compiler malgré tout — Regafy n'est jamais bloquant.
 */
export function RegafyGateDialog({
  findings,
  auditProgress,
  auditDisabled,
  onAudit,
  onClose,
  onCorrect,
  onCorrectFinding,
  onCompile,
}: {
  findings: RegafyFinding[]
  /** Progression de l'Audit Global — non null pendant l'audit. */
  auditProgress: { done: number; total: number } | null
  /** Audit indisponible (hors ligne / backend non configuré). */
  auditDisabled?: boolean
  onAudit: () => void
  onClose: () => void
  /** Raccourci : corriger le PREMIER constat qui pointe un nœud. */
  onCorrect: () => void
  /** Corriger UN constat précis (clic sur la ligne) → navigue vers son nœud. */
  onCorrectFinding: (f: RegafyFinding) => void
  onCompile: () => void
}) {
  const { t } = useI18n()
  const errors = findings.filter((f) => f.severity === 'error').length
  const auditing = auditProgress !== null
  const hasClickable = findings.some((f) => f.nodeNumber)
  const title = t({ fr: 'Remarques avant compilation', en: 'Notes before compiling' })
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-card flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border shadow-lg">
        <div className="flex items-center gap-2 border-b p-4">
          <AlertTriangle className="size-5 text-amber-500" />
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {findings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t({
                fr: "Aucune analyse effectuée sur ce dossier. Lancez l'« Audit de conformité » pour un rapport complet, ou compilez directement.",
                en: 'No analysis run on this dossier. Launch the “Compliance Audit” for a full report, or compile directly.',
              })}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mb-3 text-sm">
                {t({
                  fr: `${findings.length} observation(s)${errors > 0 ? ` dont ${errors} bloquante(s)` : ''}.`,
                  en: `${findings.length} finding(s)${errors > 0 ? `, ${errors} blocking` : ''}.`,
                })}{' '}
                {hasClickable
                  ? t({
                      fr: 'Cliquez un point pour le corriger, lancez l’« Audit de conformité », ou compilez malgré tout.',
                      en: 'Click an item to fix it, run the Compliance Audit, or compile anyway.',
                    })
                  : t({
                      fr: 'Lancez l’« Audit de conformité », ou compilez malgré tout.',
                      en: 'Run the Compliance Audit, or compile anyway.',
                    })}
              </p>
              <ul className="space-y-1">
                {findings.map((f) => {
                  // f.nodeNumber + f.message = contenu réglementaire Regafy — NON traduit.
                  const dot = (
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        f.severity === 'error'
                          ? 'bg-red-500'
                          : f.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-sky-500',
                      )}
                    />
                  )
                  const body = (
                    <span className="min-w-0 flex-1">
                      {f.nodeNumber ? <span className="font-medium">{f.nodeNumber} </span> : null}
                      {f.message}
                    </span>
                  )
                  // Un constat qui pointe un nœud = cliquable (navigue pour corriger). Sinon simple ligne.
                  return f.nodeNumber ? (
                    <li key={f.id}>
                      <button
                        type="button"
                        disabled={auditing}
                        onClick={() => onCorrectFinding(f)}
                        title={t({ fr: 'Corriger ce point', en: 'Fix this item' })}
                        className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-md p-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60"
                      >
                        {dot}
                        {body}
                        <ChevronRight
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ) : (
                    <li key={f.id} className="flex items-start gap-2 p-1.5 text-sm">
                      {dot}
                      {body}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
        {/* Annuler à gauche (sortie claire) · actions à droite, Compiler en primaire (le plus à
            droite = CTA principal). Ordre logique : Audit Global → Corriger → Compiler. Boutons
            `sm` + modale `max-w-xl` → les quatre tiennent sur une seule ligne (repli sur mobile). */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
          <Button variant="ghost" size="sm" disabled={auditing} onClick={onClose}>
            {t({ fr: 'Annuler', en: 'Cancel' })}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={auditing || auditDisabled}
              title={
                auditDisabled
                  ? t({ fr: 'Audit disponible en ligne', en: 'Audit available online' })
                  : undefined
              }
              onClick={onAudit}
              className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {auditing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t({ fr: 'Audit…', en: 'Audit…' })} {auditProgress.done}/{auditProgress.total}
                </>
              ) : (
                <>
                  <ScanSearch className="size-4" />
                  {t({ fr: 'Audit de conformité', en: 'Compliance Audit' })}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={auditing || !findings.some((f) => f.nodeNumber)}
              onClick={onCorrect}
            >
              {t({ fr: 'Corriger', en: 'Fix' })}
            </Button>
            <Button size="sm" disabled={auditing} onClick={onCompile}>
              {t({ fr: 'Compiler quand même', en: 'Compile anyway' })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
