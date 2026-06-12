import { ClipboardList, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Type court affiché sur la carte (le mockup CEO montre « RCP »). */
const SHORT_LABEL: Record<string, string> = {
  rcp: 'RCP',
  notice: 'Notice',
  labeling: 'Étiquetage',
  artwork: 'Étiquetage',
  cover: 'Cover letter',
  pght: 'Lettre de PGHT',
}

/**
 * Signalement de non-conformité — branding mockup CEO : carte blanche arrondie flottante,
 * centrée SUR l'aperçu du document, type en gras + « non conforme au template en vigueur ! »,
 * bouton violet « Upgrader ! » (ouvre le template officiel à remplir). À poser dans un
 * conteneur `relative` ; le fond reste cliquable (overlay en pointer-events-none).
 */
export function NonConformCard({
  docType,
  onUpgrade,
  onDismiss,
}: {
  docType: string
  onUpgrade: () => void
  onDismiss: () => void
}) {
  return (
    // `sticky` dans l'overlay : la carte reste centrée à l'écran même quand le document
    // derrière fait plusieurs pages (elle accompagne le défilement dans les limites de l'aperçu).
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="sticky top-[30vh] flex justify-center p-4">
        <div className="pointer-events-auto relative flex max-w-xs flex-col items-center gap-4 rounded-2xl border bg-white px-8 py-6 text-center shadow-2xl">
          <button
            type="button"
            aria-label="Masquer le signalement"
            title="Masquer (le constat reste dans le panneau Remarques)"
            onClick={onDismiss}
            className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-2 right-2 rounded-full p-1"
          >
            <X className="size-3.5" />
          </button>
          <p className="text-sm leading-snug font-bold text-neutral-900">
            {SHORT_LABEL[docType] ?? docType.toUpperCase()}
            <br />
            non conforme au template en vigueur&nbsp;!
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onUpgrade}
            className="h-8 gap-1.5 rounded-full border-violet-500 px-5 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
          >
            <ClipboardList className="size-3.5" />
            Remplir le template
          </Button>
        </div>
      </div>
    </div>
  )
}
