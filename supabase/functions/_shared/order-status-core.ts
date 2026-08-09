// Ce que la page publique voit d'une commande — module PUR (aucun réseau, aucune base).
//
// DEUX FORMES, et la distinction est une décision de performance, pas de confort : la page
// interroge cette surface TOUTES LES DEUX SECONDES pendant les cinq minutes de génération, soit
// ~150 requêtes par commande. Renvoyer le document entier à chaque fois ferait transiter plusieurs
// mégaoctets pour afficher un compteur.
//
//   • `resume`    — quelques centaines d'octets. C'est ce que le suivi en direct consomme.
//   • `livrable`  — le contenu complet, rendu UNE fois, quand tout est terminé.
//
// ⚠️ Ce module ne connaît ni `email`, ni `first_name`, ni `chariow_sale_id`. Ce n'est pas un oubli :
// la page est atteinte par la SEULE possession d'un jeton, et un jeton se retrouve dans un
// historique de navigateur, un cache de proxy, une capture d'écran envoyée au support. Ce qu'on
// n'expose pas ne fuit pas.

/** Une rubrique, telle que la base la porte. */
export interface LigneSection {
  section_id: string
  phase: string
  status: string
  content: unknown
}

export interface ResumeCommande {
  /** `paid` | `source_uploaded` | `gated_out` | `running` | `done` | `failed` */
  statut: string
  /** Passe en cours : `conformity` | `translation` | `report` | `done`. */
  phase: string
  faites: number
  total: number
  /** Rubriques définitivement en échec — non nul, l'acheteur doit le savoir, pas le découvrir. */
  echecs: number
  /** `true` quand le livrable est récupérable. */
  pret: boolean
  depositsLeft: number
  expireLe: string
  /**
   * Type de document acheté — `null` tant qu'aucun dépôt n'a eu lieu.
   *
   * ⚠️ Il ne se DEVINE pas : la commande naît du webhook Chariow, qui ne connaît que le produit
   * (un document, ou les trois), jamais lequel. Retomber en silence sur `rcp` ferait juger une
   * notice contre le gabarit du RCP — un verdict de recevabilité rendu sur le mauvais référentiel,
   * qu'aucun écran ne signalerait. Tant qu'il vaut `null`, c'est à l'acheteur de le nommer.
   */
  docType: string | null
  /** Pays de dépôt et activité — `null` tant que le PONT (ou la page) ne les a pas transportés.
   *  L'écran de dépôt les REDEMANDE alors : ils commandent la mention 4.8 et les rubriques 8/9/10,
   *  et l'acheteur les avait choisis avant de payer. */
  country: string | null
  activity: string | null
}

/**
 * Avancement d'une PHASE, jamais du travail total.
 *
 * ⚠️ Cumuler les trois passes donnerait un compteur qui recule : la conformité produit 34 rubriques,
 * la traduction ~25, la revue 4. Un « 34 sur 34 » suivi d'un « 3 sur 25 » se lit comme une panne.
 * L'écran annonce donc la passe en cours et sa progression à elle.
 */
export function resumer(
  commande: {
    status: string
    deposits_used: number
    delivery_expires_at: string
    doc_type?: string | null
    country?: string | null
    activity?: string | null
  },
  job: { phase: string; sections_total: number } | null,
  lignes: readonly LigneSection[],
  maxDepots: number,
): ResumeCommande {
  const phase = job?.phase ?? 'conformity'
  const dePhase = lignes.filter((l) => l.phase === phase)
  const faites = dePhase.filter((l) => l.status === 'done').length
  const echecs = dePhase.filter((l) => l.status === 'failed').length
  // `sections_total` peut retarder d'une transition ; le nombre de lignes réellement en file fait
  // foi. Annoncer un total plus petit que le nombre de rubriques déjà faites serait absurde.
  const total = Math.max(job?.sections_total ?? 0, dePhase.length)
  return {
    statut: commande.status,
    phase,
    faites,
    total,
    echecs,
    pret: commande.status === 'done',
    depositsLeft: Math.max(0, maxDepots - commande.deposits_used),
    expireLe: commande.delivery_expires_at,
    docType: commande.doc_type ?? null,
    country: commande.country ?? null,
    activity: commande.activity ?? null,
  }
}

// ⚠️ `assembler()` a vécu ici jusqu'à U5 : le JSON de rubriques qu'il rendait ne suffisait pas
// (les STATUTS n'y étaient pas, et le squelette de la revue aurait été recalculé côté navigateur —
// le défaut de `d224665`). Les markdowns naissent désormais au SERVEUR (`job-tick`,
// `assemblerLivrables`), et cette surface ne fait plus que les SERVIR. Un module sans appelant
// n'est pas un module fini — il est parti, pas archivé.
