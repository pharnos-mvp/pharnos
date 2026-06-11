// Modèle du FORMULAIRE INTERACTIF Notice patient — porté tel quel du gabarit fourni par le
// CEO (Notice_patient_interactive.html, « gabarit réglementaire Bénin/UEMOA »). Textes
// VERBATIM — ne pas reformuler sans décision CEO. Particularité : RÉGLAGES GLOBAUX appliqués
// à tout le document (verbe « prendre »/« utiliser », professionnels de santé mentionnés) —
// tous les textes dynamiques (dyn/secDyn/subDyn/check) se recalculent quand ils changent.
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

export const NOTICE_FORM_MODEL: FormBlock[] = [
  { type: 'title', text: 'NOTICE : INFORMATION DE L’UTILISATEUR' },

  { type: 'sub', text: 'Dénomination du médicament' },
  { type: 'line', key: 'denomination', ph: 'Dénomination du médicament' },
  { type: 'line', key: 'substances', ph: 'Substance(s) active(s)' },

  { type: 'sub', text: 'Encadré' },
  {
    type: 'dyn',
    dynText: (g) =>
      `Veuillez lire attentivement cette notice avant ${Vde(g)} ce médicament car elle contient des informations importantes pour vous.`,
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
  },

  { type: 'sub', text: 'Que contient cette notice ?' },
  {
    type: 'dyn',
    dynText: () => '1. Qu’est-ce que ce médicament et dans quels cas est-il utilisé ?',
  },
  {
    type: 'dyn',
    dynText: (g) => `2. Quelles sont les informations à connaître avant ${Vde(g)} ce médicament ?`,
  },
  { type: 'dyn', dynText: (g) => `3. Comment ${V(g)} ce médicament ?` },
  { type: 'dyn', dynText: () => '4. Quels sont les effets indésirables éventuels ?' },
  { type: 'dyn', dynText: () => '5. Comment conserver ce médicament ?' },
  { type: 'dyn', dynText: () => '6. Contenu de l’emballage et autres informations.' },

  { type: 'sec', text: '1.\tQU’EST-CE QUE CE MEDICAMENT ET DANS QUELS CAS EST-IL UTILISE ?' },
  { type: 'line', label: 'Classe pharmacothérapeutique – code ATC : ', key: 'atc', ph: 'code ATC' },
  {
    type: 'para',
    key: 'cas_utilisation',
    ph: 'Ce médicament contient … (DCI). La (DCI) est un (classe pharmacothérapeutique). Ce médicament est indiqué chez … pour … (indications).',
  },
  {
    type: 'check',
    key: 'amelioration',
    text: 'Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si vous vous sentez moins bien après un certain nombre de jours.',
    // Le délai saisi compose la mention finale (règle du gabarit CEO).
    exportText: (state) => {
      const days = (state.values.amelioration_jours ?? '').trim()
      return days
        ? `Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si vous vous sentez moins bien après ${days} jours.`
        : 'Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si vous vous sentez moins bien après un certain nombre de jours.'
    },
  },
  {
    type: 'line',
    label: 'Délai avant de consulter en l’absence d’amélioration : ',
    key: 'amelioration_jours',
    ph: 'nombre de jours',
    narrow: true,
    dependsOn: 'amelioration',
  },

  {
    type: 'secDyn',
    dynText: (g) =>
      `2.\tQUELLES SONT LES INFORMATIONS A CONNAITRE AVANT ${g.verb === 'prendre' ? 'DE PRENDRE' : 'D’UTILISER'} CE MEDICAMENT ?`,
  },
  { type: 'subDyn', dynText: (g) => `${Vne(g)} jamais ce médicament :` },
  {
    type: 'para',
    key: 'ne_jamais',
    ph: '• si vous êtes allergique à la (aux) substance(s) active(s) ou à l’un des autres composants… (mentionnés rubrique 6)\n• si …',
  },

  { type: 'sub', text: 'Avertissements et précautions' },
  { type: 'dyn', dynText: (g) => `Adressez-vous à ${HCP(g)} avant ${Vde(g)} ce médicament.` },
  { type: 'para', key: 'avertissements', ph: 'Avertissements et précautions particulières' },

  { type: 'check', key: 'enfants_av', text: 'Enfants et adolescents', asHeading: true },
  {
    type: 'para',
    key: 'enfants_av_txt',
    ph: 'Informations spécifiques aux enfants et adolescents',
    dependsOn: 'enfants_av',
  },

  { type: 'sub', text: 'Autres médicaments et ce médicament' },
  {
    type: 'dyn',
    dynText: (g) =>
      `Informez ${HCP(g)} si vous ${Vpr(g)}, avez récemment ${Vpris(g)} ou pourriez ${V(g)} tout autre médicament.`,
  },
  {
    type: 'para',
    key: 'autres_medics',
    ph: 'Interactions médicamenteuses pertinentes (le cas échéant)',
  },

  {
    type: 'subSelect',
    key: 'aliments_sel',
    before: 'Ce médicament avec ',
    options: [
      'des aliments',
      'des aliments et boissons',
      'des aliments, boissons et de l’alcool',
      'de l’alcool',
    ],
  },
  { type: 'check', key: 'aliments_so', text: 'Sans objet.' },
  {
    type: 'para',
    key: 'aliments_txt',
    ph: 'Précautions vis-à-vis des aliments/boissons/alcool (si applicable)',
  },

  {
    type: 'subSelect',
    key: 'grossesse_sel',
    before: 'Grossesse',
    options: [
      'Grossesse et allaitement',
      'Grossesse, allaitement et fertilité',
      'Grossesse et fertilité',
    ],
    headingText: (chosen) => chosen, // le choix REMPLACE le titre (règle du gabarit)
  },
  {
    type: 'dyn',
    dynText: (g) =>
      `Si vous êtes enceinte ou que vous allaitez, si vous pensez être enceinte ou planifiez une grossesse, demandez conseil à ${HCP(g)} avant ${Vde(g)} ce médicament.`,
  },
  { type: 'para', key: 'grossesse_txt', ph: 'Données grossesse / allaitement / fertilité' },

  { type: 'sub', text: 'Conduite de véhicules et utilisation de machines' },
  { type: 'check', key: 'conduite_so', text: 'Sans objet.' },
  {
    type: 'para',
    key: 'conduite_txt',
    ph: 'Effets sur la conduite et l’utilisation de machines (si applicable)',
  },

  {
    type: 'subLine',
    key: 'excipients_notoires',
    before: 'Ce médicament contient ',
    ph: 'nommer le(s) excipient(s) à effet notoire et recommandations',
  },

  {
    type: 'secDyn',
    dynText: (g) => `3.\tCOMMENT ${g.verb === 'prendre' ? 'PRENDRE' : 'UTILISER'} CE MEDICAMENT ?`,
  },
  {
    type: 'dyn',
    dynText: (g) =>
      `Veillez à toujours ${V(g)} ce médicament en suivant exactement les indications de ${HCP(g)}. Vérifiez auprès de ${HCP(g)} en cas de doute.`,
  },

  { type: 'sub', text: 'Posologie' },
  { type: 'para', key: 'posologie', ph: 'La dose recommandée est de…' },
  {
    type: 'check',
    key: 'enfants_po',
    text: 'Utilisation chez les enfants et les adolescents',
    asHeading: true,
  },
  {
    type: 'para',
    key: 'enfants_po_txt',
    ph: 'Posologie chez les enfants et adolescents',
    dependsOn: 'enfants_po',
  },
  {
    type: 'check',
    key: 'cassure1',
    text: 'La barre de cassure n’est là que pour faciliter la prise du comprimé si vous éprouvez des difficultés à l’avaler en entier.',
  },
  { type: 'check', key: 'cassure2', text: 'Le comprimé peut être divisé en doses égales.' },
  {
    type: 'check',
    key: 'cassure3',
    text: 'La barre de cassure n’est pas destinée à briser le comprimé.',
  },

  { type: 'sub', text: 'Mode d’administration' },
  {
    type: 'para',
    key: 'mode_admin',
    ph: 'Indiquer la voie d’administration et les modalités de prise',
  },

  { type: 'sub', text: 'Durée du traitement' },
  {
    type: 'para',
    key: 'duree_traitement',
    ph: 'Sauf avis médical, la durée du traitement est limitée à … (jours / semaines)',
  },

  {
    type: 'subDyn',
    dynText: (g) => `Si vous avez ${Vpris(g)} plus de ce médicament que vous n’auriez dû`,
  },
  { type: 'para', key: 'surdose', ph: 'Indiquer la conduite à tenir' },

  { type: 'subDyn', dynText: (g) => `Si vous oubliez ${Vde(g)} ce médicament` },
  {
    type: 'para',
    key: 'oubli',
    ph: 'Ne prenez pas de dose double pour compenser la dose que vous avez oublié de prendre ; …',
  },

  { type: 'subDyn', dynText: (g) => `Si vous arrêtez ${Vde(g)} ce médicament` },
  { type: 'para', key: 'arret', ph: 'Indiquer la conduite à tenir' },

  {
    type: 'dyn',
    dynText: (g) =>
      `Si vous avez d’autres questions sur l’utilisation de ce médicament, demandez plus d’informations à ${HCP(g)}.`,
  },

  { type: 'sec', text: '4.\tQUELS SONT LES EFFETS INDESIRABLES EVENTUELS ?' },
  {
    type: 'static',
    text: 'Comme tous les médicaments, ce médicament peut provoquer des effets indésirables, mais ils ne surviennent pas systématiquement chez tout le monde.',
  },
  { type: 'para', key: 'ei_liste', ph: 'Liste des effets indésirables (par fréquence)' },
  {
    type: 'check',
    key: 'ei_enfants',
    text: 'Effets indésirables supplémentaires chez les enfants et les adolescents',
    asHeading: true,
  },
  {
    type: 'para',
    key: 'ei_enfants_txt',
    ph: 'Effets indésirables spécifiques aux enfants et adolescents',
    dependsOn: 'ei_enfants',
  },

  { type: 'sub', text: 'Déclaration des effets secondaires' },
  {
    type: 'dyn',
    dynText: (g) =>
      `Si vous ressentez un quelconque effet indésirable, parlez-en à ${HCP(g)}. Ceci s’applique aussi à tout effet indésirable qui ne serait pas mentionné dans cette notice.`,
  },

  { type: 'sec', text: '5.\tCOMMENT CONSERVER CE MEDICAMENT ?' },
  { type: 'static', text: 'Tenir ce médicament hors de la vue et de la portée des enfants.' },
  {
    type: 'line',
    label: 'À conserver à une température ne dépassant pas ',
    key: 'temp_conservation',
    ph: 'X',
    narrow: true,
    suffix: ' °C, dans un milieu sec, à l’abri de la lumière et de l’humidité.',
  },
  {
    type: 'static',
    text: 'N’utilisez pas ce médicament après la date de péremption indiquée sur l’emballage. La date de péremption fait référence au dernier jour de ce mois.',
  },
  {
    type: 'check',
    key: 'deterioration',
    text: 'N’utilisez pas ce médicament si vous remarquez des signes visibles de détérioration.',
  },
  {
    type: 'para',
    key: 'deterioration_txt',
    ph: 'Description des signes visibles de détérioration',
    dependsOn: 'deterioration',
  },
  {
    type: 'check',
    key: 'elimination_env',
    text: 'Ne jetez aucun médicament au tout-à-l’égout ou avec les ordures ménagères. Demandez à votre pharmacien d’éliminer les médicaments que vous n’utilisez plus. Ces mesures contribueront à protéger l’environnement.',
  },

  { type: 'sec', text: '6.\tCONTENU DE L’EMBALLAGE ET AUTRES INFORMATIONS' },
  { type: 'sub', text: 'Ce que contient ce médicament' },
  { type: 'para', key: 'substances_actives', ph: 'La (les) substance(s) active(s) est (sont) : …' },
  {
    type: 'para',
    key: 'excipients',
    ph: 'Le(s) autre(s) composant(s) / excipient(s) est (sont) : …',
  },
  { type: 'sub', text: 'Qu’est-ce que ce médicament et contenu de l’emballage extérieur' },
  {
    type: 'para',
    key: 'presentation',
    ph: 'Ce médicament se présente sous forme de … Chaque boîte … contient …',
  },

  { type: 'sub', text: 'Titulaire de l’autorisation de mise sur le marché' },
  { type: 'line', key: 'amm_nom', ph: 'Nom du titulaire' },
  { type: 'para', key: 'amm_adresse', ph: 'Adresse complète' },

  { type: 'sub', text: 'Exploitant de l’autorisation de mise sur le marché' },
  { type: 'line', key: 'expl_nom', ph: 'Nom de l’exploitant' },
  { type: 'para', key: 'expl_adresse', ph: 'Adresse complète' },

  { type: 'sub', text: 'Fabricant' },
  { type: 'line', key: 'fab_nom', ph: 'Nom du fabricant' },
  { type: 'para', key: 'fab_adresse', ph: 'Adresse complète' },

  { type: 'sub', text: 'La dernière date à laquelle cette notice a été révisée est :' },
  { type: 'line', key: 'date_revision', ph: 'mois AAAA' },
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
