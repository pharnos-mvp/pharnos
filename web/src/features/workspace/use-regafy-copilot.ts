import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type {
  DocumentRecord,
  DossierAttachmentRecord,
  DossierRecord,
  GeneratedDocRecord,
  ProductRecord,
} from '@/lib/db'
import { env } from '@/lib/env'
import { countryLabel } from './dossier-constants'
import { createTranslationDoc, createUpgradeDoc } from './generated-docs-repository'
import { syncGeneratedDocs } from './generated-docs-sync'
import { docTypeForNode, type CtdNodeDef } from './module1-tree'
import { agencyFor, officialLanguage } from './roadmap-data'
import { tiptapText, type RegafyFinding } from './regafy'
import {
  runRegafyConformityTexts,
  runRegafyLetters,
  runRegafyValidity,
  UPGRADE_DOC_TYPES,
  type RegafyAiPiece,
} from './regafy-ai'
import { cacheAnalysis, getCachedAnalysis } from './regafy-cache'
import { textToTiptap, translateDoc } from './translate-doc'
import { upgradeDoc } from './upgrade-doc'

/**
 * Copilote Regafy IA du workspace (extrait move-only de DossierWorkspacePage — T7.2) :
 * - validité des pièces (multimodal, incrémental, cache par document) ;
 * - conformité des lettres générées ;
 * - traduction d'un document (crée un doc généré éditable, propre au dossier).
 * Assistif uniquement : ne bloque jamais la compilation.
 */
