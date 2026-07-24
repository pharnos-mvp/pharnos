import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DocumentCategory, PartyRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { syncCatalogue } from './catalogue-sync'
import { DocAddForm } from './DocAddForm'
import type { DocTypeOption } from './doc-types'
import { addPartyDocument } from './documents-repository'

/**
 * Bouton « Ajouter » de la fiche ORGANISATION (PLAN-ORG-REFERENTIEL §3) : dépose une pièce dans la
 * base documentaire PROPRE de l'org (`addPartyDocument`, 0069) via le formulaire partagé
 * `DocAddForm`. Les `types` proposés viennent de la matrice par rôle (§1) — aucun type autorisé
 * (ex. distributeur) → le bouton ne se rend pas. Tout dépôt devient immédiatement « piochable »
 * depuis les produits (§2) : la boucle fiche org ⇄ produits ⇄ CTD est fermée.
 */
export function OrgDocAddButton({
  orgId,
  party,
  types,
  category,
}: {
  orgId: string
  party: PartyRecord
  /** Types autorisés pour CET onglet/page (matrice §1) — vide = pas de bouton. */
  types: DocTypeOption[]
  category: DocumentCategory
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // Rangée PORTÉE par le bouton : aucun type autorisé (ex. distributeur) → rien du tout,
  // pas même la rangée vide (l'onglet garde sa mise en page d'origine).
  if (types.length === 0) return null

  return (
    <div className="flex justify-end">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> {t({ fr: 'Ajouter', en: 'Add' })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t({
                fr: `Ajouter à la base de ${party.nom}`,
                en: `Add to ${party.nom}'s base`,
              })}
            </DialogTitle>
          </DialogHeader>
          <DocAddForm
            types={types}
            category={category}
            onSubmit={async (input) => {
              await addPartyDocument(orgId, party.id, input)
              void syncCatalogue(orgId)
            }}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
