import { getSupabase } from '@/lib/supabase'

/**
 * Traduction (M5) — appelle l'Edge `translate` qui LIT le document (multimodal) et le traduit vers
 * la langue cible (terminologie MedDRA). Assistif : la traduction est proposée pour revue.
 */
export async function translateDoc(input: {
  filePath: string
  fileName: string
  docType: string
  targetLang: string
}): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Connexion requise pour la traduction.')
  const { data, error } = await supabase.functions.invoke('translate', { body: input })
  if (error) throw new Error(error.message || 'Échec de la traduction.')
  const text = String(data?.text ?? '').trim()
  if (!text) throw new Error('Traduction vide.')
  return text
}
