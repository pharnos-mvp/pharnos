// Authentification par JETON DE LIVRAISON — le point d'entrée UNIQUE de toutes les surfaces
// d'après-paiement (`order-upload-url`, `order-gate`, `order-start`, `order-status`).
//
// Pourquoi ce module existe plutôt que quatre copies : l'acheteur n'a ni compte, ni org, ni JWT.
// La possession du jeton EST la seule autorisation qui existe dans tout ce parcours. Une vérif
// recopiée quatre fois, c'est quatre occasions d'oublier l'expiration ou de comparer autre chose
// que le hash — et la faute ne se verrait sur aucun écran.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { deliveryTokenHash, isValidDeliveryToken } from './orders-core.ts'

export interface CommandeAutorisee {
  id: string
  status: string
  offre: 'up1' | 'up3'
  lang: 'fr' | 'en'
  essai: boolean
  depositsUsed: number
  docType: string | null
  /** Pays et activité — transportés par le dépôt, `null` avant. Ils commandent les prompts. */
  country: string | null
  activity: string | null
  expiresAt: string
}

export type RefusAcces = { refus: 'token_invalide' | 'inconnu' | 'expire' | 'db' }

export const estRefus = (r: CommandeAutorisee | RefusAcces): r is RefusAcces => 'refus' in r

/** Code HTTP d'un refus. 404 pour un jeton inconnu — jamais 403 : distinguer « existe mais pas à
 *  toi » de « n'existe pas » dirait à un chercheur de jetons qu'il approche. */
export const statutHttp = (r: RefusAcces): number =>
  r.refus === 'db' ? 503 : r.refus === 'expire' ? 410 : 404

/**
 * Résout un jeton en commande.
 *
 * La recherche se fait sur le HASH, qui est la clé primaire de `order_tokens` : un accès index à
 * une ligne. C'est ce qui rend `order-status` tenable, lui qui sera interrogé toutes les 2 s
 * pendant toute la génération.
 *
 * ⚠️ L'expiration se juge sur la ligne du JETON, pas sur la commande : un jeton frappé par le pont
 * recopie l'échéance de la commande à son émission, et l'on veut que la révocation d'un jeton reste
 * possible sans toucher aux autres.
 */
export async function commandeParJeton(
  supabase: SupabaseClient,
  token: unknown,
): Promise<CommandeAutorisee | RefusAcces> {
  if (!isValidDeliveryToken(token)) return { refus: 'token_invalide' }

  // ⚠️ `email` n'est PAS sélectionné, et c'est délibéré : aucun appelant n'en a besoin, et un futur
  // `json({ ...commande })` publierait l'adresse de l'acheteur sans que personne l'ait voulu. Ce
  // qu'on ne charge pas ne peut pas fuir.
  const { data, error } = await supabase
    .from('order_tokens')
    .select(
      'expires_at, orders!inner(id, status, offre, lang, essai, deposits_used, doc_type, country, activity)',
    )
    .eq('token_hash', await deliveryTokenHash(token))
    .maybeSingle()

  if (error) return { refus: 'db' }
  if (!data) return { refus: 'inconnu' }
  // ⚠️ Le test se formule en POSITIF (« valide jusqu'à »), jamais en négatif. Une date illisible
  // donne `NaN`, et `NaN <= Date.now()` vaut `false` : écrit à l'envers, un horodatage corrompu
  // rendait le jeton éternellement valable. Le fail-safe doit tomber du côté du refus.
  const fin = new Date(data.expires_at).getTime()
  if (!Number.isFinite(fin) || fin <= Date.now()) return { refus: 'expire' }

  // `!inner` garantit la présence ; supabase-js type la relation en tableau ou en objet selon la
  // forme de la requête, d'où la normalisation — un `as` seul masquerait un jour un tableau vide.
  const brut = data.orders as unknown
  const o = (Array.isArray(brut) ? brut[0] : brut) as Record<string, unknown> | undefined
  if (!o) return { refus: 'inconnu' }

  return {
    id: String(o.id),
    status: String(o.status),
    offre: o.offre === 'up3' ? 'up3' : 'up1',
    lang: o.lang === 'en' ? 'en' : 'fr',
    essai: o.essai === true,
    depositsUsed: Number(o.deposits_used ?? 0),
    docType: typeof o.doc_type === 'string' ? o.doc_type : null,
    country: typeof o.country === 'string' ? o.country : null,
    activity: typeof o.activity === 'string' ? o.activity : null,
    expiresAt: data.expires_at,
  }
}
