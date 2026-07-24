import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Cloud,
  CloudOff,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { renewalLeadDays } from '@/features/dashboard/dashboard-data'
import { db, type DocumentCategory, type DocumentRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { DocAddForm } from './DocAddForm'
import { DocDatesDialog, type EditableDoc } from './DocDatesDialog'
import { DocPreviewDialog, type PreviewableDoc } from './DocPreviewDialog'
import { categoryForDocType, docTypeLabel, docTypesFor, requiresExpiry } from './doc-types'
import { addDocument, deleteDocument, getDocumentBlob, listDocuments } from './documents-repository'
import { copyDocumentToProduct, listPartyDocs, sourcePartyIdsFor } from './documents-reuse'
import { syncCatalogue } from './catalogue-sync'
import { downloadDocumentBlob } from './documents-sync'
import { SourceDocPicker, type SourceDocEntry } from './SourceDocPicker'

/** Étiquette de validité d'une pièce réglementaire datée (réutilise la fenêtre de renouvellement par type). */
function validity(
  docType: string,
  expiryDate: string | null,
  now: Date,
): { tone: 'success' | 'warning' | 'danger'; fr: string; en: string } | null {
  if (!requiresExpiry(docType) || !expiryDate) return null
  const daysLeft = Math.round((new Date(expiryDate).getTime() - now.getTime()) / 86_400_000)
  if (daysLeft < 0) return { tone: 'danger', fr: 'Expiré', en: 'Expired' }
  if (daysLeft <= renewalLeadDays(docType))
    return { tone: 'warning', fr: 'À renouveler', en: 'To renew' }
  return { tone: 'success', fr: 'Valide', en: 'Valid' }
}

interface DocumentsSectionProps {
  orgId: string
  productId: string
  category: DocumentCategory
}

function triggerDownload(url: string, fileName: string, revoke: boolean) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (revoke) URL.revokeObjectURL(url)
}

