import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PackageOpen, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
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
import { useI18n } from '@/lib/i18n-context'
import { deleteProduct, listProducts } from './repository'
import { syncProducts } from './sync'
import { useCatalogueSync } from './use-catalogue-sync'

export function CataloguePage() {
  const { t } = useI18n()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  const products = useLiveQuery(() => listProducts(orgId), [orgId])

  return (
    <Page>
      <PageHeader
        title={t({ fr: 'Catalogue', en: 'Catalogue' })}
        description={t({
          fr: 'Le tableau de bord des produits — tout part du produit.',
          en: 'The product dashboard — everything starts from the product.',
        })}
        actions={
          <Button asChild>
            <Link to="/catalogue/nouveau">
              <Plus /> {t({ fr: 'Nouveau produit', en: 'New product' })}
            </Link>
          </Button>
        }
      />

      {products === undefined ? (
        <CatalogueSkeleton />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title={t({ fr: 'Aucun produit', en: 'No product' })}
          description={t({
            fr: 'Enregistrez votre premier produit. Il sera disponible hors-ligne et alimentera le CTD Workspace, la traduction et le suivi de validité.',
            en: 'Save your first product. It will be available offline and feed the CTD Workspace, translation and validity tracking.',
          })}
          action={
            <Button asChild>
              <Link to="/catalogue/nouveau">
                <Plus /> {t({ fr: 'Nouveau produit', en: 'New product' })}
              </Link>
            </Button>
          }
        />
      ) : (
        <ProductTable products={products} />
      )}
    </Page>
  )
}

function CatalogueSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function ProductTable({ products }: { products: ProductRecord[] }) {
  const { t } = useI18n()
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[24%]">{t({ fr: 'Nom commercial', en: 'Trade name' })}</TableHead>
          <TableHead className="w-[24%]">{t({ fr: 'DCI', en: 'INN' })}</TableHead>
          <TableHead className="w-[13%]">{t({ fr: 'Dosage', en: 'Strength' })}</TableHead>
          <TableHead className="w-[15%]">{t({ fr: 'Forme', en: 'Form' })}</TableHead>
          <TableHead className="w-[12%]">{t({ fr: 'Code ATC', en: 'ATC code' })}</TableHead>
          <TableHead className="w-[88px] text-right">
            {t({ fr: 'Actions', en: 'Actions' })}
          </TableHead>
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
                  aria-label={t({
                    fr: `Modifier ${p.nomCommercial}`,
                    en: `Edit ${p.nomCommercial}`,
                  })}
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
  const { t } = useI18n()
  const orgId = useOrgId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await deleteProduct(id)
      void syncProducts(orgId)
      toast.success(t({ fr: 'Produit supprimé', en: 'Product deleted' }))
    } catch {
      toast.error(t({ fr: 'Échec de la suppression', en: 'Deletion failed' }))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t({ fr: `Supprimer ${name}`, en: `Delete ${name}` })}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t({ fr: `Supprimer « ${name} » ?`, en: `Delete "${name}"?` })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t({
              fr: 'Cette action est irréversible. Le produit et ses informations seront supprimés.',
              en: 'This action is irreversible. The product and its information will be deleted.',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t({ fr: 'Annuler', en: 'Cancel' })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void confirm()
            }}
            disabled={busy}
          >
            {t({ fr: 'Supprimer', en: 'Delete' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