export function useRegafyCopilot({
  dossierId,
  dossier,
  product,
  genDocs,
  docsByNode,
  attachByNode,
  flatNodes,
  orgId,
  onOpenTranslation,
}: {
  dossierId: string | undefined
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
  const [validityByPiece, setValidityByPiece] = useState<Record<string, RegafyFinding[]>>({})
  const [letterFindings, setLetterFindings] = useState<RegafyFinding[]>([])
  /** Constats de conformité au template des TRADUCTIONS, par id de document généré. */
  const [translationConformity, setTranslationConformity] = useState<
    Record<string, RegafyFinding[]>
  >({})
  const [aiBusy, setAiBusy] = useState(false)
  const [translating, setTranslating] = useState<string | null>(null)
  /** Source (pieceId/genId) en cours de mise en conformité — null sinon. */
  const [upgrading, setUpgrading] = useState<string | null>(null)
  /** Texte (traduction OU version conforme) reçu au fil de l'eau (SSE) — null hors opération. */
  const [streamText, setStreamText] = useState<string | null>(null)
  const analyzedPieceIds = useRef<Set<string>>(new Set())
  /** Traductions analysées, clé `id:updatedAt` — une édition (sig changée) ré-analyse. */
  const analyzedTranslationSigs = useRef<Set<string>>(new Set())

  // Constats : déterministes + copilote IA (validité par pièce + conformité des lettres et des
  // traductions). Même affichage, en complément ; ne bloque jamais la compilation.
  const aiFindings = useMemo(
    () => [
      ...Object.values(validityByPiece).flat(),
      ...letterFindings,
      ...Object.values(translationConformity).flat(),
    ],
    [validityByPiece, letterFindings, translationConformity],
  )

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
            })
          }
        }
      }
    }
    return out
  }, [docsByNode, attachByNode, flatNodes, dossier])

  // Signature stable du jeu de pièces (ids triés) → l'analyse se déclenche sur un VRAI changement de
  // pièces, pas à chaque tick de la synchro Dexie (sinon le debounce est relancé en boucle → démarrage
  // lent). dossier/aiPieces sont stables pour une signature donnée.
  const piecesSig = useMemo(
    () =>
      aiPieces
        .map((p) => `${p.pieceId}:${p.sig}`)
        .sort()
        .join('|'),
    [aiPieces],
  )

  // (Pas de reset manuel : l'app-shell remonte la page via `key={location.pathname}` au changement
  // de dossier → l'état du copilote repart à zéro automatiquement.)

  // Copilote — VALIDITÉ (incrémental) : à l'ouverture, 1 batch sur toutes les pièces ; puis seulement
  // les **nouvelles** pièces à chaque upload. Réconcilie les retraits. Silencieux (échec en console).
  useEffect(() => {
    if (!env.isSupabaseConfigured || !dossier) return
    const currentIds = new Set(aiPieces.map((p) => p.pieceId))
    setValidityByPiece((prev) => {
      let changed = false
      const next: Record<string, RegafyFinding[]> = {}
      for (const [id, f] of Object.entries(prev)) {
        if (currentIds.has(id)) next[id] = f
        else {
          changed = true
          analyzedPieceIds.current.delete(id)
        }
      }
      return changed ? next : prev
    })
    const newPieces = aiPieces.filter((p) => !analyzedPieceIds.current.has(p.pieceId))
    if (newPieces.length === 0) return
    const agencySigle = agencyFor(dossier.country).name || ''
    const targetLang = officialLanguage(dossier.country)
    const productName = dossier.productName ?? product?.nomCommercial ?? ''
    const countryName = countryLabel(dossier.country) || dossier.country || ''
    const today = new Date().toISOString().slice(0, 10)
    const t = setTimeout(() => {
      void (async () => {
        // 1. Cache : constats des documents déjà analysés (inchangés) → instantané, ZÉRO appel IA.
        const fromCache: Record<string, RegafyFinding[]> = {}
        const uncached: RegafyAiPiece[] = []
        for (const p of newPieces) {
          analyzedPieceIds.current.add(p.pieceId)
          const cached = await getCachedAnalysis(p.pieceId, p.sig)
          if (cached) fromCache[p.pieceId] = cached
          else uncached.push(p)
        }
        if (Object.keys(fromCache).length > 0) {
          setValidityByPiece((prev) => ({ ...prev, ...fromCache }))
        }
        // 2. IA : SEULEMENT les documents jamais analysés (nouveaux ou remplacés). Envoi par
        // chunks de 3 → les premiers constats s'affichent AU FIL DE L'EAU sans attendre tout le
        // lot (l'Edge analyse déjà 1 doc par appel ; zéro changement serveur). Sur un dossier de
        // 12 pièces, le premier retour arrive ~4× plus tôt.
        if (uncached.length === 0) return
        setAiBusy(true)
        const CHUNK = 3
        let next = 0 // index de la 1re pièce non encore traitée (pour re-tenter après échec)
        try {
          for (; next < uncached.length; next += CHUNK) {
            const slice = uncached.slice(next, next + CHUNK)
            const fs = await runRegafyValidity(
              slice,
              today,
              agencySigle,
              targetLang,
              productName,
              countryName,
              dossier.country,
            )
            const byPiece: Record<string, RegafyFinding[]> = {}
            for (const p of slice) byPiece[p.pieceId] = []
            for (const f of fs) if (f.pieceId) (byPiece[f.pieceId] ??= []).push(f)
            // « Conformité d'abord » : sur les types couverts par un template, la traduction est
            // proposée APRÈS la mise en conformité (sur la version conforme) — le constat de
            // langue de l'ORIGINAL devient informatif (plus de bouton Traduire ici).
            for (const p of slice) {
              if (!UPGRADE_DOC_TYPES.has(p.docType)) continue
              byPiece[p.pieceId] = (byPiece[p.pieceId] ?? []).map((f) =>
                f.translate
                  ? {
                      ...f,
                      translate: undefined,
                      message: `${f.message.replace(/\s*Traduction recommandée\.\s*$/, '')} Traduction proposée après mise en conformité.`,
                    }
                  : f,
              )
            }
            await Promise.all(
              slice.map((p) => cacheAnalysis(p.pieceId, p.sig, byPiece[p.pieceId] ?? [])),
            )
            setValidityByPiece((prev) => ({ ...prev, ...byPiece }))
          }
        } catch (e) {
          // Seules les pièces NON traitées sont dé-marquées (les chunks réussis restent cachés).
          uncached.slice(next).forEach((p) => analyzedPieceIds.current.delete(p.pieceId))
          console.error('Regafy IA (validité) :', (e as Error).message)
        } finally {
          setAiBusy(false)
        }
      })()
    }, 1500)
    return () => clearTimeout(t)
    // Déclenché sur piecesSig (id + sig), pas sur le ref de l'array aiPieces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId, piecesSig])

  // Copilote — LETTRES : conformité des lettres générées (à l'ouverture + à chaque modification).
  useEffect(() => {
    if (!env.isSupabaseConfigured || !dossier || genDocs === undefined || genDocs.length === 0)
      return
    const agency = agencyFor(dossier.country)
    const t = setTimeout(() => {
      setAiBusy(true)
      void runRegafyLetters(
        genDocs.filter((g) => g.templateKey !== 'translation' && g.templateKey !== 'upgrade'),
        {
          productName: dossier.productName ?? product?.nomCommercial ?? '',
          titulaire: product?.titulaire ?? '',
          country: countryLabel(dossier.country) || dossier.country || '',
          agency: agency.full ? `${agency.full} (${agency.name})` : '',
          operationDate: new Date().toISOString().slice(0, 10),
        },
      )
        .then((fs) => setLetterFindings(fs))
        .catch((e) => console.error('Regafy IA (lettres) :', (e as Error).message))
        .finally(() => setAiBusy(false))
    }, 1500)
    return () => clearTimeout(t)
  }, [dossier, genDocs, product])

  // Copilote — CONFORMITÉ DES TRADUCTIONS (Regafy Upgrade) : un document traduit est vérifié
  // contre le template en vigueur de son type (chaînage : constat de langue → Traduire →
  // constat de conformité → Upgrader). Cache par (id, updatedAt) ; debounce long (8 s) pour ne
  // pas ré-analyser à chaque sauvegarde pendant l'édition — le constat se met à jour après une
  // pause, et disparaît quand l'utilisateur a corrigé les rubriques manquantes.
  useEffect(() => {
    if (!env.isSupabaseConfigured || !dossier || genDocs === undefined) return
    const translations = genDocs
      .filter((g) => g.deletedAt === null && g.templateKey === 'translation' && g.sourceDocId)
      .map((g) => {
        const src = aiPieces.find((p) => p.pieceId === g.sourceDocId)
        return src && UPGRADE_DOC_TYPES.has(src.docType) ? { gen: g, docType: src.docType } : null
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)

    const currentIds = new Set(translations.map((t) => t.gen.id))
    const pending = translations.filter(
      (t) => !analyzedTranslationSigs.current.has(`${t.gen.id}:${t.gen.updatedAt}`),
    )
    const countryCode = dossier.country
    const t = setTimeout(() => {
      void (async () => {
        // Réconcilie les suppressions (onglet fermé → constat retiré).
        setTranslationConformity((prev) => {
          let changed = false
          const next: Record<string, RegafyFinding[]> = {}
          for (const [id, f] of Object.entries(prev)) {
            if (currentIds.has(id)) next[id] = f
            else changed = true
          }
          return changed ? next : prev
        })
        if (pending.length === 0) return
        // 1. Cache : traduction inchangée déjà analysée → constats instantanés, zéro appel IA.
        const uncached: typeof pending = []
        for (const p of pending) {
          analyzedTranslationSigs.current.add(`${p.gen.id}:${p.gen.updatedAt}`)
          const cached = await getCachedAnalysis(p.gen.id, p.gen.updatedAt)
          if (cached) setTranslationConformity((prev) => ({ ...prev, [p.gen.id]: cached }))
          else uncached.push(p)
        }
        if (uncached.length === 0) return
        setAiBusy(true)
        try {
          const texts = uncached.map((p) => ({
            id: p.gen.id,
            nodeNumber: p.gen.nodeNumber,
            nodeLabel: p.gen.title ?? '',
            docType: p.docType,
            text: tiptapText((p.gen.content ?? {}) as Parameters<typeof tiptapText>[0]).trim(),
          }))
          const fs = await runRegafyConformityTexts(
            texts.filter((t) => t.text.length > 0),
            countryCode,
          )
          const byGen: Record<string, RegafyFinding[]> = {}
          for (const p of uncached) byGen[p.gen.id] = []
          for (const f of fs) if (f.pieceId) (byGen[f.pieceId] ??= []).push(f)
          await Promise.all(
            uncached.map((p) => cacheAnalysis(p.gen.id, p.gen.updatedAt, byGen[p.gen.id] ?? [])),
          )
          setTranslationConformity((prev) => ({ ...prev, ...byGen }))
        } catch (e) {
          uncached.forEach((p) =>
            analyzedTranslationSigs.current.delete(`${p.gen.id}:${p.gen.updatedAt}`),
          )
          console.error('Regafy IA (conformité traductions) :', (e as Error).message)
        } finally {
          setAiBusy(false)
        }
      })()
    }, 8000)
    return () => clearTimeout(t)
    // aiPieces est couvert par piecesSig (signature stable) — même pattern que l'effet validité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier, genDocs, piecesSig])

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
        toast.success('Traduction prête — à relire avant usage.')
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
              }
            : {
                text: tiptapText(
                  (genSource!.content ?? {}) as Parameters<typeof tiptapText>[0],
                ).trim(),
                docType,
                countryCode: dossier.country,
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
        toast.success('Version conforme prête — à relire.', {
          description: 'Complétez les rubriques marquées [NON FOURNI DANS LE DOCUMENT SOURCE].',
        })
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setUpgrading(null)
        setStreamText(null)
      }
    },
    [aiPieces, dossier, genDocs, orgId, flatNodes, onOpenTranslation],
  )

  return {
    aiFindings,
    translatedSourceIds,
    aiBusy,
    translating,
    upgrading,
    streamText,
    handleTranslate,
    handleUpgrade,
  }
}
