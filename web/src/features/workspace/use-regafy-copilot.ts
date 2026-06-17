import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type {
  DocumentRecord,
  DossierAttachmentRecord,
  DossierRecord,
  GeneratedDocRecord,
  ProductRecord,
} from '@/lib/db'
import { env } from '@/lib/env'
import { readLang, tStatic } from '@/lib/i18n-context'
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
import { createTranslationDoc, createUpgradeDoc } from './generated-docs-repository'
import { syncGeneratedDocs } from './generated-docs-sync'
import { docTypeForNode, type CtdNodeDef } from './module1-tree'
import { agencyFor, officialLanguage } from './roadmap-data'
import { runRegafy, tiptapText, type RegafyFinding } from './regafy'
import {
  runRegafyConformityTexts,
  runRegafyLetters,
  runRegafyValidity,
  UPGRADE_DOC_TYPES,
  type RegafyAiPiece,
} from './regafy-ai'
import { cacheAnalysis, getCachedAnalysis } from './regafy-cache'
import { auditPieceKind, type AuditData, type AuditPiece } from './audit-report'
import { textToTiptap, translateDoc } from './translate-doc'
import { upgradeDoc } from './upgrade-doc'

/**
 * Copilote Regafy du workspace — analyses À LA DEMANDE (recette CEO n°6 : plus AUCUNE
 * analyse automatique) :
 * - `analyzeActive(pieceId)` : l'utilisateur clique « Analyser » sur la pièce affichée —
 *   Regafy applique sa politique (document à template → conformité [+ langue] ; pièce
 *   administrative → validité) et CONSIGNE le résultat dans les Remarques (une remarque
 *   par document — ré-analyser remplace ; résultat positif consigné aussi) ;
 * - traduction / mise en conformité d'un document (inchangé) ;
 * Assistif uniquement : ne bloque jamais la compilation.
 */