export function DocumentsSection({ orgId, productId, category }: DocumentsSectionProps) {
  const { t, lang } = useI18n()
  // Répartition des deux colonnes par le type CANONIQUE (`doc-types`), PAS par le `category`
  // stocké : les pièces déposées avant la reclassification du COA en pièce administrative (#252)
  // ont gardé `category:'info'` en base et atterrissaient dans « Documents d'information »
  // (retour CEO). Le type, lui, ne ment pas — même règle que la fiche Organisation.
  const docs = useLiveQuery(
    async () =>
      (await listDocuments(productId)).filter(
        (d) => categoryForDocType(d.docType, d.category) === category,
      ),
    [productId, category],
  )
  const types = docTypesFor(category)
  // Formulaire d'ajout replié par défaut : on n'affiche que la liste + un bouton « + » (recette CEO).
  const [adding, setAdding] = useState(false)
  // Pièce en aperçu / en correction de dates (null = dialogue fermé).
  const [preview, setPreview] = useState<PreviewableDoc | null>(null)
  const [editing, setEditing] = useState<EditableDoc | null>(null)
  // Picker « Depuis la base de ‹org› » (§2) ouvert sur UN type (celui choisi dans le formulaire).
  const [pickingType, setPickingType] = useState<string | null>(null)

  // Base « piochable » (§2) : pièces ORG-scopées des parties liées au produit (titulaireId /
  // fabricantId), mapping par type (info+AMM → MAH, admin → fabricant, contrat → les deux).
  const sources =
    useLiveQuery<SourceDocEntry[]>(async () => {
      const product = await db.products.get(productId)
      if (!product) return []
      const tit = product.titulaireId ?? null
      const fab = product.fabricantId ?? null
      const ids = [...new Set([tit, fab].filter((id): id is string => !!id))]
      if (ids.length === 0) return []
      const parties = await db.parties.bulkGet(ids)
      const nameById = new Map(
        parties
          // Une partie SUPPRIMÉE (soft delete) encore référencée par le produit n'est plus une base.
          .filter((p): p is NonNullable<typeof p> => p !== undefined && p.deletedAt === null)
          .map((p) => [p.id, p.nom] as const),
      )
      const liveIds = ids.filter((id) => nameById.has(id))
      if (liveIds.length === 0) return []
      const partyDocs = await listPartyDocs(orgId, liveIds)
      return partyDocs
        .filter((d) => sourcePartyIdsFor(d.docType, tit, fab).includes(d.partyId ?? ''))
        .map((d) => ({ doc: d, orgName: nameById.get(d.partyId ?? '') ?? '' }))
    }, [orgId, productId]) ?? []
  // Sources d'UN type (bouton pioche du formulaire + entrées du picker).
  const sourcesFor = (dt: string) => sources.filter((s) => s.doc.docType === dt)
  const baseLabelFor = (dt: string) => {
    const names = [
      ...new Set(
        sourcesFor(dt)
          .map((s) => s.orgName)
          .filter(Boolean),
      ),
    ]
    return names.length === 1
      ? t({ fr: `Depuis la base de ${names[0]}`, en: `From the base of ${names[0]}` })
      : t({ fr: 'Depuis la base', en: 'From the base' })
  }

  /** Pioche = COPIE LIÉE immédiate vers le produit (blob + métadonnées + provenance). */
  async function pickFromBase(doc: DocumentRecord): Promise<boolean> {
    try {
      await copyDocumentToProduct(orgId, productId, doc.id)
      void syncCatalogue(orgId)
      toast.success(t({ fr: 'Pièce reprise de la base', en: 'Document picked from base' }))
      setAdding(false)
      return true
    } catch (error) {
      toast.error(t({ fr: 'Échec de la pioche', en: 'Pick failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
      return false
    }
  }

  async function handleDownload(id: string, fileName: string, filePath: string | null) {
    const blob = await getDocumentBlob(id)
    if (blob) {
      triggerDownload(URL.createObjectURL(blob), fileName, true)
      return
    }
    if (filePath) {
      const remote = await downloadDocumentBlob(filePath)
      if (remote) {
        triggerDownload(URL.createObjectURL(remote), fileName, true)
        return
      }
    }
    toast.error(t({ fr: 'Fichier indisponible hors-ligne', en: 'File unavailable offline' }))
  }

  async function handleDelete(id: string) {
    await deleteDocument(id)
    void syncCatalogue(orgId)
    toast.success(t({ fr: 'Document supprimé', en: 'Document deleted' }))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding((a) => !a)}>
          {adding ? <X /> : <Plus />}
          {adding
            ? t({ fr: 'Fermer', en: 'Close' })
            : t({ fr: 'Ajouter un document', en: 'Add document' })}
        </Button>
      </div>
      {adding ? (
        <DocAddForm
          types={types}
          category={category}
          onSubmit={async (input) => {
            await addDocument(orgId, productId, input)
            void syncCatalogue(orgId)
          }}
          onDone={() => setAdding(false)}
          // Deux chemins (§2) : la base de l'org liée possède des pièces de ce type → pioche
          // (copie liée, métadonnées héritées, aucun champ à ressaisir) OU upload classique.
          renderExtra={(dt) =>
            sourcesFor(dt).length > 0 ? (
              <div className="flex items-end sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setPickingType(dt)}>
                  <FolderOpen />
                  {baseLabelFor(dt)}
                  <span className="text-muted-foreground tabular-nums">
                    ({sourcesFor(dt).length})
                  </span>
                </Button>
              </div>
            ) : null
          }
        />
      ) : null}

      {docs === undefined ? (
        <p className="text-muted-foreground text-sm">{t({ fr: 'Chargement…', en: 'Loading…' })}</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t({ fr: "Aucun document pour l'instant.", en: 'No document yet.' })}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => {
            const v = validity(d.docType, d.expiryDate, new Date())
            return (
              <li key={d.id} className="flex items-center gap-3 p-3">
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {docTypeLabel(d.docType, lang)}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {d.fileName}
                    {d.reference ? ` · N° ${d.reference}` : ''}
                    {d.issueDate
                      ? t({ fr: ` · émise le ${d.issueDate}`, en: ` · issued ${d.issueDate}` })
                      : ''}
                    {d.expiryDate
                      ? t({ fr: ` · expire le ${d.expiryDate}`, en: ` · expires ${d.expiryDate}` })
                      : ''}
                  </div>
                </div>
                {v ? (
                  <StatusBadge tone={v.tone} className="shrink-0">
                    {t({ fr: v.fr, en: v.en })}
                  </StatusBadge>
                ) : null}
                <span
                  className="text-muted-foreground/70 shrink-0"
                  title={
                    d.uploaded
                      ? t({ fr: 'Sauvegardé dans le cloud', en: 'Saved to cloud' })
                      : t({ fr: 'Synchronisation en attente', en: 'Sync pending' })
                  }
                  aria-label={
                    d.uploaded
                      ? t({ fr: 'Sauvegardé dans le cloud', en: 'Saved to cloud' })
                      : t({ fr: 'Synchronisation en attente', en: 'Sync pending' })
                  }
                >
                  {d.uploaded ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t({ fr: 'Prévisualiser', en: 'Preview' })}
                  title={t({ fr: 'Prévisualiser', en: 'Preview' })}
                  onClick={() =>
                    setPreview({ id: d.id, filePath: d.filePath, fileName: d.fileName })
                  }
                >
                  <Eye className="size-4" />
                </Button>
                {category === 'admin' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t({ fr: 'Modifier les dates', en: 'Edit dates' })}
                    title={t({ fr: 'Modifier les dates', en: 'Edit dates' })}
                    onClick={() =>
                      setEditing({
                        id: d.id,
                        docType: d.docType,
                        fileName: d.fileName,
                        issueDate: d.issueDate ?? null,
                        expiryDate: d.expiryDate ?? null,
                        country: d.country ?? null,
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t({ fr: 'Télécharger', en: 'Download' })}
                  onClick={() => void handleDownload(d.id, d.fileName, d.filePath)}
                >
                  <Download className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t({ fr: 'Supprimer', en: 'Delete' })}
                  onClick={() => void handleDelete(d.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <DocPreviewDialog doc={preview} onOpenChange={(o) => !o && setPreview(null)} />
      <DocDatesDialog doc={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <SourceDocPicker
        entries={pickingType ? sourcesFor(pickingType) : null}
        title={pickingType ? baseLabelFor(pickingType) : ''}
        takenIds={new Set((docs ?? []).flatMap((d) => (d.sourceDocId ? [d.sourceDocId] : [])))}
        onPick={pickFromBase}
        onOpenChange={(o) => !o && setPickingType(null)}
      />
    </div>
  )
}
