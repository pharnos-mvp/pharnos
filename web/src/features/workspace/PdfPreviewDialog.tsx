import type { ReactNode } from 'react'
import { Download, X } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { PdfViewer } from './PdfViewer'

interface PdfPreviewDialogProps {
  /** Contenu PDF rendu via PDF.js (local-first, jamais bloqué par le sandbox d'un iframe). */
  blob: Blob
  /** Object URL pour le téléchargement direct. */
  url: string
  name: string
  /** Actions additionnelles dans la barre (ex. « Envoyer au correspondant » — jalon H). */
  actions?: ReactNode
  onClose: () => void
}

/** Prévisualisation in-place du PDF compilé — plein écran, rendu **PDF.js**, avec téléchargement. */
export function PdfPreviewDialog({ blob, url, name, actions, onClose }: PdfPreviewDialogProps) {
  const { t } = useI18n()
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t({ fr: `Aperçu : ${name}`, en: `Preview: ${name}` })}
    >
      <div className="bg-card mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b p-2">
          <span className="truncate px-2 text-sm font-medium">{name}</span>
          <div className="flex items-center gap-1">
            {actions}
            <a
              href={url}
              download={name}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download className="size-4" /> {t({ fr: 'Télécharger', en: 'Download' })}
            </a>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t({ fr: 'Fermer', en: 'Close' })}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <PdfViewer blob={blob} />
      </div>
    </div>
  )
}
