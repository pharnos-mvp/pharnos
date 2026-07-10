import type { CorrespondenceMessageRecord } from '@/lib/db'
import { contentTypeFor } from '@/lib/files'
import { tStatic } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'

export type MessageAttachment = CorrespondenceMessageRecord['attachments'][number]

const BUCKET = 'documents'

/**
 * Pièces jointes du composeur (côté LABO) — plafonds/types MIROIR de l'Edge
 * `share.storeAttachments` (côté reviewer), appliqués ICI côté client ; côté serveur, ce chemin
 * direct n'est borné que par le bucket (allowlist MIME + 50 Mo, `0036`/`0043`) et la RLS org
 * (`0048`) — un client trafiqué ne peut donc dépasser les plafonds QUE dans le Storage de sa
 * propre org (risque assumé, revue CTO). Upload DIRECT Storage (session authentifiée,
 * `{orgId}/shares/{corrId}/…` déjà couvert par préfixe — zéro migration) ; online-only par
 * nature, comme l'envoi du dossier.
 */
export const ATTACH_MAX_COUNT = 3
export const ATTACH_MAX_BYTES = 4 * 1024 * 1024 // 4 Mo — MAX_ATTACHMENT_BYTES de l'Edge
/** Valeur `accept` de l'input fichier (extensions = ALLOWED_ATTACH_EXTS de l'Edge). */
export const ATTACH_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx'

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx'])

const extOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? ''

/** Réplique `sanitizeName` de l'Edge : NFKC, contrôle/réservés retirés, 120 chars max (fin). */
export function sanitizeAttachmentName(name: string): string {
  const normalized = (name || '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  if (!normalized) return 'piece-jointe'
  return normalized.length <= 120 ? normalized : normalized.slice(-120)
}

/**
 * Valide une sélection AVANT ajout aux pièces en attente (nombre cumulé, taille, type) —
 * erreur déjà localisée, prête pour le toast. PURE (testée).
 */
export function validateAttachmentFiles(
  files: File[],
  existingCount: number,
): { ok: true } | { ok: false; error: string } {
  if (files.length === 0) return { ok: true }
  if (existingCount + files.length > ATTACH_MAX_COUNT) {
    return {
      ok: false,
      error: tStatic({
        fr: `${ATTACH_MAX_COUNT} pièces maximum par message.`,
        en: `${ATTACH_MAX_COUNT} attachments maximum per message.`,
      }),
    }
  }
  for (const f of files) {
    if (f.size === 0 || f.size > ATTACH_MAX_BYTES) {
      return {
        ok: false,
        error: tStatic({
          fr: `« ${f.name} » dépasse 4 Mo (ou est vide).`,
          en: `“${f.name}” exceeds 4 MB (or is empty).`,
        }),
      }
    }
    if (!ALLOWED_MIMES.has(f.type) && !ALLOWED_EXTS.has(extOf(f.name))) {
      return {
        ok: false,
        error: tStatic({
          fr: `« ${f.name} » : type non pris en charge (PDF, PNG, JPG, WEBP, DOCX).`,
          en: `“${f.name}”: unsupported type (PDF, PNG, JPG, WEBP, DOCX).`,
        }),
      }
    }
  }
  return { ok: true }
}

/**
 * Téléverse les pièces du composeur vers `{orgId}/shares/{corrId}/sender/{uuid}-{nom}` —
 * write-once (`upsert: false`, l'uuid rend le chemin unique) puis renvoie les références à
 * porter par le message. Throw un message localisé (affiché tel quel en toast).
 */
export async function uploadSenderAttachments(
  orgId: string,
  correspondenceId: string,
  files: File[],
): Promise<MessageAttachment[]> {
  if (files.length === 0) return []
  if (!navigator.onLine)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour joindre des pièces.',
        en: 'Connection required to attach files.',
      }),
    )
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Backend non configuré — pièces jointes indisponibles.',
        en: 'Backend not configured — attachments unavailable.',
      }),
    )

  const stored: MessageAttachment[] = []
  for (const file of files) {
    const name = sanitizeAttachmentName(file.name)
    const path = `${orgId}/shares/${correspondenceId}/sender/${crypto.randomUUID()}-${name}`
    // `contentTypeFor` : MIME canonique par extension quand le navigateur n'en donne pas
    // (fréquent sous Windows) — `octet-stream` serait REJETÉ par l'allowlist du bucket.
    // ⚠ Re-typer le Blob soi-même : avec un `File`, supabase-js envoie le type DU fichier
    // (multipart) et IGNORE l'option `contentType` — vérifié en recette (mime vide → 400).
    const contentType = contentTypeFor(file)
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([file], { type: contentType }), { contentType, upsert: false })
    if (error)
      throw new Error(
        tStatic({
          fr: `Échec du téléversement de « ${name} » : ${error.message}`,
          en: `Upload failed for “${name}”: ${error.message}`,
        }),
      )
    // Métadonnée du message = MIME canonique réellement stocké (pas le `type` navigateur,
    // souvent vide sous Windows) — l'affichage et l'export du fil restent cohérents.
    stored.push({ path, name, size: file.size, mime: contentType })
  }
  return stored
}
