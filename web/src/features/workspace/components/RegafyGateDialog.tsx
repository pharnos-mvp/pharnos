import { AlertTriangle, Loader2, ScanSearch } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  onCompile,
}: {
  findings: RegafyFinding[]
  /** Progression de l'Audit Global — non null pendant l'audit. */
  auditProgress: { done: number; total: number } | null
  /** Audit indisponible (hors ligne / backend non configuré). */
  auditDisabled?: boolean
  onAudit: () => void
  onClose: () => void
  onCorrect: () => void
  onCompile: () => void
}) {
  const errors = findings.filter((f) => f.severity === 'error').length
  const auditing = auditProgress !== null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Remarques avant compilation"
    >
      <div className="bg-card flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-lg">
        <div className="flex items-center gap-2 border-b p-4">
          <AlertTriangle className="size-5 text-amber-500" />
          <h2 className="font-semibold">Remarques avant compilation</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {findings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune analyse effectuée sur ce dossier. Lancez l'« Audit Global » pour un rapport de
              conformité complet, ou compilez directement.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mb-3 text-sm">
                {findings.length} observation(s)
                {errors > 0 ? ` dont ${errors} bloquante(s)` : ''}. Corriger d'abord, lancer l'«
                Audit Global », ou compiler malgré tout ?
              </p>
              <ul className="space-y-1.5">
                {findings.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-sm">
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
                    <span>
                      {f.nodeNumber ? <span className="font-medium">{f.nodeNumber} </span> : null}
                      {f.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
          <Button
            variant="outline"
            disabled={auditing || auditDisabled}
            title={auditDisabled ? 'Audit disponible en ligne' : undefined}
            onClick={onAudit}
            className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {auditing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Audit… {auditProgress.done}/{auditProgress.total}
              </>
            ) : (
              <>
                <ScanSearch className="size-4" />
                Audit Global
              </>
            )}
          </Button>
          <Button variant="ghost" disabled={auditing} onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="outline"
            disabled={auditing || !findings.some((f) => f.nodeNumber)}
            onClick={onCorrect}
          >
            Corriger
          </Button>
          <Button disabled={auditing} onClick={onCompile}>
            Compiler quand même
          </Button>
        </div>
      </div>
    </div>
  )
}
