import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { JSONContent } from '@tiptap/core'
import {
  ArrowLeft,
  CircleDashed,
  FileDown,
  FileText,
  Languages,
  Map as MapIcon,
  MessagesSquare,
  Pencil,
  Send,
  Sparkles,
  ClipboardList,
  Wand2,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useHeaderSlot } from '@/components/layout/header-slot'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  dossierDisplayStatus,
  STATUS_BADGE_CLASSES,
  statusLabel,
} from '@/features/correspondence/correspondence-constants'
import { listByDossier } from '@/features/correspondence/correspondence-repository'
import { CorrespondencePanel } from '@/features/correspondence/CorrespondencePanel'
import { ShareDialog } from '@/features/correspondence/ShareDialog'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { listDocuments } from '@/features/catalogue/documents-repository'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import { useCanManageSubmission } from '@/features/org/use-current-org'
import { featureState } from '@/features/org/feature-state'
import { recordCompilation, useOrgPlan } from '@/features/org/use-org-plan'
import { useUpsell } from '@/features/org/use-upsell'
import {
  getOrgBranding,
  getUserSignature,
  setUserSignature,
} from '@/features/profile/pro-settings-repository'
import { useProSettingsSync } from '@/features/profile/use-pro-settings-sync'
import { db, type DossierAttachmentRecord, type GeneratedDocRecord } from '@/lib/db'
import { env } from '@/lib/env'
import { UPLOAD_ACCEPT } from '@/lib/files'
import { tStatic, useI18n } from '@/lib/i18n-context'
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
  viewableTabType,
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
  createTemplateFillDoc,
  deleteGeneratedDoc,
  listGeneratedDocs,
  regenerateGeneratedDoc,
} from './generated-docs-repository'
import { generatedDocToHtml } from './generated-doc-html'
import { syncGeneratedDocs } from './generated-docs-sync'
import { useDossierAttachmentsSync } from './use-dossier-attachments-sync'
import { useDossierSync } from './use-dossier-sync'
import { useGeneratedDocsSync } from './use-generated-docs-sync'
import { buildAuditReport, type AuditReport } from './audit-report'
import { docTypeForNode, getModule1Tree, type CtdNodeDef } from './module1-tree'
import { agencyCivilite, agencyFor, officialLanguage } from './roadmap-data'
import { PdfPreviewDialog } from './PdfPreviewDialog'
import { runRegafy, tiptapText, type RegafyFinding } from './regafy'
import './regafy-scan.css'
import { hasSignature, insertSignature, removeSignature } from './signature'
import { BrandingPanel, SignaturePanel } from './SignatureBrandingPanels'
import { TEMPLATES, templateKeyForNode, type TemplateContext } from './templates'
import { flattenTree, isTreeOutdated, mergeDefaultTree } from './tree-utils'
import { useDebouncedDocSave } from './use-debounced-doc-save'
import { useRegafyCopilot } from './use-regafy-copilot'
import { CompletionPanel } from './components/CompletionPanel'
import { InlineDocPreview } from './components/InlineDocPreview'
import type { TemplateFillFormHandle } from './components/TemplateFillForm'
import { DocumentHeader } from './components/DocumentHeader'
import {
  buildDocActions,
  type DocActionsContext,
  type DocHeaderStatus,
  type DocKind,
} from './components/document-header-model'
import { AuditReportView } from './components/AuditReportView'
import { RegafyGateDialog } from './components/RegafyGateDialog'
import { FormatToolbar } from './components/toolbar'
import { TranslationProgress } from './components/TranslationProgress'
import { PanelHandle } from './components/PanelHandle'
import { TreePanel } from './components/TreePanel'
import { dossierBaseName, downloadDoc, slugify, triggerDownload } from './download-utils'
import { UPGRADE_DOC_TYPES } from './regafy-ai'
import { buildTemplateSkeleton, FILL_PLACEHOLDER } from './template-fill'
import { formStateFromContent } from './template-form/form-content'
import { formDefinitionFor } from './template-form/form-definitions'
import { countEmptyFields, formExportName } from './template-form/form-types'
import { countMarker, countMissing } from './upgrade-doc'

