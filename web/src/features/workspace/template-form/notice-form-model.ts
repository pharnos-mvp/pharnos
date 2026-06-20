// Modèle du FORMULAIRE INTERACTIF Notice patient — porté tel quel du gabarit fourni par le
// CEO (Notice_patient_interactive.html, « gabarit réglementaire Bénin/UEMOA »). Textes
// VERBATIM — ne pas reformuler sans décision CEO. Particularité : RÉGLAGES GLOBAUX appliqués
// à tout le document (verbe « prendre »/« utiliser », professionnels de santé mentionnés) —
// tous les textes dynamiques (dyn/secDyn/subDyn/check) se recalculent quand ils changent.
// Bilingue (jalon Bibliothèque M2b) : EN porté en champs jumeaux `*En`/`dynTextEn`/`itemsEn`/
// `textEn` — prose patient standard EMA QRD (Package Leaflet) + termes MedDRA. Les `key` sont
// identiques FR/EN → la saisie est indépendante de la langue ; les chemins éditable/export/compile
// FR restent inchangés (le FR reste la langue de soumission UEMOA).
import type { FormBlock, FormGlobals, TemplateFormDefinition } from './form-types'

/* ---- Helpers de conjugaison du gabarit CEO (verbe + professionnels de santé) ---- */
const V = (g: FormGlobals) => g.verb
const Vpris = (g: FormGlobals) => (g.verb === 'prendre' ? 'pris' : 'utilisé')
const Vde = (g: FormGlobals) => (g.verb === 'prendre' ? 'de prendre' : 'd’utiliser')
const Vpr = (g: FormGlobals) => (g.verb === 'prendre' ? 'prenez' : 'utilisez')
const Vne = (g: FormGlobals) => (g.verb === 'prendre' ? 'Ne prenez' : 'N’utilisez')

/** « votre médecin, votre pharmacien ou votre infirmier/ère » selon les cases cochées. */
export function HCP(g: FormGlobals, prefix = 'votre '): string {
  const list: string[] = []
  if (g.hcp.medecin) list.push(`${prefix}médecin`)
  if (g.hcp.pharmacien) list.push(`${prefix}pharmacien`)
  if (g.hcp.infirmier) list.push(`${prefix}infirmier/ère`)
  if (list.length === 0) return `${prefix}médecin`
  if (list.length === 1) return list[0]!
  return `${list.slice(0, -1).join(', ')} ou ${list[list.length - 1]}`
}

/* ---- Conjugaison EN (EMA QRD : take/use · taking/using · taken/used + professionnels) ---- */
const Ven = (g: FormGlobals) => (g.verb === 'prendre' ? 'take' : 'use')
const VgerEn = (g: FormGlobals) => (g.verb === 'prendre' ? 'taking' : 'using')
const VtakenEn = (g: FormGlobals) => (g.verb === 'prendre' ? 'taken' : 'used')

