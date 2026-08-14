// Porte de RECEVABILITÉ — couche 0, déterministe et gratuite (PLAN-RECEVABILITE §4).
//
// La question posée n'est PAS « ce document est-il conforme ? » mais « est-ce bien un document du
// type demandé ? ». La confusion serait commercialement fatale : un RCP médiocre, lacunaire, mal
// numéroté est le cas d'usage NORMAL de l'upgrade — c'est précisément ce qu'il vient corriger.
// Refuser sur la qualité, ce serait refuser les clients qui ont le plus besoin du produit.
//
// L'asymétrie des erreurs commande le réglage :
//   • **faux accept** (on analyse un journal officiel) → livrable absurde, crédit brûlé,
//     crédibilité détruite en un essai, rien de récupérable ;
//   • **faux refus** (on refuse un vrai RCP) → grave aussi, mais il reste une porte de sortie.
// On penche donc vers le refus — **à la condition stricte que la seconde chance soit réelle et
// gratuite**, ce que garantit `deposits_used` (3 dépôts, aucun crédit consommé sur refus).
import {
  findInSource,
  findInSourceExact,
  normalizeForEvidence,
  prepareSource,
  type SourceKind,
} from './ai/evidence.ts'
import { flattenRubrics, type ConformitySpec } from './conformity-specs.ts'
import { DELIVERABLE_TITLES_EN } from './deliverable-titles.ts'

/**
 * Repères cherchés : les titres de rubriques du gabarit demandé — **en FRANÇAIS ET EN ANGLAIS** —
 * dérivés de `conformity-specs.ts` et de `deliverable-titles.ts`, jamais d'une liste parallèle à
 * maintenir. Une liste en double finirait par diverger du gabarit, et la porte jugerait alors sur
 * un référentiel que le moteur n'utilise plus.
 *
 * ⚠️ L'anglais n'est pas une largesse, c'est LE cas d'affaires (payé à la première vente réelle,
 * 2026-08-14) : le dossier d'un fabricant arrive en SmPC anglais et vient ici précisément pour
 * devenir un RCP UEMOA. L'empreinte monolingue a refusé deux fois un SmPC parfaitement structuré —
 * « KV-RL, Summary of Product Characteristics » — à 0 repère sur 29 : la porte exigeait la langue
 * du LIVRABLE, pas celle du document reçu. Les titres EN sortent de la table de l'assemblage,
 * gardée contre la dérive par `deliverable-titles.test.ts` — la même source de vérité que le
 * livrable lui-même.
 *
 * Les titres très courts sont écartés : « Posologie », « Fertilité » ou « Overdose » se retrouvent
 * dans trop de documents pour distinguer quoi que ce soit, et gonfleraient le score d'une notice.
 */
const MIN_REPERE_CHARS = 12

export function empreinteGabarit(spec: ConformitySpec): string[] {
  const vus = new Set<string>()
  for (const r of flattenRubrics(spec)) {
    const t = r.title.trim()
    if (t.length >= MIN_REPERE_CHARS) vus.add(t)
  }
  // La table EN couvre le gabarit RCP/SmPC — les autres types recevront la leur en ouvrant
  // (le test de dérive refusera un gabarit dont la table manque, comme pour l'assemblage).
  if (spec.docType === 'rcp') {
    for (const t of DELIVERABLE_TITLES_EN.values()) {
      const v = t.trim()
      if (v.length >= MIN_REPERE_CHARS) vus.add(v)
    }
  }
  return [...vus]
}

/**
 * Repères distincts exigés pour laisser passer.
 *
 * ⚠️ **Seuil NON MESURÉ** — `PLAN-RECEVABILITE §9` le dit explicitement, et il ne faut pas le faire
 * passer pour établi. 3 est délibérément BAS : un RCP réel dont les titres sont reformulés
 * (« Composition » au lieu de « COMPOSITION QUALITATIVE ET QUANTITATIVE ») doit passer, quitte à
 * laisser à la couche 1 — un appel IA à ~0,02 $ — le soin de trancher une notice d'un RCP. Un
 * journal officiel, une lettre ou une facture tombent à zéro et sont arrêtés ici, gratuitement.
 *
 * À calibrer sur un corpus réel AVANT d'ouvrir la vente publique : le relever refuserait des
 * clients légitimes, le baisser laisserait passer des documents hors sujet.
 */
export const REPERES_MINIMUM = 3

export interface VerdictRecevabilite {
  recevable: boolean
  /** Repères effectivement retrouvés — RENDUS, pour que le refus puisse être motivé. */
  trouves: string[]
  /** Total de repères cherchés : sans lui, « 2 trouvés » ne veut rien dire. */
  cherches: number
  seuil: number
}

/**
 * Juge la recevabilité sur le CORPUS DE CONTRÔLE produit par le navigateur.
 *
 * ⚠️ La recherche passe par `findInSource` — **la même fonction que le contrôle de citation**, donc
 * tolérante aux erreurs de lecture sur un scan. Une empreinte plus stricte que le contrôle qu'elle
 * précède refuserait des documents que le moteur, lui, saurait parfaitement traiter.
 */
