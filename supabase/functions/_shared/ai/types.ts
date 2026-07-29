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
}

/** Observabilité du mode flux : appelés à la fin du flux, jamais dans la boucle chaude. */
export interface SimpleSseHooks {
  /** Nombre de caractères émis (journalisation). */
  onDone?: (chars: number) => void
  /** Tokens consommés (quota par organisation). */
  onUsage?: (input: number, output: number) => void
}
