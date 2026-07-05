import { useState } from 'react'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { TRASH_RETENTION_DAYS } from './dossier-repository'

export type DossierActionMode = 'delete' | 'archive' | 'restore' | 'restore-trash' | 'purge'

/**
 * Action de fin de vie d'un dossier, avec confirmation + motif (audit ALCOA). Cinq régimes :
 * - delete : brouillon jamais soumis → corbeille (restaurable pendant la fenêtre de grâce,
 *   puis purge définitive automatique — docs/RETENTION-POLICY.md).
 * - archive : dossier soumis (enregistrement réglementaire) → conservé, jamais purgé.
 * - restore : remet un archivé dans l'actif.
 * - restore-trash : remet un brouillon de la corbeille dans l'actif.
 * - purge : suppression DÉFINITIVE immédiate d'un brouillon de la corbeille (irréversible).
 * Réutilisé par le board Opérations ET la page d'aperçu (icône seule, nom accessible).
 */
export function DossierAction({
  mode,
  name,
  onConfirm,
  skipConfirm = false,
  onSkipPreference,
}: {
  mode: DossierActionMode
  name: string
  onConfirm: (reason: string) => Promise<void>
  /**
   * Préférence « ne plus afficher » active (mode delete) : le clic exécute directement, sans
   * dialogue — le toast « Restaurer » (undo) reste le filet de sécurité.
   */
  skipConfirm?: boolean
  /** Rend la case « Ne plus afficher ce message » et reçoit le choix au moment de confirmer. */
  onSkipPreference?: (skip: boolean) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const cfg = {
    delete: {
      Icon: Trash2,
      trigger: t({ fr: 'Supprimer le brouillon', en: 'Delete draft' }),
      title: t({ fr: 'Supprimer ce brouillon ?', en: 'Delete this draft?' }),
      desc: t({
        fr: `« ${name} » est un brouillon jamais soumis. Il sera déplacé dans la corbeille (action tracée) — restaurable pendant ${TRASH_RETENTION_DAYS} jours, puis purgé définitivement.`,
        en: `"${name}" is a draft never submitted. It will be moved to the trash (audited) — restorable for ${TRASH_RETENTION_DAYS} days, then permanently purged.`,
      }),
      confirm: t({ fr: 'Supprimer', en: 'Delete' }),
      reason: true,
      destructive: true,
    },
    archive: {
      Icon: Archive,
      trigger: t({ fr: 'Archiver le dossier', en: 'Archive dossier' }),
      title: t({ fr: 'Archiver ce dossier ?', en: 'Archive this dossier?' }),
      desc: t({
        fr: `« ${name} » a été soumis à une agence : la réglementation interdit sa suppression (rétention). Il sera archivé — conservé et restaurable à tout moment.`,
        en: `"${name}" was submitted to an agency: regulation forbids deletion (retention). It will be archived — kept and restorable anytime.`,
      }),
      confirm: t({ fr: 'Archiver', en: 'Archive' }),
      reason: true,
      destructive: false,
    },
    restore: {
      Icon: ArchiveRestore,
      trigger: t({ fr: 'Restaurer le dossier', en: 'Restore dossier' }),
      title: t({ fr: 'Restaurer ce dossier ?', en: 'Restore this dossier?' }),
      desc: t({
        fr: `« ${name} » reviendra dans vos dossiers actifs.`,
        en: `"${name}" will return to your active dossiers.`,
      }),
      confirm: t({ fr: 'Restaurer', en: 'Restore' }),
      reason: false,
      destructive: false,
    },
    'restore-trash': {
      Icon: ArchiveRestore,
      trigger: t({ fr: 'Restaurer le brouillon', en: 'Restore draft' }),
      title: t({ fr: 'Restaurer ce brouillon ?', en: 'Restore this draft?' }),
      desc: t({
        fr: `« ${name} » sortira de la corbeille et reviendra dans vos dossiers actifs.`,
        en: `"${name}" will leave the trash and return to your active dossiers.`,
      }),
      confirm: t({ fr: 'Restaurer', en: 'Restore' }),
      reason: false,
      destructive: false,
    },
    purge: {
      Icon: Trash2,
      trigger: t({ fr: 'Supprimer définitivement', en: 'Delete permanently' }),
      title: t({
        fr: 'Supprimer définitivement ce brouillon ?',
        en: 'Permanently delete this draft?',
      }),
      desc: t({
        fr: `« ${name} » sera effacé immédiatement et IRRÉVERSIBLEMENT — données, pièces et fichiers — sans attendre la purge automatique. L'action reste tracée au journal d'audit.`,
        en: `"${name}" will be erased immediately and IRREVERSIBLY — data, items and files — without waiting for the automatic purge. The action remains in the audit log.`,
      }),
      confirm: t({ fr: 'Supprimer définitivement', en: 'Delete permanently' }),
      reason: true,
      destructive: true,
    },
  }[mode]
  const { Icon } = cfg

  async function go() {
    setBusy(true)
    try {
      await onConfirm(reason)
      if (dontAskAgain) onSkipPreference?.(true)
      setOpen(false)
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  // Préférence « ne plus afficher » active : action DIRECTE (pas de dialogue) — le motif est vide
  // (l'audit trace quand même l'acte) et le toast undo sert de filet. VOLONTAIREMENT limité au
  // mode delete : purge (irréversible) et archive (réglementaire) ne se skippent JAMAIS.
  if (mode === 'delete' && skipConfirm) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={cfg.trigger}
        title={cfg.trigger}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          setBusy(true)
          void onConfirm('').finally(() => setBusy(false))
        }}
      >
        <Icon className="size-4" />
      </Button>
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={cfg.trigger}>
          <Icon className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cfg.title}</AlertDialogTitle>
          <AlertDialogDescription>{cfg.desc}</AlertDialogDescription>
        </AlertDialogHeader>
        {cfg.reason ? (
          <div className="space-y-1.5">
            <label htmlFor="dossier-action-reason" className="text-muted-foreground text-xs">
              {t({ fr: 'Motif (recommandé)', en: 'Reason (recommended)' })}
            </label>
            <textarea
              id="dossier-action-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
            />
          </div>
        ) : null}
        {mode === 'delete' && onSkipPreference ? (
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="accent-primary size-4 cursor-pointer"
            />
            {t({ fr: 'Ne plus afficher ce message', en: "Don't show this message again" })}
          </label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{t({ fr: 'Annuler', en: 'Cancel' })}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              void go()
            }}
            className={
              cfg.destructive ? 'bg-destructive hover:bg-destructive/90 text-white' : undefined
            }
          >
            {cfg.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