export function useRegafyCopilot({
  dossier,
  product,
  genDocs,
  docsByNode,
  attachByNode,
  flatNodes,
  orgId,
  onOpenTranslation,
}: {
  dossier: DossierRecord | null | undefined
  product: ProductRecord | undefined
  genDocs: GeneratedDocRecord[] | undefined
  docsByNode: Map<string, DocumentRecord[]>
  attachByNode: Map<string, DossierAttachmentRecord[]>
  flatNodes: CtdNodeDef[]
  orgId: string
  /** Ouvre l'onglet d'une traduction (sélection du nœud + mode édition) — fourni par la page. */
  onOpenTranslation: (node: CtdNodeDef, genId: string) => void
}) {
  /** Remarques de la SESSION, par pièce analysée — vide par défaut, ré-analyser REMPLACE. */
  const [analysisByPiece, setAnalysisByPiece] = useState<Record<string, RegafyFinding[]>>({})
  /** Pièce en cours d'analyse (animation de scan sur l'aperçu) — null sinon. */
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  /** Progression de l'Audit Global ({done,total}) — null hors audit. */
  const [auditProgress, setAuditProgress] = useState<{ done: number; total: number } | null>(null)
  const [translating, setTranslating] = useState<string | null>(null)
  /** Source (pieceId/genId) en cours de mise en conformité — null sinon. */
  const [upgrading, setUpgrading] = useState<string | null>(null)
  /** Texte (traduction OU version conforme) reçu au fil de l'eau (SSE) — null hors opération. */
  const [streamText, setStreamText] = useState<string | null>(null)

  // Constat « résolu » : dès qu'une traduction existe pour un doc, on masque son constat de langue
  // (et son bouton « Traduire ») — l'utilisateur a satisfait la demande. Vaut pour le panneau ET le
  // gate de compilation. Les autres constats s'effacent déjà au recalcul (re-analyse).
  const translatedSourceIds = useMemo(
    () =>
      new Set(
        (genDocs ?? [])
          .filter((g) => g.deletedAt === null && g.templateKey === 'translation' && g.sourceDocId)
          .map((g) => g.sourceDocId),
      ),
    [genDocs],
  )

  // Pièces admin/COA téléversées à faire analyser (validité multimodale), clé = id du document.
  const aiPieces = useMemo<RegafyAiPiece[]>(() => {
    const out: RegafyAiPiece[] = []
    for (const [num, list] of docsByNode) {
      const nodeLabel = flatNodes.find((n) => n.number === num)?.label ?? ''
      for (const d of list) {
        const relevant =
          d.category === 'admin' ||
          ['coa', 'rcp', 'notice', 'labeling', 'artwork'].includes(d.docType)
        if (relevant && d.filePath) {
          out.push({
            pieceId: d.id,
            sig: d.updatedAt,
            nodeNumber: num,
            nodeLabel,
            docType: d.docType,
            category: d.category,
            fileName: d.fileName,
            filePath: d.filePath,
            declaredExpiry: d.expiryDate ?? null,
          })
        }
      }
    }
    // Pièces jointes téléversées DIRECTEMENT sur un nœud du workspace : analysées comme les docs
    // produit, avec le type dérivé du nœud → Regafy détecte la langue (RCP/Notice/…) / la validité.
    if (dossier) {
      for (const [num, list] of attachByNode) {
        // Tout nœud produit (1.3.x) est langue-sensible → détection de langue même si le sous-type
        // précis n'est pas mappé (Étiquetage étranger 1.3.4, produits de référence 1.3.5…) : repli
        // 'labeling' (type LANG). Sinon, type admin dérivé du nœud (validité), ou rien.
        const docType =
          docTypeForNode(dossier.format, num) ?? (num.startsWith('1.3') ? 'labeling' : null)
        if (!docType) continue
        const nodeLabel = flatNodes.find((n) => n.number === num)?.label ?? ''
        for (const a of list) {
          if (a.filePath) {
            out.push({
              pieceId: a.id,
              sig: a.updatedAt,
              nodeNumber: num,
              nodeLabel,
              docType,
              category: num.startsWith('1.3') ? 'info' : 'admin',
              fileName: a.fileName,
              filePath: a.filePath,
              declaredExpiry: null,
            })
          }
        }
      }
    }
    return out
  }, [docsByNode, attachByNode, flatNodes, dossier])

  // Remarques de session — une pièce RETIRÉE du dossier emporte ses remarques (dérivation
  // pure : pas d'effet, les entrées orphelines sont simplement ignorées).
  const aiFindings = useMemo(() => {
    const currentIds = new Set(aiPieces.map((p) => p.pieceId))
    for (const g of genDocs ?? []) if (g.deletedAt === null) currentIds.add(g.id)
    return Object.entries(analysisByPiece)
      .filter(([id]) => currentIds.has(id))
      .flatMap(([, fs]) => fs)
  }, [analysisByPiece, aiPieces, genDocs])
  const aiBusy = analyzing !== null

  /**
   * Consolide le résultat d'une analyse en remarques de session — UNE remarque par genre :
   * - conformité + langue d'un document à template fusionnées en UN constat (boutons
   *   Remplir le template / Traduire / Remplacer) ;
   * - analyse SANS constat → remarque POSITIVE (`ok`) : le panneau consigne chaque résultat.
   */
  const consolidate = useCallback(
    (piece: RegafyAiPiece, fs: RegafyFinding[], countryName: string): RegafyFinding[] => {
      const isTemplate = UPGRADE_DOC_TYPES.has(piece.docType)
      // Nature du constat (dédup recette n°6 : un constat par doc et par nature ; Monitor cède à l'IA).
      const topic = isTemplate ? 'conformity' : 'validity'
      if (fs.length === 0) {
        return [
          {
            id: `analysis:${piece.pieceId}`,
            nodeNumber: piece.nodeNumber,
            nodeLabel: piece.nodeLabel,
            severity: 'info',
            ok: true,
            source: 'ai',
            pieceId: piece.pieceId,
            topic,
            message: isTemplate
              ? tStatic({
                  fr: `${piece.fileName} : conforme au template en vigueur.`,
                  en: `${piece.fileName}: compliant with the current template.`,
                })
              : tStatic({
                  fr: `${piece.fileName} : validité vérifiée — conforme.`,
                  en: `${piece.fileName}: validity checked — compliant.`,
                }),
          },
        ]
      }
      if (!isTemplate) {
        // Pièce admin/COA : le constat positif daté de l'IA est reformulé avec le NOM DE FICHIER
        // (point 4 — la date relevée figure dans le verdict conforme).
        return fs.map((f) =>
          f.ok && f.validUntil
            ? {
                ...f,
                pieceId: piece.pieceId,
                topic,
                message: tStatic({
                  fr: `${piece.fileName} : validité vérifiée — conforme — valable encore ~${f.validityMonths ?? '?'} mois (expire le ${f.validUntil}).`,
                  en: `${piece.fileName}: validity checked — compliant — still valid for ~${f.validityMonths ?? '?'} months (expires ${f.validUntil}).`,
                }),
              }
            : { ...f, topic },
        )
      }
      // Document à template : fusionner conformité + langue en un constat porteur d'actions.
      const upgradeF = fs.find((f) => f.upgrade)
      const langF = fs.find((f) => f.translate || (f.language && f.language !== 'fr'))
      if (upgradeF && langF) {
        const lang = (langF.language ?? '??').toUpperCase()
        const dt = piece.docType.toUpperCase()
        // UEMOA/CEDEAO : la langue officielle cible est TOUJOURS le français → on l'écrit en dur
        // ici (constat fusionné). Un constat de langue seul reste rendu par l'Edge (langName
        // dynamique) ; à reconsolider sur regafyMessages le jour d'une cible non francophone.
        const merged: RegafyFinding = {
          ...upgradeF,
          translate: true,
          language: langF.language,
          topic,
          message: tStatic({
            fr: `${dt} : non conforme au template en vigueur et rédigé en ${lang} — langue officielle du ${countryName} : français.`,
            en: `${dt}: not compliant with the current template and written in ${lang} — official language of ${countryName}: French.`,
          }),
        }
        return [
          merged,
          ...fs.filter((f) => f !== upgradeF && f !== langF).map((f) => ({ ...f, topic })),
        ]
      }
      return fs.map((f) => ({ ...f, topic }))
    },
    [],
  )

  /**
   * Analyse À LA DEMANDE de la pièce affichée (bouton « Analyser ») — politique Regafy :
   * document à template → conformité (+ langue) ; pièce administrative → validité.
   * Cache par (pieceId, updatedAt) : pièce inchangée = résultat immédiat, zéro appel IA.
   */
  const analyzeActive = useCallback(
    async (pieceId: string) => {
      const piece = aiPieces.find((p) => p.pieceId === pieceId)
      if (!piece || !dossier || !env.isSupabaseConfigured) return
      if (analyzing) return
      const countryName = countryLabel(dossier.country, readLang()) || dossier.country || ''
      setAnalyzing(piece.pieceId)
      try {
        let fs = await getCachedAnalysis(piece.pieceId, piece.sig)
        const cached = !!fs
        if (!fs) {
          fs = await runRegafyValidity(
            [piece],
            new Date().toISOString().slice(0, 10),
            agencyFor(dossier.country).name || '',
            officialLanguage(dossier.country),
            dossier.productName ?? product?.nomCommercial ?? '',
            countryName,
            dossier.country,
          )
          fs = fs.filter((f) => !f.pieceId || f.pieceId === piece.pieceId)
          await cacheAnalysis(piece.pieceId, piece.sig, fs)
        }
        setAnalysisByPiece((prev) => ({
          ...prev,
          [piece.pieceId]: consolidate(piece, fs!, countryName),
        }))
        // Doc inchangé (cache) : rejoue l'animation de scan VISIBLE, sans réappel IA ni doublon de
        // remarque (résultat identique → idempotent) — recette n°10.
        if (cached) await new Promise((r) => setTimeout(r, 900))
      } catch (e) {
        toast.error(`Analyse impossible : ${(e as Error).message}`)
      } finally {
        setAnalyzing(null)
      }
    },
    [aiPieces, dossier, product, analyzing, consolidate],
  )

  /**
   * Analyse À LA DEMANDE d'un DOCUMENT GÉNÉRÉ (traduction / version conforme) — politique :
   * conformité au template en vigueur (texte). Résultat consigné comme pour une pièce
   * (remarque positive si aucun constat), cache (genId, updatedAt).
   */
  const analyzeGenerated = useCallback(
    async (genDoc: GeneratedDocRecord) => {
      if (!dossier || !env.isSupabaseConfigured) return
      if (analyzing) return
      setAnalyzing(genDoc.id)
      try {
        let fs = await getCachedAnalysis(genDoc.id, genDoc.updatedAt)
        const cached = !!fs
        if (!fs) {
          fs = await runRegafyConformityTexts(
            [
              {
                id: genDoc.id,
                nodeNumber: genDoc.nodeNumber,
                nodeLabel: flatNodes.find((n) => n.number === genDoc.nodeNumber)?.label ?? '',
                docType:
                  docTypeForNode(dossier.format, genDoc.nodeNumber) ??
                  (genDoc.nodeNumber.startsWith('1.3') ? 'labeling' : 'document'),
                text: tiptapText((genDoc.content ?? {}) as Parameters<typeof tiptapText>[0]).trim(),
              },
            ],
            dossier.country,
          )
          fs = fs.filter((f) => !f.pieceId || f.pieceId === genDoc.id)
          await cacheAnalysis(genDoc.id, genDoc.updatedAt, fs)
        }
        const title = genDoc.title || 'Document'
        const consolidated: RegafyFinding[] =
          fs.length === 0
            ? [
                {
                  id: `analysis:${genDoc.id}`,
                  nodeNumber: genDoc.nodeNumber,
                  nodeLabel: flatNodes.find((n) => n.number === genDoc.nodeNumber)?.label ?? '',
                  severity: 'info',
                  ok: true,
                  source: 'ai',
                  pieceId: genDoc.id,
                  message: tStatic({
                    fr: `${title} : conforme au template en vigueur.`,
                    en: `${title}: compliant with the current template.`,
                  }),
                },
              ]
            : fs
        setAnalysisByPiece((prev) => ({ ...prev, [genDoc.id]: consolidated }))
        // Doc inchangé (cache) : rejoue l'animation de scan VISIBLE, sans réappel IA (recette n°10).
        if (cached) await new Promise((r) => setTimeout(r, 900))
      } catch (e) {
        toast.error(`Analyse impossible : ${(e as Error).message}`)
      } finally {
        setAnalyzing(null)
      }
    },
    [dossier, analyzing, flatNodes],
  )

  /**
   * AUDIT GLOBAL (bouton du gate de compilation) : applique la politique d'analyse à TOUT
   * le dossier — pièces (cache traversé), lettres générées, traductions/versions conformes,
   * exigences structurelles — consigne chaque résultat au panneau Remarques et retourne les
   * données du rapport. Déterministe : seuls les constats réellement émis sont rapportés.
   */
  const runGlobalAudit = useCallback(
    async (opts: {
      tree: CtdNodeDef[]
      genByNode: Map<string, GeneratedDocRecord>
    }): Promise<AuditData | null> => {
      if (!dossier || !env.isSupabaseConfigured || auditProgress) return null
      const countryName = countryLabel(dossier.country, readLang()) || dossier.country || ''
      const agency = agencyFor(dossier.country).name || ''
      const today = new Date().toISOString().slice(0, 10)
      const productName = dossier.productName ?? product?.nomCommercial ?? ''
      const activeGen = (genDocs ?? []).filter((g) => g.deletedAt === null)
      const letters = activeGen.filter((g) => g.templateKey === 'cover' || g.templateKey === 'pght')
      const texts = activeGen.filter(
        (g) => g.templateKey === 'translation' || g.templateKey === 'upgrade',
      )
      const total = aiPieces.length + (letters.length > 0 ? 1 : 0) + (texts.length > 0 ? 1 : 0)
      setAuditProgress({ done: 0, total })
      const labelOf = (num: string) => flatNodes.find((n) => n.number === num)?.label ?? ''
      const pieces: AuditPiece[] = []
      let done = 0
      try {
        // 1) Pièces téléversées — politique standard, par lots de 3, cache (pieceId, sig) traversé.
        for (let i = 0; i < aiPieces.length; i += 3) {
          const chunk = aiPieces.slice(i, i + 3)
          const results = await Promise.all(
            chunk.map(async (piece) => {
              let fs = await getCachedAnalysis(piece.pieceId, piece.sig)
              if (!fs) {
                fs = await runRegafyValidity(
                  [piece],
                  today,
                  agency,
                  officialLanguage(dossier.country),
                  productName,
                  countryName,
                  dossier.country,
                )
                fs = fs.filter((f) => !f.pieceId || f.pieceId === piece.pieceId)
                await cacheAnalysis(piece.pieceId, piece.sig, fs)
              }
              return { piece, fs }
            }),
          )
          for (const { piece, fs } of results) {
            const consolidated = consolidate(piece, fs, countryName)
            setAnalysisByPiece((prev) => ({ ...prev, [piece.pieceId]: consolidated }))
            pieces.push({
              name: piece.fileName,
              nodeNumber: piece.nodeNumber,
              nodeLabel: piece.nodeLabel || labelOf(piece.nodeNumber),
              docType: piece.docType,
              kind: auditPieceKind(piece.docType, piece.category),
              findings: consolidated,
            })
            done += 1
          }
          setAuditProgress({ done, total })
        }
        // 2) Lettres générées (Cover/PGHT) — conformité.
        if (letters.length > 0) {
          const lf = await runRegafyLetters(letters, {
            productName,
            titulaire: product?.titulaire ?? '',
            country: countryName,
            agency,
            operationDate: today,
          })
          for (const g of letters) {
            pieces.push({
              name: g.title || 'Lettre',
              nodeNumber: g.nodeNumber,
              nodeLabel: labelOf(g.nodeNumber),
              docType: g.templateKey,
              kind: 'lettre',
              findings: lf.filter((f) => f.nodeNumber === g.nodeNumber),
            })
          }
          done += 1
          setAuditProgress({ done, total })
        }
        // 3) Traductions / versions conformes — conformité au template (texte).
        if (texts.length > 0) {
          const tf = await runRegafyConformityTexts(
            texts.map((g) => ({
              id: g.id,
              nodeNumber: g.nodeNumber,
              nodeLabel: labelOf(g.nodeNumber),
              docType:
                docTypeForNode(dossier.format, g.nodeNumber) ??
                (g.nodeNumber.startsWith('1.3') ? 'labeling' : 'document'),
              text: tiptapText((g.content ?? {}) as Parameters<typeof tiptapText>[0]).trim(),
            })),
            dossier.country,
          )
          for (const g of texts) {
            pieces.push({
              name: g.title || 'Document généré',
              nodeNumber: g.nodeNumber,
              nodeLabel: labelOf(g.nodeNumber),
              docType: g.templateKey,
              kind: 'texte',
              findings: tf.filter((f) => f.pieceId === g.id),
            })
          }
          done += 1
          setAuditProgress({ done, total })
        }
        // 4) Exigences structurelles (déterministe local) : sections validées sans document,
        // titulaire ≠ fabricant sans contrat, dossier vide…
        const structural = runRegafy({
          tree: opts.tree,
          titulaire: product?.titulaire ?? '',
          fabricant: product?.fabricant,
          docsByNode,
          genByNode: opts.genByNode,
          attachByNode,
        })
        return {
          productName,
          countryName,
          countryCode: dossier.country,
          agency,
          format: formatLabel(dossier.format),
          activity: activityLabel(dossier.activity) || dossier.activity || '',
          date: today,
          pieces,
          structural,
        }
      } catch (e) {
        toast.error(
          tStatic({ fr: 'Audit impossible : ', en: 'Audit failed: ' }) + (e as Error).message,
        )
        return null
      } finally {
        setAuditProgress(null)
      }
    },
    [
      aiPieces,
      dossier,
      product,
      genDocs,
      auditProgress,
      consolidate,
      docsByNode,
      attachByNode,
      flatNodes,
    ],
  )

  /** Purge les remarques d'une pièce (document remplacé). */
  const clearPieceAnalysis = useCallback((pieceId: string) => {
    setAnalysisByPiece((prev) => {
      if (!(pieceId in prev)) return prev
      const next = { ...prev }
      delete next[pieceId]
      return next
    })
  }, [])

  // « Traduire » (M5) : lit le document via l'Edge, crée/MAJ une traduction ÉDITABLE propre au
  // dossier (document généré), puis l'ouvre côte à côte avec l'original. Ne touche jamais au
  // document produit original — c'est une version de conformité pour ce montage uniquement.
  const handleTranslate = useCallback(
    async (f: RegafyFinding) => {
      const piece = aiPieces.find((p) => p.pieceId === f.pieceId)
      if (!piece || !dossier) return
      const openTab = (genId: string) => {
        const node = flatNodes.find((n) => n.number === piece.nodeNumber)
        if (node) onOpenTranslation(node, genId)
      }
      // Cache anti-retraduction : déjà traduit → on rouvre l'onglet (zéro appel IA, zéro gaspillage).
      // Pour forcer une nouvelle traduction : fermer l'onglet (« × ») puis recliquer « Traduire ».
      const existing = (genDocs ?? []).find(
        (g) =>
          g.deletedAt === null &&
          g.templateKey === 'translation' &&
          g.sourceDocId === piece.pieceId,
      )
      if (existing) {
        openTab(existing.id)
        return
      }
      const lang = officialLanguage(dossier.country)
      setTranslating(f.pieceId ?? null)
      setStreamText('')
      try {
        const text = await translateDoc(
          {
            filePath: piece.filePath,
            fileName: piece.fileName,
            docType: piece.docType,
            targetLang: lang,
          },
          setStreamText,
        )
        const rec = await createTranslationDoc(orgId, {
          dossierId: dossier.id,
          nodeNumber: piece.nodeNumber,
          sourceDocId: piece.pieceId,
          title: `${piece.docType.toUpperCase()} — traduction (${lang.toUpperCase()})`,
          content: textToTiptap(text),
        })
        void syncGeneratedDocs(orgId)
        openTab(rec.id)
        toast.success(
          tStatic({
            fr: 'Traduction prête — à relire avant usage.',
            en: 'Translation ready — review before use.',
          }),
        )
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setTranslating(null)
        setStreamText(null)
      }
    },
    [aiPieces, dossier, genDocs, orgId, flatNodes, onOpenTranslation],
  )

  // « Upgrader » (Regafy Upgrade) : produit la VERSION CONFORME au template en vigueur dans un
  // onglet à côté (document généré éditable), à partir de la pièce uploadée OU de sa traduction.
  // Zéro invention : les rubriques absentes de la source sont marquées [NON FOURNI…] — à
  // compléter par l'utilisateur (bannière de revue). L'original n'est jamais modifié.
  const handleUpgrade = useCallback(
    async (f: RegafyFinding) => {
      if (!dossier || !f.pieceId) return
      const openTab = (nodeNumber: string, genId: string) => {
        const node = flatNodes.find((n) => n.number === nodeNumber)
        if (node) onOpenTranslation(node, genId)
      }
      // Anti-relance : une version conforme existe déjà pour cette source → rouvrir l'onglet.
      // Pour forcer une nouvelle version : fermer l'onglet (« × ») puis recliquer « Upgrader ».
      const existing = (genDocs ?? []).find(
        (g) => g.deletedAt === null && g.templateKey === 'upgrade' && g.sourceDocId === f.pieceId,
      )
      if (existing) {
        openTab(existing.nodeNumber, existing.id)
        return
      }
      // Source : pièce uploadée (le PDF est lu par l'Edge) OU traduction (texte du doc généré).
      const piece = aiPieces.find((p) => p.pieceId === f.pieceId)
      const genSource = piece
        ? undefined
        : (genDocs ?? []).find((g) => g.id === f.pieceId && g.deletedAt === null)
      const docType =
        piece?.docType ?? aiPieces.find((p) => p.pieceId === genSource?.sourceDocId)?.docType
      if ((!piece && !genSource) || !docType) return
      const nodeNumber = piece?.nodeNumber ?? genSource!.nodeNumber

      // Contexte certifié du dossier (fiche produit) : rubrique 9 auto-résolue pour une
      // nouvelle AMM, 7.1 Titulaire / 7.2 Fabricant quand ils diffèrent — données vérifiées,
      // utilisables par « Générer » au même titre que le document source.
      const dossierContext = {
        activity: dossier.activity,
        titulaire: product?.titulaire,
        titulaireAdresse: product?.titulaireAdresse,
        fabricant: product?.fabricant,
        fabricantAdresse: product?.fabricantAdresse,
      }
      setUpgrading(f.pieceId)
      setStreamText('')
      try {
        const text = await upgradeDoc(
          piece
            ? {
                filePath: piece.filePath,
                fileName: piece.fileName,
                docType,
                countryCode: dossier.country,
                dossierContext,
              }
            : {
                text: tiptapText(
                  (genSource!.content ?? {}) as Parameters<typeof tiptapText>[0],
                ).trim(),
                docType,
                countryCode: dossier.country,
                dossierContext,
              },
          setStreamText,
        )
        const baseName = (piece?.fileName ?? genSource?.title ?? docType).replace(/\.[^.]+$/, '')
        const rec = await createUpgradeDoc(orgId, {
          dossierId: dossier.id,
          nodeNumber,
          sourceDocId: f.pieceId,
          title: `${baseName} — version conforme`,
          content: textToTiptap(text),
        })
        void syncGeneratedDocs(orgId)
        openTab(nodeNumber, rec.id)
        toast.success(
          tStatic({
            fr: 'Version conforme prête — à relire.',
            en: 'Compliant version ready — review it.',
          }),
          {
            description: tStatic({
              fr: 'Complétez les rubriques marquées [NON FOURNI DANS LE DOCUMENT SOURCE].',
              en: 'Complete the sections marked [NON FOURNI DANS LE DOCUMENT SOURCE].',
            }),
          },
        )
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setUpgrading(null)
        setStreamText(null)
      }
    },
    [aiPieces, dossier, genDocs, orgId, flatNodes, onOpenTranslation],
  )

  // Traduction d'un DOCUMENT GÉNÉRÉ (version conforme, template rempli) — « conformité d'abord,
  // traduction après » : la version conforme non-FR porte le bouton « Traduire ». La traduction
  // produite n'est PAS re-soumise au constat de conformité (sa source n'est pas une pièce).
  const handleTranslateGenerated = useCallback(
    async (genDoc: GeneratedDocRecord) => {
      if (!dossier) return
      const openTab = (genId: string) => {
        const node = flatNodes.find((n) => n.number === genDoc.nodeNumber)
        if (node) onOpenTranslation(node, genId)
      }
      const existing = (genDocs ?? []).find(
        (g) =>
          g.deletedAt === null && g.templateKey === 'translation' && g.sourceDocId === genDoc.id,
      )
      if (existing) {
        openTab(existing.id)
        return
      }
      const docType =
        docTypeForNode(dossier.format, genDoc.nodeNumber) ??
        (genDoc.nodeNumber.startsWith('1.3') ? 'labeling' : 'document')
      const lang = officialLanguage(dossier.country)
      setTranslating(genDoc.id)
      setStreamText('')
      try {
        const text = await translateDoc(
          {
            text: tiptapText((genDoc.content ?? {}) as Parameters<typeof tiptapText>[0]).trim(),
            docType,
            targetLang: lang,
          },
          setStreamText,
        )
        const rec = await createTranslationDoc(orgId, {
          dossierId: dossier.id,
          nodeNumber: genDoc.nodeNumber,
          sourceDocId: genDoc.id,
          title: `${docType.toUpperCase()} — traduction (${lang.toUpperCase()})`,
          content: textToTiptap(text),
        })
        void syncGeneratedDocs(orgId)
        openTab(rec.id)
        toast.success(
          tStatic({
            fr: 'Traduction prête — à relire avant usage.',
            en: 'Translation ready — review before use.',
          }),
        )
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setTranslating(null)
        setStreamText(null)
      }
    },
    [dossier, genDocs, orgId, flatNodes, onOpenTranslation],
  )

  return {
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
    handleUpgrade,
  }
}
