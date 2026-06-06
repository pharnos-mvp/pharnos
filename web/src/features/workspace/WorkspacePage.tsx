import { useLiveQuery } from 'dexie-react-hooks'
import { FileStack, FolderPlus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useOrgId } from '@/features/org/org-context'
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
import { deleteDossier, listDossiers } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import { useDossierSync } from './use-dossier-sync'

export function WorkspacePage() {
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  const dossiers = useLiveQuery(() => listDossiers(orgId), [orgId])

  async function handleDelete(id: string) {
    await deleteDossier(id)
    void syncDossiers(orgId)
    toast.success('Dossier supprimé')
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CTD Workspace</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Montez vos dossiers CTD/eCTD Module 1.
          </p>
        </div>
        <Button asChild>
          <Link to="/workspace/nouveau">
            <FolderPlus /> Nouveau dossier
          </Link>
        </Button>
      </div>

      <div className="mt-6">
        {dossiers === undefined ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : dossiers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <FileStack className="text-muted-foreground mx-auto size-8" />
            <h2 className="mt-2 text-lg font-medium">Aucun dossier</h2>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
              Créez un dossier : choisissez un produit, le format (CTD/eCTD), l'activité et le pays
              cible.
            </p>
            <Button asChild className="mt-4">
              <Link to="/workspace/nouveau">
                <FolderPlus /> Nouveau dossier
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {dossiers.map((d) => (
              <li key={d.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/workspace/${d.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.productName}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {activityLabel(d.activity)} · {countryLabel(d.country)}
                    </div>
                  </Link>
                  <Badge variant="secondary">{formatLabel(d.format)}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="outline">{d.status}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer le dossier"
                    onClick={() => void handleDelete(d.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
