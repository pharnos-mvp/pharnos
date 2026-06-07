import { db } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'

export interface ProfileMetadata {
  nom?: string
  prenom?: string
  username?: string
  /** Photo de profil (data URL). */
  photo?: string
}

/** Garde-fou : `user_metadata` est embarqué dans le JWT → la photo doit rester légère. */
const MAX_PHOTO_CHARS = 60_000

/** Met à jour les métadonnées de profil (Supabase user_metadata). */
export async function updateProfileMetadata(data: ProfileMetadata): Promise<void> {
  if (data.photo && data.photo.length > MAX_PHOTO_CHARS) {
    throw new Error('Photo trop lourde — choisissez une image plus petite.')
  }
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Compte indisponible hors-ligne')
  const { error } = await supabase.auth.updateUser({ data })
  if (error) throw error
}

export async function updatePassword(password: string): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Compte indisponible hors-ligne')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Efface toutes les données locales (Dexie + curseurs de synchro). Irréversible. */
export async function purgeLocalData(): Promise<void> {
  await Promise.all([
    db.products.clear(),
    db.documents.clear(),
    db.documentBlobs.clear(),
    db.dossiers.clear(),
    db.generatedDocs.clear(),
    db.dossierAttachments.clear(),
    db.proSettings.clear(),
    db.outbox.clear(),
  ])
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('pharnos.lastPull')) localStorage.removeItem(k)
  }
}
