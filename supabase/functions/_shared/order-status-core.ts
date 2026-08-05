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
  }
}

export interface Livrable {
  /** Rubriques de conformité, dans l'ordre du gabarit — le document français. */
  conformity: { sectionId: string; content: unknown }[]
  /** Traductions abouties — l'anglais. Une rubrique non traduite reste dans sa langue d'origine. */
  translation: { sectionId: string; content: unknown }[]
  /** Les quatre tableaux de la revue, par nom. */
  report: Record<string, unknown>
  sourceKind: string
  lang: string
}

/**
 * Assemble le livrable à partir des rubriques ABOUTIES.
 *
 * ⚠️ **Ne rend RIEN si une rubrique manque.** Les cinq fichiers sont fabriqués dans le navigateur à
 * partir de ce JSON : livrer un JSON amputé produirait un document silencieusement incomplet, avec
 * un décompte de lacunes calculé sur ce qui reste — exactement le défaut corrigé en `d224665`, où
 * un rapport contredisait son propre document. Refuser laisse le job rejouable ; livrer faux, non.
 */
export function assembler(
  lignes: readonly LigneSection[],
  attendu: { conformity: number; report: number },
  meta: { sourceKind: string; lang: string },
): Livrable | { erreur: string } {
  const abouties = lignes.filter((l) => l.status === 'done')
  const conformity = abouties.filter((l) => l.phase === 'conformity')
  const translation = abouties.filter((l) => l.phase === 'translation')
  const report = abouties.filter((l) => l.phase === 'report')

  if (conformity.length < attendu.conformity) {
    return {
      erreur: `document incomplet : ${conformity.length} rubriques sur ${attendu.conformity}`,
    }
  }
  if (report.length < attendu.report) {
    return { erreur: `revue incomplète : ${report.length} tableaux sur ${attendu.report}` }
  }

  return {
    conformity: conformity.map((l) => ({ sectionId: l.section_id, content: l.content })),
    translation: translation.map((l) => ({ sectionId: l.section_id, content: l.content })),
    report: Object.fromEntries(report.map((l) => [l.section_id, l.content])),
    sourceKind: meta.sourceKind,
    lang: meta.lang,
  }
}
