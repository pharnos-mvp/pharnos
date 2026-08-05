/**
 * Le client des quatre surfaces d'après-paiement — typé, borné, sans dépendance à React.
 *
 * ⚠️ **Aucun appel ne passe par `supabase-js`.** L'acheteur n'a pas de compte : le client Supabase
 * porterait une session, une organisation et une synchronisation dont cette page n'a rien à faire,
 * et il chargerait au passage la couche hors ligne (Dexie) sur une page qui doit s'ouvrir vite,
 * une seule fois, sur un lien reçu par e-mail. Le JETON de livraison est la seule autorisation.
 *
 * Les erreurs sont NOMMÉES, jamais réduites à un booléen : l'écran doit distinguer « votre lien a
 * expiré » (30 jours, irrattrapable) de « ce fichier n'est pas un RCP » (rattrapable, et sans
 * aucun débit) — les deux sont des 4xx, et les confondre transformerait un refus gratuit en
 * impression de panne payante.
 */
import { env } from '../../lib/env'

const BASE = `${env.supabaseUrl}/functions/v1`
/** Un appel qui n'aboutit pas en 30 s n'aboutira pas : la page doit pouvoir le dire et réessayer. */
const TIMEOUT_MS = 30_000

export type RaisonEchec =
  /** Jeton inconnu, malformé, ou lien expiré (30 jours). */
  | 'lien_invalide'
  /** Le serveur a refusé la demande (type de fichier, dépôts épuisés, commande déjà lancée). */
  | 'refus'
  /** Trop d'appels — la page doit ralentir, pas abandonner. */
  | 'trop_de_requetes'
  /** Panne serveur ou réseau : réessayable tel quel. */
  | 'indisponible'

export class UpgradeApiError extends Error {
  readonly raison: RaisonEchec
  /** Message DESTINÉ AU CLIENT quand le serveur en fournit un (la porte de recevabilité le fait). */
  readonly messageClient?: string
  /**
   * Code MACHINE rendu par le serveur (`already_running`, `no_source`, `gated_out`…).
   *
   * ⚠️ Sans lui, `already_running` — qui arrive en 409, donc en exception — était indiscernable
   * d'un vrai refus : deux onglets ouverts sur la même commande faisaient afficher « ce dépôt a
   * été refusé » sur un traitement qui venait de démarrer normalement. Le code se lit dans
   * `error` OU dans `status` selon la surface, les deux formes existent en production.
   */
  readonly code?: string
  constructor(raison: RaisonEchec, message: string, messageClient?: string, code?: string) {
    super(message)
    this.name = 'UpgradeApiError'
    this.raison = raison
    this.messageClient = messageClient
    this.code = code
  }
}

/** Traduit un code HTTP en raison. C'est ici, et une seule fois, que la sémantique est fixée. */
export function raisonDepuisHttp(status: number): RaisonEchec {
  if (status === 404 || status === 410) return 'lien_invalide'
  if (status === 429) return 'trop_de_requetes'
  // 400, 403, 409, 413 : le serveur a compris et a refusé. Réessayer à l'identique ne sert à rien.
  if (status >= 400 && status < 500) return 'refus'
  return 'indisponible'
}

async function poster<T>(chemin: string, corps: unknown): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${BASE}/${chemin}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      signal: ctrl.signal,
    })
  } catch {
    // Coupure réseau ou délai dépassé : réessayable, et la page le dira sans dramatiser.
    throw new UpgradeApiError('indisponible', `${chemin} : injoignable`)
  } finally {
    clearTimeout(timer)
  }

  // Une réponse illisible n'est pas un succès : la traiter comme tel ferait avancer l'écran sur du
  // vide. On lit d'abord, on juge ensuite.
  let payload: Record<string, unknown> = {}
  try {
    payload = (await res.json()) as Record<string, unknown>
  } catch {
    if (res.ok) throw new UpgradeApiError('indisponible', `${chemin} : réponse illisible`)
  }

  if (!res.ok) {
    // Le code machine vit tantôt dans `error` (refus), tantôt dans `status` (`already_running`) :
    // les deux formes existent en production, et l'écran doit pouvoir les distinguer.
    const code =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.status === 'string'
          ? payload.status
          : undefined
    throw new UpgradeApiError(
      raisonDepuisHttp(res.status),
      `${chemin} : ${res.status} ${code ?? ''}`.trim(),
      typeof payload.message === 'string' ? payload.message : undefined,
      code,
    )
  }
  return payload as T
}

/* ─────────────────────────────────────── Les surfaces ──────────────────────────────────────── */

export interface ReponseDepot {
  jobId: string
  path: string
  uploadUrl: string
  uploadToken: string
  depositsLeft: number
}

/** Demande une URL signée de dépôt. Le serveur calcule la clé : le client ne choisit pas où il écrit. */
export const demanderUrlDepot = (token: string, size: number, docType = 'rcp') =>
  poster<ReponseDepot>('order-upload-url', {
    token,
    size,
    docType,
    contentType: 'application/pdf',
  })

/**
 * Téléverse le PDF sur l'URL signée.
 *
 * ⚠️ `x-upsert: true` est volontaire : un dépôt interrompu puis relancé écrit la MÊME clé (elle est
 * dérivée du job), et sans cela le second essai échouerait en 409 sur un job qui vient pourtant de
 * consommer sa tentative. L'acheteur perdrait un dépôt sur trois pour une coupure réseau.
 *
 * ⚠️ **La coupure réseau est NOMMÉE `indisponible`**, comme partout ailleurs dans ce module. Sans
 * cela, `fetch` laisse remonter un `TypeError` brut — donc le mode d'échec le plus fréquent d'un
 * téléversement de plusieurs mégaoctets, précisément celui qu'il faut réessayer, échappait à toute
 * politique de reprise écrite en `instanceof UpgradeApiError`.
 */
