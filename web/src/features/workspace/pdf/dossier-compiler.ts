import { getDocumentBlob } from '@/features/catalogue/documents-repository'
import { getDocumentDownloadUrl } from '@/features/catalogue/documents-sync'
import type {
  DocumentRecord,
  DossierAttachmentRecord,
  DossierRecord,
  GeneratedDocRecord,
  ProductRecord,
  ProSettingRecord,
} from '@/lib/db'
import { getAttachmentBlob } from '../dossier-attachments-repository'
import { getAttachmentDownloadUrl } from '../dossier-attachments-sync'
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

async function urlToBytes(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return { bytes: new Uint8Array(buf), mime: res.headers.get('content-type') ?? '' }
  } catch {
    return null
  }
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
    const url = await getAttachmentDownloadUrl(a.filePath)
    if (url) {
      const out = await urlToBytes(url)
      if (out)
        return {
          bytes: out.bytes,
          mime: a.mimeType || out.mime || inferMime(a.fileName),
          fileName: a.fileName,
        }
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
    const url = await getDocumentDownloadUrl(d.filePath)
    if (url) {
      const out = await urlToBytes(url)
      if (out)
        return {
          bytes: out.bytes,
          mime: d.mimeType || out.mime || inferMime(d.fileName),
          fileName: d.fileName,
        }
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
      c = { pieces: [] }
      contentByNumber.set(n, c)
    }
    return c
  }
  const missing: string[] = []

  for (const g of generatedDocs) ensure(g.nodeNumber).generated = g

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

  const dciDose = [product?.dci, product?.dosage].filter((x) => x && x.trim()).join(' ')
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
    logo,
    header,
    footer,
    cover,
    autoStructural,
    contentByNumber,
  })
  return { bytes, missing }
}
