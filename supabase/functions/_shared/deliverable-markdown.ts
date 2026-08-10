// Assemblage des MARKDOWNS livrables — module PUR, la source UNIQUE des deux appelants.
//
// POURQUOI IL EXISTE, ET POURQUOI ICI. La recette U5 exige que les cinq fichiers fabriqués dans le
// navigateur soient BINAIREMENT conformes à ceux du banc d'essai. Cette conformité commence un cran
// plus haut : les deux chemins doivent partir du MÊME markdown. Tant que l'assemblage vivait dans
// le harnais (`bench-harness.ts`), le serveur aurait dû le recopier — et deux copies divergent.
// Il est donc EXTRAIT ici, et le harnais l'importe comme `job-tick` : un seul texte possible.
//
// ⚠️ Le serveur assemble, le navigateur met en page — et ce partage n'est pas un détail :
// `renderReportMarkdown` calcule la liste des lacunes depuis les STATUTS des rubriques, que
// l'API du livrable ne rend pas. Faire recalculer ce squelette au navigateur recréerait le défaut
// de `d224665` — un rapport dont le décompte contredit son propre document.
import { type ConformitySpec, flattenRubrics, type RubricSpec } from './conformity-specs.ts'
import { DELIVERABLE_TITLES_EN } from './deliverable-titles.ts'
import { REPORT_PARTS, type ReportAnalysis } from './report-core.ts'
import { MISSING_MARKER, MISSING_MARKER_EN } from './upgrade-section-core.ts'

/** Une rubrique telle que l'assemblage la consomme — le sous-ensemble STABLE des sorties du moteur. */
export interface LigneAssemblage {
  sectionId: string
  /** Titre FRANÇAIS, celui que le moteur a posé (gabarit UEMOA). */
  title: string
  status: 'filled' | 'partial' | 'missing'
  /** Corps de la rubrique dans la langue du document. */
  content: string
}

export interface MetaAssemblage {
  /** Nom commercial — dérivé de la rubrique 1, jamais « votre produit ». */
  product: string
  /** Nom du fichier DÉPOSÉ, cité en tête : le client doit reconnaître sa pièce. */
  sourceName: string
  /** Code pays de dépôt (`BJ`…), ou vide — l'en-tête l'affiche tel quel. */
  country: string
  /** Libellé d'activité déjà RÉDIGÉ (« Renouvellement d'AMM »…) — pas un code. */
  activity: string
}

/**
 * Le marqueur de lacune — RÉEXPORTÉ depuis sa source unique (`upgrade-section-core`, étape 1 §2).
 * ⚠️ Jamais redéfini ici : deux copies de la même chaîne finissent toujours par diverger, et un
 * marqueur qui dérive d'un caractère rend toutes les lacunes invisibles à l'assemblage.
 */
export { MISSING_MARKER, MISSING_MARKER_EN }

/**
 * Niveau de titre d'une rubrique — la convention EXACTE des livrables de référence (Gynoril,
 * KV-Kacin) : `###` pour les entiers, `####` pour les décimales, gras pour les sous-parties
 * nommées, `###` sans numéro pour la rubrique de prescription.
 */
export function sectionHeading(r: Pick<RubricSpec, 'id'>, title: string): string {
  if (r.id === 'prescription') return `### ${title}`
  if (r.id.includes('-')) return `**${title}**`
  return r.id.includes('.') ? `#### ${r.id}. ${title}` : `### ${r.id}. ${title}`
}

/** Base des noms de fichiers, dérivée du nom commercial — même règle que le harnais U0. */
export const slugFrom = (product: string): string =>
  product.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')

/**
 * Nom commercial dérivé de la rubrique 1 (« DÉNOMINATION DU MÉDICAMENT »).
 *
 * ⚠️ C'est le correctif du `productName: 'votre produit'` en dur : le rapport livré posait sa
 * question « sans objet » sur « votre produit », dans un document payé. La rubrique 1 des
 * références s'écrit « KV-KACIN 500, poudre pour solution injectable. » — le nom est la première
 * proposition, coupée à la virgule. Une rubrique 1 manquante rend la chaîne vide : l'appelant
 * DIT alors qu'il ne sait pas, il n'invente pas.
 */
