// Glossaire et conventions de traduction pharmaceutique réglementaire (U2, Traduction Pro).
//
// Sources et attributions :
// - Terminologie MedDRA® : classes de systèmes d'organes (SOC) et catégories de fréquence
//   CIOMS — libellés FR conformes au guide d'introduction MedDRA v29.0 (français) fourni par
//   l'abonnement de l'organisation (RA-source/MedDRA). MedDRA® est une marque de l'ICH.
// - Référentiel des médicaments ANS/ANSM (RA-source/MedDRA/dat, RUIM 2026-04) — Licence
//   Ouverte 2.0 (Etalab) : réutilisation libre avec mention de la source et de la date.
// - Formules réglementaires : templates officiels UEMOA/ABMed 2026 (RA-source/Template).
//
// Ce module n'embarque qu'un NOYAU terminologique (SOC, fréquences, formes/voies usuelles,
// formules types) : le modèle connaît MedDRA nativement, le noyau VERROUILLE les libellés
// officiels FR là où l'à-peu-près est inacceptable (rubrique 4.8, structure RCP/Notice).

import { specForDocType, specPromptText } from './conformity-specs.ts'

/** Les 27 classes de systèmes d'organes (SOC) MedDRA — libellés officiels EN → FR. */
export const MEDDRA_SOC_FR: Record<string, string> = {
  'Blood and lymphatic system disorders': 'Affections hématologiques et du système lymphatique',
  'Cardiac disorders': 'Affections cardiaques',
  'Congenital, familial and genetic disorders':
    'Affections congénitales, familiales et génétiques',
  'Ear and labyrinth disorders': "Affections de l'oreille et du labyrinthe",
  'Endocrine disorders': 'Affections endocriniennes',
  'Eye disorders': 'Affections oculaires',
  'Gastrointestinal disorders': 'Affections gastro-intestinales',
  'General disorders and administration site conditions':
    "Troubles généraux et anomalies au site d'administration",
  'Hepatobiliary disorders': 'Affections hépatobiliaires',
  'Immune system disorders': 'Affections du système immunitaire',
  'Infections and infestations': 'Infections et infestations',
  'Injury, poisoning and procedural complications':
    'Lésions, intoxications et complications liées aux procédures',
  Investigations: 'Investigations',
  'Metabolism and nutrition disorders': 'Troubles du métabolisme et de la nutrition',
  'Musculoskeletal and connective tissue disorders':
    'Affections musculo-squelettiques et du tissu conjonctif',
  'Neoplasms benign, malignant and unspecified (incl cysts and polyps)':
    'Tumeurs bénignes, malignes et non précisées (incluant kystes et polypes)',
  'Nervous system disorders': 'Affections du système nerveux',
  'Pregnancy, puerperium and perinatal conditions':
    'Affections gravidiques, puerpérales et périnatales',
  'Product issues': 'Problèmes de produit',
  'Psychiatric disorders': 'Affections psychiatriques',
  'Renal and urinary disorders': 'Affections du rein et des voies urinaires',
  'Reproductive system and breast disorders':
    'Affections des organes de reproduction et du sein',
  'Respiratory, thoracic and mediastinal disorders':
    'Affections respiratoires, thoraciques et médiastinales',
  'Skin and subcutaneous tissue disorders': 'Affections de la peau et du tissu sous-cutané',
  'Social circumstances': 'Caractéristiques socio-environnementales',
  'Surgical and medical procedures': 'Actes médicaux et chirurgicaux',
  'Vascular disorders': 'Affections vasculaires',
}

/** Catégories de fréquence des effets indésirables (convention MedDRA/CIOMS) — EN → FR officiel. */
export const FREQUENCY_FR: Record<string, string> = {
  'very common': 'très fréquent (≥ 1/10)',
  common: 'fréquent (≥ 1/100, < 1/10)',
  uncommon: 'peu fréquent (≥ 1/1 000, < 1/100)',
  rare: 'rare (≥ 1/10 000, < 1/1 000)',
  'very rare': 'très rare (< 1/10 000)',
  'not known': 'fréquence indéterminée (ne peut être estimée sur la base des données disponibles)',
}

/** Formes pharmaceutiques usuelles (termes standard EDQM) — EN → FR. */
export const DOSAGE_FORM_FR: Record<string, string> = {
  tablet: 'comprimé',
  'film-coated tablet': 'comprimé pelliculé',
  'scored tablet': 'comprimé sécable',
  'effervescent tablet': 'comprimé effervescent',
  'capsule, hard': 'gélule',
  capsule: 'gélule',
  'capsule, soft': 'capsule molle',
  'oral solution': 'solution buvable',
  'oral suspension': 'suspension buvable',
  syrup: 'sirop',
  'powder for oral suspension': 'poudre pour suspension buvable',
  'solution for injection': 'solution injectable',
  'powder for solution for injection': 'poudre pour solution injectable',
  'solution for infusion': 'solution pour perfusion',
  cream: 'crème',
  ointment: 'pommade',
  gel: 'gel',
  'eye drops, solution': 'collyre en solution',
  suppository: 'suppositoire',
}

