import type { Translatable } from '@/lib/i18n-context'

/**
 * Référentiel des variations d'AMM — **Annexe N°2 du Règlement n°04/2020/CM/UEMOA**
 * (« Contenu du dossier technique pour une variation de l'AMM d'un produit pharmaceutique
 * à usage humain », pages 79–85).
 *
 * Source verbatim : 42 exemples de variations, classées **mineures** (1–12) ou **majeures**
 * (13–42), chacune avec sa liste de pièces. La liste de l'annexe est **non exhaustive**
 * (« répertorie quelques variations » + « l'autorité se réserve le droit de classer… ») :
 * d'où l'entrée filet {@link VARIATION_FALLBACK}.
 *
 * Pur, hors-ligne, déterministe — aucune dépendance. C'est le **contenu à amender** par l'expert RA :
 * libellés FR/EN, classement mineure/majeure, pièces exigées.
 */

/** Classe d'une variation selon l'annexe. */
export type VariationClass = 'mineure' | 'majeure'

/** Pièce exigée au dossier de variation (vocabulaire fermé de l'annexe). */
export type PieceCode =
  | 'lettre'
  | 'echantillon'
  | 'maquette'
  | 'recepisse'
  | 'module1'
  | 'dossierVariation'
  | 'tableauComparatif'

export const PIECE_LABEL: Record<PieceCode, Translatable> = {
  lettre: { fr: 'Lettre de demande', en: 'Request letter' },
  echantillon: { fr: 'Échantillon et/ou maquette', en: 'Sample and/or mock-up' },
  maquette: { fr: 'Maquette', en: 'Mock-up' },
  recepisse: { fr: 'Récépissé de paiement', en: 'Payment receipt' },
  module1: { fr: 'Module 1', en: 'Module 1' },
  dossierVariation: {
    fr: 'Dossier présentant la variation + pièces justificatives',
    en: 'Dossier presenting the variation + supporting documents',
  },
  tableauComparatif: {
    fr: 'Tableau comparatif (ancienne / nouvelle version)',
    en: 'Comparison table (old / new version)',
  },
}

export interface Variation {
  /** Numéro de l'annexe (1–42). Absent pour l'entrée filet « Autre ». */
  n?: number
  class: VariationClass
  nature: Translatable
  pieces: PieceCode[]
  /** Note optionnelle (anomalie de classement, précision). Affichée dans le détail. */
  note?: Translatable
}

/** Jeu de pièces par défaut — variation MINEURE (lettre + échantillon + récépissé). */
const MINOR: PieceCode[] = ['lettre', 'echantillon', 'recepisse']
/** Jeu de pièces par défaut — variation MAJEURE (+ Module 1 + dossier de variation). */
const MAJOR: PieceCode[] = ['lettre', 'echantillon', 'recepisse', 'module1', 'dossierVariation']

/* ------------------------------- Variations mineures (1–12) ------------------------------- */

