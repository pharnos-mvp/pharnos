import type { LifecycleEventRecord } from '@/lib/db'
import {
  contentTypeFor,
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  storageObjectKey,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
} from '@/lib/files'
import { tStatic } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'
import { triggerDownload } from './download-utils'

/**
 * Pièces justificatives du cycle de vie (M3) — autorisation d'import, LTA/AWB, avis SWIFT…
 * Stockées dans le bucket privé `documents` (RLS : 1er dossier du chemin = org_id, migration 0002),
 * référencées par `lifecycle_events.doc_refs` ({path,name,size,mime}[], immuable comme l'événement).
 *
 * Choix M3 (pièces « recommandées, jamais obligatoires » — décision CEO) : l'upload est EN LIGNE
 * SEULEMENT ; hors-ligne, l'événement se journalise sans pièce (offline-first préservé pour le
 * journal lui-même, qui passe par Dexie + outbox).
 */

const BUCKET = 'documents'

export type LifecycleDocRef = LifecycleEventRecord['docRefs'][number]

/** Téléverse une pièce et retourne sa référence — jette avec un message affichable en cas d'échec. */
export async function uploadLifecycleDoc(
  orgId: string,
  dossierId: string,
  file: File,
): Promise<LifecycleDocRef> {
  if (!isAllowedUpload(file)) throw new Error(tStatic(UPLOAD_TYPE_ERROR))
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(tStatic(UPLOAD_SIZE_ERROR))
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour joindre une pièce.',
        en: 'Sign-in required to attach a file.',
      }),
    )
  const name = sanitizeFileName(file.name)
  const mime = contentTypeFor(file)
  // Dossier unique par pièce : deux uploads du même nom de fichier ne se percutent jamais.
  // La CLÉ est ASCII (Storage refuse les accents : `Invalid key`) ; `name` — ce que l'utilisateur
  // lit et retrouve au téléchargement — conserve les siens.
  const path = `${orgId}/dossiers/${dossierId}/lifecycle/${crypto.randomUUID()}/${storageObjectKey(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return { path, name, size: file.size, mime }
}

/** Nettoyage best-effort d'uploads orphelins (append de l'événement échoué après upload). */
export async function removeLifecycleDocs(refs: LifecycleDocRef[]): Promise<void> {
  if (refs.length === 0) return
  try {
    const supabase = await getSupabase()
    if (!supabase) return
    await supabase.storage.from(BUCKET).remove(refs.map((r) => r.path))
  } catch {
    // Orphelin toléré : le fichier reste compté dans le quota de l'org mais n'est référencé nulle part.
  }
}

/**
 * Télécharge une pièce et la remet à l'utilisateur (RLS). `false` = hors-ligne / introuvable.
 * Pattern maison `triggerDownload` (clic programmatique sur `<a download>`) — PAS `window.open`
 * après un `await` : la chaîne du geste utilisateur est rompue et les bloqueurs de pop-up
 * supprimeraient l'onglet silencieusement (revue M3).
 */
export async function openLifecycleDoc(
  doc: Pick<LifecycleDocRef, 'path' | 'name'>,
): Promise<boolean> {
  const supabase = await getSupabase()
  if (!supabase) return false
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.path)
    if (error || !data) return false
    triggerDownload(URL.createObjectURL(data), doc.name || 'document', true)
    return true
  } catch {
    return false
  }
}
