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
  /**
   * Verdict de la rubrique (`filled`/`partial`/`missing`), extrait de `content->>status` PAR LA
   * REQUÊTE — jamais en chargeant `content` entier : le contenu des ~34 rubriques pèse des
   * centaines de kilo-octets, et cette surface est sondée toutes les deux secondes.
   */
  outcome?: string | null
}

/**
 * Une rubrique telle que la PAGE la montre — la liste « à statuts vivants » du mockup v3
 * (Reprise / À compléter / En attente / en cours). Champs courts : ~34 entrées par sondage.
 */
export interface SectionVivante {
  id: string
  /** `queued` | `running` | `done` | `failed` — l'état d'exécution. */
  st: string
  /** `filled` | `partial` | `missing` — le verdict, seulement quand `st` vaut `done`. */
  o?: string
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
  /** Provenance du corpus (`text`/`ocr`) — la notice « nous lisons page par page » en dépend. */
  sourceKind: string | null
  /** Langue du document SOURCE, détectée par la porte (LOT B3) — libellés de phase et nommage. */
  sourceLang: string | null
  /** Nom du produit (rubrique 1) — `null` tant qu'elle n'a pas abouti. Le bandeau contexte l'attend. */
  produit: string | null
  /**
   * La liste « à statuts vivants » du mockup : les rubriques de la passe de CONFORMITÉ — celle que
   * l'acheteur comprend, le gabarit de SON document. Les passes suivantes gardent cette liste
   * (toutes abouties) et changent le libellé de phase. L'ORDRE est celui de la base : la page trie
   * sur le gabarit (`@specs`), qu'elle possède déjà — le transporter ici serait le payer à chaque
   * sondage.
   */
  sections: SectionVivante[]
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
  job: {
    phase: string
    sections_total: number
    source_kind?: string | null
    source_lang?: string | null
  } | null,
  lignes: readonly LigneSection[],
  maxDepots: number,
  produit: string | null = null,
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
    sourceKind: job?.source_kind ?? null,
    sourceLang: job?.source_lang ?? null,
    produit,
    // La liste vivante = la passe de CONFORMITÉ, toujours : c'est le gabarit du document de
    // l'acheteur. Le verdict (`o`) n'accompagne qu'une rubrique ABOUTIE — un verdict sur une
    // rubrique en vol serait celui d'une exécution précédente.
    sections: lignes
      .filter((l) => l.phase === 'conformity')
      .map((l) => ({
        id: l.section_id,
        st: l.status,
        ...(l.status === 'done' && l.outcome ? { o: l.outcome } : {}),
      })),
  }
}

// ⚠️ `assembler()` a vécu ici jusqu'à U5 : le JSON de rubriques qu'il rendait ne suffisait pas
// (les STATUTS n'y étaient pas, et le squelette de la revue aurait été recalculé côté navigateur —
// le défaut de `d224665`). Les markdowns naissent désormais au SERVEUR (`job-tick`,
// `assemblerLivrables`), et cette surface ne fait plus que les SERVIR. Un module sans appelant
// n'est pas un module fini — il est parti, pas archivé.
