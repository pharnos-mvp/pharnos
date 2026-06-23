import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ProductRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { seedVariationItems, type VariationItem } from './variation-request'
import { VariationPicker } from './VariationPicker'
import { VariationTableForm } from './VariationTableForm'

/**
 * Modale **centrée au premier plan** « natures de variation + tableau comparatif ». Quand
 * `showPicker` (Workspace), le sélecteur deux colonnes est EN HAUT et le tableau **grandit en live**
 * au fur et à mesure des coches. **Annuler** ferme sans rien valider → la sélection revient à l'état
 * d'avant ouverture (décoche le choix qui a ouvert la modale) ; **Valider** remonte refs + items.
 * Sans `showPicker` (Bibliothèque), seules les lignes du tableau sont éditées (refs déjà choisis via
 * la liste déroulante du header) : ici **Annuler** abandonne uniquement les saisies du tableau, pas le
 * choix des variations (la décoche se fait sur les chips du header).
 */
export function VariationTableDialog({
  open,
  onOpenChange,
  refs,
  product,
  initialItems,
  showPicker = true,
  onCommit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  refs: number[]
  product?: ProductRecord
  initialItems?: VariationItem[]
  showPicker?: boolean
  onCommit: (refs: number[], items: VariationItem[]) => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {showPicker
              ? t({
                  fr: 'Natures de variation & tableau comparatif',
                  en: 'Variation types & comparison table',
                })
              : t({ fr: 'Tableau comparatif', en: 'Comparison table' })}
          </DialogTitle>
          <DialogDescription>
            {t({
              fr: 'Renseignez l’ancien et le nouveau pour chaque variation. La justification est optionnelle (colonne masquée sur le document si vide).',
              en: 'Fill the old and new values for each variation. Justification is optional (column hidden in the document if empty).',
            })}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <Body
            refs={refs}
            product={product}
            initialItems={initialItems}
            showPicker={showPicker}
            onCancel={() => onOpenChange(false)}
            onCommit={(r, items) => {
              onCommit(r, items)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  refs,
  product,
  initialItems,
  showPicker,
  onCancel,
  onCommit,
}: {
  refs: number[]
  product?: ProductRecord
  initialItems?: VariationItem[]
  showPicker: boolean
  onCancel: () => void
  onCommit: (refs: number[], items: VariationItem[]) => void
}) {
  const { t } = useI18n()
  // Brouillon local : ne touche au parent qu'à « Valider » (→ Annuler revient à l'état d'avant).
  const [draftRefs, setDraftRefs] = useState<number[]>(refs)
  const [items, setItems] = useState<VariationItem[]>(() =>
    seedVariationItems(refs, product, initialItems),
  )
  // Coche/décoche → réamorce les lignes du tableau en préservant les saisies déjà faites.
  const changeRefs = (next: number[]) => {
    setDraftRefs(next)
    setItems((cur) => seedVariationItems(next, product, cur))
  }

  return (
    <div className="flex flex-col gap-4">
      {showPicker ? (
        <div>
          <p className="text-foreground mb-2 text-sm font-medium">
            {t({
              fr: '1. Cochez la (les) nature(s) de variation',
              en: '1. Tick the variation type(s)',
            })}
          </p>
          <VariationPicker value={draftRefs} onChange={changeRefs} />
        </div>
      ) : null}

      <div>
        {showPicker ? (
          <p className="text-foreground mb-2 text-sm font-medium">
            {t({ fr: '2. Renseignez le tableau comparatif', en: '2. Fill the comparison table' })}
          </p>
        ) : null}
        <VariationTableForm
          items={items}
          onChange={setItems}
          emptyHint={t({
            fr: 'Cochez au moins une variation ci-dessus pour remplir le tableau.',
            en: 'Tick at least one variation above to fill the table.',
          })}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t({ fr: 'Annuler', en: 'Cancel' })}
        </Button>
        <Button disabled={draftRefs.length === 0} onClick={() => onCommit(draftRefs, items)}>
          {t({ fr: 'Valider', en: 'Save' })}
        </Button>
      </DialogFooter>
    </div>
  )
}
