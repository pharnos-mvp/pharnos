import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InlineDocPreview } from '@/features/workspace/components/InlineDocPreview'

export interface PreviewableDoc {
  id: string
  filePath: string | null
  fileName: string
}

/**
 * Aperçu **au premier plan** d'une pièce PERSISTÉE (≠ brouillon du wizard, qui est un `File` en
 * mémoire). `InlineDocPreview` fait le travail : blob local d'abord (offline-first), sinon
 * téléchargement Storage puis épinglage local — donc un 2ᵉ aperçu marche hors-ligne.
 *
 * `key={doc.id}` : remonte la visionneuse à chaque pièce → jamais le blob de la précédente.
 */
export function DocPreviewDialog({
  doc,
  onOpenChange,
}: {
  doc: PreviewableDoc | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8" title={doc?.fileName}>
            {doc?.fileName}
          </DialogTitle>
        </DialogHeader>
        {doc ? (
          <div className="max-h-[72vh] overflow-auto">
            <InlineDocPreview
              key={doc.id}
              kind="doc"
              docId={doc.id}
              filePath={doc.filePath}
              fileName={doc.fileName}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