export function jugerRecevabilite(
  controlText: string,
  sourceKind: SourceKind,
  spec: ConformitySpec,
): VerdictRecevabilite {
  const reperes = empreinteGabarit(spec)
  const trouves: string[] = []

  // ── Passe 1 : LITTÉRALE, sur tout le corpus. Elle ne coûte presque rien. ──────────────────────
  const litteral = prepareSource(controlText, 'text')
  const restants: string[] = []
  for (const r of reperes) {
    if (trouves.length >= REPERES_MINIMUM) break
    if (findInSourceExact(normalizeForEvidence(r), litteral)) trouves.push(r)
    else restants.push(r)
  }

  // ── Passe 2 : TOLÉRANTE, seulement sur un scan, seulement si nécessaire, sur un corpus BORNÉ ──
  //
  // ⚠️ C'est ici que se joue le budget CPU, et le piège est contre-intuitif : le chemin coûteux est
  // celui du REFUS, c'est-à-dire le chemin annoncé comme gratuit. Un document accepté s'arrête au
  // troisième repère ; un document hors sujet, lui, les balaie tous. Mesuré sur un RCP (29
  // repères), corpus océrisé sans aucun repère : ~1,15 s pour 200 000 caractères et ~9,5 s pour
  // 1,4 million — très au-delà des 2 s de CPU d'une invocation Edge. L'isolat était tué, et
  // l'acheteur recevait une erreur opaque à la place du message de refus soigné qui lui disait
  // qu'il pouvait redéposer sans rien payer.
  if (sourceKind === 'ocr' && trouves.length < REPERES_MINIMUM) {
    const approche = prepareSource(controlText.slice(0, MAX_CORPUS_APPROCHE), 'ocr')
    for (const r of restants) {
      if (trouves.length >= REPERES_MINIMUM) break
      if (findInSource(r, approche) !== 'absent') trouves.push(r)
    }
  }

  return {
    recevable: trouves.length >= REPERES_MINIMUM,
    trouves,
    cherches: reperes.length,
    seuil: REPERES_MINIMUM,
  }
}

/**
 * Corpus soumis au rapprochement APPROCHÉ, en caractères.
 *
 * ⚠️ **MESURÉ, deux fois — la première borne était fausse.** Posée à 200 000 par raisonnement, elle
 * laissait le chemin de refus à 3 001 ms, au-dessus des 2 s de CPU d'une invocation ; c'est un test
 * qui l'a rattrapée, pas une relecture. Relevé sur 29 repères tous absents (le pire cas) :
 *
 *   | corpus approché | 40 k | 60 k | 80 k | 120 k |
 *   |---|---|---|---|---|
 *   | durée           | 558 ms | 693 ms | 947 ms | 1 396 ms |
 *
 * 60 000 laissait une marge de plus du double pour 29 repères. **L'empreinte bilingue les porte à
 * ~55** : le pire cas (tout absent) double, et 60 000 le ramènerait à ~1,4 s — trop près du mur.
 * 40 000 le tient à ~1,1 s, marge conservée. La passe LITTÉRALE, elle, reste sur le corpus entier :
 * elle coûte **20 ms sur 430 000 caractères**, soit trois ordres de grandeur de moins — la borner
 * aurait sacrifié de la couverture pour rien.
 *
 * Un RCP porte ses repères dans ses premières pages ; 40 000 caractères en couvrent une douzaine.
 */
const MAX_CORPUS_APPROCHE = 40_000

/**
 * Le message de refus, dans la langue de l'acheteur.
 *
 * §6 du plan : un refus doit DIRE trois choses — ce qu'on a reçu, ce qu'on attendait, et que **rien
 * n'a été débité**. Un refus sec ferait ouvrir un litige là où une phrase suffit.
 */
export function messageRefus(lang: 'fr' | 'en', docLabel: string, depotsRestants: number): string {
  // ⚠️ Texte BRUT, aucun balisage : la page l'affiche tel quel, et des `**` de markdown se sont
  // retrouvés à l'écran d'un acheteur (constaté sur la vente réelle du 2026-08-14).
  if (lang === 'en') {
    return `This file does not look like ${docLabel}. We stopped before any analysis: ` +
      `nothing has been charged and your order is intact. ` +
      (depotsRestants > 0
        ? `You can upload another document (${depotsRestants} attempt(s) left).`
        : `Reply to your confirmation email and we will look at it with you.`)
  }
  return `Ce fichier ne ressemble pas à ${docLabel}. Nous nous sommes arrêtés avant toute ` +
    `analyse : rien n'a été débité et votre commande reste entière. ` +
    (depotsRestants > 0
      ? `Vous pouvez déposer un autre document (${depotsRestants} tentative(s) restante(s)).`
      : `Répondez à votre e-mail de confirmation et nous le regarderons avec vous.`)
}