export function produitDepuisRubrique1(content: string | undefined): string {
  const premiere = String(content ?? '').trim().split('\n')[0] ?? ''
  if (!premiere || premiere === MISSING_MARKER) return ''
  const coupe = premiere.split(/[,;]/)[0]?.trim() ?? ''
  // Une « dénomination » d'un paragraphe entier n'en est pas une : au-delà, on refuse de deviner.
  return coupe.length > 0 && coupe.length <= 120 ? coupe.replace(/\.$/, '') : ''
}

/**
 * Assemble le document conforme d'une langue.
 *
 * ⚠️ **Une rubrique du gabarit absente des lignes fait REFUSER** — jamais sauter en silence.
 * C'est la leçon de `d224665` : une borne qui tronque en silence rend un document amputé présenté
 * comme complet. L'appelant décide quoi faire d'un refus ; l'assembleur, lui, ne livre pas faux.
 */
export function assembleDocument(
  lang: 'fr' | 'en',
  spec: ConformitySpec,
  lignes: ReadonlyMap<string, LigneAssemblage>,
  traductions: ReadonlyMap<string, string>,
  meta: MetaAssemblage,
): string | { erreur: string } {
  const flat = flattenRubrics(spec)
  const isParent = (r: RubricSpec) => Boolean(r.children?.length)
  const out: string[] = []

  if (lang === 'fr') {
    out.push(
      `# RCP ${meta.product} — version conforme au gabarit ABMed/UEMOA 2026`,
      '',
      `> **LIVRABLE.** Produit à partir du seul \`${meta.sourceName}\`, restructuré selon le gabarit`,
      `> RCP ABMed/UEMOA 2026. Aucune information n'y a été ajoutée depuis une connaissance générale`,
      `> du médicament, ni depuis un autre document du dossier.`,
      `>`,
      `> Pays de dépôt : ${meta.country} · Activité : ${meta.activity}.`,
      `> L'analyse et les recommandations figurent dans le **rapport séparé** — jamais dans ce document.`,
      '',
      '---',
      '',
      '## RÉSUMÉ DES CARACTÉRISTIQUES DU PRODUIT',
    )
  } else {
    out.push(
      `# ${meta.product} SmPC — English version`,
      '',
      `> **DELIVERABLE.** Companion to the French version, both produced from \`${meta.sourceName}\``,
      `> alone, restructured to the ABMed/UEMOA 2026 template. Section status is carried over,`,
      `> never recalculated: the same sections are marked as incomplete in both languages.`,
      `>`,
      `> Country of filing: ${meta.country} · Activity: ${meta.activity}.`,
      '',
      '---',
      '',
      '## SUMMARY OF PRODUCT CHARACTERISTICS',
    )
  }

  for (const r of flat) {
    const ligne = lignes.get(r.id)
    if (!ligne) return { erreur: `rubrique ${r.id} absente : le document serait amputé` }
    const title = lang === 'fr' ? ligne.title : DELIVERABLE_TITLES_EN.get(r.id)
    if (!title) return { erreur: `titre ${lang} introuvable pour la rubrique ${r.id}` }
    out.push('', sectionHeading(r, title))
    if (isParent(r)) continue // un conteneur n'a pas de corps : ses enfants suivent
    const content = lang === 'fr'
      ? ligne.content
      : ligne.status === 'missing' || ligne.content === MISSING_MARKER
      ? MISSING_MARKER_EN
      : traductions.get(r.id)
    // ⚠️ Une traduction absente sur une rubrique RENSEIGNÉE fait refuser : livrer le français sous
    // un titre anglais produirait un « companion » qui ne l'est pas.
    if (content === undefined) {
      return { erreur: `traduction absente pour la rubrique ${r.id}` }
    }
    out.push('', content)
  }
  out.push('')
  return out.join('\n')
}

