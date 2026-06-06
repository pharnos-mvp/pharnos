import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  XCircle,
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
import { cn } from '@/lib/utils'
import { ArborescenceTree } from './ArborescenceTree'
import { countryLabel } from './dossier-constants'
import { getDossier, updateDossierTree } from './dossier-repository'
import { nodeForDocType, type CtdNodeDef } from './module1-tree'
import { flattenTree } from './tree-utils'

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
      map.set(nodeForDocType(dossier.format, d.docType, d.category), [
        ...(map.get(nodeForDocType(dossier.format, d.docType, d.category)) ?? []),
        d,
      ])
    }
    return map
  }, [docs, dossier])

  const flatNodes = useMemo(() => (dossier ? flattenTree(dossier.tree) : []), [dossier])
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
  const leaves = flatNodes.filter((n) => !n.children?.length)
  const filledLeaves = leaves.filter((n) => docsFor(n).length > 0)
  const pct = leaves.length ? Math.round((filledLeaves.length / leaves.length) * 100) : 0
  const okCount = filledLeaves.length
  const warnCount = alerts.filter((a) => !a.expired).length
  const errCount = alerts.filter((a) => a.expired).length
  const region = dossier.format === 'ctd' ? 'CTD UEMOA' : 'eCTD CEDEAO'

  return (
    <div className="flex h-[calc(100svh-7rem)] flex-col">
      <div className="flex items-start gap-2 border-b pb-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="mt-0.5"
          aria-label="Retour aux dossiers"
          onClick={() => navigate('/workspace')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl leading-tight font-bold">
            {dossier.productName} - {countryLabel(dossier.country)}
          </h1>
          <p className="text-muted-foreground text-sm">Création Module 1 ({region})</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 pt-3">
        {/* Panneau gauche : arborescence */}
        {collapsed ? (
          <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 overflow-auto rounded-lg border py-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Déplier l'arborescence"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeftOpen className="size-4" />
            </Button>
            {flatNodes.map((n) => (
              <button
                key={n.id ?? n.number}
                type="button"
                title={`${n.number} ${n.label}`}
                onClick={() => setSelected(n)}
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums',
                  selected?.id === n.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {n.number || '•'}
              </button>
            ))}
          </div>
        ) : (
          <aside className="flex w-72 shrink-0 flex-col rounded-lg border">
            <div className="flex items-start justify-between border-b p-3">
              <div>
                <div className="text-sm font-semibold">Arborescence</div>
                <div className="text-muted-foreground text-xs">Séquence 0001</div>
              </div>
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
              <div className="text-muted-foreground px-1 pb-1 text-[11px] font-semibold tracking-wide">
                MODULE 1 — ADMINISTRATIF
              </div>
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

        {/* Panneau central */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="flex justify-center border-b p-2">
            <div className="bg-card flex items-center gap-1 rounded-full border px-1 py-1 text-sm">
              <ToolbarBtn label="Modifier" disabled />
              <ToolbarBtn label="Signer" disabled />
              <ToolbarBtn label="En-tête / Pied de page" disabled />
              <ToolbarBtn label="Régénérer" disabled />
              <ToolbarBtn
                label="Télécharger"
                disabled={selectedDocs.length === 0}
                onClick={() => selectedDocs[0] && void downloadDoc(selectedDocs[0])}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {selected ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      {selected.number ? `${selected.number} ` : ''}
                      {selected.label}
                    </h2>
                    <p className="text-muted-foreground text-xs">
                      {selectedDocs.length > 0
                        ? `${selectedDocs.length} document(s) ajouté(s)`
                        : 'Aucun document'}
                    </p>
                  </div>
                  {selectedDocs.length > 0 ? (
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                      EN ATTENTE
                    </Badge>
                  ) : null}
                </div>

                {selectedDocs.length === 0 ? (
                  <div className="text-muted-foreground flex h-64 flex-col items-center justify-center rounded-lg border border-dashed text-sm">
                    <FileText className="mb-2 size-8" />
                    Aucun document classé sous cette section.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4 rounded-lg border p-6">
                    {selectedDocs.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => void downloadDoc(d)}
                        className="hover:bg-accent flex w-40 flex-col items-center gap-2 rounded-lg p-3"
                        title="Télécharger"
                      >
                        <FileText className="text-muted-foreground size-10" />
                        <span className="max-w-full truncate rounded-full border px-3 py-1 text-xs">
                          {d.fileName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                Sélectionnez une section de l'arborescence.
              </div>
            )}
          </div>
        </main>

        {/* Panneau droit : complétude & remarques */}
        {rightCollapsed ? (
          <div className="hidden w-14 shrink-0 flex-col items-center gap-3 rounded-lg border py-3 lg:flex">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Afficher la complétude"
              onClick={() => setRightCollapsed(false)}
            >
              <PanelRightOpen className="size-4" />
            </Button>
            <Donut value={pct} size={44} />
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="size-4" /> {okCount}
            </div>
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <span className="text-sm leading-none">⚠</span> {warnCount}
            </div>
            <div className="flex items-center gap-1 text-xs text-red-600">
              <XCircle className="size-4" /> {errCount}
            </div>
          </div>
        ) : (
          <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-auto lg:flex">
            <div className="flex flex-col items-center rounded-lg border p-4">
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium">État d'avancement</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Replier"
                  onClick={() => setRightCollapsed(true)}
                >
                  <PanelRightClose className="size-4" />
                </Button>
              </div>
              <Donut value={pct} size={96} />
              <p className="text-muted-foreground mt-1 text-xs">Conformité UEMOA en direct</p>
            </div>
            <div className="rounded-lg border p-3">
              <h3 className="text-sm font-medium">Remarques pour la session</h3>
              {alerts.length === 0 ? (
                <p className="text-muted-foreground mt-3 text-center text-xs italic">
                  Aucune irrégularité trouvée pour le moment.
                </p>
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
        )}
      </div>
    </div>
  )
}

function ToolbarBtn({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="rounded-full"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Bientôt disponible' : label}
    >
      {label}
    </Button>
  )
}

function Donut({ value, size = 96 }: { value: number; size?: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value}%`}
    >
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        className="text-muted"
        opacity="0.25"
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
        className="text-primary"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
        {value}%
      </text>
    </svg>
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
