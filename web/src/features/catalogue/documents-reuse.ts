/**
 * « Piocher depuis la base » (PLAN-ORG-REFERENTIEL §2) : réutiliser une pièce de la base
 * documentaire d'une ORGANISATION (docs org-scopés, 0069) vers un PRODUIT, en COPIE LIÉE —
 * nouveau document produit-scopé (blob + métadonnées dupliqués) avec provenance `sourceDocId`
 * (0070). Module séparé du repository : il consomme AUSSI la couche sync (téléchargement Storage),
 * qui elle-même importe le repository — le garder ici évite le cycle d'imports.
 */
import { db, type DocumentRecord } from '@/lib/db'
import { tStatic } from '@/lib/i18n-context'
import { categoryForDocType } from './doc-types'
import { addDocument, cacheDocumentBlob, getDocumentBlob } from './documents-repository'
import { downloadDocumentBlob } from './documents-sync'

/**
 * Parties SOURCES légitimes pour un type de pièce (mapping CEO §2) :
 *  • documents d'information + AMM → base du TITULAIRE (MAH) ;
 *  • pièces administratives → base du FABRICANT ;
 *  • le CONTRAT titulaire–fabricant vit des deux côtés (matrice §1) → les deux bases.
 * Rôles cumulés (même org titulaire ET fabricant) : ids identiques, dédupliqués.
 */
export function sourcePartyIdsFor(
  docType: string,
  titulaireId: string | null | undefined,
  fabricantId: string | null | undefined,
): string[] {
  const fromMah = categoryForDocType(docType, 'info') === 'info' || docType === 'amm'
  const ids =
    docType === 'contract' ? [titulaireId, fabricantId] : fromMah ? [titulaireId] : [fabricantId]
  return [...new Set(ids.filter((id): id is string => !!id))]
}

/** Documents ORG-scopés NON SUPPRIMÉS des parties données (base « piochable »), récents d'abord. */
export async function listPartyDocs(
  orgId: string,
  partyIds: readonly string[],
): Promise<DocumentRecord[]> {
  if (partyIds.length === 0) return []
  const wanted = new Set(partyIds)
  const items = await db.documents.where('orgId').equals(orgId).toArray()
  return items
    .filter((d) => d.deletedAt === null && !!d.partyId && wanted.has(d.partyId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Blob d'une pièce de la base : cache local d'abord (épinglé par la sync), sinon Storage. */
async function resolveSourceBlob(src: DocumentRecord): Promise<Blob | null> {
  const local = await getDocumentBlob(src.id)
  if (local) return local
  if (!src.filePath) return null
  const remote = await downloadDocumentBlob(src.filePath)
  // Épingle la source en local au passage (offline-first, comme `pinMissingDocumentBlobs`).
  if (remote) await cacheDocumentBlob(src.id, remote)
  return remote
}

/**
 * Reconstruit un `File` prêt à réutiliser depuis une pièce de la base (nom + type MIME d'origine).
 * `null` = blob indisponible (hors-ligne et pas encore épinglé) — l'appelant affiche l'erreur.
 * Utilisé par le wizard produit (buffer de brouillons) ET par la copie directe ci-dessous.
 */
export async function sourceDocFile(src: DocumentRecord): Promise<File | null> {
  const blob = await resolveSourceBlob(src)
  if (!blob) return null
  return new File([blob], src.fileName, {
    type: src.mimeType || blob.type || 'application/octet-stream',
  })
}

export const SOURCE_BLOB_UNAVAILABLE = {
  fr: 'Fichier de la base indisponible hors-ligne.',
  en: 'Base file unavailable offline.',
}

/**
 * COPIE LIÉE d'une pièce org-scopée vers un produit : blob copié + métadonnées héritées +
 * `sourceDocId`. Passe par `addDocument` → même pipeline offline-first (Dexie + outbox + audit),
 * le blob copié est re-téléversé sous le chemin produit au prochain cycle de sync. La catégorie
 * est la CANONIQUE du type (une COA legacy `category:'info'` redevient une pièce admin).
 */
export async function copyDocumentToProduct(
  orgId: string,
  productId: string,
  sourceId: string,
): Promise<DocumentRecord> {
  const src = await db.documents.get(sourceId)
  if (!src || src.deletedAt !== null || src.orgId !== orgId) {
    throw new Error(tStatic({ fr: 'Pièce source introuvable.', en: 'Source document not found.' }))
  }
  const file = await sourceDocFile(src)
  if (!file) throw new Error(tStatic(SOURCE_BLOB_UNAVAILABLE))
  return addDocument(orgId, productId, {
    category: categoryForDocType(src.docType, src.category),
    docType: src.docType,
    file,
    language: src.language,
    expiryDate: src.expiryDate,
    issueDate: src.issueDate,
    reference: src.reference,
    holder: src.holder,
    country: src.country,
    batchNumber: src.batchNumber,
    sourceDocId: src.id,
  })
}