export async function televerserSource(
  uploadUrl: string,
  uploadToken: string,
  fichier: Blob,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${uploadToken}`,
        'content-type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: fichier,
    })
  } catch {
    throw new UpgradeApiError('indisponible', 'téléversement : injoignable')
  }
  if (!res.ok) {
    throw new UpgradeApiError(raisonDepuisHttp(res.status), `téléversement : ${res.status}`)
  }
}

/** Tentatives de téléversement — voir `televerserAvecReprises`. */
export const PUT_ESSAIS = 3
const PUT_ATTENTE_MS = 800

/**
 * Téléverse, en réessayant ce qui a une chance de passer.
 *
 * ⚠️ **Réessayer le PUT ne consomme PAS un second dépôt** : la clé est dérivée du job et `x-upsert`
 * autorise la réécriture. C'est `order-upload-url` qui décompte, et il a déjà été appelé. Sans
 * cette reprise, une coupure d'une seconde — sur un marché où la bande passante est ce qu'elle est,
 * avec un PDF de plusieurs mégaoctets — coûtait à l'acheteur une tentative sur trois.
 *
 * Ce qui ne se réessaie pas : un refus du serveur. Une URL signée expirée refusera à l'identique,
 * trois fois plus lentement, pendant que l'écran prétend travailler.
 */
export async function televerserAvecReprises(
  uploadUrl: string,
  uploadToken: string,
  fichier: Blob,
  attendre: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  for (let essai = 1; ; essai++) {
    try {
      await televerserSource(uploadUrl, uploadToken, fichier)
      return
    } catch (e) {
      const rejouable =
        e instanceof UpgradeApiError &&
        (e.raison === 'indisponible' || e.raison === 'trop_de_requetes')
      if (!rejouable || essai >= PUT_ESSAIS) throw e
      await attendre(PUT_ATTENTE_MS * essai)
    }
  }
}

export interface ReponseSource {
  jobId: string
  docType: string
  /** URL signée de LECTURE, valable quelques minutes. À consommer tout de suite. */
  url: string
  expiresIn: number
}

/**
 * Récupère le document déjà déposé — celui que le pont a téléversé depuis `pharnos.com`.
 *
 * ⚠️ **Ce n'est pas un confort, c'est ce qui empêche de brûler un dépôt.** L'acheteur a téléversé
 * depuis une AUTRE origine ; rien de son navigateur ne traverse jusqu'ici. Sans cet appel, la page
 * lui redemanderait son fichier, et ce second dépôt consommerait une des trois tentatives d'une
 * commande déjà payée.
 *
 * `404 no_source` et `409 source_absente` ne sont pas des pannes : ils disent « personne n'a encore
 * déposé », et l'écran de dépôt est la bonne réponse.
 */
export const demanderSource = (token: string) => poster<ReponseSource>('order-source', { token })

/**
 * Télécharge la source depuis son URL signée.
 *
 * ⚠️ Aucun en-tête d'autorisation : la signature EST dans l'URL. En ajouter un ferait échouer la
 * requête préliminaire CORS sur le domaine de stockage.
 */
export async function telechargerSource(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch {
    throw new UpgradeApiError('indisponible', 'source : injoignable')
  }
  if (!res.ok) {
    // Une URL signée périmée se re-demande ; c'est un appel, pas un dépôt.
    throw new UpgradeApiError(raisonDepuisHttp(res.status), `source : ${res.status}`)
  }
  return await res.arrayBuffer()
}

export interface ReponsePorte {
  status: 'started' | 'refused' | 'already_running'
  /** Présent sur un refus : il DIT que rien n'a été débité. À afficher tel quel. */
  message?: string
  depositsLeft?: number
  sectionsTotal?: number
}

/**
 * Franchit la porte de recevabilité, et lance le travail si elle s'ouvre.
 *
 * ⚠️ Un refus n'est PAS une erreur ici : il revient en 200 avec `status: 'refused'`. Le traiter en
 * exception ferait afficher un écran de panne là où la commande est intacte et l'acheteur peut
 * redéposer sans rien payer.
 */
export const franchirPorte = (
  token: string,
  jobId: string,
  controlText: string,
  sourceKind: 'text' | 'ocr',
) => poster<ReponsePorte>('order-gate', { token, jobId, controlText, sourceKind })

export interface ReponseStatut {
  statut: string
  phase: string
  faites: number
  total: number
  echecs: number
  pret: boolean
  depositsLeft: number
  expireLe: string
  docType?: string | null
  jobId?: string | null
  erreur?: string | null
  livrable?: unknown
}

/** Le résumé — quelques centaines d'octets, appelé toutes les 2 s. */
export const lireStatut = (token: string) => poster<ReponseStatut>('order-status', { token })

/** Le livrable complet — demandé UNE fois, quand `pret` est vrai. */
export const lireLivrable = (token: string) =>
  poster<ReponseStatut>('order-status', { token, livrable: 1 })

/**
 * Réclame le jeton de livraison contre la référence, au retour de paiement.
 *
 * ⚠️ Appelé EN BOUCLE COURTE : le webhook Chariow peut arriver après le client. Un seul essai
 * renverrait l'acheteur sur « commande introuvable » alors qu'elle naît une seconde plus tard.
 */
export const reclamerJeton = (ref: string) => poster<{ token: string }>('order-claim', { ref })
