import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Editor, JSONContent } from '@tiptap/core'
import {
  ArrowLeft,
  Bold,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  Heading2,
  Italic,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { getDocumentBlob, listDocuments } from '@/features/catalogue/documents-repository'
import { getDocumentDownloadUrl } from '@/features/catalogue/documents-sync'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import { getOrgBranding, getUserSignature } from '@/features/profile/pro-settings-repository'
import { useProSettingsSync } from '@/features/profile/use-pro-settings-sync'
import {
  db,
  type DocumentRecord,
  type DossierAttachmentRecord,
  type GeneratedDocRecord,
} from '@/lib/db'
import { cn } from '@/lib/utils'
import { ArborescenceTree } from './ArborescenceTree'
import { countryLabel } from './dossier-constants'
import {
  addAttachment,
  deleteAttachment,
  getAttachmentBlob,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
} from './dossier-attachments-repository'
import { getAttachmentDownloadUrl, syncDossierAttachments } from './dossier-attachments-sync'
import { getDossier, updateDossierTree } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import {
  createGeneratedDoc,
  listGeneratedDocs,
  regenerateGeneratedDoc,
  updateGeneratedDocContent,
} from './generated-docs-repository'
import { generatedDocToHtml } from './generated-doc-html'
import { syncGeneratedDocs } from './generated-docs-sync'
import { useDossierAttachmentsSync } from './use-dossier-attachments-sync'
import { useDossierSync } from './use-dossier-sync'
import { useGeneratedDocsSync } from './use-generated-docs-sync'
import { nodeForDocType, type CtdNodeDef } from './module1-tree'
import { agencyFor } from './roadmap-data'
import { PdfPreviewDialog } from './PdfPreviewDialog'
import { RichTextEditor } from './RichTextEditor'
import { TEMPLATES, templateKeyForNode, type TemplateContext } from './templates'
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
  useDossierSync(orgId)
  useGeneratedDocsSync(orgId)
  useDossierAttachmentsSync(orgId)
  useProSettingsSync(orgId)

  const { user } = useAuth()
  const userId = user?.id ?? 'local'

  const dossier = useLiveQuery(
    async () => (dossierId ? ((await getDossier(dossierId)) ?? null) : null),
    [dossierId],
  )
  const product = useLiveQuery(
    async () => (dossier ? ((await db.products.get(dossier.productId)) ?? undefined) : undefined),
    [dossier?.productId],
  )
  const docs = useLiveQuery(
    () => (dossier ? listDocuments(dossier.productId) : Promise.resolve([])),
    [dossier?.productId],
  )
  const genDocs = useLiveQuery(
    () => (dossierId ? listGeneratedDocs(dossierId) : Promise.resolve([])),
    [dossierId],
  )
  const attachments = useLiveQuery(
    () => (dossierId ? listAttachments(dossierId) : Promise.resolve([])),
    [dossierId],
  )
  const branding = useLiveQuery(() => getOrgBranding(orgId), [orgId])
  const signature = useLiveQuery(() => getUserSignature(userId), [userId])

  const [selected, setSelected] = useState<CtdNodeDef | null>(null)
  const [treeEditing, setTreeEditing] = useState(false)
  const [docEditing, setDocEditing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [editorState, setEditorState] = useState<{ id: string; ed: Editor } | null>(null)
  const [previewPdf, setPreviewPdf] = useState<{
    url: string
    name: string
    revoke: boolean
  } | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [autoStructural, setAutoStructural] = useState(true)
  const [pickedKey, setPickedKey] = useState<string | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<{ id: string; json: JSONContent } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<{ url: string; revoke: boolean } | null>(null)

  const docsByNode = useMemo(() => {
    const map = new Map<string, DocumentRecord[]>()
    if (!dossier) return map
    for (const d of docs ?? []) {
      const node = nodeForDocType(dossier.format, d.docType, d.category)
      map.set(node, [...(map.get(node) ?? []), d])
    }
    return map
  }, [docs, dossier])

  const genByNode = useMemo(() => {
    const map = new Map<string, GeneratedDocRecord>()
    for (const g of genDocs ?? []) map.set(g.nodeNumber, g)
    return map
  }, [genDocs])

  const attachByNode = useMemo(() => {
    const map = new Map<string, DossierAttachmentRecord[]>()
    for (const a of attachments ?? []) map.set(a.nodeNumber, [...(map.get(a.nodeNumber) ?? []), a])
    return map
  }, [attachments])

  const flatNodes = useMemo(() => (dossier ? flattenTree(dossier.tree) : []), [dossier])
  const alerts = useMemo(() => computeAlerts(docs ?? []), [docs])

  const handleEditorReady = useCallback((ed: Editor, id: string) => setEditorState({ id, ed }), [])

  /** Écrit immédiatement toute édition débouncée en attente. */
  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const p = pendingSave.current
    if (p) {
      pendingSave.current = null
      void updateGeneratedDocContent(p.id, p.json).then(() => syncGeneratedDocs(orgId))
    }
  }, [orgId])

  /** Abandonne toute édition débouncée en attente (ex. avant régénération). */
  const cancelSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingSave.current = null
  }, [])

  const handleEditorChange = useCallback(
    (id: string, json: JSONContent) => {
      pendingSave.current = { id, json }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => flushSave(), 700)
    },
    [flushSave],
  )

  // Persiste les éditions en attente au démontage (navigation hors du workspace).
  useEffect(() => () => flushSave(), [flushSave])

  // Libère l'object URL d'aperçu au démontage (évite une fuite si on quitte dialog ouvert).
  useEffect(() => {
    previewRef.current = previewPdf ? { url: previewPdf.url, revoke: previewPdf.revoke } : null
  }, [previewPdf])
  useEffect(
    () => () => {
      if (previewRef.current?.revoke) URL.revokeObjectURL(previewRef.current.url)
    },
    [],
  )

  function docsFor(node: CtdNodeDef): DocumentRecord[] {
    const out: DocumentRecord[] = []
    for (const [n, list] of docsByNode) {
      if (n === node.number || (node.number !== '' && n.startsWith(`${node.number}.`))) {
        out.push(...list)
      }
    }
    return out
  }

  function genDocsFor(node: CtdNodeDef): GeneratedDocRecord[] {
    const out: GeneratedDocRecord[] = []
    for (const [n, g] of genByNode) {
      if (n === node.number || (node.number !== '' && n.startsWith(`${node.number}.`))) {
        out.push(g)
      }
    }
    return out
  }

  function attachmentsFor(node: CtdNodeDef): DossierAttachmentRecord[] {
    const out: DossierAttachmentRecord[] = []
    for (const [n, list] of attachByNode) {
      if (n === node.number || (node.number !== '' && n.startsWith(`${node.number}.`))) {
        out.push(...list)
      }
    }
    return out
  }

  function countFor(node: CtdNodeDef): number {
    return docsFor(node).length + genDocsFor(node).length + attachmentsFor(node).length
  }

  async function handleTreeChange(tree: CtdNodeDef[]) {
    if (dossierId) await updateDossierTree(dossierId, tree)
    void syncDossiers(orgId)
  }

  function handleSelectNode(node: CtdNodeDef) {
    flushSave() // ne pas perdre l'édition en cours en changeant de section
    setSelected(node)
    setDocEditing(false)
    setPickedKey(null) // aperçu auto du 1er document du nœud
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

  const activeDossier = dossier
  const selectedDocs = selected ? docsFor(selected) : []
  const selectedTplKey = selected ? templateKeyForNode(dossier.format, selected.number) : undefined
  const selectedGenDoc = selected ? genByNode.get(selected.number) : undefined
  const selectedAttachments = selected ? attachmentsFor(selected) : []
  // N'utiliser l'instance éditeur que si elle correspond au document sélectionné
  // (évite d'agir sur une instance détruite pendant le changement de document).
  const liveEditor =
    editorState && selectedGenDoc && editorState.id === selectedGenDoc.id ? editorState.ed : null

  // Documents visualisables du nœud : lettre générée + pièces jointes + documents produit.
  // Aperçu in-place automatique du 1er (ou de l'onglet choisi), même cadre que la lettre.
  type Viewable =
    | { key: string; kind: 'letter'; label: string }
    | {
        key: string
        kind: 'attachment' | 'doc'
        label: string
        id: string
        filePath: string | null
        fileName: string
      }
  const viewables: Viewable[] = []
  if (selectedGenDoc) {
    viewables.push({
      key: `letter:${selectedGenDoc.id}`,
      kind: 'letter',
      label: selectedGenDoc.title,
    })
  }
  for (const a of selectedAttachments) {
    viewables.push({
      key: `att:${a.id}`,
      kind: 'attachment',
      label: a.fileName,
      id: a.id,
      filePath: a.filePath,
      fileName: a.fileName,
    })
  }
  for (const d of selectedDocs) {
    viewables.push({
      key: `doc:${d.id}`,
      kind: 'doc',
      label: d.fileName,
      id: d.id,
      filePath: d.filePath,
      fileName: d.fileName,
    })
  }
  const activeKey =
    pickedKey && viewables.some((v) => v.key === pickedKey)
      ? pickedKey
      : (viewables[0]?.key ?? null)
  const active = viewables.find((v) => v.key === activeKey) ?? null

  const leaves = flatNodes.filter((n) => !n.children?.length)
  const filledLeaves = leaves.filter((n) => countFor(n) > 0)
  const pct = leaves.length ? Math.round((filledLeaves.length / leaves.length) * 100) : 0
  const okCount = filledLeaves.length
  const warnCount = alerts.filter((a) => !a.expired).length
  const errCount = alerts.filter((a) => a.expired).length
  const region = dossier.format === 'ctd' ? 'CTD UEMOA' : 'eCTD CEDEAO'

  function buildContext(): TemplateContext {
    const ag = agencyFor(activeDossier.country)
    return {
      nomCommercial: product?.nomCommercial ?? activeDossier.productName,
      dci: product?.dci ?? '',
      dosage: product?.dosage ?? '',
      forme: product?.forme ?? '',
      presentation: product?.presentation ?? '',
      demandeur: product?.titulaire || '[Nom et adresse du demandeur d’AMM]',
      fabricant: product?.fabricant || '[Nom et adresse du fabricant]',
      agencyName: ag.name,
      agencyFull: ag.full,
      country: activeDossier.country,
      ville: '[Ville]',
      date: new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      pght: '[PGHT en FCFA]',
    }
  }

  async function handleGenerate() {
    if (!selected || !selectedTplKey) return
    await createGeneratedDoc(orgId, {
      dossierId: activeDossier.id,
      nodeNumber: selected.number,
      templateKey: selectedTplKey,
      context: buildContext(),
    })
    setDocEditing(true)
    void syncGeneratedDocs(orgId)
  }

  async function handleRegenerate() {
    if (!selectedGenDoc) return
    cancelSave() // on repart du modèle : abandonner toute édition en attente
    const content = await regenerateGeneratedDoc(selectedGenDoc.id, buildContext())
    if (content && liveEditor) liveEditor.commands.setContent(content)
    void syncGeneratedDocs(orgId)
  }

  function handleDownload() {
    if (selectedGenDoc) {
      const json = (liveEditor?.getJSON() ?? selectedGenDoc.content) as JSONContent
      const html = generatedDocToHtml(selectedGenDoc.title, json, {
        header: branding?.headerImage ?? null,
        footer: branding?.footerImage ?? null,
      })
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      triggerDownload(URL.createObjectURL(blob), `${slugify(selectedGenDoc.title)}.html`, true)
      return
    }
    if (selectedDocs[0]) void downloadDoc(selectedDocs[0])
  }

  async function handleUpload(file: File) {
    if (!selected) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('Fichier trop lourd (max 25 Mo).')
      return
    }
    await addAttachment(orgId, activeDossier.id, selected.number, file)
    void syncDossierAttachments(orgId)
  }

  async function handleDeleteAttachment(id: string) {
    await deleteAttachment(id)
    void syncDossierAttachments(orgId)
  }

  function handleSign() {
    const src = signature?.signatureImage
    if (src && liveEditor) liveEditor.chain().focus().setImage({ src }).run()
  }

  function showPreview(url: string, name: string, revoke: boolean) {
    if (previewPdf?.revoke) URL.revokeObjectURL(previewPdf.url)
    setPreviewPdf({ url, name, revoke })
  }
  function closePreview() {
    if (previewPdf?.revoke) URL.revokeObjectURL(previewPdf.url)
    setPreviewPdf(null)
  }

  async function handleCompile() {
    setCompiling(true)
    try {
      // pdf-lib chargé à la demande → hors du chunk workspace (perf).
      const { compileDossierToPdf } = await import('./pdf/dossier-compiler')
      const { bytes, missing } = await compileDossierToPdf({
        dossier: activeDossier,
        product,
        generatedDocs: genDocs ?? [],
        docs: docs ?? [],
        attachments: attachments ?? [],
        branding,
        autoStructural,
      })
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
      showPreview(
        URL.createObjectURL(blob),
        `${slugify(activeDossier.productName)}-module-1.pdf`,
        true,
      )
      if (missing.length > 0) {
        toast.warning(`${missing.length} pièce(s) non incluse(s) (indisponibles hors-ligne)`, {
          description: missing.slice(0, 5).join(', '),
        })
      }
    } catch (e) {
      console.error(e)
      toast.error('Échec de la compilation du dossier.')
    } finally {
      setCompiling(false)
    }
  }

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
        <div className="ml-auto flex items-center gap-2">
          <label className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
            <input
              type="checkbox"
              checked={autoStructural}
              onChange={(e) => setAutoStructural(e.target.checked)}
            />
            TDM + gardes auto
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workspace/${dossier.id}/roadmap`)}
          >
            Roadmap
          </Button>
          <Button size="sm" disabled={compiling} onClick={() => void handleCompile()}>
            <FileDown className="size-4" /> {compiling ? 'Compilation…' : 'Compiler le PDF'}
          </Button>
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
                onClick={() => handleSelectNode(n)}
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
                  variant={treeEditing ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label="Éditer l'arborescence"
                  onClick={() => setTreeEditing(!treeEditing)}
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
                onSelect={handleSelectNode}
                docCount={(node) => countFor(node)}
                editing={treeEditing}
                onChange={handleTreeChange}
              />
            </div>
            {treeEditing ? (
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
              <ToolbarBtn
                label="Modifier"
                active={docEditing}
                disabled={!selectedGenDoc}
                onClick={() => {
                  if (!selectedGenDoc) return
                  setPickedKey(`letter:${selectedGenDoc.id}`)
                  setDocEditing((v) => !v)
                }}
              />
              <ToolbarBtn
                label="Signer"
                disabled={!liveEditor || !docEditing || !signature?.signatureImage}
                hint="Configurez votre signature dans Mon compte, puis passez en mode Modifier"
                onClick={handleSign}
              />
              <ToolbarBtn label="En-tête / Pied de page" onClick={() => navigate('/compte')} />
              <ToolbarBtn
                label="Régénérer"
                disabled={!selectedGenDoc || active?.kind !== 'letter'}
                onClick={() => void handleRegenerate()}
              />
              <ToolbarBtn
                label="Télécharger"
                disabled={!selectedGenDoc || active?.kind !== 'letter'}
                onClick={handleDownload}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-4">
            {selected ? (
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      {selected.number ? `${selected.number} ` : ''}
                      {selected.label}
                    </h2>
                    {selected.note ? (
                      <p className="text-muted-foreground mt-1 max-w-prose text-xs italic">
                        {selected.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedGenDoc ? (
                      <Badge variant="secondary">BROUILLON</Badge>
                    ) : viewables.length > 0 ? (
                      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                        EN ATTENTE
                      </Badge>
                    ) : null}
                    {selectedTplKey && !selectedGenDoc ? (
                      <Button size="sm" onClick={() => void handleGenerate()}>
                        <Sparkles className="size-4" /> Générer
                      </Button>
                    ) : null}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleUpload(f)
                        e.target.value = ''
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="size-4" /> Téléverser
                    </Button>
                  </div>
                </div>

                {viewables.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {viewables.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setPickedKey(v.key)}
                        title={v.label}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
                          active?.key === v.key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        <FileText className="size-3.5" />
                        <span className="max-w-[160px] truncate">{v.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1">
                  {active?.kind === 'letter' && selectedGenDoc ? (
                    <section className="bg-card flex h-full flex-col overflow-hidden rounded-lg border">
                      {docEditing ? <FormatToolbar editor={liveEditor} /> : null}
                      <div className="min-h-0 flex-1 overflow-auto">
                        <RichTextEditor
                          docId={selectedGenDoc.id}
                          initialContent={selectedGenDoc.content as JSONContent}
                          editable={docEditing}
                          onChange={(json) => handleEditorChange(selectedGenDoc.id, json)}
                          onReady={handleEditorReady}
                          header={branding?.headerImage ?? null}
                          footer={branding?.footerImage ?? null}
                        />
                      </div>
                    </section>
                  ) : active && active.kind !== 'letter' ? (
                    <InlineDocPreview
                      key={active.key}
                      kind={active.kind}
                      docId={active.id}
                      filePath={active.filePath}
                      fileName={active.fileName}
                      onDelete={
                        active.kind === 'attachment'
                          ? () => void handleDeleteAttachment(active.id)
                          : undefined
                      }
                    />
                  ) : selectedTplKey ? (
                    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center">
                      <Sparkles className="text-primary mb-2 size-8" />
                      <p className="text-sm font-medium">{TEMPLATES[selectedTplKey].title}</p>
                      <p className="text-muted-foreground mt-1 max-w-sm text-xs">
                        Générez ce document depuis le modèle UEMOA, ou téléversez un fichier.
                      </p>
                      <Button className="mt-3" size="sm" onClick={() => void handleGenerate()}>
                        <Sparkles className="size-4" /> Générer
                      </Button>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center rounded-lg border border-dashed text-sm">
                      <FileText className="mb-2 size-8" />
                      Aucun document classé sous cette section.
                    </div>
                  )}
                </div>
              </div>
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

      {previewPdf ? (
        <PdfPreviewDialog url={previewPdf.url} name={previewPdf.name} onClose={closePreview} />
      ) : null}
    </div>
  )
}

function InlineDocPreview({
  kind,
  docId,
  filePath,
  fileName,
  onDelete,
}: {
  kind: 'attachment' | 'doc'
  docId: string
  filePath: string | null
  fileName: string
  onDelete?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Composant remonté (key=docId) à chaque changement → état initial déjà correct.
    let alive = true
    let created: string | null = null
    void (async () => {
      const blob =
        kind === 'attachment' ? await getAttachmentBlob(docId) : await getDocumentBlob(docId)
      if (blob) {
        created = URL.createObjectURL(blob)
        if (alive) {
          setUrl(created)
          setLoading(false)
        }
        return
      }
      if (filePath) {
        const remote =
          kind === 'attachment'
            ? await getAttachmentDownloadUrl(filePath)
            : await getDocumentDownloadUrl(filePath)
        if (alive) {
          setUrl(remote)
          setLoading(false)
        }
      } else if (alive) {
        setLoading(false)
      }
    })()
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [kind, docId, filePath])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border">
      <div className="bg-card flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="truncate text-xs font-medium">{fileName}</span>
        <div className="flex items-center gap-1">
          {url ? (
            <a
              href={url}
              download={fileName}
              aria-label="Télécharger"
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <Download className="size-4" />
            </a>
          ) : null}
          {onDelete ? (
            <Button size="icon-sm" variant="ghost" aria-label="Supprimer" onClick={onDelete}>
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          Chargement…
        </div>
      ) : url ? (
        <iframe
          src={url}
          title={fileName}
          sandbox="allow-same-origin allow-popups allow-downloads"
          className="min-h-0 flex-1 bg-white"
        />
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          Aperçu indisponible hors-ligne.
        </div>
      )}
    </div>
  )
}

function FormatToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  return (
    <div className="flex items-center gap-1 border-b p-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Gras"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Italique"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Titre"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Liste à puces"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </Button>
    </div>
  )
}

function ToolbarBtn({
  label,
  disabled,
  active,
  hint,
  onClick,
}: {
  label: string
  disabled?: boolean
  active?: boolean
  hint?: string
  onClick?: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className="rounded-full"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? (hint ?? 'Bientôt disponible') : label}
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

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
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
