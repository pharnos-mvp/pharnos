import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { JSONContent } from '@tiptap/core'
import { ArrowLeft, FileDown, FileText, Languages, Save, Sparkles, Upload, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useHeaderSlot } from '@/components/layout/header-slot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listDocuments } from '@/features/catalogue/documents-repository'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import {
  getOrgBranding,
  getUserSignature,
  setUserSignature,
} from '@/features/profile/pro-settings-repository'
import { useProSettingsSync } from '@/features/profile/use-pro-settings-sync'
import { db, type DossierAttachmentRecord, type GeneratedDocRecord } from '@/lib/db'
import { UPLOAD_ACCEPT } from '@/lib/files'
import { cn } from '@/lib/utils'
import { extractCity } from './city'
import { formatComposition } from './composition'
import { countryLabel } from './dossier-constants'
import {
  attachmentsForNode,
  buildDocsByNode,
  buildViewables,
  completionStats,
  docsForNode,
  genDocsForNode,
  nextLeafAfter,
  type Viewable,
} from './dossier-selectors'
import {
  addAttachment,
  deleteAttachment,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
} from './dossier-attachments-repository'
import { syncDossierAttachments } from './dossier-attachments-sync'
import { excludeProductDoc, getDossier, updateDossierTree } from './dossier-repository'
import { syncDossiers } from './dossier-sync'
import {
  createGeneratedDoc,
  deleteGeneratedDoc,
  listGeneratedDocs,
  regenerateGeneratedDoc,
} from './generated-docs-repository'
import { generatedDocToHtml } from './generated-doc-html'
import { syncGeneratedDocs } from './generated-docs-sync'
import { useDossierAttachmentsSync } from './use-dossier-attachments-sync'
import { useDossierSync } from './use-dossier-sync'
import { useGeneratedDocsSync } from './use-generated-docs-sync'
import { getModule1Tree, type CtdNodeDef } from './module1-tree'
import { agencyCivilite, agencyFor, officialLanguage } from './roadmap-data'
import { PdfPreviewDialog } from './PdfPreviewDialog'
import { runRegafy, type RegafyFinding } from './regafy'
import { RichTextEditor } from './RichTextEditor'
import { hasSignature, insertSignature, removeSignature } from './signature'
import { BrandingPanel, SignaturePanel } from './SignatureBrandingPanels'
import { TEMPLATES, templateKeyForNode, type TemplateContext } from './templates'
import { flattenTree, isTreeOutdated, mergeDefaultTree, setNodeSaved } from './tree-utils'
import { useDebouncedDocSave } from './use-debounced-doc-save'
import { useRegafyCopilot } from './use-regafy-copilot'
import { CompletionPanel } from './components/CompletionPanel'
import { InlineDocPreview } from './components/InlineDocPreview'
import { RegafyGateDialog } from './components/RegafyGateDialog'
import { FormatToolbar, ToolbarBtn } from './components/toolbar'
import { TreePanel } from './components/TreePanel'
import { downloadDoc, slugify, triggerDownload } from './download-utils'

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
  const [previewPdf, setPreviewPdf] = useState<{
    url: string
    name: string
    revoke: boolean
    blob: Blob
  } | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [autoStructural, setAutoStructural] = useState(true)
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [gateFindings, setGateFindings] = useState<RegafyFinding[] | null>(null)
  const [sigPanelOpen, setSigPanelOpen] = useState(false)
  const [brandPanelOpen, setBrandPanelOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<{ url: string; revoke: boolean } | null>(null)
  const didAutoSelect = useRef(false)
  const setHeaderSlot = useHeaderSlot()

  const docsByNode = useMemo(() => buildDocsByNode(dossier, docs), [docs, dossier])

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
  const findings = useMemo(
    () =>
      dossier
        ? runRegafy({
            tree: dossier.tree,
            titulaire: product?.titulaire ?? '',
            fabricant: product?.fabricant ?? '',
            docsByNode,
            genByNode,
            attachByNode,
          })
        : [],
    [dossier, product, docsByNode, genByNode, attachByNode],
  )
  // Ouverture d'un onglet de traduction (sélection du nœud + édition immédiate) — callback du
  // copilote IA, stable pour ne pas relancer ses memos.
  const onOpenTranslation = useCallback((node: CtdNodeDef, genId: string) => {
    setSelected(node)
    setDocEditing(true) // traduction éditable d'emblée (pas besoin de cliquer « Modifier »)
    setPickedKey(`letter:${genId}`)
  }, [])

  // Copilote Regafy IA : validité des pièces, conformité des lettres, traduction (T7.2).
  const { aiFindings, translatedSourceIds, aiBusy, translating, handleTranslate } =
    useRegafyCopilot({
      dossierId,
      dossier,
      product,
      genDocs,
      docsByNode,
      attachByNode,
      flatNodes,
      orgId,
      onOpenTranslation,
    })

  // Sauvegarde débouncée des éditions TipTap (T7.3).
  const { editorState, handleEditorReady, handleEditorChange, flushSave, cancelSave } =
    useDebouncedDocSave(orgId)

  const allFindings = useMemo(
    () =>
      [...findings, ...aiFindings].filter(
        (f) => !(f.translate && f.pieceId && translatedSourceIds.has(f.pieceId)),
      ),
    [findings, aiFindings, translatedSourceIds],
  )

  // Offline-first : précharge le compilateur PDF (pdf-lib) ET le worker pdf.js **tant qu'on est
  // en ligne** → en mémoire/cache avant toute coupure réseau. Le worker (~1,2 Mo) n'est plus
  // précaché par le SW (installation initiale allégée) : ce fetch le pose dans le runtime cache
  // CacheFirst (vite.config) → l'aperçu PDF hors-ligne reste garanti dès la 1re session en ligne.
  // Warm-up différé (hors chemin critique) + réessai au retour en ligne.
  useEffect(() => {
    const warm = () => {
      if (!navigator.onLine) return
      void import('./pdf/dossier-compiler').catch(() => {})
      void import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        .then((w) => fetch(w.default))
        .catch(() => {})
    }
    const t = setTimeout(warm, 2000)
    window.addEventListener('online', warm)
    return () => {
      clearTimeout(t)
      window.removeEventListener('online', warm)
    }
  }, [])

  const structureOutdated = useMemo(
    () => (dossier ? isTreeOutdated(dossier.tree, getModule1Tree(dossier.format)) : false),
    [dossier],
  )

  // Fusion automatique de la structure à jour, une seule fois par dossier (respecte ensuite les
  // personnalisations de l'utilisateur : une section supprimée volontairement ne revient pas).
  useEffect(() => {
    if (!dossier || !structureOutdated) return
    const key = `pharnos.autostruct.${dossier.id}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    const merged = mergeDefaultTree(dossier.tree, getModule1Tree(dossier.format))
    void updateDossierTree(dossier.id, merged).then(() => syncDossiers(orgId))
  }, [dossier, structureOutdated, orgId])

  // À l'ouverture, sélectionne automatiquement la 1re section contenant un document (sinon la 1re
  // feuille) → l'utilisateur voit immédiatement ses pièces auto-classées sans avoir à chercher.
  useEffect(() => {
    if (didAutoSelect.current || selected || docs === undefined || flatNodes.length === 0) return
    const hasDocs = (n: CtdNodeDef) => {
      const match = (k: string) =>
        k === n.number || (n.number !== '' && k.startsWith(`${n.number}.`))
      for (const k of docsByNode.keys()) if (match(k)) return true
      if (genByNode.has(n.number)) return true
      for (const k of attachByNode.keys()) if (match(k)) return true
      return false
    }
    const target =
      flatNodes.find(hasDocs) ?? flatNodes.find((n) => !n.children?.length) ?? flatNodes[0]
    if (target) {
      didAutoSelect.current = true
      // Initialisation unique de la sélection après chargement async des données (gardée par le
      // ref didAutoSelect → aucune boucle de rendu) : exception légitime à set-state-in-effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(target)
    }
  }, [flatNodes, selected, docs, docsByNode, genByNode, attachByNode])

  // Titre du dossier (produit · pays · format) injecté dans le bandeau du haut — sur la même ligne
  // que le profil, façon Google Docs. Remis à null en quittant le montage.
  useEffect(() => {
    if (!setHeaderSlot) return
    if (!dossier) {
      setHeaderSlot(null)
      return
    }
    const fmt = dossier.format === 'ctd' ? 'CTD UEMOA' : 'eCTD CEDEAO'
    setHeaderSlot(
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Retour aux dossiers"
          onClick={() => navigate('/workspace')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">
            {dossier.productName} — {countryLabel(dossier.country)}
          </div>
          <div className="text-muted-foreground truncate text-xs">Création Module 1 ({fmt})</div>
        </div>
      </div>,
    )
    return () => setHeaderSlot(null)
  }, [setHeaderSlot, dossier, navigate])

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

  const docsFor = (node: CtdNodeDef) => docsForNode(docsByNode, node)
  const genDocsFor = (node: CtdNodeDef) => genDocsForNode(genByNode, node)
  const attachmentsFor = (node: CtdNodeDef) => attachmentsForNode(attachByNode, node)
  const countFor = (node: CtdNodeDef) =>
    docsFor(node).length + genDocsFor(node).length + attachmentsFor(node).length

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
  // Traduction : document produit original lié (affiché à gauche, en regard de la version éditable).
  // Source d'une traduction : doc produit OU pièce jointe (upload direct workspace). Pour le libellé.
  const translationSourceDoc =
    selectedGenDoc?.templateKey === 'translation' && selectedGenDoc.sourceDocId
      ? ((docs ?? []).find((d) => d.id === selectedGenDoc.sourceDocId) ??
        (attachments ?? []).find((a) => a.id === selectedGenDoc.sourceDocId))
      : undefined
  // Langue cible (code pays → 'FR'/'PT'/'EN') pour les libellés (« Traduire en FR », « …_FR.docx »).
  const targetLangLabel = officialLanguage(dossier.country).toUpperCase()
  // N'utiliser l'instance éditeur que si elle correspond au document sélectionné
  // (évite d'agir sur une instance détruite pendant le changement de document).
  const liveEditor =
    editorState && selectedGenDoc && editorState.id === selectedGenDoc.id ? editorState.ed : null

  // Documents visualisables du nœud : lettre générée + pièces jointes + documents produit.
  // Aperçu in-place automatique du 1er (ou de l'onglet choisi), même cadre que la lettre.
  const viewables = buildViewables({
    selectedGenDoc,
    selectedAttachments,
    selectedDocs,
    translationSourceDoc,
    targetLangLabel,
  })
  const activeKey =
    pickedKey && viewables.some((v) => v.key === pickedKey)
      ? pickedKey
      : (viewables[0]?.key ?? null)
  const active = viewables.find((v) => v.key === activeKey) ?? null
  // Onglet actif = texte éditable (doc généré / lettre / traduction) → on affiche la barre d'édition
  // (Modifier/Signer/En-tête/Régénérer). Inutile sur un PDF/pièce → masquée.
  const isEditableActive = active?.kind === 'letter' && !!selectedGenDoc

  // Constat de langue du document affiché (langue ≠ pays cible) → bouton « Traduire » en
  // surbrillance directement sur l'aperçu, en plus du rappel dans le panneau de droite.
  const activeLangFinding =
    active && active.kind !== 'letter'
      ? allFindings.find((f) => f.pieceId === active.id && f.translate)
      : undefined

  const { okCount, pct } = completionStats(flatNodes, countFor)
  const warnCount = findings.filter((f) => f.severity === 'warning').length
  const errCount = findings.filter((f) => f.severity === 'error').length

  function buildContext(): TemplateContext {
    const ag = agencyFor(activeDossier.country)
    return {
      nomCommercial: product?.nomCommercial ?? activeDossier.productName,
      dci: product?.dci ?? '',
      dosage: product?.dosage ?? '',
      dciDosage: formatComposition(product?.dci ?? '', product?.dosage ?? ''),
      forme: product?.forme ?? '',
      presentation: product?.presentation ?? '',
      demandeurNom: product?.titulaire?.trim() || '[Nom du demandeur d’AMM]',
      demandeurAdresse: product?.titulaireAdresse?.trim() ?? '',
      fabricantNom: product?.fabricant?.trim() || '[Nom du fabricant]',
      fabricantAdresse: product?.fabricantAdresse?.trim() ?? '',
      agencyName: ag.name,
      agencyFull: ag.name ? `${ag.full} (${ag.name})` : ag.full,
      agencyCivilite: agencyCivilite(ag),
      agencyAdresse: ag.adresse || '[Adresse de l’agence]',
      country: activeDossier.country,
      ville: extractCity(product?.titulaireAdresse) || '[Ville]',
      date: new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      poste: branding?.poste ?? '',
      signataire: branding?.signataire ?? '',
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

  /** Télécharge une traduction au format .docx (lib `docx` chargée en lazy → hors chunk d'entrée). */
  async function downloadTranslationDocx(gen: GeneratedDocRecord) {
    try {
      const json = (liveEditor?.getJSON() ?? gen.content) as JSONContent
      const { tiptapToDocxBlob } = await import('./tiptap-docx')
      const blob = await tiptapToDocxBlob(json)
      const src = (docs ?? []).find((d) => d.id === gen.sourceDocId)
      const base = (src?.fileName ?? gen.title).replace(/\.[^.]+$/, '')
      triggerDownload(URL.createObjectURL(blob), `${base}_${targetLangLabel}.docx`, true)
    } catch (e) {
      console.error(e)
      toast.error('Échec du téléchargement de la traduction (.docx).')
    }
  }

  /** Télécharge selon l'onglet actif : traduction → .docx · lettre → .html · doc produit → fichier d'origine. */
  function handleDownload() {
    if (active?.kind === 'letter' && selectedGenDoc) {
      if (selectedGenDoc.templateKey === 'translation') {
        void downloadTranslationDocx(selectedGenDoc)
        return
      }
      const json = (liveEditor?.getJSON() ?? selectedGenDoc.content) as JSONContent
      const html = generatedDocToHtml(selectedGenDoc.title, json, {
        header: branding?.headerImage ?? null,
        footer: branding?.footerImage ?? null,
      })
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      triggerDownload(URL.createObjectURL(blob), `${slugify(selectedGenDoc.title)}.html`, true)
      return
    }
    if (active?.kind === 'doc') {
      const d = (docs ?? []).find((x) => x.id === active.id)
      if (d) void downloadDoc(d)
    }
  }

  /** « × » d'un onglet : retire le document du dossier. Doc produit → exclu (reste sous le produit) ;
   *  pièce jointe / lettre / traduction → supprimé du dossier. */
  async function handleRemoveViewable(v: Viewable) {
    if (v.kind === 'letter') {
      await deleteGeneratedDoc(v.key.replace('letter:', ''))
      void syncGeneratedDocs(orgId)
    } else if (v.kind === 'attachment') {
      await deleteAttachment(v.id)
      void syncDossierAttachments(orgId)
    } else {
      await excludeProductDoc(activeDossier.id, v.id)
      void syncDossiers(orgId)
    }
    setPickedKey(null)
    toast.success('Document retiré du dossier')
  }

  async function handleUpload(file: File) {
    if (!selected) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('Fichier trop lourd (max 25 Mo).')
      return
    }
    try {
      await addAttachment(orgId, activeDossier.id, selected.number, file)
    } catch (error) {
      toast.error("Échec de l'ajout", {
        description: error instanceof Error ? error.message : undefined,
      })
      return
    }
    // Synchroniser tout de suite → la pièce reçoit son chemin Storage et entre dans l'analyse Regafy.
    await syncDossierAttachments(orgId)
    toast.success('Pièce ajoutée — analyse en cours…')
  }

  function handleSign() {
    if (!liveEditor) return
    // Toggle : déjà signée → retirer ; sinon signature stockée → insérer ; sinon ouvrir le panneau.
    if (hasSignature(liveEditor)) {
      removeSignature(liveEditor)
      return
    }
    const src = signature?.signatureImage
    if (src) insertSignature(liveEditor, src)
    else setSigPanelOpen(true)
  }

  /** Applique une signature (data URL) à la lettre, en option en la stockant pour réutiliser. */
  async function applySignature(dataUrl: string, store: boolean) {
    if (store) await setUserSignature(orgId, userId, dataUrl)
    if (liveEditor) insertSignature(liveEditor, dataUrl)
    setSigPanelOpen(false)
  }

  async function handleSaveNode() {
    if (!selected) return
    flushSave()
    if (selected.id) {
      const tree = setNodeSaved(activeDossier.tree, selected.id, new Date().toISOString())
      await updateDossierTree(activeDossier.id, tree)
      void syncDossiers(orgId)
    }
    toast.success('Section enregistrée')
    const next = nextLeafAfter(flatNodes, selected)
    if (next) handleSelectNode(next)
  }

  async function handleUpdateStructure() {
    const merged = mergeDefaultTree(activeDossier.tree, getModule1Tree(activeDossier.format))
    await updateDossierTree(activeDossier.id, merged)
    void syncDossiers(orgId)
    toast.success('Structure mise à jour')
  }

  async function handleRemoveActive() {
    if (!active) return
    if (active.kind === 'letter' && selectedGenDoc) {
      await deleteGeneratedDoc(selectedGenDoc.id)
      void syncGeneratedDocs(orgId)
    } else if (active.kind === 'attachment') {
      await deleteAttachment(active.id)
      void syncDossierAttachments(orgId)
    } else if (active.kind === 'doc') {
      // Document produit : on l'exclut du dossier (il reste présent sous le produit).
      await excludeProductDoc(activeDossier.id, active.id)
      void syncDossiers(orgId)
    }
    setPickedKey(null)
    toast.success('Document retiré du dossier')
  }

  function showPreview(url: string, name: string, revoke: boolean, blob: Blob) {
    if (previewPdf?.revoke) URL.revokeObjectURL(previewPdf.url)
    setPreviewPdf({ url, name, revoke, blob })
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
        blob,
      )
      if (missing.length > 0) {
        toast.warning(`${missing.length} pièce(s) non incluse(s) (indisponibles hors-ligne)`, {
          description: missing.slice(0, 5).join(', '),
        })
      }
    } catch (e) {
      console.error(e)
      const msg = (e as Error)?.message
      toast.error(msg ? `Échec de la compilation : ${msg}` : 'Échec de la compilation du dossier.')
    } finally {
      setCompiling(false)
    }
  }

  function handleCompileClick() {
    // Rappel AVANT compilation : TOUS les constats (déterministes + IA), pas seulement les
    // déterministes. + garde anti-« dossier vide ».
    const gate = [...allFindings]
    const hasContent = genByNode.size > 0 || attachByNode.size > 0 || docsByNode.size > 0
    if (!hasContent && !gate.some((f) => f.id === 'empty')) {
      gate.unshift({
        id: 'empty',
        nodeNumber: '',
        nodeLabel: 'Dossier',
        severity: 'error',
        message: 'Dossier vide : aucun document.',
      })
    }
    if (gate.length > 0) {
      setGateFindings(gate)
      return
    }
    void handleCompile()
  }

  return (
    // Modèle « Google Docs » : la page de montage défile globalement (scrollbar de <main> à droite),
    // l'en-tête (toolbar) et les deux panneaux latéraux restent figés (sticky), seule la zone centrale
    // (A4) défile, jusqu'au pied de page (marge de bas — rien n'est collé au bas).
    <div className="flex flex-col gap-3">
      <div className="bg-background sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b py-1.5">
        <label className="text-muted-foreground hidden items-center gap-1.5 justify-self-start text-xs sm:flex">
          <input
            type="checkbox"
            checked={autoStructural}
            onChange={(e) => setAutoStructural(e.target.checked)}
          />
          TDM + gardes auto
        </label>
        {/* Barre des menus d'édition (Modifier/Signer/…) — CENTRÉE au-dessus du panneau d'aperçu. */}
        <div className="flex min-w-0 justify-center">
          <div className="bg-card flex items-center gap-1 rounded-full border px-1 py-1 text-sm shadow-sm">
            {/* Boutons d'édition : seulement pour du texte éditable (doc généré/lettre/traduction). */}
            {isEditableActive ? (
              <>
                <ToolbarBtn
                  label="Modifier"
                  active={docEditing}
                  onClick={() => {
                    if (!selectedGenDoc) return
                    setPickedKey(`letter:${selectedGenDoc.id}`)
                    setDocEditing((v) => !v)
                  }}
                />
                <ToolbarBtn
                  label="Signer"
                  disabled={!liveEditor || !docEditing}
                  hint="Passez en mode Modifier pour signer"
                  onClick={handleSign}
                />
                <ToolbarBtn
                  label="En-tête / Pied de page"
                  onClick={() => setBrandPanelOpen(true)}
                />
                {selectedGenDoc?.templateKey !== 'translation' ? (
                  <ToolbarBtn label="Régénérer" onClick={() => void handleRegenerate()} />
                ) : null}
              </>
            ) : null}
            <ToolbarBtn
              label="Télécharger"
              disabled={
                !(active?.kind === 'doc' || (active?.kind === 'letter' && !!selectedGenDoc))
              }
              onClick={handleDownload}
            />
            <ToolbarBtn
              label="Supprimer"
              disabled={!active}
              hint="Sélectionnez un document"
              onClick={() => void handleRemoveActive()}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workspace/${dossier.id}/roadmap`)}
          >
            Roadmap
          </Button>
          <Button size="sm" disabled={compiling} onClick={handleCompileClick}>
            <FileDown className="size-4" /> {compiling ? 'Compilation…' : 'Compiler le PDF'}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <TreePanel
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          treeEditing={treeEditing}
          setTreeEditing={setTreeEditing}
          structureOutdated={structureOutdated}
          onUpdateStructure={() => void handleUpdateStructure()}
          tree={dossier.tree}
          flatNodes={flatNodes}
          selected={selected}
          onSelectNode={handleSelectNode}
          countFor={countFor}
          onTreeChange={(tree) => void handleTreeChange(tree)}
        />

        {/* Colonne centrale : contenu A4 qui défile (les toolbars sont dans le bandeau du haut). */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <div className="flex flex-col gap-3">
              {/* Chrome figé : titre, actions, onglets et barre de format restent en place pendant
                  que la page A4 défile dessous (sticky sous le bandeau du haut). */}
              <div className="bg-background sticky top-12 z-20 flex flex-col gap-3 pb-1">
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
                      accept={UPLOAD_ACCEPT}
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
                    <Button size="sm" variant="secondary" onClick={() => void handleSaveNode()}>
                      <Save className="size-4" /> Enregistrer
                    </Button>
                  </div>
                </div>

                {viewables.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {viewables.map((v) => {
                      const removeHint =
                        v.kind === 'doc'
                          ? 'Retirer du dossier (le document reste sous le produit)'
                          : 'Supprimer du dossier'
                      return (
                        <div
                          key={v.key}
                          className={cn(
                            'flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-xs',
                            active?.key === v.key
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-accent',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setPickedKey(v.key)
                              // Traduction → éditable d'emblée (cohérent avec l'ouverture via « Traduire »).
                              if (v.kind === 'letter' && v.isTranslation) setDocEditing(true)
                            }}
                            title={v.label}
                            className="flex items-center gap-1.5"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            <span className="max-w-[160px] truncate">{v.label}</span>
                          </button>
                          <button
                            type="button"
                            aria-label={removeHint}
                            title={removeHint}
                            onClick={() => void handleRemoveViewable(v)}
                            className="hover:bg-destructive/10 hover:text-destructive rounded-full p-0.5"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div>
                {active?.kind === 'letter' && selectedGenDoc ? (
                  // Onglet traduction = plein largeur (éditeur + barre de format) ; l'original est
                  // l'onglet voisin. Pas d'`overflow-hidden` : casserait le `sticky` de la barre.
                  <section className="bg-card rounded-lg border">
                    {selectedGenDoc.templateKey === 'translation' ? (
                      <p className="text-muted-foreground flex items-center gap-1.5 px-3 pt-2 text-xs italic">
                        <Languages className="size-3.5 shrink-0 text-amber-500" />
                        Traduction assistée (MedDRA) — à relire. N'altère pas l'original ; propre à
                        ce dossier.
                      </p>
                    ) : null}
                    {docEditing ? (
                      <div className="bg-card sticky top-[5.25rem] z-10 rounded-t-lg">
                        <FormatToolbar editor={liveEditor} />
                      </div>
                    ) : null}
                    <RichTextEditor
                      docId={selectedGenDoc.id}
                      initialContent={selectedGenDoc.content as JSONContent}
                      editable={docEditing}
                      onChange={(json) => handleEditorChange(selectedGenDoc.id, json)}
                      onReady={handleEditorReady}
                      header={
                        selectedGenDoc.templateKey === 'translation'
                          ? null
                          : (branding?.headerImage ?? null)
                      }
                      footer={
                        selectedGenDoc.templateKey === 'translation'
                          ? null
                          : (branding?.footerImage ?? null)
                      }
                    />
                  </section>
                ) : active && active.kind !== 'letter' ? (
                  <div className="space-y-2">
                    {activeLangFinding ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                          <Languages className="size-4 shrink-0" />
                          {activeLangFinding.message}
                        </span>
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-amber-500 text-white hover:bg-amber-600"
                          disabled={translating === activeLangFinding.pieceId}
                          onClick={() => void handleTranslate(activeLangFinding)}
                        >
                          <Languages className="size-3.5" />
                          {translating === activeLangFinding.pieceId
                            ? 'Traduction…'
                            : `Traduire en ${targetLangLabel}`}
                        </Button>
                      </div>
                    ) : null}
                    <InlineDocPreview
                      key={active.key}
                      kind={active.kind}
                      docId={active.id}
                      filePath={active.filePath}
                      fileName={active.fileName}
                    />
                  </div>
                ) : selectedTplKey ? (
                  <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center">
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
                  <div className="text-muted-foreground flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed text-sm">
                    <FileText className="mb-2 size-8" />
                    Aucun document classé sous cette section.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground flex items-center justify-center rounded-lg border border-dashed py-16 text-sm">
              Sélectionnez une section de l'arborescence.
            </div>
          )}
        </div>

        <CompletionPanel
          collapsed={rightCollapsed}
          setCollapsed={setRightCollapsed}
          pct={pct}
          okCount={okCount}
          warnCount={warnCount}
          errCount={errCount}
          allFindings={allFindings}
          aiBusy={aiBusy}
          translating={translating}
          targetLangLabel={targetLangLabel}
          flatNodes={flatNodes}
          onSelectNode={handleSelectNode}
          onTranslate={(f) => void handleTranslate(f)}
        />
      </div>

      {/* Pied de page de l'app — marge de bas (rien n'est collé au pied de page). */}
      <footer className="text-muted-foreground border-t pt-6 pb-10 text-center text-xs">
        Pharnos — Montage CTD Module&nbsp;1
      </footer>

      {previewPdf ? (
        <PdfPreviewDialog
          blob={previewPdf.blob}
          url={previewPdf.url}
          name={previewPdf.name}
          onClose={closePreview}
        />
      ) : null}

      {gateFindings ? (
        <RegafyGateDialog
          findings={gateFindings}
          onClose={() => setGateFindings(null)}
          onCorrect={() => {
            const target = gateFindings.find((f) => f.nodeNumber)
            setGateFindings(null)
            if (target) {
              const n = flatNodes.find((x) => x.number === target.nodeNumber)
              if (n) handleSelectNode(n)
            }
          }}
          onCompile={() => {
            setGateFindings(null)
            void handleCompile()
          }}
        />
      ) : null}

      {sigPanelOpen ? (
        <SignaturePanel onApply={applySignature} onClose={() => setSigPanelOpen(false)} />
      ) : null}
      {brandPanelOpen ? (
        <BrandingPanel branding={branding} orgId={orgId} onClose={() => setBrandPanelOpen(false)} />
      ) : null}
    </div>
  )
}