const MINEURES: Variation[] = [
  {
    n: 1,
    class: 'mineure',
    nature: {
      fr: "Changement du nom et/ou de l'adresse du fabricant d'une substance active pour laquelle on ne dispose pas de certificat de conformité à la pharmacopée, sans changement de site de fabrication",
      en: 'Change in name and/or address of the manufacturer of an active substance for which no pharmacopoeial certificate of suitability (CEP) is held, without change of manufacturing site',
    },
    pieces: MINOR,
  },
  {
    n: 2,
    class: 'mineure',
    nature: {
      fr: "Changement du nom et/ou de l'adresse du titulaire de l'AMM, ou transfert d'AMM",
      en: 'Change in name and/or address of the marketing authorisation holder, or transfer of the MA',
    },
    pieces: MINOR,
  },
  {
    n: 3,
    class: 'mineure',
    nature: {
      fr: 'Changement du nom du médicament',
      en: 'Change in the (invented) name of the medicinal product',
    },
    pieces: MINOR,
  },
  {
    n: 4,
    class: 'mineure',
    nature: {
      fr: 'Changement de la dénomination commune internationale (DCI) de la substance active',
      en: 'Change in the International Non-proprietary Name (INN) of the active substance',
    },
    pieces: MINOR,
  },
  {
    n: 5,
    class: 'mineure',
    nature: {
      fr: "Changement du nom et/ou de l'adresse du fabricant du produit fini, sans changement de site de fabrication",
      en: 'Change in name and/or address of the finished product manufacturer, without change of manufacturing site',
    },
    pieces: MINOR,
  },
  {
    n: 6,
    class: 'mineure',
    nature: { fr: 'Changement du code ATC', en: 'Change in the ATC code' },
    pieces: MINOR,
  },
  {
    n: 7,
    class: 'mineure',
    nature: {
      fr: "Suppression d'un site de fabrication (substance active, intermédiaire ou produit fini ; site de conditionnement ; site responsable de la libération des lots ; site de contrôle des lots)",
      en: 'Deletion of a manufacturing site (active substance, intermediate or finished product; packaging site; batch release site; batch control testing site)',
    },
    pieces: MINOR,
  },
  {
    n: 8,
    class: 'mineure',
    nature: { fr: 'Diminution du prix', en: 'Price decrease' },
    pieces: ['lettre'],
    note: {
      fr: "Lettre de demande seule — seule variation à ne pas exiger d'échantillon ni de récépissé.",
      en: 'Request letter only — the single variation requiring neither sample nor receipt.',
    },
  },
  {
    n: 9,
    class: 'mineure',
    nature: { fr: 'Changement de la raison sociale', en: 'Change of company (corporate) name' },
    pieces: MINOR,
  },
  {
    n: 10,
    class: 'mineure',
    nature: {
      fr: 'Changement du conditionnement secondaire (emballage extérieur)',
      en: 'Change in the secondary packaging',
    },
    pieces: MINOR,
  },
  {
    n: 11,
    class: 'mineure',
    nature: {
      fr: "Ajout d'un matériel d'utilisation (dispositif d'administration)",
      en: 'Addition of an administration/usage device',
    },
    pieces: MINOR,
  },
  {
    n: 12,
    class: 'mineure',
    nature: {
      fr: 'Modifications du format (présentation générale / reformulation) du RCP et de la notice',
      en: 'Changes to the format/layout (general presentation / reformatting) of the SmPC and package leaflet',
    },
    pieces: ['lettre', 'maquette', 'recepisse', 'tableauComparatif'],
  },
]

/* ------------------------------- Variations majeures (13–42) ------------------------------- */

