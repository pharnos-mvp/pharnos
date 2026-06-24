// Garde-fous d'upload (T5, PLAN-V2) : nom de fichier assaini + whitelist de types.
// Le nom choisi par l'utilisateur est injecté dans le chemin Storage (`org/…/id/fileName`) :
// on neutralise séparateurs et caractères réservés (anti path-traversal, compat Windows/S3),
// et on n'accepte que les formats que l'app sait réellement traiter.

/** Plafond commun de taille d'un fichier téléversé (documents produit ET pièces jointes). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 Mo

// Formats acceptés : PDF + images (aperçu, analyse IA, compilation) + bureautique courante
// (annexes). Les types à risque (html, svg — XSS, exécutables…) sont volontairement exclus.
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xlsx'])

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/** Valeur pour l'attribut `accept` des inputs file (premier filtre, côté navigateur). */
export const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xlsx'

const extOf = (name: string): string => name.toLowerCase().split('.').pop() ?? ''

/**
 * Type accepté si le MIME OU l'extension est whitelisté : sous Windows le MIME déclaré est
 * souvent vide ou générique (application/octet-stream), l'extension fait alors foi.
 */
export function isAllowedUpload(file: { name: string; type: string }): boolean {
  return ALLOWED_MIMES.has(file.type) || ALLOWED_EXTENSIONS.has(extOf(file.name))
}

// MIME canonique par extension — couvre exactement ALLOWED_EXTENSIONS.
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/**
 * Content-Type FIABLE à poser sur l'objet Storage : le MIME navigateur s'il est déjà dans
 * l'allowlist, sinon dérivé de l'extension (sous Windows le MIME est souvent vide/octet-stream →
 * un PDF était stocké en `application/octet-stream`). Garantit qu'un upload accepté par
 * `isAllowedUpload` passe aussi la `allowed_mime_types` du bucket (backstop serveur N3).
 */
export function contentTypeFor(file: { name: string; type?: string | null }): string {
  if (file.type && ALLOWED_MIMES.has(file.type)) return file.type
  return MIME_BY_EXT[extOf(file.name)] ?? 'application/octet-stream'
}

/** Message d'erreur FR unique (toasts + throw des repositories). */
export const UPLOAD_TYPE_ERROR =
  'Format non pris en charge — formats acceptés : PDF, PNG, JPG, WebP, DOCX, XLSX.'

export const UPLOAD_SIZE_ERROR = 'Fichier trop lourd (max 25 Mo).'

/**
 * Assainit un nom de fichier utilisateur avant stockage :
 * séparateurs de chemin et caractères réservés (Windows/URL) remplacés, contrôles retirés,
 * espaces normalisés, longueur bornée à 120 caractères en préservant l'extension.
 */
export function sanitizeFileName(name: string): string {
  const normalized = (name || '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- les caractères de contrôle sont la cible
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows interdit points/espaces en fin de nom.
    .replace(/[. ]+$/, '')

  if (!normalized) return 'document'

  const MAX = 120
  if (normalized.length <= MAX) return normalized
  const dot = normalized.lastIndexOf('.')
  // Extension raisonnable (≤ 10 chars) préservée, base tronquée.
  if (dot > 0 && normalized.length - dot <= 11) {
    const ext = normalized.slice(dot)
    return normalized.slice(0, MAX - ext.length).replace(/[. ]+$/, '') + ext
  }
  return normalized.slice(0, MAX).replace(/[. ]+$/, '')
}
