import { Download, X } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'

interface PdfPreviewDialogProps {
  url: string
  name: string
  onClose: () => void
}

/** Prévisualisation in-place d'un PDF/image (object URL) — plein écran, avec téléchargement. */
export function PdfPreviewDialog({ url, name, onClose }: PdfPreviewDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu : ${name}`}
    >
      <div className="bg-card mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b p-2">
          <span className="truncate px-2 text-sm font-medium">{name}</span>
          <div className="flex items-center gap-1">
            <a
              href={url}
              download={name}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download className="size-4" /> Télécharger
            </a>
            <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <iframe
          src={url}
          title={name}
          sandbox="allow-same-origin allow-popups allow-downloads"
          className="min-h-0 flex-1 bg-white"
        />
      </div>
    </div>
  )
}