const MAJEURES: Variation[] = [
  {
    n: 13,
    class: 'majeure',
    nature: {
      fr: "Remplacement ou ajout d'un site de fabrication pour une partie ou la totalité du procédé de fabrication du produit fini, avec changement d'adresse",
      en: 'Replacement or addition of a manufacturing site for part or all of the finished product manufacturing process, with change of address',
    },
    pieces: MAJOR,
  },
  {
    n: 14,
    class: 'majeure',
    nature: {
      fr: 'Changement des modalités de libération des lots et/ou des essais de contrôle de qualité du produit fini',
      en: 'Change to the batch release arrangements and/or quality control testing of the finished product',
    },
    pieces: MAJOR,
  },
  {
    n: 15,
    class: 'majeure',
    nature: {
      fr: 'Changement du procédé de fabrication de la substance active, sans changement de ses propriétés',
      en: 'Change in the manufacturing process of the active substance, without change to its properties',
    },
    pieces: MAJOR,
  },
  {
    n: 16,
    class: 'majeure',
    nature: {
      fr: 'Changement de la taille du lot de la substance active ou de la substance intermédiaire',
      en: 'Change in the batch size of the active substance or intermediate',
    },
    pieces: MAJOR,
  },
  {
    n: 17,
    class: 'majeure',
    nature: {
      fr: "Resserrement des limites de spécifications, ou ajout d'un nouveau paramètre d'essai aux spécifications d'une substance active / matière première / intermédiaire / réactif du procédé de fabrication de la substance active",
      en: 'Tightening of specification limits, or addition of a new test parameter to the specifications of an active substance / starting material / intermediate / reagent used in the active substance manufacturing process',
    },
    pieces: MAJOR,
  },
  {
    n: 18,
    class: 'majeure',
    nature: {
      fr: "Changement (ou remplacement/ajout) d'une méthode d'essai d'une substance active / matière première / intermédiaire / réactif du procédé de fabrication de la substance active",
      en: 'Change to (or replacement/addition of) a test method for an active substance / starting material / intermediate / reagent used in the active substance manufacturing process',
    },
    pieces: MAJOR,
  },
  {
    n: 19,
    class: 'majeure',
    nature: {
      fr: "Changement de site d'un fabricant approuvé de la substance active / matière première / intermédiaire / réactif, pour lequel on ne dispose pas de certificat de conformité à la pharmacopée",
      en: 'Change to a site of an approved manufacturer of the active substance / starting material / intermediate / reagent for which no pharmacopoeial certificate of suitability is held',
    },
    pieces: MAJOR,
  },
  {
    n: 20,
    class: 'majeure',
    nature: {
      fr: "Ajout d'un nouveau fabricant de la substance active / matière première / intermédiaire / réactif, pour lequel on ne dispose pas de certificat de conformité à la pharmacopée",
      en: 'Addition of a new manufacturer of the active substance / starting material / intermediate / reagent for which no pharmacopoeial certificate of suitability is held',
    },
    pieces: MAJOR,
  },
  {
    n: 21,
    class: 'majeure',
    nature: {
      fr: 'Changement de la période de contrôle (re-test) ou des conditions de stockage de la substance active',
      en: 'Change in the re-test period or storage conditions of the active substance',
    },
    pieces: MAJOR,
  },
  {
    n: 22,
    class: 'majeure',
    nature: {
      fr: "Remplacement d'un excipient par un excipient comparable",
      en: 'Replacement of an excipient with a comparable excipient',
    },
    pieces: MAJOR,
  },
  {
    n: 23,
    class: 'majeure',
    nature: {
      fr: "Resserrement des limites de spécifications, ou ajout d'un nouveau paramètre d'essai à la spécification d'un excipient",
      en: 'Tightening of specification limits, or addition of a new test parameter to the specification of an excipient',
    },
    pieces: MAJOR,
  },
  {
    n: 24,
    class: 'majeure',
    nature: {
      fr: "Changement mineur d'une méthode d'essai approuvée (y compris excipient biologique), ou remplacement par une nouvelle méthode d'essai d'un excipient",
      en: 'Minor change to an approved test method (including for a biological excipient), or replacement with a new test method for an excipient',
    },
    pieces: MAJOR,
  },
  {
    n: 25,
    class: 'majeure',
    nature: {
      fr: "Présentation d'un certificat de conformité à une pharmacopée nouvelle ou actualisée pour un excipient",
      en: 'Submission of a certificate of suitability to a new or updated pharmacopoeia for an excipient',
    },
    pieces: MAJOR,
  },
  {
    n: 26,
    class: 'majeure',
    nature: {
      fr: "Présentation d'un nouveau certificat de conformité à une pharmacopée nouvelle ou actualisée pour une substance active / matière première / intermédiaire / réactif",
      en: 'Submission of a new certificate of suitability to a new or updated pharmacopoeia for an active substance / starting material / intermediate / reagent',
    },
    pieces: MAJOR,
  },
  {
    n: 27,
    class: 'majeure',
    nature: {
      fr: "Changement de la synthèse ou de l'extraction d'un excipient non inscrit à la pharmacopée et décrit dans le dossier",
      en: 'Change in the synthesis or recovery of a non-pharmacopoeial excipient described in the dossier',
    },
    pieces: MAJOR,
  },
  {
    n: 28,
    class: 'majeure',
    nature: {
      fr: "Changement des méthodes d'essai ou des caractéristiques en vue de se conformer à la pharmacopée",
      en: 'Change to test methods or characteristics in order to comply with the pharmacopoeia',
    },
    pieces: MAJOR,
  },
  {
    n: 29,
    class: 'majeure',
    nature: {
      fr: "Resserrement des limites de spécifications, ou ajout d'un nouveau paramètre d'essai du conditionnement primaire du produit fini",
      en: 'Tightening of specification limits, or addition of a new test parameter for the primary packaging of the finished product',
    },
    pieces: MAJOR,
  },
  {
    n: 30,
    class: 'majeure',
    nature: {
      fr: "Changement d'une méthode d'essai approuvée, autre changement, ou ajout d'une méthode d'essai du conditionnement primaire du produit fini",
      en: 'Change to an approved test method, other change, or addition of a test method for the primary packaging of the finished product',
    },
    pieces: MAJOR,
  },
  {
    n: 31,
    class: 'majeure',
    nature: {
      fr: "Changement d'un élément du matériau de conditionnement primaire non en contact avec le produit fini (ex. couleur du bouchon amovible, anneaux de code couleur sur ampoules, protecteur d'aiguille en plastique différent)",
      en: 'Change to a component of the (primary) packaging material not in contact with the finished product (e.g. colour of flip-off cap, colour-code rings on ampoules, needle shield using a different plastic)',
    },
    pieces: MAJOR,
  },
  {
    n: 32,
    class: 'majeure',
    nature: {
      fr: 'Changement de la composition qualitative et/ou quantitative du matériau de conditionnement primaire',
      en: 'Change in the qualitative and/or quantitative composition of the primary packaging material',
    },
    pieces: MAJOR,
  },
  {
    n: 33,
    class: 'majeure',
    nature: {
      fr: 'Changement des contrôles en cours de fabrication ou des limites appliquées durant la fabrication du produit',
      en: 'Change to the in-process controls or limits applied during manufacture of the product',
    },
    pieces: MAJOR,
  },
  {
    n: 34,
    class: 'majeure',
    nature: {
      fr: 'Changement de la taille du lot de produit fini',
      en: 'Change in the batch size of the finished product',
    },
    pieces: MAJOR,
  },
  {
    n: 35,
    class: 'majeure',
    nature: {
      fr: 'Modifications relatives au principe actif',
      en: 'Changes relating to the active substance',
    },
    pieces: MAJOR,
  },
  {
    n: 36,
    class: 'majeure',
    nature: {
      fr: 'Changements dans le procédé de fabrication du principe actif (voie de synthèse, produit intermédiaire de synthèse)',
      en: 'Changes in the manufacturing process of the active substance (synthesis route, synthesis intermediate)',
    },
    pieces: MAJOR,
  },
  {
    n: 37,
    class: 'majeure',
    nature: {
      fr: 'Changements dans la composition du produit fini',
      en: 'Changes in the composition of the finished product',
    },
    pieces: MAJOR,
  },
  {
    n: 38,
    class: 'majeure',
    nature: {
      fr: 'Changements de conditionnement primaire',
      en: 'Changes to the primary packaging',
    },
    pieces: MAJOR,
  },
  {
    n: 39,
    class: 'majeure',
    nature: { fr: 'Augmentation du prix', en: 'Price increase' },
    pieces: MAJOR,
    note: {
      fr: "Anomalie de classement : une hausse de prix n'affecte ni la qualité ni la sécurité, mais l'annexe l'exige en variation MAJEURE (Module 1 + dossier complet). À l'inverse, la diminution de prix (n°8) est mineure.",
      en: 'Classification quirk: a price increase affects neither quality nor safety, yet the annex requires it as a MAJOR variation (Module 1 + full dossier). Conversely, a price decrease (no. 8) is minor.',
    },
  },
  {
    n: 40,
    class: 'majeure',
    nature: {
      fr: "Ajout d'une nouvelle indication thérapeutique",
      en: 'Addition of a new therapeutic indication',
    },
    pieces: MAJOR,
    note: {
      fr: "Variation lourde : appelle normalement des données cliniques (Module 5) au-delà du Module 1. L'annexe reste générique sur les justificatifs.",
      en: 'Heavyweight variation: normally requires clinical data (Module 5) beyond Module 1. The annex stays generic on supporting documents.',
    },
  },
  {
    n: 41,
    class: 'majeure',
    nature: { fr: 'Changement de la durée de conservation', en: 'Change in the shelf life' },
    pieces: MAJOR,
  },
  {
    n: 42,
    class: 'majeure',
    nature: {
      fr: 'Modifications significatives du RCP et de la notice (nouveaux résultats cliniques, précliniques, de qualité ou de pharmacovigilance — indications, posologies, contre-indications)',
      en: 'Significant changes to the SmPC and package leaflet (new clinical, non-clinical, quality or pharmacovigilance results — indications, posology, contraindications)',
    },
    pieces: ['lettre', 'maquette', 'recepisse', 'module1', 'dossierVariation', 'tableauComparatif'],
  },
]

