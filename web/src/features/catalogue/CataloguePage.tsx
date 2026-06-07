import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOrgId } from '@/features/org/org-context'
import type { ProductRecord } from '@/lib/db'
import { deleteProduct, listProducts } from './repository'
import { syncProducts } from './sync'
import { useCatalogueSync } from './use-catalogue-sync'

export function CataloguePage() {
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  const products = useLiveQuery(() => listProducts(orgId), [orgId])

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalogue</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Le tableau de bord des produits — tout part du produit.
          </p>
        </div>
        <Button asChild>
          <Link to="/catalogue/nouveau">
            <Plus /> Nouveau produit
          </Link>
        </Button>
      </div>

      <div className="mt-6">
        {products === undefined ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : products.length === 0 ? (
          <EmptyState />
        ) : (
          <ProductTable products={products} />
        )}
      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <h2 className="text-lg font-medium">Aucun produit</h2>
      <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
        Enregistrez votre premier produit. Il sera disponible hors-ligne et alimentera le CTD
        Workspace, la traduction et le suivi de validité.
      </p>
      <Button asChild className="mt-4">
        <Link to="/catalogue/nouveau">
          <Plus /> Nouveau produit
        </Link>
      </Button>
    </div>
  )
}

function ProductTable({ products }: { products: ProductRecord[] }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[24%]">Nom commercial</TableHead>
          <TableHead className="w-[24%]">DCI</TableHead>
          <TableHead className="w-[13%]">Dosage</TableHead>
          <TableHead className="w-[15%]">Forme</TableHead>
          <TableHead className="w-[12%]">Code ATC</TableHead>
          <TableHead className="w-[88px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="truncate font-medium" title={p.nomCommercial}>
              {p.nomCommercial}
            </TableCell>
            <TableCell className="truncate" title={p.dci}>
              {p.dci}
            </TableCell>
            <TableCell className="truncate" title={p.dosage || undefined}>
              {p.dosage || '—'}
            </TableCell>
            <TableCell className="truncate" title={p.forme || undefined}>
              {p.forme || '—'}
            </TableCell>
            <TableCell className="truncate" title={p.codeAtc || undefined}>
              {p.codeAtc || '—'}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label={`Modifier ${p.nomCommercial}`}
                >
                  <Link to={`/catalogue/${p.id}`}>
                    <Pencil />
                  </Link>
                </Button>
                <DeleteProductDialog id={p.id} name={p.nomCommercial} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DeleteProductDialog({ id, name }: { id: string; name: string }) {
  const orgId = useOrgId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await deleteProduct(id)
      void syncProducts(orgId)
      toast.success('Produit supprimé')
    } catch {
      toast.error('Échec de la suppression')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Supprimer ${name}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le produit et ses informations seront supprimés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void confirm()
            }}
            disabled={busy}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