/**
 * Ligne de contexte certifié portant l'ACTIVITÉ réglementaire — consommée par le worker
 * (`job-tick`). Le texte est ALIGNÉ sur celui que l'Edge authentifiée fabrique elle-même
 * (`upgrade/index.ts`, `dossierContextBlock`) ; les fusionner exigerait de toucher cette Edge,
 * que l'invariant du chantier protège — l'alignement se vérifie à la lecture, pas par import.
 *
 * ⚠️ Deux vocabulaires coexistent : l'app dit `new_ma`, la landing dit `amm`/`renouv`. Les accepter
 * tous ici évite la table de correspondance de plus — et le repli est le SILENCE, jamais une
 * consigne inventée : sans activité connue, le modèle traite les rubriques 8/9/10 depuis la seule
 * source, ce qui est le comportement par défaut du gabarit.
 */
export function activityContextLine(activity: string | null | undefined): string {
  if (activity === 'new_ma' || activity === 'amm') {
    return "- Activité réglementaire : NOUVELLE demande d'AMM → pour la rubrique « DATE DE PREMIÈRE " +
      "AUTORISATION/DE RENOUVELLEMENT DE L'AUTORISATION », écris exactement : " +
      '« Sans objet — première demande d\'AMM en cours d\'instruction. »'
  }
  if (activity === 'renewal' || activity === 'renouv') {
    return "- Activité réglementaire : RENOUVELLEMENT d'AMM → le numéro d'AMM existant (rubrique 8) " +
      'et les DEUX dates de la rubrique 9 (première autorisation ET renouvellement) doivent être ' +
      'repris de la source ; leur absence se marque, elle ne se comble pas.'
  }
  return ''
}

/** Libellé d'affichage de l'activité, pour l'en-tête du livrable. */
export function activityLabel(activity: string | null | undefined, lang: 'fr' | 'en'): string {
  if (activity === 'renouv' || activity === 'renewal') {
    return lang === 'fr' ? "renouvellement d'AMM" : 'MA renewal'
  }
  if (activity === 'amm' || activity === 'new_ma') {
    return lang === 'fr' ? "nouvelle demande d'AMM" : 'new MA application'
  }
  return lang === 'fr' ? 'non précisée' : 'not specified'
}

/**
 * Reconstruit l'analyse de la revue depuis les quatre lignes de `upgrade_sections`.
 *
 * ⚠️ Un tableau ABSENT fait refuser le rapport entier, il ne le dégrade pas : `renderReportMarkdown`
 * écrit « Aucun. » pour une liste vide, et c'est une AFFIRMATION — livrer « aucune terminologie à
 * aligner » parce qu'une ligne manque serait le défaut corrigé en `d224665`.
 */
export function analyseDepuisParts(
  parts: ReadonlyMap<string, unknown>,
): { analyse: ReportAnalysis } | { erreur: string } {
  const analyse: Record<string, unknown> = {}
  for (const nom of REPORT_PARTS) {
    const brut = parts.get(nom) as Record<string, unknown> | null | undefined
    const liste = brut?.[nom]
    if (!Array.isArray(liste)) return { erreur: `tableau de revue absent : ${nom}` }
    // ⚠️ Vide-par-ERREUR ≠ vide-par-constat. Le contrôle d'ancrage (`pruneUnverifiable`) peut
    // écarter TOUTES les lignes d'un tableau — le compte est dans `droppedClaims`. Rendre alors la
    // liste vide ferait écrire « Aucun. » dans le rapport : une AFFIRMATION fausse, le défaut
    // `d224665` exactement. Un tableau intégralement écarté se refuse, il ne se tait pas.
    const ecartees = brut?.droppedClaims
    if (liste.length === 0 && Array.isArray(ecartees) && ecartees.length > 0) {
      return {
        erreur: `tableau ${nom} entièrement écarté par le contrôle d'ancrage : ` +
          `le rapport affirmerait « Aucun. » à tort`,
      }
    }
    analyse[nom] = liste
  }
  return { analyse: analyse as unknown as ReportAnalysis }
}

