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

export type DossierActionMode = 'delete' | 'archive' | 'restore'

/**
 * Action de fin de vie d'un dossier, avec confirmation + motif (audit ALCOA). Trois régimes :
 * - delete : brouillon jamais soumis → suppression douce (récupérable par un admin).
 * - archive : dossier soumis (enregistrement réglementaire) → conservé, jamais purgé.
 * - restore : remet un archivé dans l'actif.
 * Réutilisé par le board Opérations ET la page d'aperçu (icône seule, nom accessible).
 */
export function DossierAction({
  mode,
  name,
  onConfirm,
}: {
  mode: DossierActionMode
  name: string
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const cfg = {
    delete: {
      Icon: Trash2,
      trigger: t({ fr: 'Supprimer le brouillon', en: 'Delete draft' }),
      title: t({ fr: 'Supprimer ce brouillon ?', en: 'Delete this draft?' }),
      desc: t({
        fr: `« ${name} » est un brouillon jamais soumis. Il sera retiré (action tracée, récupérable par un administrateur).`,
        en: `"${name}" is a draft never submitted. It will be removed (audited, recoverable by an administrator).`,
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
  }[mode]
  const { Icon } = cfg

  async function go() {
    setBusy(true)
    try {
      await onConfirm(reason)
      setOpen(false)
      setReason('')
    } finally {
      setBusy(false)
    }
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
