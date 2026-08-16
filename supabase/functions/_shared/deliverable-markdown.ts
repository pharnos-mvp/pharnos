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
import {
  lacunesDuDocument,
  REPORT_PARTS,
  type ReportAnalysis,
  rubriquesDuDocument,
} from './report-core.ts'
import { MISSING_MARKER, MISSING_MARKER_EN, type OutputLang } from './upgrade-section-core.ts'

/**
 * Les TROIS langues d'une commande, et pourquoi elles ne sont pas la même.
 *
 * ⚠️ CORRECTIF D'UN DÉFAUT PAYÉ (recette du 2026-08-16). La passe de conformité recevait
 * `orders.lang` — la langue de la PAGE que l'acheteur consultait. Un acheteur qui parcourt
 * pharnos.com en anglais faisait donc rédiger le corps des rubriques en anglais ; comme
 * `assembleDocument` prend le français DANS cette passe et l'anglais dans la traduction, le
 * fichier livré sous le nom `-RCP-FR` était intégralement en anglais, titres français mis à part.
 * La traduction, elle, est cablée vers l'anglais : elle ne pouvait pas le rattraper.
 *
 * Les trois langues, et leur seule source légitime :
 *   • le DOCUMENT est français parce que le gabarit ABMed/UEMOA l'est — c'est la pièce déposée ;
 *   • la TRADUCTION est anglaise parce qu'elle est l'exemplaire d'accompagnement ;
 *   • le RAPPORT suit le document TÉLÉVERSÉ — décision verrouillée de
 *     `docs/gabarits/PROCESS-UPGRADE-ETAPE-1.md` : « source FR → rapport FR ; source EN → rapport
 *     EN. Le rapport suit le client, pas le livrable. » C'est aussi `source_lang` qui NOMME
 *     l'archive et le rapport lui-même : les faire diverger mettrait, dans le même ZIP, une revue
 *     française sous un nom anglais.
 *
 * ⚠️ La langue de la PAGE n'entre dans aucune des trois. Elle n'y est admise qu'en dernier recours,
 * pour les jobs antérieurs à `source_lang` (elle valait alors déjà le rapport) : mieux vaut le
 * comportement d'hier qu'un anglais imposé à un acheteur francophone.
 */
export interface LanguesLivrable {
  /** Langue du document conforme — la pièce qui part à l'agence. */
  document: OutputLang
  /** Langue de l'exemplaire d'accompagnement. */
  traduction: OutputLang
  /** Langue du rapport — celle du document déposé. */
  rapport: OutputLang
}

/**
 * ⚠️ `langueSource` est typée `string` et non `OutputLang` : elle vient de la BASE
 * (`upgrade_jobs.source_lang`), où rien ne garantit l'énumération — les jobs antérieurs à ce champ
 * la portent à `null`, et une détection future pourrait y écrire autre chose. Le repli est décidé
 * ici plutôt que chez chaque appelant.
 */
export function languesLivrable(
  langueSource: string | null | undefined,
  langueAcheteur: OutputLang,
): LanguesLivrable {
  return {
    document: 'fr',
    traduction: 'en',
    rapport: langueSource === 'fr' || langueSource === 'en' ? langueSource : langueAcheteur,
  }
}

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
/** Les quatre comptes de l'écran de livraison — figés à l'assemblage (migration `0093`). */
export interface StatsLivrable {
  /** Rubriques reprises et vérifiées (`filled` + `partial`). */
  reprises: number
  /** Rubriques restées « Non fourni, à compléter ». */
  aCompleter: number
  /** Contenus remis à leur place (les relocations de la revue). */
  deplaces: number
  /** Valeurs lues par reconnaissance de caractères, à relire — dédupliquées comme au rapport. */
  aRelire: number
}

/**
 * Calcule les comptes de l'écran de livraison — au SEUL moment où conformité et revue sont
 * ensemble en mémoire (l'assemblage). Les recalculer à la lecture referait ce travail à chaque
 * visite du lien, sur des données que l'assemblage a déjà jugées.
 *
 * ⚠️ `aRelire` DÉDUPLIQUE comme le rapport (`renderReportMarkdown` passe par un `Set`) : la même
 * valeur mal lue apparaît dans plusieurs rubriques, et le compte doit égaler la liste que le
 * client voit — un « 7 valeurs à relire » au-dessus d'une liste de 4 se lit comme une omission.
 */
export function statsLivrable(
  sections: readonly {
    sectionId: string
    status: 'filled' | 'partial' | 'missing'
    figuresToVerify?: readonly string[]
  }[],
  analyse: Pick<ReportAnalysis, 'relocations'>,
  spec: ConformitySpec,
): StatsLivrable {
  // ⚠️ `aRelire` se calcule sur TOUTES les lignes, morceaux compris : une valeur mal lue dans la
  // moitié « posologie » de la 4.2 est à relire, que la rubrique soit comptée entière ou non.
  const aRelire = new Set(sections.flatMap((s) => [...(s.figuresToVerify ?? [])]))
  // ⚠️ Les comptes viennent de la MÊME liste que le rapport (`lacunesDuDocument`) : un rapport qui
  // annonce « À compléter — 4 » sous une tuile qui annonce 1 détruit la confiance, et c'est
  // l'artefact — pas l'écran — que l'expert transmet à l'agence. Une seule fonction, donc, plutôt
  // que deux règles jumelles.
  const rubriques = rubriquesDuDocument(spec)
  const lacunes = lacunesDuDocument(sections, spec).length
  // ⚠️ Une rubrique SANS ligne n'a pas été traitée : la compter en « reprise » affirmerait un
  // travail qui n'a pas eu lieu, sur un artefact payé. `assembleDocument` refuse déjà un jeu
  // incomplet — mais cette garde-là vit chez l'appelant, et c'est ICI qu'on signe le chiffre.
  const vues = new Set(sections.map((s) => s.sectionId))
  const absentes = flattenRubrics(spec).filter(
    (r) => !r.interne && !vues.has(r.id),
  ).length
  return {
    reprises: rubriques - lacunes - absentes,
    aCompleter: lacunes,
    deplaces: analyse.relocations.length,
    aRelire: aRelire.size,
  }
}

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