/** Les 42 variations de l'annexe, dans l'ordre (mineures 1–12 puis majeures 13–42). */
export const VARIATIONS: Variation[] = [...MINEURES, ...MAJEURES]

/**
 * Entrée filet — la liste de l'annexe est explicitement **non exhaustive**. Toute variation
 * non répertoriée est classée et instruite par l'autorité ; par prudence, on présente le jeu
 * de pièces majeur.
 */
export const VARIATION_FALLBACK: Variation = {
  class: 'majeure',
  nature: {
    fr: 'Autre variation — non répertoriée',
    en: 'Other variation — not listed',
  },
  pieces: MAJOR,
  note: {
    fr: "La liste de l'annexe n'est pas exhaustive : « l'autorité de réglementation se réserve le droit de classer et de demander des informations complémentaires » pour toute variation non prévue. Rapprochez-vous de l'autorité pour le classement exact.",
    en: 'The annex list is not exhaustive: “the regulatory authority reserves the right to classify and request additional information” for any unlisted variation. Confirm the exact classification with the authority.',
  },
}

/* ------------------------------- Exigences générales (intro de l'annexe) ------------------------------- */

/** Les 4 exigences générales applicables à toute demande de modification (intro de l'annexe). */
export const GENERAL_REQUIREMENTS: Translatable[] = [
  {
    fr: "Formulaire dûment rempli de demande de modification d'enregistrement",
    en: 'Duly completed registration-variation application form',
  },
  {
    fr: 'Échantillons du produit reflétant la modification (selon le besoin)',
    en: 'Product samples reflecting the change (as required)',
  },
  {
    fr: "Fichier maître du site du fabricant (Site Master File), si la modification touche le nom, le site et/ou l'adresse du fabricant",
    en: 'Site Master File of the manufacturer, where the change affects the name, site and/or address of the manufacturer',
  },
  {
    fr: 'Autres documents permettant de justifier la modification',
    en: 'Other documents justifying the change',
  },
]