/** « your doctor, pharmacist or nurse » selon les cases cochées (registre EMA QRD, préfixe unique). */
export function HCPen(g: FormGlobals, prefix = 'your '): string {
  const list: string[] = []
  if (g.hcp.medecin) list.push('doctor')
  if (g.hcp.pharmacien) list.push('pharmacist')
  if (g.hcp.infirmier) list.push('nurse')
  if (list.length === 0) list.push('doctor')
  const joined =
    list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`
  return `${prefix}${joined}`
}

export const NOTICE_FORM_MODEL: FormBlock[] = [
  {
    type: 'title',
    text: 'NOTICE : INFORMATION DE L’UTILISATEUR',
    textEn: 'PACKAGE LEAFLET: INFORMATION FOR THE USER',
  },

  { type: 'sub', text: 'Dénomination du médicament', textEn: 'Name of the medicine' },
  {
    type: 'line',
    key: 'denomination',
    ph: 'Dénomination du médicament',
    phEn: 'Name of the medicine',
  },
  { type: 'line', key: 'substances', ph: 'Substance(s) active(s)', phEn: 'Active substance(s)' },

  { type: 'sub', text: 'Encadré', textEn: 'Boxed information' },
  {
    type: 'dyn',
    dynText: (g) =>
      `Veuillez lire attentivement cette notice avant ${Vde(g)} ce médicament car elle contient des informations importantes pour vous.`,
    dynTextEn: (g) =>
      `Read all of this leaflet carefully before you start ${VgerEn(g)} this medicine because it contains important information for you.`,
  },
  {
    type: 'bullets',
    items: [
      'Gardez cette notice. Vous pourriez avoir besoin de la relire.',
      (g) => `Si vous avez d’autres questions, interrogez ${HCP(g)}.`,
      'Ce médicament vous a été personnellement prescrit. Ne le donnez pas à d’autres personnes. Il pourrait leur être nocif, même si les signes de leur maladie sont identiques aux vôtres.',
      (g) =>
        `Si vous ressentez un quelconque effet indésirable, parlez-en à ${HCP(g)}. Ceci s’applique aussi à tout effet indésirable qui ne serait pas mentionné dans cette notice. Voir rubrique 4.`,
    ],
    itemsEn: [
      'Keep this leaflet. You may need to read it again.',
      (g) => `If you have any further questions, ask ${HCPen(g)}.`,
      'This medicine has been prescribed for you only. Do not pass it on to others. It may harm them, even if their signs of illness are the same as yours.',
      (g) =>
        `If you get any side effects, talk to ${HCPen(g)}. This includes any possible side effects not listed in this leaflet. See section 4.`,
    ],
  },

  { type: 'sub', text: 'Que contient cette notice ?', textEn: 'What is in this leaflet' },
  {
    type: 'dyn',
    dynText: () => '1. Qu’est-ce que ce médicament et dans quels cas est-il utilisé ?',
    dynTextEn: () => '1. What this medicine is and what it is used for',
  },
  {
    type: 'dyn',
    dynText: (g) => `2. Quelles sont les informations à connaître avant ${Vde(g)} ce médicament ?`,
    dynTextEn: (g) => `2. What you need to know before you ${Ven(g)} this medicine`,
  },
  {
    type: 'dyn',
    dynText: (g) => `3. Comment ${V(g)} ce médicament ?`,
    dynTextEn: (g) => `3. How to ${Ven(g)} this medicine`,
  },
  {
    type: 'dyn',
    dynText: () => '4. Quels sont les effets indésirables éventuels ?',
    dynTextEn: () => '4. Possible side effects',
  },
  {
    type: 'dyn',
    dynText: () => '5. Comment conserver ce médicament ?',
    dynTextEn: () => '5. How to store this medicine',
  },
  {
    type: 'dyn',
    dynText: () => '6. Contenu de l’emballage et autres informations.',
    dynTextEn: () => '6. Contents of the pack and other information',
  },

  {
    type: 'sec',
    text: '1.\tQU’EST-CE QUE CE MEDICAMENT ET DANS QUELS CAS EST-IL UTILISE ?',
    textEn: '1.\tWHAT THIS MEDICINE IS AND WHAT IT IS USED FOR',
  },
  {
    type: 'line',
    label: 'Classe pharmacothérapeutique – code ATC : ',
    labelEn: 'Pharmacotherapeutic group – ATC code: ',
    key: 'atc',
    ph: 'code ATC',
    phEn: 'ATC code',
  },
  {
    type: 'para',
    key: 'cas_utilisation',
    ph: 'Ce médicament contient … (DCI). La (DCI) est un (classe pharmacothérapeutique). Ce médicament est indiqué chez … pour … (indications).',
    phEn: 'This medicine contains … (INN). … is a (pharmacotherapeutic group). This medicine is indicated in … for … (indications).',
  },
  {
    type: 'check',
    key: 'amelioration',
    text: 'Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si vous vous sentez moins bien après un certain nombre de jours.',
    textEn:
      'You must talk to a doctor if you do not feel better or if you feel worse after a number of days.',
    // Le délai saisi compose la mention finale (règle du gabarit CEO).
    exportText: (state) => {
      const days = (state.values.amelioration_jours ?? '').trim()
      return days
        ? `Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si vous vous sentez moins bien après ${days} jours.`
        : 'Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si vous vous sentez moins bien après un certain nombre de jours.'
    },
    exportTextEn: (state) => {
      const days = (state.values.amelioration_jours ?? '').trim()
      return days
        ? `You must talk to a doctor if you do not feel better or if you feel worse after ${days} days.`
        : 'You must talk to a doctor if you do not feel better or if you feel worse after a number of days.'
    },
  },
  {
    type: 'line',
    label: 'Délai avant de consulter en l’absence d’amélioration : ',
    labelEn: 'Number of days before seeking advice if no improvement: ',
    key: 'amelioration_jours',
    ph: 'nombre de jours',
    phEn: 'number of days',
    narrow: true,
    dependsOn: 'amelioration',
  },

  {
    type: 'secDyn',
    dynText: (g) =>
      `2.\tQUELLES SONT LES INFORMATIONS A CONNAITRE AVANT ${g.verb === 'prendre' ? 'DE PRENDRE' : 'D’UTILISER'} CE MEDICAMENT ?`,
    dynTextEn: (g) =>
      `2.\tWHAT YOU NEED TO KNOW BEFORE YOU ${g.verb === 'prendre' ? 'TAKE' : 'USE'} THIS MEDICINE`,
  },
  {
    type: 'subDyn',
    dynText: (g) => `${Vne(g)} jamais ce médicament :`,
    dynTextEn: (g) => `Do not ${Ven(g)} this medicine:`,
  },
  {
    type: 'para',
    key: 'ne_jamais',
    ph: '• si vous êtes allergique à la (aux) substance(s) active(s) ou à l’un des autres composants… (mentionnés rubrique 6)\n• si …',
    phEn: '• if you are allergic to the active substance(s) or any of the other ingredients of this medicine (listed in section 6)\n• if …',
  },

  { type: 'sub', text: 'Avertissements et précautions', textEn: 'Warnings and precautions' },
  {
    type: 'dyn',
    dynText: (g) => `Adressez-vous à ${HCP(g)} avant ${Vde(g)} ce médicament.`,
    dynTextEn: (g) => `Talk to ${HCPen(g)} before ${VgerEn(g)} this medicine.`,
  },
  {
    type: 'para',
    key: 'avertissements',
    ph: 'Avertissements et précautions particulières',
    phEn: 'Special warnings and precautions',
  },

  {
    type: 'check',
    key: 'enfants_av',
    text: 'Enfants et adolescents',
    textEn: 'Children and adolescents',
    asHeading: true,
  },
  {
    type: 'para',
    key: 'enfants_av_txt',
    ph: 'Informations spécifiques aux enfants et adolescents',
    phEn: 'Specific information for children and adolescents',
    dependsOn: 'enfants_av',
  },

  {
    type: 'sub',
    text: 'Autres médicaments et ce médicament',
    textEn: 'Other medicines and this medicine',
  },
  {
    type: 'dyn',
    dynText: (g) =>
      `Informez ${HCP(g)} si vous ${Vpr(g)}, avez récemment ${Vpris(g)} ou pourriez ${V(g)} tout autre médicament.`,
    dynTextEn: (g) =>
      `Tell ${HCPen(g)} if you are ${VgerEn(g)}, have recently ${VtakenEn(g)} or might ${Ven(g)} any other medicines.`,
  },
  {
    type: 'para',
    key: 'autres_medics',
    ph: 'Interactions médicamenteuses pertinentes (le cas échéant)',
    phEn: 'Relevant medicine interactions (if any)',
  },

  {
    type: 'subSelect',
    key: 'aliments_sel',
    before: 'Ce médicament avec ',
    beforeEn: 'This medicine with ',
    options: [
      'des aliments',
      'des aliments et boissons',
      'des aliments, boissons et de l’alcool',
      'de l’alcool',
    ],
    optionsEn: ['food', 'food and drink', 'food, drink and alcohol', 'alcohol'],
  },
  { type: 'check', key: 'aliments_so', text: 'Sans objet.', textEn: 'Not applicable.' },
  {
    type: 'para',
    key: 'aliments_txt',
    ph: 'Précautions vis-à-vis des aliments/boissons/alcool (si applicable)',
    phEn: 'Precautions regarding food/drink/alcohol (if applicable)',
  },

  {
    type: 'subSelect',
    key: 'grossesse_sel',
    before: 'Grossesse',
    beforeEn: 'Pregnancy',
    options: [
      'Grossesse et allaitement',
      'Grossesse, allaitement et fertilité',
      'Grossesse et fertilité',
    ],
    optionsEn: [
      'Pregnancy and breast-feeding',
      'Pregnancy, breast-feeding and fertility',
      'Pregnancy and fertility',
    ],
    headingText: (chosen) => chosen, // le choix REMPLACE le titre (règle du gabarit)
  },
  {
    type: 'dyn',
    dynText: (g) =>
      `Si vous êtes enceinte ou que vous allaitez, si vous pensez être enceinte ou planifiez une grossesse, demandez conseil à ${HCP(g)} avant ${Vde(g)} ce médicament.`,
    dynTextEn: (g) =>
      `If you are pregnant or breast-feeding, think you may be pregnant or are planning to have a baby, ask ${HCPen(g)} for advice before ${VgerEn(g)} this medicine.`,
  },
  {
    type: 'para',
    key: 'grossesse_txt',
    ph: 'Données grossesse / allaitement / fertilité',
    phEn: 'Pregnancy / breast-feeding / fertility data',
  },

  {
    type: 'sub',
    text: 'Conduite de véhicules et utilisation de machines',
    textEn: 'Driving and using machines',
  },
  { type: 'check', key: 'conduite_so', text: 'Sans objet.', textEn: 'Not applicable.' },
  {
    type: 'para',
    key: 'conduite_txt',
    ph: 'Effets sur la conduite et l’utilisation de machines (si applicable)',
    phEn: 'Effects on driving and using machines (if applicable)',
  },

  {
    type: 'subLine',
    key: 'excipients_notoires',
    before: 'Ce médicament contient ',
    beforeEn: 'This medicine contains ',
    ph: 'nommer le(s) excipient(s) à effet notoire et recommandations',
    phEn: 'name the excipient(s) with known effect and recommendations',
  },

  {
    type: 'secDyn',
    dynText: (g) => `3.\tCOMMENT ${g.verb === 'prendre' ? 'PRENDRE' : 'UTILISER'} CE MEDICAMENT ?`,
    dynTextEn: (g) => `3.\tHOW TO ${g.verb === 'prendre' ? 'TAKE' : 'USE'} THIS MEDICINE`,
  },
  {
    type: 'dyn',
    dynText: (g) =>
      `Veillez à toujours ${V(g)} ce médicament en suivant exactement les indications de ${HCP(g)}. Vérifiez auprès de ${HCP(g)} en cas de doute.`,
    dynTextEn: (g) =>
      `Always ${Ven(g)} this medicine exactly as ${HCPen(g)} has told you. Check with ${HCPen(g)} if you are not sure.`,
  },

  { type: 'sub', text: 'Posologie', textEn: 'Dosage' },
  {
    type: 'para',
    key: 'posologie',
    ph: 'La dose recommandée est de…',
    phEn: 'The recommended dose is…',
  },
  {
    type: 'check',
    key: 'enfants_po',
    text: 'Utilisation chez les enfants et les adolescents',
    textEn: 'Use in children and adolescents',
    asHeading: true,
  },
  {
    type: 'para',
    key: 'enfants_po_txt',
    ph: 'Posologie chez les enfants et adolescents',
    phEn: 'Dosage in children and adolescents',
    dependsOn: 'enfants_po',
  },
  {
    type: 'check',
    key: 'cassure1',
    text: 'La barre de cassure n’est là que pour faciliter la prise du comprimé si vous éprouvez des difficultés à l’avaler en entier.',
    textEn:
      'The score line is only to help you break the tablet if you have difficulty swallowing it whole.',
  },
  {
    type: 'check',
    key: 'cassure2',
    text: 'Le comprimé peut être divisé en doses égales.',
    textEn: 'The tablet can be divided into equal doses.',
  },
  {
    type: 'check',
    key: 'cassure3',
    text: 'La barre de cassure n’est pas destinée à briser le comprimé.',
    textEn: 'The score line is not intended for breaking the tablet.',
  },

  { type: 'sub', text: 'Mode d’administration', textEn: 'Method of administration' },
  {
    type: 'para',
    key: 'mode_admin',
    ph: 'Indiquer la voie d’administration et les modalités de prise',
    phEn: 'Indicate the route of administration and how to take it',
  },

  { type: 'sub', text: 'Durée du traitement', textEn: 'Duration of treatment' },
  {
    type: 'para',
    key: 'duree_traitement',
    ph: 'Sauf avis médical, la durée du traitement est limitée à … (jours / semaines)',
    phEn: 'Unless otherwise advised by your doctor, the duration of treatment is limited to … (days / weeks)',
  },

  {
    type: 'subDyn',
    dynText: (g) => `Si vous avez ${Vpris(g)} plus de ce médicament que vous n’auriez dû`,
    dynTextEn: (g) => `If you ${Ven(g)} more of this medicine than you should`,
  },
  { type: 'para', key: 'surdose', ph: 'Indiquer la conduite à tenir', phEn: 'Indicate what to do' },

  {
    type: 'subDyn',
    dynText: (g) => `Si vous oubliez ${Vde(g)} ce médicament`,
    dynTextEn: (g) => `If you forget to ${Ven(g)} this medicine`,
  },
  {
    type: 'para',
    key: 'oubli',
    ph: 'Ne prenez pas de dose double pour compenser la dose que vous avez oublié de prendre ; …',
    phEn: 'Do not take a double dose to make up for a forgotten dose; …',
  },

  {
    type: 'subDyn',
    dynText: (g) => `Si vous arrêtez ${Vde(g)} ce médicament`,
    dynTextEn: (g) => `If you stop ${VgerEn(g)} this medicine`,
  },
  { type: 'para', key: 'arret', ph: 'Indiquer la conduite à tenir', phEn: 'Indicate what to do' },

  {
    type: 'dyn',
    dynText: (g) =>
      `Si vous avez d’autres questions sur l’utilisation de ce médicament, demandez plus d’informations à ${HCP(g)}.`,
    dynTextEn: (g) =>
      `If you have any further questions on the use of this medicine, ask ${HCPen(g)}.`,
  },

  {
    type: 'sec',
    text: '4.\tQUELS SONT LES EFFETS INDESIRABLES EVENTUELS ?',
    textEn: '4.\tPOSSIBLE SIDE EFFECTS',
  },
  {
    type: 'static',
    text: 'Comme tous les médicaments, ce médicament peut provoquer des effets indésirables, mais ils ne surviennent pas systématiquement chez tout le monde.',
    textEn:
      'Like all medicines, this medicine can cause side effects, although not everybody gets them.',
  },
  {
    type: 'para',
    key: 'ei_liste',
    ph: 'Liste des effets indésirables (par fréquence)',
    phEn: 'List of side effects (by frequency)',
  },
  {
    type: 'check',
    key: 'ei_enfants',
    text: 'Effets indésirables supplémentaires chez les enfants et les adolescents',
    textEn: 'Additional side effects in children and adolescents',
    asHeading: true,
  },
  {
    type: 'para',
    key: 'ei_enfants_txt',
    ph: 'Effets indésirables spécifiques aux enfants et adolescents',
    phEn: 'Side effects specific to children and adolescents',
    dependsOn: 'ei_enfants',
  },

  { type: 'sub', text: 'Déclaration des effets secondaires', textEn: 'Reporting of side effects' },
  {
    type: 'dyn',
    dynText: (g) =>
      `Si vous ressentez un quelconque effet indésirable, parlez-en à ${HCP(g)}. Ceci s’applique aussi à tout effet indésirable qui ne serait pas mentionné dans cette notice.`,
    dynTextEn: (g) =>
      `If you get any side effects, talk to ${HCPen(g)}. This includes any possible side effects not listed in this leaflet.`,
  },

  {
    type: 'sec',
    text: '5.\tCOMMENT CONSERVER CE MEDICAMENT ?',
    textEn: '5.\tHOW TO STORE THIS MEDICINE',
  },
  {
    type: 'static',
    text: 'Tenir ce médicament hors de la vue et de la portée des enfants.',
    textEn: 'Keep this medicine out of the sight and reach of children.',
  },
  {
    type: 'line',
    label: 'À conserver à une température ne dépassant pas ',
    labelEn: 'Store below ',
    key: 'temp_conservation',
    ph: 'X',
    phEn: 'X',
    narrow: true,
    suffix: ' °C, dans un milieu sec, à l’abri de la lumière et de l’humidité.',
    suffixEn: ' °C, in a dry place, protected from light and moisture.',
  },
  {
    type: 'static',
    text: 'N’utilisez pas ce médicament après la date de péremption indiquée sur l’emballage. La date de péremption fait référence au dernier jour de ce mois.',
    textEn:
      'Do not use this medicine after the expiry date which is stated on the packaging. The expiry date refers to the last day of that month.',
  },
  {
    type: 'check',
    key: 'deterioration',
    text: 'N’utilisez pas ce médicament si vous remarquez des signes visibles de détérioration.',
    textEn: 'Do not use this medicine if you notice visible signs of deterioration.',
  },
  {
    type: 'para',
    key: 'deterioration_txt',
    ph: 'Description des signes visibles de détérioration',
    phEn: 'Description of visible signs of deterioration',
    dependsOn: 'deterioration',
  },
  {
    type: 'check',
    key: 'elimination_env',
    text: 'Ne jetez aucun médicament au tout-à-l’égout ou avec les ordures ménagères. Demandez à votre pharmacien d’éliminer les médicaments que vous n’utilisez plus. Ces mesures contribueront à protéger l’environnement.',
    textEn:
      'Do not throw away any medicines via wastewater or household waste. Ask your pharmacist how to throw away medicines you no longer use. These measures will help protect the environment.',
  },

  {
    type: 'sec',
    text: '6.\tCONTENU DE L’EMBALLAGE ET AUTRES INFORMATIONS',
    textEn: '6.\tCONTENTS OF THE PACK AND OTHER INFORMATION',
  },
  { type: 'sub', text: 'Ce que contient ce médicament', textEn: 'What this medicine contains' },
  {
    type: 'para',
    key: 'substances_actives',
    ph: 'La (les) substance(s) active(s) est (sont) : …',
    phEn: 'The active substance(s) is (are): …',
  },
  {
    type: 'para',
    key: 'excipients',
    ph: 'Le(s) autre(s) composant(s) / excipient(s) est (sont) : …',
    phEn: 'The other ingredient(s) / excipient(s) is (are): …',
  },
  {
    type: 'sub',
    text: 'Qu’est-ce que ce médicament et contenu de l’emballage extérieur',
    textEn: 'What this medicine looks like and contents of the pack',
  },
  {
    type: 'para',
    key: 'presentation',
    ph: 'Ce médicament se présente sous forme de … Chaque boîte … contient …',
    phEn: 'This medicine comes as … Each pack … contains …',
  },

  {
    type: 'sub',
    text: 'Titulaire de l’autorisation de mise sur le marché',
    textEn: 'Marketing Authorisation Holder',
  },
  { type: 'line', key: 'amm_nom', ph: 'Nom du titulaire', phEn: 'Name of the holder' },
  { type: 'para', key: 'amm_adresse', ph: 'Adresse complète', phEn: 'Full address' },

  {
    type: 'sub',
    text: 'Exploitant de l’autorisation de mise sur le marché',
    textEn: 'Operator of the marketing authorisation',
  },
  { type: 'line', key: 'expl_nom', ph: 'Nom de l’exploitant', phEn: 'Name of the operator' },
  { type: 'para', key: 'expl_adresse', ph: 'Adresse complète', phEn: 'Full address' },

  { type: 'sub', text: 'Fabricant', textEn: 'Manufacturer' },
  { type: 'line', key: 'fab_nom', ph: 'Nom du fabricant', phEn: 'Name of the manufacturer' },
  { type: 'para', key: 'fab_adresse', ph: 'Adresse complète', phEn: 'Full address' },

  {
    type: 'sub',
    text: 'La dernière date à laquelle cette notice a été révisée est :',
    textEn: 'This leaflet was last revised in:',
  },
  { type: 'line', key: 'date_revision', ph: 'mois AAAA', phEn: 'month YYYY' },
]

/**
 * Définition du formulaire Notice. Pré-remplissage STRICTEMENT session Identification :
 * dénomination + substance(s) active(s) — tout le reste à l'utilisateur (exigence CEO).
 */
export const NOTICE_FORM_DEFINITION: TemplateFormDefinition = {
  docType: 'notice',
  model: NOTICE_FORM_MODEL,
  topbarTitle: 'Notice : information de l’utilisateur',
  slugPrefix: 'Notice',
  slugKey: 'denomination',
  hasGlobalsBar: true,
  prefill: (product) => ({
    denomination: [product.nomCommercial, product.dosage, product.forme].filter(Boolean).join(', '),
    substances: product.dci ?? '',
  }),
}
