import { cacheDocumentBlob, getDocumentBlob } from '@/features/catalogue/documents-repository'
import { downloadDocumentBlob } from '@/features/catalogue/documents-sync'
import type {
  DocumentRecord,
  DossierAttachmentRecord,
  DossierRecord,
  GeneratedDocRecord,
  ProductRecord,
  ProSettingRecord,
} from '@/lib/db'
import { formatComposition } from '../composition'
import { cacheAttachmentBlob, getAttachmentBlob } from '../dossier-attachments-repository'
import { downloadAttachmentBlob } from '../dossier-attachments-sync'
import { activityLabel, countryLabel } from '../dossier-constants'
import { nodeForDocType, resolveExistingNode, treeNodeNumbers } from '../module1-tree'
import {
  compileDossier,
  dataUrlToBytes,
  type CompileNodeContent,
  type CompilePiece,
} from './compile-dossier'

function inferMime(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return ''
}

async function attachmentPiece(a: DossierAttachmentRecord): Promise<CompilePiece | null> {
  const blob = await getAttachmentBlob(a.id)
  if (blob) {
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: a.mimeType || blob.type || inferMime(a.fileName),
      fileName: a.fileName,
    }
  }
  if (a.filePath) {
    const remote = await downloadAttachmentBlob(a.filePath)
    if (remote) {
      const mime = a.mimeType || remote.type || inferMime(a.fileName)
      // Offline-first : épingle le fichier en local pour les compilations hors-ligne suivantes.
      void cacheAttachmentBlob(a.id, remote)
      return { bytes: new Uint8Array(await remote.arrayBuffer()), mime, fileName: a.fileName }
    }
  }
  return null
}

async function docPiece(d: DocumentRecord): Promise<CompilePiece | null> {
  const blob = await getDocumentBlob(d.id)
  if (blob) {
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: d.mimeType || blob.type || inferMime(d.fileName),
      fileName: d.fileName,
    }
  }
  if (d.filePath) {
    const remote = await downloadDocumentBlob(d.filePath)
    if (remote) {
      const mime = d.mimeType || remote.type || inferMime(d.fileName)
      // Offline-first : épingle le fichier en local pour les compilations hors-ligne suivantes.
      void cacheDocumentBlob(d.id, remote)
      return { bytes: new Uint8Array(await remote.arrayBuffer()), mime, fileName: d.fileName }
    }
  }
  return null
}

export interface CompileArgs {
  dossier: DossierRecord
  product?: ProductRecord
  generatedDocs: GeneratedDocRecord[]
  docs: DocumentRecord[]
  attachments: DossierAttachmentRecord[]
  branding?: ProSettingRecord
  autoStructural: boolean
}

export interface CompileResult {
  bytes: Uint8Array
  /** Noms des pièces non incluses (indisponibles hors-ligne). */
  missing: string[]
}

/** Rassemble le contenu d'un dossier (lettres, pièces, produit) et le compile en PDF. */
export async function compileDossierToPdf(args: CompileArgs): Promise<CompileResult> {
  const { dossier, product, generatedDocs, docs, attachments, branding, autoStructural } = args

  const contentByNumber = new Map<string, CompileNodeContent>()
  const ensure = (n: string): CompileNodeContent => {
    let c = contentByNumber.get(n)
    if (!c) {
      c = { generated: [], pieces: [] }
      contentByNumber.set(n, c)
    }
    return c
  }
  const missing: string[] = []

  // TOUS les documents générés du nœud (lettre + template rempli + traduction + version
  // conforme coexistent en onglets) — chacun est compilé. L'ancienne affectation simple
  // écrasait : seul un document par nœud survivait (bug recette CEO : formulaire RCP absent).
  for (const g of generatedDocs) ensure(g.nodeNumber).generated.push(g)

  for (const a of attachments) {
    const piece = await attachmentPiece(a)
    if (piece) {
      ensure(a.nodeNumber).pieces.push(piece)
    } else {
      ensure(a.nodeNumber).pieces.push({
        bytes: new Uint8Array(),
        mime: '',
        fileName: a.fileName,
        missing: true,
      })
      missing.push(a.fileName)
    }
  }

  const treeNumbers = treeNodeNumbers(dossier.tree)
  for (const d of docs) {
    const node = resolveExistingNode(
      treeNumbers,
      nodeForDocType(dossier.format, d.docType, d.category),
    )
    const piece = await docPiece(d)
    if (piece) {
      ensure(node).pieces.push(piece)
    } else {
      ensure(node).pieces.push({
        bytes: new Uint8Array(),
        mime: '',
        fileName: d.fileName,
        missing: true,
      })
      missing.push(d.fileName)
    }
  }

  const dciDose = formatComposition(product?.dci ?? '', product?.dosage ?? '')
  const commercialLine = dciDose ? `${dossier.productName} (${dciDose})` : dossier.productName

  const logo = branding?.logoImage ? dataUrlToBytes(branding.logoImage) : null
  const header = branding?.headerImage ? dataUrlToBytes(branding.headerImage) : null
  const footer = branding?.footerImage ? dataUrlToBytes(branding.footerImage) : null

  const monthYear = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const cover = product
    ? {
        activity: activityLabel(dossier.activity),
        nomCommercial: product.nomCommercial || dossier.productName,
        dciDosage: dciDose,
        titulaireName: product.titulaire?.trim() ?? '',
        titulaireAddress: product.titulaireAdresse?.trim() ?? '',
        fabricantName: product.fabricant?.trim() ?? '',
        fabricantAddress: product.fabricantAdresse?.trim() ?? '',
        dateLabel: monthYear.charAt(0).toUpperCase() + monthYear.slice(1),
      }
    : null

  const bytes = await compileDossier({
    tree: dossier.tree,
    moduleLabel: 'Module 1',
    country: countryLabel(dossier.country),
    titulaire: product?.titulaire?.trim() || '[Titulaire]',
    commercialLine,
    productName: dossier.productName,
    logo,
    header,
    footer,
    cover,
    autoStructural,
    contentByNumber,
  })
  return { bytes, missing }
}
