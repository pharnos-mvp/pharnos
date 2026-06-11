import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RegafyFinding } from '../regafy'

/** Rappel des constats Regafy AVANT compilation : corriger d'abord, ou compiler malgré tout. */
export function RegafyGateDialog({
  findings,
  onClose,
  onCorrect,
  onCompile,
}: {
  findings: RegafyFinding[]
  onClose: () => void
  onCorrect: () => void
  onCompile: () => void
}) {
  const errors = findings.filter((f) => f.severity === 'error').length
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
          <p className="text-muted-foreground mb-3 text-sm">
            {findings.length} observation(s)
            {errors > 0 ? ` dont ${errors} bloquante(s)` : ''}. Corriger d'abord, ou compiler malgré
            tout ?
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
        </div>
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="outline"
            disabled={!findings.some((f) => f.nodeNumber)}
            onClick={onCorrect}
          >
            Corriger
          </Button>
          <Button onClick={onCompile}>Compiler quand même</Button>
        </div>
      </div>
    </div>
  )
}