/** Voies d'administration usuelles (termes standard EDQM) — EN → FR. */
export const ROUTE_FR: Record<string, string> = {
  'oral use': 'voie orale',
  'intravenous use': 'voie intraveineuse',
  'intramuscular use': 'voie intramusculaire',
  'subcutaneous use': 'voie sous-cutanée',
  'cutaneous use': 'voie cutanée',
  'rectal use': 'voie rectale',
  'vaginal use': 'voie vaginale',
  'ocular use': 'voie ophtalmique',
  'inhalation use': 'voie inhalée',
  'nasal use': 'voie nasale',
}

/** Formules réglementaires types FR (reprises des templates officiels UEMOA/ABMed). */
export const REGULATORY_PHRASES_FR: string[] = [
  'Tenir hors de la vue et de la portée des enfants.',
  'Lire la notice avant utilisation.',
  'Sans objet.',
  "La déclaration des effets indésirables suspectés après autorisation du médicament est importante. Elle permet une surveillance continue du rapport bénéfice/risque du médicament.",
  "Ne jetez aucun médicament au tout-à-l'égout ou avec les ordures ménagères. Demandez à votre pharmacien d'éliminer les médicaments que vous n'utilisez plus.",
  'Comme tous les médicaments, ce médicament peut provoquer des effets indésirables, mais ils ne surviennent pas systématiquement chez tout le monde.',
]

const mapLines = (map: Record<string, string>): string =>
  Object.entries(map)
    .map(([en, fr]) => `« ${en} » → « ${fr} »`)
    .join(' ; ')

/**
 * Règles de traduction professionnelles communes (toutes langues cibles) — invariants à ne
 * JAMAIS altérer : identités, chiffres, unités.
 */
export const CORE_TRANSLATION_RULES: string[] = [
  'Ne traduis JAMAIS les noms commerciaux de médicaments ni les noms de sociétés : recopie-les à l’identique.',
  'Les DCI (dénominations communes internationales) prennent leur forme française officielle OMS (ex. « amikacin » → « amikacine ») — jamais une traduction libre.',
  'Recopie à l’identique : nombres, dosages, unités (mg, g, mL, UI, %, mmol), codes ATC, numéros de lot et d’AMM, dates, adresses e-mail et URL.',
  'Conserve la structure du document : titres, numérotation, listes, tableaux (rendus en texte aligné).',
  'Traduis INTÉGRALEMENT : ne résume pas, ne commente pas, n’ajoute rien, n’omets rien.',
]

/**
 * Bloc de calibration FR (niveau professionnel) injecté dans le system prompt quand la langue
 * cible est le français : terminologie verrouillée + titres officiels du type de document.
 */
export function frenchCalibration(docType: string): string {
  const parts: string[] = [
    'TERMINOLOGIE VERROUILLÉE (libellés officiels FR — utilise-les mot pour mot) :',
    `Classes de systèmes d'organes (SOC MedDRA) : ${mapLines(MEDDRA_SOC_FR)}.`,
    `Catégories de fréquence des effets indésirables (MedDRA/CIOMS) : ${mapLines(FREQUENCY_FR)}.`,
    `Formes pharmaceutiques (EDQM) : ${mapLines(DOSAGE_FORM_FR)}.`,
    `Voies d'administration (EDQM) : ${mapLines(ROUTE_FR)}.`,
    `Formules réglementaires consacrées (reprends-les telles quelles quand le sens correspond) : ${REGULATORY_PHRASES_FR.map((p) => `« ${p} »`).join(' ; ')}.`,
  ]
  const spec = specForDocType(docType)
  if (spec) {
    parts.push(
      'TITRES DE RUBRIQUES OFFICIELS : le document traduit doit utiliser les titres officiels FR du template en vigueur ci-dessous (pas de traduction libre des titres).',
      specPromptText(spec),
    )
  }
  return parts.join('\n')
}

/**
 * System prompt complet de traduction professionnelle. `targetName` est le nom de la langue
 * cible en français (« français », « anglais », « portugais »).
 */
export function buildTranslateSystem(
  docType: string,
  targetLang: string,
  targetName: string,
): string {
  const base =
    'Tu es un traducteur professionnel spécialisé en affaires réglementaires pharmaceutiques ' +
    `(UEMOA/CEDEAO). Tu traduis fidèlement le document vers le ${targetName}, en utilisant la ` +
    'terminologie médicale standardisée MedDRA pour les termes médicaux (effets indésirables, ' +
    "pathologies, classes de systèmes d'organes).\n" +
    `RÈGLES :\n- ${CORE_TRANSLATION_RULES.join('\n- ')}`
  return targetLang.toLowerCase().startsWith('fr')
    ? `${base}\n${frenchCalibration(docType)}`
    : base
}