// Code-split (gate N2-b) : TipTap (RichTextEditor) et le moteur de formulaires (TemplateFillForm)
// concentrent l'essentiel du poids du chunk de la route workspace. Chargés à la demande (rendu
// conditionnel, sous <Suspense>) → la page s'affiche sans eux ; précachés par le service worker
// (offline-safe) + préchargés à l'idle quand on est en ligne (cf. warm()).
const RichTextEditor = lazy(() =>
  import('./RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
)
const TemplateFillForm = lazy(() =>
  import('./components/TemplateFillForm').then((m) => ({ default: m.TemplateFillForm })),
)

/** Repère de chargement de l'éditeur (TipTap/formulaire) — conserve la page A4 (anti-CLS). */
function EditorSkeleton() {
  const { t } = useI18n()
  return (
    <div className="editor-page-wrap">
      <div className="editor-page text-muted-foreground flex items-center justify-center text-sm">
        {t({ fr: 'Chargement de l’éditeur…', en: 'Loading editor…' })}
      </div>
    </div>
  )
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
  useCorrespondenceSync(orgId)

  const { user } = useAuth()
  const userId = user?.id ?? 'local'
  const online = useOnlineStatus()
  const { t, lang } = useI18n()
  // Gestion des soumissions (envoi du dossier) réservée à Admin + rôles agence/expert (RLS 0028).
  const canSubmit = useCanManageSubmission()
  // Offre IA Regafy (modèle 3 états) : Activée → analyse réelle ; Vitrine → upsell ; Masquée → invisible.
  // L'entitlement RÉEL reste serveur (`consume_ai_quota` → feature_disabled) ; ici on gate l'UI + le CTA.
  const { data: orgPlan } = useOrgPlan()
  const upsell = useUpsell()
  const regafyState = featureState(orgPlan?.features, 'regafy')

  const dossier = useLiveQuery(
    async () => (dossierId ? ((await getDossier(dossierId)) ?? null) : null),
    [dossierId],
  )
  const product = useLiveQuery(
    async () => (dossier ? ((await db.products.get(dossier.productId)) ?? undefined) : undefined),
    [dossier?.productId],
  )
  // `undefined` (pas `[]`) tant que le dossier n'est pas chargé : l'effet d'auto-sélection
  // attend les VRAIS documents — un [] transitoire le verrouillait sur la première feuille
  // au lieu de la première section documentée (bug figé par la caractérisation T7.0).
  const docs = useLiveQuery(
    () => (dossier ? listDocuments(dossier.productId) : undefined),
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
  // Correspondances du dossier → état dérivé (badge du bandeau + panneau).
  const dossierCorrespondences = useLiveQuery(
    () => (dossierId ? listByDossier(dossierId) : Promise.resolve([])),
    [dossierId],
  )
  const corrStatus = dossierDisplayStatus(dossierId ?? '', dossierCorrespondences ?? [])
  // Messages reviewer non lus de CE dossier (pastille du bandeau).
  const dossierUnread =
    useLiveQuery(async () => {
      const ids = (dossierCorrespondences ?? []).map((c) => c.id)
      if (ids.length === 0) return 0
      const [msgs, reads] = await Promise.all([
        db.correspondenceMessages.where('correspondenceId').anyOf(ids).toArray(),
        db.correspondenceReads.toArray(),
      ])
      const seen = new Map(reads.map((r) => [r.id, r.lastSeenAt]))
      return msgs.filter(
        (m) => m.author === 'recipient' && m.createdAt > (seen.get(m.correspondenceId) ?? ''),
      ).length
    }, [dossierCorrespondences]) ?? 0

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
  // « Envoyer le dossier » (jalon H) : dialog d'envoi du PDF compilé au correspondant.
  const [shareOpen, setShareOpen] = useState(false)
  // Panneau Correspondance (fil de review avec le correspondant).
  const [corrPanelOpen, setCorrPanelOpen] = useState(false)
  // Pages structurelles (TDM + gardes) toujours générées — l'option a été retirée de l'UI (mockup).
  const autoStructural = true
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [gateFindings, setGateFindings] = useState<RegafyFinding[] | null>(null)
  /** Rapport d'Audit Global affiché au premier plan — null sinon. */
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)
  const [sigPanelOpen, setSigPanelOpen] = useState(false)
  const [brandPanelOpen, setBrandPanelOpen] = useState(false)
  // Cartes de non-conformité masquées par l'utilisateur (ids de constats — session seulement,
  // le constat reste dans le panneau Remarques).
  const [hiddenCards, setHiddenCards] = useState<ReadonlySet<string>>(new Set())
  // « Remplacer » : pièce à retirer dès que le nouveau fichier est téléversé avec succès.
  const [replaceTarget, setReplaceTarget] = useState<Extract<
    Viewable,
    { kind: 'doc' | 'attachment' }
  > | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Pt2 : poignée du formulaire de template (RCP/Notice/Étiquetage) → la barre d'actions du
  // dossier déclenche Réinitialiser/PDF/DOCX (convergence avec l'éditeur de la Bibliothèque).
  const fillFormRef = useRef<TemplateFillFormHandle>(null)
  const previewRef = useRef<{ url: string; revoke: boolean } | null>(null)
  const didAutoSelect = useRef(false)
  const setHeaderSlot = useHeaderSlot()

  // M1 : l'en-tête de document UNIQUE (DocumentHeader) est désormais la seule barre collante —
  // plus de cascade pilule + barre d'actions + bandeau navy + barre de format à mesurer/empiler.

  const docsByNode = useMemo(() => buildDocsByNode(dossier, docs), [docs, dossier])

  const genByNode = useMemo(() => {
    const map = new Map<string, GeneratedDocRecord>()
    for (const g of genDocs ?? []) map.set(g.nodeNumber, g)
    return map
  }, [genDocs])

  // TOUS les documents générés par nœud (lettre + traduction + version conforme coexistent —
  // un onglet chacun). genByNode (un seul) reste pour la complétude/Regafy déterministe.
  const genListByNode = useMemo(() => {
    const map = new Map<string, GeneratedDocRecord[]>()
    for (const g of genDocs ?? []) map.set(g.nodeNumber, [...(map.get(g.nodeNumber) ?? []), g])
    return map
  }, [genDocs])

  // Nom d'affichage des sources (labels d'onglets traduction/version conforme).
  const sourceNamesById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of docs ?? []) m.set(d.id, d.fileName)
    for (const a of attachments ?? []) m.set(a.id, a.fileName)
    for (const g of genDocs ?? []) m.set(g.id, g.title)
    return m
  }, [docs, attachments, genDocs])

  const attachByNode = useMemo(() => {
    const map = new Map<string, DossierAttachmentRecord[]>()
    for (const a of attachments ?? []) map.set(a.nodeNumber, [...(map.get(a.nodeNumber) ?? []), a])
    return map
  }, [attachments])

  // MONITOR (jalon O) — vérifications DÉTERMINISTES, gratuites, TOUJOURS actives (offline, sans IA,
  // zéro token) : complétude des lettres générées, sections validées sans pièce, validité des dates
  // DÉCLARÉES (admin ≥ 6 mois, COA ≥ 18 mois), titulaire ≠ fabricant sans contrat. Indépendant de
  // « Analyser » (Regafy/IA) — disponible sur TOUS les plans, y compris Free.
  const monitorFindings = useMemo<RegafyFinding[]>(() => {
    if (!dossier) return []
    return runRegafy({
      tree: dossier.tree,
      titulaire: product?.titulaire ?? '',
      fabricant: product?.fabricant,
      docsByNode,
      genByNode,
      attachByNode,
    }).map((f) => ({ ...f, source: 'monitor' as const }))
    // `lang` force la recomputation pour relocaliser les messages Monitor (runRegafy → tStatic lit la langue).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier, product, docsByNode, genByNode, attachByNode, lang])

  const flatNodes = useMemo(() => (dossier ? flattenTree(dossier.tree) : []), [dossier])
  // Ouverture d'un onglet de traduction (sélection du nœud + édition immédiate) — callback du
  // copilote IA, stable pour ne pas relancer ses memos.
  const onOpenTranslation = useCallback((node: CtdNodeDef, genId: string) => {
    setSelected(node)
    setDocEditing(true) // traduction éditable d'emblée (pas besoin de cliquer « Modifier »)
    setPickedKey(`letter:${genId}`)
  }, [])

  // Copilote Regafy IA : validité des pièces, conformité des lettres, traduction (T7.2).
  const {
    aiFindings,
    translatedSourceIds,
    aiBusy,
    analyzing,
    analyzeActive,
    analyzeGenerated,
    clearPieceAnalysis,
    auditProgress,
    runGlobalAudit,
    translating,
    upgrading,
    streamText,
    handleTranslate,
    handleTranslateGenerated,
  } = useRegafyCopilot({
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

  // Complétude FORM-AWARE (recette CEO) : les champs vides d'un FORMULAIRE (RCP/Notice/Étiquetage)
  // sont OMIS du contenu sauvegardé (jamais des [...]) → invisibles à hasPlaceholder. On les compte
  // ici via la définition du formulaire (countEmptyFields). Déclenché AUTO dès qu'un document généré
  // « fill » est incomplet — visible au panneau Remarques ET au gate de compilation.
  const formCompletionFindings = useMemo<RegafyFinding[]>(() => {
    if (!dossier) return []
    const out: RegafyFinding[] = []
    for (const g of genDocs ?? []) {
      if (g.deletedAt !== null || g.templateKey !== 'fill') continue
      const docType =
        docTypeForNode(dossier.format, g.nodeNumber) ??
        (g.nodeNumber.startsWith('1.3') ? 'labeling' : null)
      const def = docType ? formDefinitionFor(docType) : null
      const incomplete = def
        ? countEmptyFields(formStateFromContent(def, g.content as JSONContent)) > 0
        : /\[[^\]\n]{2,}\]/.test(tiptapText((g.content ?? {}) as Parameters<typeof tiptapText>[0]))
      if (incomplete) {
        out.push({
          id: `formfill:${g.id}`,
          nodeNumber: g.nodeNumber,
          nodeLabel: flatNodes.find((n) => n.number === g.nodeNumber)?.label ?? '',
          severity: 'warning',
          source: 'monitor',
          topic: 'completeness',
          message: tStatic({
            fr: 'Champs à compléter dans le document',
            en: 'Fields to complete in the document',
          }),
        })
      }
    }
    return out
    // `lang` force la recomputation pour relocaliser le message (tStatic lit la langue courante).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier, genDocs, flatNodes, lang])

  // Remarques de la SESSION (analyses déclenchées par l'utilisateur — recette n°6 : plus
  // d'analyse automatique). Constat de langue masqué dès qu'une traduction existe.
  const allFindings = useMemo(() => {
    const ai = aiFindings.filter(
      (f) => !(f.translate && f.pieceId && translatedSourceIds.has(f.pieceId)),
    )
    // Monitor TOUJOURS affiché (gratuit, déterministe). Dédup (recette n°6) : on retire le constat
    // Monitor si l'IA en a déjà un sur le MÊME message OU la MÊME (nœud, nature) — une seule remarque
    // par doc et par nature ; l'IA (contre-expertise O3 plus riche) prime.
    const seenMsg = new Set(ai.map((f) => `${f.nodeNumber}|${f.message}`))
    const seenTopic = new Set(ai.filter((f) => f.topic).map((f) => `${f.nodeNumber}|${f.topic}`))
    // Monitor déterministe + complétude form-aware ; dédup INTERNE (un seul « Champs à compléter »
    // par nœud) puis dédup vs IA (message exact OU nœud+nature, l'IA primant).
    const seenMonitor = new Set<string>()
    const monitor = [...monitorFindings, ...formCompletionFindings].filter((f) => {
      const k = `${f.nodeNumber}|${f.message}`
      if (seenMonitor.has(k)) return false
      seenMonitor.add(k)
      return !seenMsg.has(k) && !(f.topic && seenTopic.has(`${f.nodeNumber}|${f.topic}`))
    })
    return [...monitor, ...ai]
  }, [aiFindings, monitorFindings, formCompletionFindings, translatedSourceIds])

  // Surbrillance sobre (recette n°6) : nœuds (et leurs ancêtres) portant un constat NON résolu →
  // oriente l'utilisateur vers la section à compléter/vérifier dans l'arborescence.
  const flaggedNodes = useMemo(() => {
    const set = new Set<string>()
    for (const f of allFindings) {
      if (f.ok || !f.nodeNumber) continue
      const parts = f.nodeNumber.split('.')
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('.'))
    }
    return set
  }, [allFindings])

  // Offline-first : précharge le compilateur PDF (pdf-lib) **tant qu'on est en ligne** → il est
  // en mémoire avant toute coupure réseau. (Le worker pdf.js est de retour dans le PRÉCACHE du
  // SW — vite.config — après le bug recette : le warm-up runtime était trop fragile offline.)
  useEffect(() => {
    const warm = () => {
      if (!navigator.onLine) return
      void import('./pdf/dossier-compiler').catch(() => {})
      // Précharge aussi les chunks code-splittés (N2-b) tant qu'on est en ligne → 1re édition
      // instantanée + disponibles hors-ligne avant même que le SW ait fini de précacher.
      void import('./RichTextEditor').catch(() => {})
      void import('./components/TemplateFillForm').catch(() => {})
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

  // Bandeau du haut (mockup CEO) : titre du dossier à gauche + actions globales à droite
  // (Roadmap, Compiler le PDF). Le handler de compilation est lu via une ref resynchronisée à
  // chaque rendu (effet sans dépendances, AVANT les early returns — règle des hooks) : le slot
  // n'est reconstruit que quand dossier/compiling changent, le clic voit l'état frais.
  const compileClickRef = useRef<() => void>(() => {})

  function showPreview(url: string, name: string, revoke: boolean, blob: Blob) {
    if (previewPdf?.revoke) URL.revokeObjectURL(previewPdf.url)
    setPreviewPdf({ url, name, revoke, blob })
  }
  function closePreview() {
    if (previewPdf?.revoke) URL.revokeObjectURL(previewPdf.url)
    setPreviewPdf(null)
  }

  async function handleCompile() {
    if (!dossier) return
    setCompiling(true)
    try {
      // Garde de quota au DÉPÔT (compilation = le livrable métré, migration 0039). En ligne uniquement
      // (l'acte est en ligne) ; hors-ligne, on laisse compiler (best-effort, réconcilié plus tard).
      if (online && env.isSupabaseConfigured) {
        const gate = await recordCompilation(dossierId ?? null, 'm1_pdf')
        if (!gate.allowed) {
          if (gate.reason === 'quota_exceeded') {
            toast.error(
              t({
                fr: `Quota de dépôts atteint ce mois (${gate.cap ?? ''}). Compilez davantage avec un plan supérieur.`,
                en: `Monthly submission quota reached (${gate.cap ?? ''}). Upgrade to compile more.`,
              }),
              {
                action: {
                  label: t({ fr: 'Mettre à niveau', en: 'Upgrade' }),
                  onClick: () => navigate('/compte', { state: { section: 'abonnement' } }),
                },
              },
            )
          } else {
            toast.error(t({ fr: 'Compilation indisponible.', en: 'Compilation unavailable.' }))
          }
          return
        }
      }
      // pdf-lib chargé à la demande → hors du chunk workspace (perf).
      const { compileDossierToPdf } = await import('./pdf/dossier-compiler')
      const { bytes, missing } = await compileDossierToPdf({
        dossier,
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
        `${dossierBaseName(dossier.productName, dossier.country)}.pdf`,
        true,
        blob,
      )
      if (missing.length > 0) {
        toast.warning(
          t({
            fr: `${missing.length} pièce(s) non incluse(s) (indisponibles hors-ligne)`,
            en: `${missing.length} item(s) not included (unavailable offline)`,
          }),
          {
            description: missing.slice(0, 5).join(', '),
          },
        )
      }
    } catch (e) {
      console.error(e)
      const msg = (e as Error)?.message
      toast.error(
        msg
          ? t({ fr: `Échec de la compilation : ${msg}`, en: `Compilation failed: ${msg}` })
          : t({ fr: 'Échec de la compilation du dossier.', en: 'Dossier compilation failed.' }),
      )
    } finally {
      setCompiling(false)
    }
  }

  function handleCompileClick() {
    // Rappel AVANT compilation : TOUS les constats (déterministes + IA), pas seulement les
    // déterministes. + garde anti-« dossier vide ».
    const gate = allFindings.filter((f) => !f.ok)
    const hasContent = genByNode.size > 0 || attachByNode.size > 0 || docsByNode.size > 0
    if (!hasContent && !gate.some((f) => f.id === 'empty')) {
      gate.unshift({
        id: 'empty',
        nodeNumber: '',
        nodeLabel: t({ fr: 'Dossier', en: 'Dossier' }),
        severity: 'error',
        message: t({ fr: 'Dossier vide : aucun document.', en: 'Empty dossier: no documents.' }),
      })
    }
    // Recette n°6 : sans AUCUNE analyse de session, proposer l'Audit Global avant de compiler.
    if (gate.length > 0 || (hasContent && allFindings.length === 0)) {
      setGateFindings(gate)
      return
    }
    void handleCompile()
  }

  /** « Audit Global » (gate) : politique d'analyse sur tout le dossier → rapport A4. */
  async function handleAudit() {
    if (!dossier) return
    const data = await runGlobalAudit({ tree: dossier.tree, genByNode })
    if (data) {
      setGateFindings(null)
      setAuditReport(buildAuditReport(data))
    }
  }
  // Ref resynchronisée à chaque rendu (effet sans dépendances) → le clic du bandeau voit
  // toujours l'état frais (constats, contenu) sans reconstruire le slot.
  useEffect(() => {
    compileClickRef.current = handleCompileClick
  })
  useEffect(() => {
    if (!setHeaderSlot) return
    if (!dossier) {
      setHeaderSlot(null)
      return
    }
    const fmt = dossier.format === 'ctd' ? 'CTD UEMOA' : 'eCTD CEDEAO'
    setHeaderSlot(
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Retour aux dossiers', en: 'Back to dossiers' })}
          onClick={() => navigate('/workspace')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        {/* Fil d'Ariane sur UNE seule ligne (mockup .crumb) : produit (gras) — pays · activité. */}
        <div className="min-w-0 flex-1 truncate text-sm leading-tight">
          <span className="font-semibold">{dossier.productName}</span>{' '}
          <span className="text-muted-foreground">
            — {countryLabel(dossier.country, lang)} ·{' '}
            {t({ fr: `Création Module 1 (${fmt})`, en: `Module 1 creation (${fmt})` })}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workspace/${dossier.id}/roadmap`)}
          >
            <MapIcon className="size-4" />
            {t({ fr: 'Feuille de route', en: 'Roadmap' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="relative"
            onClick={() => setCorrPanelOpen(true)}
          >
            <MessagesSquare className="size-4" />
            <span className="hidden lg:inline">
              {t({ fr: 'Correspondance', en: 'Correspondence' })}
            </span>
            {corrStatus !== 'draft' ? (
              <Badge className={cn('px-1.5 py-0', STATUS_BADGE_CLASSES[corrStatus])}>
                {statusLabel(corrStatus, lang)}
              </Badge>
            ) : null}
            {dossierUnread > 0 ? (
              <span
                className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full text-[10px] font-semibold"
                aria-label={t({
                  fr: `${dossierUnread} message(s) non lu(s)`,
                  en: `${dossierUnread} unread message(s)`,
                })}
              >
                {dossierUnread}
              </span>
            ) : null}
          </Button>
          <Button size="sm" disabled={compiling} onClick={() => compileClickRef.current()}>
            <FileDown className="size-4" />{' '}
            {compiling
              ? t({ fr: 'Compilation…', en: 'Compiling…' })
              : t({ fr: 'Compiler le PDF', en: 'Compile the PDF' })}
          </Button>
        </div>
      </div>,
    )
    return () => setHeaderSlot(null)
  }, [setHeaderSlot, dossier, navigate, compiling, corrStatus, dossierUnread, t, lang])

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
    setReplaceTarget(null)
  }

  if (dossier === undefined) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({ fr: 'Chargement…', en: 'Loading…' })}
      </p>
    )
  }
  if (dossier === null) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Dossier introuvable.', en: 'Dossier not found.' })}
        </p>
        <Button variant="ghost" className="mt-2 -ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> {t({ fr: 'Retour aux dossiers', en: 'Back to dossiers' })}
        </Button>
      </div>
    )
  }

  const activeDossier = dossier
  // Recette n°7 : les sections de GARDE (nœuds parents + 1.0 TdM) ne regroupent plus les
  // documents de leurs sous-sections sur la page de montage — pièces à correspondance EXACTE
  // uniquement (la compilation, elle, est inchangée : intercalaires autogénérés).
  const isCoverNode =
    !!selected && ((selected.children?.length ?? 0) > 0 || selected.number === '1.0')
  const selectedDocs = selected
    ? isCoverNode
      ? (docsByNode.get(selected.number) ?? [])
      : docsFor(selected)
    : []
  const selectedTplKey = selected ? templateKeyForNode(dossier.format, selected.number) : undefined
  const selectedGenDocs = selected ? (genListByNode.get(selected.number) ?? []) : []
  // Le document de TEMPLATE du nœud (lettre cover/PGHT générée) — pilote « Générer » : tant qu'il
  // n'existe pas sur un nœud à template, Générer reste proposé (même si une pièce est l'onglet actif).
  const selectedTemplateDoc = selectedGenDocs.find(
    (g) => g.templateKey !== 'translation' && g.templateKey !== 'upgrade',
  )
  const canGenerate = !!selectedTplKey && !selectedTemplateDoc
  const selectedAttachments = selected
    ? isCoverNode
      ? (attachByNode.get(selected.number) ?? [])
      : attachmentsFor(selected)
    : []
  // Langue cible (code pays → 'FR'/'PT'/'EN') pour les libellés (« Traduire en FR », « …_FR.docx »).
  const targetLangLabel = officialLanguage(dossier.country).toUpperCase()

  // Documents visualisables du nœud : lettre générée + pièces jointes + documents produit.
  // Aperçu in-place automatique du 1er (ou de l'onglet choisi), même cadre que la lettre.
  const viewables = buildViewables({
    selectedGenDocs,
    selectedAttachments,
    selectedDocs,
    sourceNamesById,
    targetLangLabel,
  })
  const activeKey =
    pickedKey && viewables.some((v) => v.key === pickedKey)
      ? pickedKey
      : (viewables[0]?.key ?? null)
  const active = viewables.find((v) => v.key === activeKey) ?? null
  // Page de garde épurée : section de garde SANS pièce propre (une cover custom téléversée
  // sur la section reprend la vue normale).
  const showCoverPage = isCoverNode && !active
  // Document généré AFFICHÉ (lettre/traduction/version conforme de l'onglet actif).
  const activeGenDoc =
    active?.kind === 'letter'
      ? selectedGenDocs.find((g) => `letter:${g.id}` === active.key)
      : undefined
  // N'utiliser l'instance éditeur que si elle correspond au document affiché
  // (évite d'agir sur une instance détruite pendant le changement de document).
  const liveEditor =
    editorState && activeGenDoc && editorState.id === activeGenDoc.id ? editorState.ed : null
  // Onglet actif = texte éditable (doc généré / lettre / traduction) → on affiche la barre d'édition
  // (Modifier/Signer/En-tête/Régénérer). Inutile sur un PDF/pièce → masquée.
  const isEditableActive = active?.kind === 'letter' && !!activeGenDoc

  // Document généré analysable à la demande (recette n°7) : traduction ou version conforme.
  const analyzableGenDoc =
    activeGenDoc &&
    (activeGenDoc.templateKey === 'translation' || activeGenDoc.templateKey === 'upgrade')
      ? activeGenDoc
      : undefined
  // Cible du bouton « Analyser » : pièce affichée OU document généré analysable.
  const analyzeTargetId =
    active && active.kind !== 'letter' ? active.id : (analyzableGenDoc?.id ?? null)

  // Constat de l'élément affiché (résultat d'une analyse Regafy non résolue) → carte
  // d'actions flottante sur l'aperçu (Remplir le template / Traduire / Remplacer).
  const activeAnalysisFinding = analyzeTargetId
    ? allFindings.find((f) => f.pieceId === analyzeTargetId && !f.ok)
    : undefined

  // Version conforme affichée : rubriques [NON FOURNI…] restant à compléter (recalculé sur le
  // contenu sauvegardé — la bannière s'allège au fur et à mesure des corrections).
  const upgradeMissingCount =
    activeGenDoc?.templateKey === 'upgrade'
      ? countMissing(tiptapText(activeGenDoc.content as JSONContent))
      : 0

  // Squelette « Remplir le template » affiché : zones [À COMPLÉTER] restantes.
  const fillMissingCount =
    activeGenDoc?.templateKey === 'fill'
      ? countMarker(tiptapText(activeGenDoc.content as JSONContent), FILL_PLACEHOLDER)
      : 0

  // « Conformité d'abord, traduction après » : la version conforme rédigée dans une autre
  // langue que la langue officielle du pays porte le bouton « Traduire » (langue détectée par
  // le constat de conformité de la pièce source).
  const activeUpgradeLang =
    activeGenDoc?.templateKey === 'upgrade' && activeGenDoc.sourceDocId
      ? allFindings.find((f) => f.pieceId === activeGenDoc.sourceDocId && f.upgrade)?.language
      : undefined
  const activeConformNeedsTranslation =
    !!activeUpgradeLang && activeUpgradeLang !== officialLanguage(activeDossier.country)

  // « Remplir le template » disponible sur les nœuds dont le type est couvert par un template
  // officiel (RCP, Notice, Étiquetage… — 1.3.x), même sans aucun document.
  const fillDocType = selected
    ? (docTypeForNode(activeDossier.format, selected.number) ??
      (selected.number.startsWith('1.3') ? 'labeling' : null))
    : null
  const canFillSelected = !!fillDocType && UPGRADE_DOC_TYPES.has(fillDocType)

  // Formulaire officiel (branding CEO — RCP, Notice, Étiquetage) : l'onglet « template à
  // compléter » est rendu par TemplateFillForm (feuille A4 navy + exports DOCX/PDF) — plus
  // d'éditeur TipTap pour ces types.
  const activeFormDef = activeGenDoc?.templateKey === 'fill' ? formDefinitionFor(fillDocType) : null

  // Carte de constat (mockup CEO) du document affiché — masquable pour la session (le
  // constat reste dans le panneau Remarques). Type pour les actions : type de la pièce
  // analysée si connu, sinon type du nœud.
  const activePiece =
    active && active.kind !== 'letter'
      ? (selectedDocs.find((d) => d.id === active.id) ??
        selectedAttachments.find((a) => a.id === active.id))
      : undefined
  const activeAnalysisDocType =
    (activePiece && 'docType' in activePiece ? activePiece.docType : null) ??
    fillDocType ??
    'document'
  const visibleAnalysisCard =
    activeAnalysisFinding && !hiddenCards.has(activeAnalysisFinding.id)
      ? activeAnalysisFinding
      : undefined
  const hideAnalysisCard = () => {
    if (activeAnalysisFinding) setHiddenCards((prev) => new Set(prev).add(activeAnalysisFinding.id))
  }

  // Constat Regafy de l'élément affiché → carte amber du panneau Copilote (pass 2 : déplacée du
  // canevas → rail droit). Cible : document généré analysable (traduction / version conforme) →
  // Remplir/Traduire, sans « Remplacer » ; pièce → Remplir/Traduire/Remplacer.
  const railFinding = visibleAnalysisCard
    ? {
        finding: visibleAnalysisCard,
        docType: activeAnalysisDocType,
        showReplace: !analyzableGenDoc,
        translating: translating === (analyzableGenDoc?.id ?? visibleAnalysisCard.pieceId),
        onFill: () => {
          if (selected) void handleFillTemplate(selected)
        },
        onTranslate: () => {
          if (analyzableGenDoc) void handleTranslateGenerated(analyzableGenDoc)
          else void handleTranslate(visibleAnalysisCard)
        },
        onReplace: () => {
          if (active && active.kind !== 'letter') handleReplace(active)
        },
        onDismiss: hideAnalysisCard,
      }
    : null

  const { okCount, pct, leaves } = completionStats(flatNodes, countFor)
  const warnCount = allFindings.filter((f) => !f.ok && f.severity === 'warning').length
  const errCount = allFindings.filter((f) => !f.ok && f.severity === 'error').length

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
    if (!activeGenDoc) return
    cancelSave() // on repart du modèle : abandonner toute édition en attente
    const content = await regenerateGeneratedDoc(activeGenDoc.id, buildContext())
    if (content && liveEditor) liveEditor.commands.setContent(content)
    void syncGeneratedDocs(orgId)
  }

  /** Télécharge un doc généré au format .docx (lib `docx` en lazy) — traduction ou version conforme. */
  async function downloadGeneratedDocx(gen: GeneratedDocRecord, suffix: string) {
    try {
      const json = (liveEditor?.getJSON() ?? gen.content) as JSONContent
      const { tiptapToDocxBlob } = await import('./tiptap-docx')
      const blob = await tiptapToDocxBlob(json)
      const base = ((gen.sourceDocId && sourceNamesById.get(gen.sourceDocId)) ?? gen.title).replace(
        /\.[^.]+$/,
        '',
      )
      triggerDownload(URL.createObjectURL(blob), `${base}_${suffix}.docx`, true)
    } catch (e) {
      console.error(e)
      toast.error(t({ fr: 'Échec du téléchargement (.docx).', en: 'Download failed (.docx).' }))
    }
  }

  /** Télécharge un formulaire de template en .docx 100 % conforme au gabarit (Times/navy, A4). */
  async function downloadFormDocx(gen: GeneratedDocRecord, def: NonNullable<typeof activeFormDef>) {
    try {
      // Lazy : la lib docx reste hors du chunk workspace.
      const { formDocxBlob } = await import('./template-form/form-docx')
      const state = formStateFromContent(def, gen.content as JSONContent)
      const blob = await formDocxBlob(def, state)
      triggerDownload(URL.createObjectURL(blob), `${formExportName(def, state)}.docx`, true)
    } catch (e) {
      console.error(e)
      toast.error(t({ fr: 'Échec du téléchargement (.docx).', en: 'Download failed (.docx).' }))
    }
  }

  /** Télécharge selon l'onglet actif : traduction/version conforme → .docx · lettre → .html · doc produit → fichier d'origine. */
  function handleDownload() {
    if (active?.kind === 'letter' && activeGenDoc) {
      if (activeGenDoc.templateKey === 'translation') {
        void downloadGeneratedDocx(activeGenDoc, targetLangLabel)
        return
      }
      if (activeGenDoc.templateKey === 'upgrade') {
        void downloadGeneratedDocx(activeGenDoc, 'CONFORME')
        return
      }
      if (activeFormDef) {
        void downloadFormDocx(activeGenDoc, activeFormDef)
        return
      }
      const json = (liveEditor?.getJSON() ?? activeGenDoc.content) as JSONContent
      const html = generatedDocToHtml(activeGenDoc.title, json, {
        header: branding?.headerImage ?? null,
        footer: branding?.footerImage ?? null,
      })
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      triggerDownload(URL.createObjectURL(blob), `${slugify(activeGenDoc.title)}.html`, true)
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
    toast.success(t({ fr: 'Document retiré du dossier', en: 'Document removed from the dossier' }))
  }

  async function handleUpload(file: File) {
    if (!selected) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(t({ fr: 'Fichier trop lourd (max 25 Mo).', en: 'File too large (max 25 MB).' }))
      return
    }
    try {
      await addAttachment(orgId, activeDossier.id, selected.number, file)
    } catch (error) {
      toast.error(t({ fr: "Échec de l'ajout", en: 'Upload failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
      return
    }
    // Synchroniser tout de suite → la pièce reçoit son chemin Storage (analysable au clic).
    await syncDossierAttachments(orgId)
    // « Remplacer » : le nouveau fichier remplace la pièce visée — l'ancienne est retirée du
    // dossier (un doc produit reste au catalogue) et ses remarques sont purgées.
    if (replaceTarget) {
      const target = replaceTarget
      setReplaceTarget(null)
      if (target.kind === 'attachment') await deleteAttachment(target.id)
      else if (target.kind === 'doc') await excludeProductDoc(activeDossier.id, target.id)
      clearPieceAnalysis(target.id)
      void syncDossiers(orgId)
      setPickedKey(null)
      toast.success(t({ fr: 'Document remplacé.', en: 'Document replaced.' }))
      return
    }
    toast.success(
      t({
        fr: 'Pièce ajoutée — cliquez « Analyser » pour la vérifier.',
        en: 'Item added — click “Analyze” to check it.',
      }),
    )
  }

  /** « Remplacer » (carte de constat) : téléverser un nouveau fichier à la place de la pièce visée. */
  function handleReplace(target: Viewable) {
    if (target.kind === 'letter') return
    setReplaceTarget(target)
    fileInputRef.current?.click()
  }

  /** « Remplir le template » : squelette officiel verrouillé, zones [À COMPLÉTER] remplies
   *  PAR L'UTILISATEUR (pré-rempli : session Identification produit uniquement). Généré
   *  localement (zéro IA, offline) ; Regafy vérifie la conformité à chaque enregistrement. */
  async function handleFillTemplate(node: CtdNodeDef) {
    const docType =
      docTypeForNode(activeDossier.format, node.number) ??
      (node.number.startsWith('1.3') ? 'labeling' : null)
    if (!docType) return
    // Recette CEO : le constat « non conforme — Remplir le template » disparaît dès qu'on ouvre le
    // template pour le remplir → purge l'analyse de la pièce source qui le portait (par nœud).
    for (const f of allFindings) {
      if (f.nodeNumber === node.number && f.upgrade && f.pieceId) clearPieceAnalysis(f.pieceId)
    }
    const openTab = (genId: string) => {
      setSelected(node)
      setDocEditing(true)
      setPickedKey(`letter:${genId}`)
    }
    // Anti-relance : un squelette existe déjà sur ce nœud → rouvrir son onglet.
    const existing = (genDocs ?? []).find(
      (g) => g.deletedAt === null && g.templateKey === 'fill' && g.nodeNumber === node.number,
    )
    if (existing) {
      openTab(existing.id)
      return
    }
    const skeleton = buildTemplateSkeleton(docType, product)
    if (!skeleton) return
    const rec = await createTemplateFillDoc(orgId, {
      dossierId: activeDossier.id,
      nodeNumber: node.number,
      title: t({
        fr: `${docType.toUpperCase()} — template à compléter`,
        en: `${docType.toUpperCase()} — template to complete`,
      }),
      content: skeleton,
    })
    void syncGeneratedDocs(orgId)
    openTab(rec.id)
    toast.success(t({ fr: 'Template officiel prêt.', en: 'Official template ready.' }), {
      description: formDefinitionFor(docType)
        ? t({
            fr: 'Remplissez le formulaire officiel — structure et mentions réglementaires verrouillées.',
            en: 'Fill in the official form — regulatory structure and statements are locked.',
          })
        : t({
            fr: 'Complétez les zones [À COMPLÉTER] — les titres du template sont verrouillés.',
            en: 'Complete the [À COMPLÉTER] areas — the template headings are locked.',
          }),
    })
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

  async function handleUpdateStructure() {
    const merged = mergeDefaultTree(activeDossier.tree, getModule1Tree(activeDossier.format))
    await updateDossierTree(activeDossier.id, merged)
    void syncDossiers(orgId)
    toast.success(t({ fr: 'Structure mise à jour', en: 'Structure updated' }))
  }

  async function handleRemoveActive() {
    if (!active) return
    if (active.kind === 'letter' && activeGenDoc) {
      await deleteGeneratedDoc(activeGenDoc.id)
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
    toast.success(t({ fr: 'Document retiré du dossier', en: 'Document removed from the dossier' }))
  }

  // ───────────────────────── EN-TÊTE DE DOCUMENT UNIQUE (M1) ─────────────────────────
  // Type fonctionnel du document affiché → cadre constant + boutons adaptatifs (buildDocActions).
  const headerKind: DocKind | null = !selected
    ? null
    : showCoverPage
      ? 'cover'
      : isEditableActive && activeFormDef
        ? 'form'
        : isEditableActive
          ? 'letter'
          : active && active.kind !== 'letter'
            ? 'piece'
            : 'empty'
  const regafyFor: 'enabled' | 'teaser' | 'hidden' =
    regafyState === 'enabled' ? 'enabled' : regafyState === 'teaser' ? 'teaser' : 'hidden'
  const isTranslationOrUpgrade =
    activeGenDoc?.templateKey === 'translation' || activeGenDoc?.templateKey === 'upgrade'
  const headerStatus: DocHeaderStatus | undefined =
    headerKind === null
      ? undefined
      : headerKind === 'cover'
        ? { tone: 'auto', label: t({ fr: 'Autogénéré', en: 'Auto-generated' }), icon: Sparkles }
        : headerKind === 'piece'
          ? { tone: 'file', label: t({ fr: 'Pièce', en: 'File' }), icon: FileText }
          : headerKind === 'empty'
            ? { tone: 'todo', label: t({ fr: 'À générer', en: 'To generate' }), icon: CircleDashed }
            : { tone: 'draft', label: t({ fr: 'Brouillon', en: 'Draft' }), icon: Pencil }
  const headerSubtitle =
    headerKind === 'form'
      ? t({ fr: 'Module 1 · Information produit', en: 'Module 1 · Product information' })
      : headerKind === 'piece'
        ? t({ fr: 'Module 1 · Pièce téléversée', en: 'Module 1 · Uploaded file' })
        : headerKind === 'cover'
          ? t({ fr: 'Module 1 · Page de garde', en: 'Module 1 · Cover page' })
          : headerKind === 'letter'
            ? t({ fr: 'Module 1 · Correspondance', en: 'Module 1 · Correspondence' })
            : t({ fr: 'Module 1', en: 'Module 1' })
  const headerTitle =
    active?.label ??
    (selectedTplKey ? TEMPLATES[selectedTplKey].title : undefined) ??
    selected?.label ??
    ''
  const runHeaderAnalyze = () => {
    if (regafyState !== 'enabled') {
      upsell('regafy', { fr: 'Analyse IA', en: 'AI analysis' })
      return
    }
    if (!analyzeTargetId || analyzing !== null || !online || !env.isSupabaseConfigured) return
    if (activeAnalysisFinding)
      setHiddenCards((prev) => {
        if (!prev.has(activeAnalysisFinding.id)) return prev
        const next = new Set(prev)
        next.delete(activeAnalysisFinding.id)
        return next
      })
    if (analyzableGenDoc) void analyzeGenerated(analyzableGenDoc)
    else void analyzeActive(analyzeTargetId)
  }
  const headerCtx: DocActionsContext | null = headerKind
    ? {
        kind: headerKind,
        regafy: regafyFor,
        editing: docEditing,
        aiGenerated: headerKind === 'letter' && !isTranslationOrUpgrade,
        analyzable: headerKind === 'piece' || (headerKind === 'letter' && !!analyzableGenDoc),
        analyzeDisabled: analyzing !== null || !online || !env.isSupabaseConfigured,
        canGenerate,
        handlers: {
          edit: () => {
            if (!activeGenDoc) return
            setPickedKey(`letter:${activeGenDoc.id}`)
            setDocEditing((v) => !v)
          },
          regenerate: () => void handleRegenerate(),
          // Garde anti-régression : signer modifie le document → uniquement en mode édition
          // (le bouton est aussi désactivé hors édition ; handleSign re-vérifie l'éditeur).
          sign: () => {
            if (docEditing) handleSign()
          },
          branding: () => setBrandPanelOpen(true),
          download: handleDownload,
          downloadPdf: () => fillFormRef.current?.pdf(),
          downloadDocx: () => void fillFormRef.current?.docx(),
          upload: () => fileInputRef.current?.click(),
          reset: () => fillFormRef.current?.reset(),
          analyze: runHeaderAnalyze,
          translate: () => upsell('regafy', { fr: 'Traduction IA', en: 'AI translation' }),
          replace: () => {
            if (active) handleReplace(active)
          },
          generate: () => void handleGenerate(),
          remove: () => void handleRemoveActive(),
        },
      }
    : null
  // buildDocActions ne fait que STOCKER les handlers (appelés au clic) — aucun ref lu au rendu.
  // eslint-disable-next-line react-hooks/refs
  const headerActions = headerCtx ? buildDocActions(headerCtx, t) : []

  return (
    // Layout plein écran (mockup ctd-builder-unified-header) : en-tête de document UNIQUE
    // full-bleed, puis 3 colonnes FLUSH (Structure │ Document │ Copilote) qui défilent
    // indépendamment. Le conteneur remplit <main> en hauteur (h = 100% + le padding-bottom
    // neutralisé du shell, cf. app-shell) → plus de scroll global, bordures verticales pleine
    // hauteur. Les overlays (dialogs) sont SORTIS du conteneur overflow-hidden (fragment) → jamais rognés.
    <>
      <div className="bg-canvas -mx-4 -mb-4 flex h-[calc(100%+1rem)] flex-col overflow-hidden md:-mx-6 md:-mb-6 md:h-[calc(100%+1.5rem)]">
        {/* Barre d'ONGLETS de documents (mockup `.legend`) — pleine largeur, ENTRE l'en-tête
            global du shell et l'en-tête de document. Pilules `.pickbtn` : « {Type} ({n° CTD}) »,
            navy si actif + « × » pour retirer du dossier (façon onglet de navigateur). Pas de
            role=tab (pattern tablist clavier complet = jalon M3 a11y). */}
        {selected && !showCoverPage && viewables.length > 0 ? (
          <div
            role="group"
            aria-label={t({ fr: 'Documents de la section', en: 'Section documents' })}
            className="bg-card flex flex-wrap items-center gap-2 border-b px-4 py-2"
          >
            {viewables.map((v) => {
              const isActive = active?.key === v.key
              const tabLabel = `${t(viewableTabType(v))} (${selected.number})`
              const removeHint =
                v.kind === 'doc'
                  ? t({
                      fr: 'Retirer du dossier (le document reste sous le produit)',
                      en: 'Remove from dossier (the document stays under the product)',
                    })
                  : t({ fr: 'Supprimer du dossier', en: 'Remove from dossier' })
              return (
                <span
                  key={v.key}
                  className={cn(
                    'inline-flex items-center rounded-full border text-[12px] transition-colors',
                    isActive
                      ? 'border-brand bg-brand text-brand-foreground'
                      : 'text-foreground hover:bg-accent',
                  )}
                >
                  <button
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => {
                      setPickedKey(v.key)
                      // Traduction/version conforme/template → éditable d'emblée.
                      if (v.kind === 'letter' && (v.isTranslation || v.isUpgrade || v.isFill))
                        setDocEditing(true)
                    }}
                    title={v.label}
                    className="focus-visible:ring-ring/50 max-w-[200px] truncate rounded-full py-1 pr-1.5 pl-[11px] font-medium outline-none focus-visible:ring-[3px]"
                  >
                    {tabLabel}
                  </button>
                  <button
                    type="button"
                    aria-label={`${removeHint} — ${tabLabel}`}
                    title={removeHint}
                    onClick={() => void handleRemoveViewable(v)}
                    className={cn(
                      'focus-visible:ring-ring/50 mr-1 grid size-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-[3px]',
                      isActive
                        ? 'hover:bg-brand-foreground/20'
                        : 'hover:bg-destructive/10 hover:text-destructive',
                    )}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
        ) : null}
        {/* EN-TÊTE DE DOCUMENT UNIQUE (M1) : cadre constant (identité + actions), boutons adaptés
            au type — full-bleed, bordure basse. Remplace pilule + barre + bandeau navy + format. */}
        {headerKind ? (
          <DocumentHeader
            number={selected?.number}
            title={headerTitle}
            subtitle={headerSubtitle}
            status={headerStatus}
            actions={headerActions}
            toolbarLabel={t({ fr: 'Actions du document', en: 'Document actions' })}
            // Mockup : « Modifier » révèle la mise en forme SUR LA MÊME LIGNE (dans l'en-tête).
            formatSlot={
              isEditableActive && docEditing && !activeFormDef && liveEditor ? (
                <FormatToolbar editor={liveEditor} />
              ) : undefined
            }
          />
        ) : null}

        {/* Corps : 3 colonnes flush ; `relative` → poignées de rabat posées SUR les bordures. */}
        <div className="relative flex min-h-0 flex-1">
          {/* Colonne 1 — Structure (bordure droite, pleine hauteur, défile). */}
          <div className="relative h-full shrink-0">
            <TreePanel
              collapsed={collapsed}
              treeEditing={treeEditing}
              setTreeEditing={setTreeEditing}
              structureOutdated={structureOutdated}
              onUpdateStructure={() => void handleUpdateStructure()}
              tree={dossier.tree}
              flatNodes={flatNodes}
              selected={selected}
              onSelectNode={handleSelectNode}
              countFor={countFor}
              flaggedNodes={flaggedNodes}
              onTreeChange={(tree) => void handleTreeChange(tree)}
            />
            <PanelHandle
              side="left"
              open={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
              label={
                collapsed
                  ? t({ fr: "Déplier l'arborescence", en: 'Expand the structure' })
                  : t({ fr: "Replier l'arborescence", en: 'Collapse the structure' })
              }
              className="absolute top-1/2 -right-[9px] z-20 -translate-y-1/2"
            />
          </div>

          {/* Colonne 2 — Document : fond canevas (mockup `--bg`), défile ; feuille centrée (max 840).
              `div` (pas `main` : le shell porte déjà le landmark `main` — pas de main imbriqué). */}
          <div className="bg-canvas min-w-0 flex-1 overflow-auto">
            {selected ? (
              <>
                {/* Input fichier caché : déclenché par « Téléverser » de l'en-tête (et « Remplacer »). */}
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
                <div className="mx-auto w-full max-w-[840px] p-4 md:p-5">
                  {showCoverPage && selected ? (
                    // Page de GARDE : aperçu numéro + intitulé (contenu autogénéré à la compilation).
                    // L'identité (titre h2) et les actions (Autogénéré / Téléverser) vivent dans l'EN-TÊTE.
                    <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                      <div>
                        <span className="block text-4xl font-bold tracking-wide">
                          {selected.number}
                        </span>{' '}
                        <span className="mt-2 block text-lg font-semibold">{selected.label}</span>
                      </div>
                      <p className="text-muted-foreground mt-3 max-w-md text-sm">
                        {selected.number === '1.0'
                          ? t({
                              fr: 'Table des matières générée automatiquement à la compilation (pagination incluse).',
                              en: 'Table of contents generated automatically at compilation (pagination included).',
                            })
                          : t({
                              fr: 'Page de garde générée automatiquement à la compilation — numéro et intitulé de la section.',
                              en: 'Cover page generated automatically at compilation — section number and title.',
                            })}
                      </p>
                    </div>
                  ) : active?.kind === 'letter' && activeGenDoc ? (
                    // Onglet traduction/version conforme = plein largeur (éditeur + barre de format) ;
                    // l'original est l'onglet voisin. Pas d'`overflow-hidden` : casserait le `sticky`.
                    // `relative` : ancre de la carte de non-conformité et du scan (mockup CEO).
                    <section
                      className={cn(
                        'bg-card relative rounded-lg border',
                        analyzing === activeGenDoc.id && 'regafy-scanning',
                      )}
                    >
                      {analyzing === activeGenDoc.id ? <div className="regafy-scan-line" /> : null}
                      {/* Constat Regafy (carte amber) déplacé dans le panneau Copilote — pass 2. */}
                      {activeGenDoc.templateKey === 'upgrade' ? (
                        <p
                          className={cn(
                            'flex items-center gap-1.5 px-3 pt-2 text-xs italic',
                            upgradeMissingCount > 0 ? 'text-amber-700' : 'text-emerald-700',
                          )}
                        >
                          <Wand2 className="size-3.5 shrink-0" />
                          {upgradeMissingCount > 0
                            ? t({
                                fr: `Mise en conformité assistée — à relire : ${upgradeMissingCount} rubrique(s) marquée(s) [NON FOURNI DANS LE DOCUMENT SOURCE] à compléter.`,
                                en: `Assisted compliance upgrade — to review: ${upgradeMissingCount} section(s) marked [NON FOURNI DANS LE DOCUMENT SOURCE] to complete.`,
                              })
                            : t({
                                fr: 'Mise en conformité assistée — à relire. Toutes les rubriques portent une information issue du document source.',
                                en: 'Assisted compliance upgrade — to review. All sections carry information from the source document.',
                              })}
                        </p>
                      ) : null}
                      {activeGenDoc.templateKey === 'fill' ? (
                        activeFormDef ? null : (
                          <p
                            className={cn(
                              'flex items-center gap-1.5 px-3 pt-2 text-xs italic',
                              fillMissingCount > 0 ? 'text-amber-700' : 'text-emerald-700',
                            )}
                          >
                            <ClipboardList className="size-3.5 shrink-0" />
                            {fillMissingCount > 0
                              ? t({
                                  fr: `Template officiel — ${fillMissingCount} zone(s) [À COMPLÉTER] restante(s). Les titres du template sont verrouillés ; Regafy vérifie la conformité à chaque enregistrement.`,
                                  en: `Official template — ${fillMissingCount} [À COMPLÉTER] area(s) remaining. Template headings are locked; Regafy checks compliance on each save.`,
                                })
                              : t({
                                  fr: 'Template officiel — toutes les zones sont complétées. Regafy vérifie la conformité à chaque enregistrement.',
                                  en: 'Official template — all areas are completed. Regafy checks compliance on each save.',
                                })}
                          </p>
                        )
                      ) : null}
                      {activeConformNeedsTranslation ? (
                        // Politique « conformité d'abord, traduction après » : doc rédigé dans une
                        // langue ≠ langue officielle du pays → contrôle SOBRE de traduction (style
                        // Bibliothèque : bordé, navy), pas un bandeau ambré criard.
                        <div className="bg-muted/40 mx-3 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <Languages className="text-brand size-4 shrink-0" />
                            {t({
                              fr: `Rédigé en ${activeUpgradeLang?.toUpperCase()} — langue officielle du pays : ${targetLangLabel}.`,
                              en: `Written in ${activeUpgradeLang?.toUpperCase()} — country official language: ${targetLangLabel}.`,
                            })}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-brand text-brand hover:bg-brand/5 h-7 gap-1.5"
                            disabled={translating === activeGenDoc.id}
                            onClick={() => void handleTranslateGenerated(activeGenDoc)}
                          >
                            <Languages className="size-3.5" />
                            {translating === activeGenDoc.id
                              ? t({ fr: 'Traduction…', en: 'Translating…' })
                              : t({
                                  fr: `Traduire en ${targetLangLabel}`,
                                  en: `Translate to ${targetLangLabel}`,
                                })}
                          </Button>
                        </div>
                      ) : null}
                      {upgrading === activeGenDoc.id && streamText !== null ? (
                        <div className="px-3 pt-2">
                          <TranslationProgress
                            label={t({
                              fr: 'Mise en conformité en cours…',
                              en: 'Compliance upgrade in progress…',
                            })}
                          />
                        </div>
                      ) : null}
                      {translating === activeGenDoc.id && streamText !== null ? (
                        <div className="px-3 pt-2">
                          <TranslationProgress />
                        </div>
                      ) : null}
                      <Suspense fallback={<EditorSkeleton />}>
                        {activeFormDef ? (
                          // Formulaire officiel (RCP/Notice/Étiquetage) — branding CEO (feuille A4
                          // navy, exports DOCX/PDF conformes). Remplace l'éditeur TipTap.
                          <TemplateFillForm
                            key={activeGenDoc.id}
                            ref={fillFormRef}
                            def={activeFormDef}
                            genDoc={activeGenDoc}
                            product={product}
                            countryName={countryLabel(activeDossier.country, lang)}
                            orgId={orgId}
                            controlsInBar
                          />
                        ) : (
                          <>
                            {/* Mise en forme (gras/italique/titre/liste) : dans l'EN-TÊTE en mode
                              Modifier (mockup), plus de barre séparée au-dessus de l'éditeur. */}
                            <RichTextEditor
                              docId={activeGenDoc.id}
                              initialContent={activeGenDoc.content as JSONContent}
                              editable={docEditing}
                              onChange={(json) => handleEditorChange(activeGenDoc.id, json)}
                              onReady={handleEditorReady}
                              header={
                                activeGenDoc.templateKey === 'translation' ||
                                activeGenDoc.templateKey === 'upgrade'
                                  ? null
                                  : (branding?.headerImage ?? null)
                              }
                              footer={
                                activeGenDoc.templateKey === 'translation' ||
                                activeGenDoc.templateKey === 'upgrade'
                                  ? null
                                  : (branding?.footerImage ?? null)
                              }
                            />
                          </>
                        )}
                      </Suspense>
                    </section>
                  ) : active && active.kind !== 'letter' ? (
                    // `relative` : ancre de la carte de constat et de l'animation d'analyse.
                    <div
                      className={cn(
                        'relative space-y-2',
                        analyzing === active.id && 'regafy-scanning rounded-lg',
                      )}
                    >
                      {/* Animation d'analyse Regafy (mockup CEO) : barre verte qui balaie le doc. */}
                      {analyzing === active.id ? <div className="regafy-scan-line" /> : null}
                      {/* Carte de CONSTAT Regafy déplacée dans le panneau Copilote (rail droit) — pass 2. */}
                      {translating === active.id && streamText !== null ? (
                        <TranslationProgress />
                      ) : null}
                      {upgrading === active.id && streamText !== null ? (
                        <TranslationProgress
                          label={t({
                            fr: 'Mise en conformité en cours…',
                            en: 'Compliance upgrade in progress…',
                          })}
                        />
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
                        {t({
                          fr: 'Générez ce document depuis le modèle UEMOA, ou téléversez un fichier.',
                          en: 'Generate this document from the WAEMU template, or upload a file.',
                        })}
                      </p>
                      <Button className="mt-3" size="sm" onClick={() => void handleGenerate()}>
                        <Sparkles className="size-4" /> Générer
                      </Button>
                    </div>
                  ) : canFillSelected ? (
                    <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center">
                      <ClipboardList className="text-primary mb-2 size-8" />
                      <p className="text-sm font-medium">
                        {t({
                          fr: 'Template officiel disponible',
                          en: 'Official template available',
                        })}
                      </p>
                      <p className="text-muted-foreground mt-1 max-w-sm text-xs">
                        {t({
                          fr: 'Remplissez le template en vigueur (structure verrouillée, conformité vérifiée par Regafy à chaque enregistrement), ou téléversez un document.',
                          en: 'Fill in the current template (locked structure, compliance checked by Regafy on each save), or upload a document.',
                        })}
                      </p>
                      <Button
                        className="mt-3"
                        size="sm"
                        onClick={() => selected && void handleFillTemplate(selected)}
                      >
                        <ClipboardList className="size-4" />{' '}
                        {t({ fr: 'Remplir le template', en: 'Fill the template' })}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed text-sm">
                      <FileText className="mb-2 size-8" />
                      {t({
                        fr: 'Aucun document classé sous cette section.',
                        en: 'No document filed under this section.',
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground flex items-center justify-center rounded-lg border border-dashed py-16 text-sm">
                {t({
                  fr: "Sélectionnez une section de l'arborescence.",
                  en: 'Select a section from the structure.',
                })}
              </div>
            )}
          </div>

          {/* Colonne 3 — Copilote (bordure gauche, pleine hauteur, défile) + poignée sur la bordure. */}
          <div className="relative hidden h-full shrink-0 lg:block">
            <PanelHandle
              side="right"
              open={!rightCollapsed}
              onClick={() => setRightCollapsed(!rightCollapsed)}
              label={
                rightCollapsed
                  ? t({ fr: 'Afficher la complétude', en: 'Show completeness' })
                  : t({ fr: 'Replier la complétude', en: 'Collapse completeness' })
              }
              className="absolute top-1/2 -left-[9px] z-20 -translate-y-1/2"
            />
            <CompletionPanel
              collapsed={rightCollapsed}
              pct={pct}
              okCount={okCount}
              total={leaves.length}
              warnCount={warnCount}
              errCount={errCount}
              allFindings={allFindings}
              aiBusy={aiBusy}
              translating={translating}
              targetLangLabel={targetLangLabel}
              flatNodes={flatNodes}
              onSelectNode={handleSelectNode}
              onTranslate={(f) => void handleTranslate(f)}
              onFillTemplate={(f) => {
                const n = flatNodes.find((x) => x.number === f.nodeNumber)
                if (n) void handleFillTemplate(n)
              }}
              finding={railFinding}
            />
          </div>
        </div>
      </div>

      {previewPdf ? (
        <PdfPreviewDialog
          blob={previewPdf.blob}
          url={previewPdf.url}
          name={previewPdf.name}
          actions={
            canSubmit ? (
              <Button
                size="sm"
                disabled={!online || !env.isSupabaseConfigured}
                title={
                  !online
                    ? t({
                        fr: 'Hors-ligne : l’envoi nécessite une connexion',
                        en: 'Offline: sending requires a connection',
                      })
                    : undefined
                }
                onClick={() => setShareOpen(true)}
              >
                <Send className="size-4" /> {t({ fr: 'Envoyer', en: 'Send' })}
              </Button>
            ) : undefined
          }
          onClose={closePreview}
        />
      ) : null}

      {shareOpen && previewPdf && dossier ? (
        <ShareDialog
          orgId={orgId}
          dossier={dossier}
          pdfBlob={previewPdf.blob}
          senderEmail={user?.email ?? 'local'}
          onClose={() => setShareOpen(false)}
          onSent={() => {
            toast.success(
              t({
                fr: 'Dossier envoyé — la review du correspondant apparaîtra ici.',
                en: 'Dossier sent — the reviewer’s review will appear here.',
              }),
            )
          }}
        />
      ) : null}

      {corrPanelOpen && dossierId ? (
        <CorrespondencePanel
          orgId={orgId}
          dossierId={dossierId}
          senderEmail={user?.email ?? 'local'}
          onClose={() => setCorrPanelOpen(false)}
        />
      ) : null}

      {gateFindings ? (
        <RegafyGateDialog
          findings={gateFindings}
          auditProgress={auditProgress}
          auditDisabled={!online || !env.isSupabaseConfigured}
          onAudit={() => void handleAudit()}
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

      {auditReport ? (
        <AuditReportView report={auditReport} onClose={() => setAuditReport(null)} />
      ) : null}

      {sigPanelOpen ? (
        <SignaturePanel onApply={applySignature} onClose={() => setSigPanelOpen(false)} />
      ) : null}
      {brandPanelOpen ? (
        <BrandingPanel branding={branding} orgId={orgId} onClose={() => setBrandPanelOpen(false)} />
      ) : null}
    </>
  )
}
