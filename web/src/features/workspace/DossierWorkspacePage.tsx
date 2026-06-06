import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  Download,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { getDocumentBlob, listDocuments } from '@/features/catalogue/documents-repository'
import { getDocumentDownloadUrl } from '@/features/catalogue/documents-sync'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useOrgId } from '@/features/org/org-context'
import type { DocumentRecord } from '@/lib/db'
import { ArborescenceTree } from './ArborescenceTree'
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
import { getDossier, updateDossierTree } from './dossier-repository'
import { nodeForDocType, type CtdNodeDef } from './module1-tree'

interface ValidityAlert {
  id: string
  docType: string
  expiryDate: string
  expired: boolean
}

export function DossierWorkspacePage() {
  const { dossierId } = useParams()
  const navigate = useNavigate()
  const orgId = useOrgId()
  useCatalogueSync(orgId)

  const dossier = useLiveQuery(
    async () => (dossierId ? ((await getDossier(dossierId)) ?? null) : null),
    [dossierId],
  )
  const docs = useLiveQuery(
    () => (dossier ? listDocuments(dossier.productId) : Promise.resolve([])),
    [dossier?.productId],
  )

  const [selected, setSelected] = useState<CtdNodeDef | null>(null)
  const [editing, setEditing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const docsByNode = useMemo(() => {
    const map = new Map<string, DocumentRecord[]>()
    if (!dossier) return map
    for (const d of docs ?? []) {
      const n = nodeForDocType(dossier.format, d.docType, d.category)
      map.set(n, [...(map.get(n) ?? []), d])
    }
    return map
  }, [docs, dossier])

  const alerts = useMemo(() => computeAlerts(docs ?? []), [docs])

  function docsFor(node: CtdNodeDef): DocumentRecord[] {
    const out: DocumentRecord[] = []
    for (const [n, list] of docsByNode) {
      if (n === node.number || (node.number !== '' && n.startsWith(`${node.number}.`))) {
        out.push(...list)
      }
    }
    return out
  }

  async function handleTreeChange(tree: CtdNodeDef[]) {
    if (dossierId) await updateDossierTree(dossierId, tree)
  }

  if (dossier === undefined) {
    return <p className="text-muted-foreground p-4 text-sm">Chargement…</p>
  }
  if (dossier === null) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">Dossier introuvable.</p>
        <Button variant="ghost" className="mt-2 -ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> Retour aux dossiers
        </Button>
      </div>
    )
  }

  const selectedDocs = selected ? docsFor(selected) : []
  const totalClassified = docs?.length ?? 0
  const filledSections = docsByNode.size

  return (
    <div className="flex h-[calc(100svh-7rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> Dossiers
        </Button>
        <h1 className="text-lg font-semibold">{dossier.productName}</h1>
        <Badge variant="secondary">{formatLabel(dossier.format)}</Badge>
        <span className="text-muted-foreground text-sm">
          {activityLabel(dossier.activity)} · {countryLabel(dossier.country)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={rightCollapsed ? 'Afficher la complétude' : 'Masquer la complétude'}
            onClick={() => setRightCollapsed(!rightCollapsed)}
          >
            {rightCollapsed ? (
              <PanelRightOpen className="size-4" />
            ) : (
              <PanelRightClose className="size-4" />
            )}
          </Button>
          <Button variant="outline" size="sm" disabled title="Disponible en M6">
            Compiler PDF
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 pt-3">
        {collapsed ? (
          <Button
            variant="outline"
            size="icon"
            aria-label="Afficher l'arborescence"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        ) : (
          <aside className="flex w-72 shrink-0 flex-col rounded-lg border">
            <div className="flex items-center justify-between border-b p-2">
              <span className="text-sm font-medium">Module 1</span>
              <span className="flex items-center">
                <Button
                  variant={editing ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label="Éditer l'arborescence"
                  onClick={() => setEditing(!editing)}
                >
                  <Settings2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Replier le panneau"
                  onClick={() => setCollapsed(true)}
                >
                  <PanelLeftClose className="size-4" />
                </Button>
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <ArborescenceTree
                tree={dossier.tree}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                docCount={(node) => docsFor(node).length}
                editing={editing}
                onChange={handleTreeChange}
              />
            </div>
            {editing ? (
              <p className="text-muted-foreground border-t p-2 text-xs">
                Mode édition : renommez, repositionnez (▲▼), ajoutez ou supprimez des sections.
              </p>
            ) : null}
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-auto rounded-lg border p-4">
          {selected ? (
            <>
              <div className="mb-3">
                <h2 className="font-semibold">
                  {selected.number ? `${selected.number} · ` : ''}
                  {selected.label}
                </h2>
                <p className="text-muted-foreground text-xs">
                  {selectedDocs.length} document(s) classé(s) automatiquement ici
                </p>
              </div>
              {selectedDocs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucun document classé sous cette section. Les documents enregistrés sous le
                  produit (Catalogue) apparaissent ici automatiquement.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {selectedDocs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 p-3">
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {docTypeLabel(d.docType)}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          {d.fileName}
                          {d.expiryDate ? ` · expire le ${d.expiryDate}` : ''}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Télécharger"
                        onClick={() => void downloadDoc(d)}
                      >
                        <Download className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Sélectionnez une section de l'arborescence.
            </div>
          )}
        </main>

        {!rightCollapsed ? (
          <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-auto lg:flex">
            <div className="rounded-lg border p-3">
              <h3 className="text-sm font-medium">Complétude</h3>
              <p className="text-muted-foreground mt-1 text-xs">
                {totalClassified} document(s) · {filledSections} rubrique(s) remplie(s)
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <h3 className="text-sm font-medium">Alertes de validité</h3>
              {alerts.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-xs">Aucune alerte.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-xs">
                      <Badge variant={a.expired ? 'destructive' : 'outline'}>
                        {a.expired ? 'Expiré' : 'Bientôt'}
                      </Badge>
                      <span className="truncate">
                        {docTypeLabel(a.docType)} — {a.expiryDate}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

async function downloadDoc(d: DocumentRecord) {
  const blob = await getDocumentBlob(d.id)
  if (blob) {
    triggerDownload(URL.createObjectURL(blob), d.fileName, true)
    return
  }
  if (d.filePath) {
    const url = await getDocumentDownloadUrl(d.filePath)
    if (url) triggerDownload(url, d.fileName, false)
  }
}

function triggerDownload(url: string, name: string, revoke: boolean) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (revoke) URL.revokeObjectURL(url)
}

function computeAlerts(docs: DocumentRecord[]): ValidityAlert[] {
  const today = new Date()
  const soon = new Date()
  soon.setDate(soon.getDate() + 90)
  const out: ValidityAlert[] = []
  for (const d of docs) {
    if (!d.expiryDate) continue
    const exp = new Date(d.expiryDate)
    if (exp <= soon) {
      out.push({ id: d.id, docType: d.docType, expiryDate: d.expiryDate, expired: exp < today })
    }
  }
  return out.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
}
