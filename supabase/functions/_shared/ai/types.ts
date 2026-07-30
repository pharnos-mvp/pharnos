// Surface NEUTRE du moteur IA (M1) — aucun type spécifique à un fournisseur ne doit apparaître ici.
// `provider.ts` dispatche, `vertex.ts` / `anthropic.ts` implémentent.

/** Un fragment de contenu : texte ou donnée binaire inline (base64) — pour le multimodal. */
export interface Part {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

export type Provider = 'vertex' | 'anthropic'

/** Profondeur de raisonnement (Anthropic). Ignoré par Vertex. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface AiOptions {
  /** Consigne système. */
  system?: string
  /** Budget de sortie demandé. ⚠️ Anthropic : plancher imposé (réflexion + texte partagent le budget). */
  maxOutputTokens?: number
  /** ⚠️ VERTEX UNIQUEMENT — Opus 5 refuse ce paramètre (400) ; le fournisseur Anthropic l'ignore. */
  temperature?: number
  /** Sortie JSON. Sur Anthropic, exige `jsonSchema` (décodage contraint, pas une consigne). */
  json?: boolean
  /** Schéma de sortie structurée (M2). Anthropic : `output_config.format`. */
  jsonSchema?: Record<string, unknown>
  /** Profondeur de raisonnement — Anthropic seulement (défaut `medium`, PLAN-MOTEUR-IA §10). */
  effort?: Effort
  /** Modèle pour CET appel (surcharge le défaut du fournisseur). */
  model?: string
  /** Timeout de l'appel. Toujours borné à `MAX_CALL_TIMEOUT_MS`. */
  timeoutMs?: number
  /** Fournisseur pour CET appel (défaut : variable `AI_PROVIDER`, sinon `vertex`). */
  provider?: Provider
  /**
   * Repli serveur en cas de refus des classificateurs — ACTIF PAR DÉFAUT côté Anthropic.
   * `false` le désactive : à ne faire que pour mesurer le taux de refus brut (banc d'essai M3),
   * jamais sur un livrable client, où un refus non rattrapé est une panne produit.
   */
  fallbacks?: boolean
  /**
   * Index (0-based) du DERNIER fragment appartenant au préfixe mis en cache. Tout ce qui précède —
   * consigne système comprise — devient un préfixe réutilisable ; ce qui suit reste variable.
   *
   * ⚠️ **Doit désigner un fragment autre que le dernier.** Marquer le dernier mettrait en cache la
   * requête ENTIÈRE, partie variable incluse : chaque appel paierait l'écriture (1,25×) sans jamais
   * relire. Le fournisseur refuse ce cas plutôt que de le laisser coûter en silence.
   *
   * Ne sert que là où le préfixe est réellement partagé : la génération par rubrique renvoie le même
   * document source 29 fois, soit **72 % du coût d'entrée** mesuré sur KV-Kacin. La traduction et la
   * revue n'ont rien à partager entre appels — l'option y serait un coût net.
   */
  cacheBreakpointAfter?: number
  /**
   * Met en cache la CONSIGNE SYSTÈME seule.
   *
   * Utile là où le contenu diffère à chaque appel mais la consigne non — la passe de traduction, dont
   * chaque rubrique porte un texte différent alors que la posture du terminologue et le termbase
   * pèsent ~2 500 jetons répétés à chaque appel. `cacheBreakpointAfter` n'y sert à rien : il n'y a
   * qu'un seul fragment de contenu, et le marquer ferait entrer le texte variable dans le cache.
   *
   * Sans effet si la consigne est plus courte que le minimum cachable du modèle (1 024 jetons) : le
   * marqueur est alors ignoré par l'API, sans surcoût.
   */
  cacheSystem?: boolean
}

/** Observabilité du mode flux : appelés à la fin du flux, jamais dans la boucle chaude. */
export interface SimpleSseHooks {
  /** Nombre de caractères émis (journalisation). */
  onDone?: (chars: number) => void
  /** Tokens consommés (quota par organisation). */
  onUsage?: (input: number, output: number) => void
}