/** Note transversale : régime d'approbation préalable (intro de l'annexe). */
export const PRIOR_APPROVAL_NOTE: Translatable = {
  fr: "Toute variation requiert l'accord préalable de l'autorité de réglementation pharmaceutique avant mise en œuvre (pas de catégorie de simple notification).",
  en: 'Every variation requires prior approval of the pharmaceutical regulatory authority before implementation (no notification-only category).',
}

/* ------------------------------- Regroupement de variations ------------------------------- */

/** Les 7 conditions de regroupement de plusieurs variations sur une même demande. */
export const GROUPING_RULES: Translatable[] = [
  {
    fr: "L'une est une modification majeure ; toutes les autres en découlent",
    en: 'One change is major; all the others derive from it',
  },
  {
    fr: "L'une est une modification mineure ; toutes les autres sont des modifications mineures qui en découlent",
    en: 'One change is minor; all the others are minor changes deriving from it',
  },
  {
    fr: "Toutes sont des changements administratifs apportés au RCP, à l'étiquetage ou à la notice",
    en: 'All are administrative changes to the SmPC, labelling or package leaflet',
  },
  {
    fr: "Toutes portent sur le dossier confidentiel de la substance active, le dossier de l'antigène vaccinal ou le dossier du plasma",
    en: 'All concern the active substance confidential dossier, the vaccine antigen master file or the plasma master file',
  },
  {
    fr: 'Toutes concernent le procédé de fabrication et la qualité du médicament ou de sa substance active',
    en: 'All concern the manufacturing process and quality of the medicine or its active substance',
  },
  {
    fr: "Toutes concernent l'évaluation d'un PSUR (rapport périodique de sécurité) et le système de pharmacovigilance",
    en: 'All concern the evaluation of a PSUR (periodic safety update report) and the pharmacovigilance system',
  },
  {
    fr: "Toutes découlent d'une restriction urgente pour raisons de sécurité",
    en: 'All derive from an urgent safety restriction',
  },
]

/** Règle de redevance en cas de regroupement. */
export const GROUPING_FEE_NOTE: Translatable = {
  fr: 'En cas de regroupement, la redevance est exigée pour chaque variation.',
  en: 'In the event of grouping, the fee is due for each variation.',
}

/* ------------------------------- Sélecteurs ------------------------------- */

export const VARIATION_COUNTS = {
  total: VARIATIONS.length,
  mineure: VARIATIONS.filter((v) => v.class === 'mineure').length,
  majeure: VARIATIONS.filter((v) => v.class === 'majeure').length,
}
