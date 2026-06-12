// Modèle du FORMULAIRE INTERACTIF RCP — porté tel quel du gabarit fourni par le CEO
// (RCP_formulaire_interactif.html, branding navy/Times « gabarit réglementaire Bénin/UEMOA »).
// C'est la SOURCE DE VÉRITÉ du rendu, de l'export DOCX/PDF et de la persistance TipTap du
// panneau « Remplir le template » pour les RCP. Les textes (titres officiels, mentions
// statiques, options à cocher) sont VERBATIM — ne pas reformuler sans décision CEO.
import { formatComposition } from '../composition'
import type { FormBlock, TemplateFormDefinition } from './form-types'

export const RCP_FORM_MODEL: FormBlock[] = [
  { type: 'title', text: 'RESUME DES CARACTERISTIQUES DU PRODUIT' },

  { type: 'sec', text: '1.\tDENOMINATION DU MEDICAMENT' },
  { type: 'line', key: 'denomination', ph: 'Nom du médicament, dosage, forme pharmaceutique' },

  { type: 'sec', text: '2.\tCOMPOSITION QUALITATIVE ET QUANTITATIVE' },
  {
    type: 'para',
    key: 'composition',
    ph: 'Composition qualitative et quantitative (substance(s) active(s) et quantité par unité de prise)',
  },
  { type: 'subsub', text: 'Excipient(s) à effet notoire :' },
  { type: 'para', key: 'excipients_notoires', ph: 'Excipient(s) à effet notoire et leur quantité' },
  { type: 'static', text: 'Pour la liste complète des excipients, voir rubrique 6.1.' },

  { type: 'sec', text: '3.\tFORME PHARMACEUTIQUE' },
  { type: 'para', key: 'forme', ph: 'Forme pharmaceutique et description (aspect)' },

  { type: 'sec', text: '4.\tDONNEES CLINIQUES' },

  { type: 'sub', text: '4.1.\tIndications thérapeutiques' },
  { type: 'para', key: 'indications', ph: 'Indications thérapeutiques' },

  { type: 'sub', text: '4.2.\tPosologie et mode d’administration' },
  { type: 'subsub', text: 'Posologie' },
  { type: 'para', key: 'posologie', ph: 'Posologie' },
  { type: 'subsub', text: 'Mode d’administration' },
  { type: 'para', key: 'mode_admin', ph: 'Mode d’administration' },

  { type: 'sub', text: '4.3.\tContre-indications' },
  { type: 'para', key: 'ci', ph: 'Contre-indications' },

  { type: 'sub', text: '4.4.\tMises en garde spéciales et précautions d’emploi' },
  { type: 'para', key: 'mises_en_garde', ph: 'Mises en garde spéciales et précautions d’emploi' },

  {
    type: 'sub',
    text: '4.5.\tInteractions avec d’autres médicaments et autres formes d’interactions',
  },
  {
    type: 'checks',
    key: 'interactions_chk',
    options: [
      'Aucune étude d’interaction n’a été réalisée.',
      'Population pédiatrique : les études d’interaction n’ont été réalisées que chez l’adulte.',
      'Associations contre-indiquées',
      'Associations déconseillées',
      'Associations faisant l’objet de précautions d’emploi',
      'Associations à prendre en compte',
      'Interactions avec les examens paracliniques',
    ],
  },
  {
    type: 'para',
    key: 'interactions',
    ph: 'Détail des interactions (selon les associations cochées ci-dessus)',
  },

  { type: 'sub', text: '4.6.\tFertilité, grossesse et allaitement' },
  { type: 'subsub', text: 'Grossesse' },
  { type: 'para', key: 'grossesse', ph: 'Données relatives à la grossesse' },
  { type: 'subsub', text: 'Allaitement' },
  { type: 'para', key: 'allaitement', ph: 'Données relatives à l’allaitement' },
  { type: 'subsub', text: 'Fertilité' },
  { type: 'para', key: 'fertilite', ph: 'Données relatives à la fertilité' },

  {
    type: 'sub',
    text: '4.7.\tEffets sur l’aptitude à conduire des véhicules et à utiliser des machines',
  },
  {
    type: 'para',
    key: 'conduite',
    ph: 'Effets sur l’aptitude à conduire et à utiliser des machines',
  },

  { type: 'sub', text: '4.8.\tEffets indésirables' },
  {
    type: 'para',
    key: 'ei',
    ph: 'Effets indésirables (par classe de système d’organes MedDRA et fréquence)',
  },
  { type: 'subsub', text: 'Déclaration des effets indésirables suspectés' },
  {
    type: 'static',
    text:
      'La déclaration des effets indésirables suspectés après autorisation du médicament est importante. ' +
      'Elle permet une surveillance continue du rapport bénéfice/risque du médicament. Les professionnels ' +
      'de santé déclarent tout effet indésirable suspecté via le système national de déclaration : Agence ' +
      'béninoise du Médicament et des autres produits de Santé – e-mail : vigilances.abmed@gouv.bj.',
  },

  { type: 'sub', text: '4.9.\tSurdosage' },
  { type: 'para', key: 'surdosage', ph: 'Informations relatives au surdosage' },

  { type: 'sec', text: '5.\tPROPRIETES PHARMACOLOGIQUES' },

  { type: 'sub', text: '5.1.\tPropriétés pharmacodynamiques' },
  {
    type: 'line',
    label: 'Classe pharmacothérapeutique : ',
    key: 'classe_pharma',
    ph: 'classe pharmacothérapeutique',
  },
  {
    type: 'atc',
    key: 'code_atc',
    chkKey: 'atc_non_attribue',
    label: 'Code ATC : ',
    ph: 'code ATC',
    chkLabel: 'Code ATC non encore attribué',
  },
  { type: 'subsub', text: 'Mécanisme d’action' },
  { type: 'para', key: 'mecanisme', ph: 'Mécanisme d’action' },
  { type: 'subsub', text: 'Effets pharmacodynamiques' },
  { type: 'para', key: 'effets_pd', ph: 'Effets pharmacodynamiques' },
  { type: 'subsub', text: 'Efficacité et sécurité clinique' },
  { type: 'para', key: 'efficacite', ph: 'Données d’efficacité et de sécurité clinique' },
  { type: 'subsub', text: 'Population pédiatrique' },
  { type: 'para', key: 'pediatrie_pd', ph: 'Données relatives à la population pédiatrique' },

  { type: 'sub', text: '5.2.\tPropriétés pharmacocinétiques' },
  { type: 'subsub', text: 'Absorption' },
  { type: 'para', key: 'absorption', ph: 'Données d’absorption' },
  { type: 'subsub', text: 'Distribution' },
  { type: 'para', key: 'distribution', ph: 'Données de distribution' },
  { type: 'subsub', text: 'Biotransformation' },
  { type: 'para', key: 'biotransformation', ph: 'Données de biotransformation' },
  { type: 'subsub', text: 'Élimination' },
  { type: 'para', key: 'elimination', ph: 'Données d’élimination' },
  { type: 'subsub', text: 'Linéarité/non-linéarité' },
  { type: 'para', key: 'linearite', ph: 'Données de linéarité/non-linéarité' },
  { type: 'subsub', text: 'Relations pharmacocinétique/pharmacodynamique' },
  { type: 'para', key: 'pkpd', ph: 'Relations PK/PD' },

  { type: 'sub', text: '5.3.\tDonnées de sécurité préclinique' },
  {
    type: 'checks',
    key: 'preclinique_chk',
    options: [
      'Les données non cliniques issues des études conventionnelles de pharmacologie de sécurité, toxicologie en administration répétée, génotoxicité, cancérogénèse, et des fonctions de reproduction et de développement, n’ont pas révélé de risque particulier pour l’homme.',
      'Des effets ont été observés chez l’animal uniquement à des expositions considérées comme suffisamment supérieures à l’exposition maximale observée chez l’homme, et ont peu de signification clinique.',
      'Les effets indésirables suivants n’ont pas été observés dans les études cliniques, mais ont été constatés chez des animaux soumis à des niveaux d’exposition semblables à ceux utilisés pour l’homme et pourraient avoir une signification clinique.',
      'Évaluation du risque environnemental',
    ],
  },
  {
    type: 'para',
    key: 'preclinique',
    ph: 'Données de sécurité préclinique (en complément des mentions cochées)',
  },

  { type: 'sec', text: '6.\tDONNEES PHARMACEUTIQUES' },

  { type: 'sub', text: '6.1.\tListe des excipients' },
  { type: 'para', key: 'liste_excipients', ph: 'Liste complète des excipients' },

  { type: 'sub', text: '6.2.\tIncompatibilités' },
  { type: 'checks', key: 'incompat_chk', options: ['Sans objet.'] },
  { type: 'para', key: 'incompatibilites', ph: 'Incompatibilités (si autres que « Sans objet. »)' },

  { type: 'sub', text: '6.3.\tDurée de conservation' },
  { type: 'duree', key: 'duree_nombre', ph: 'nombre' },

  { type: 'sub', text: '6.4.\tPrécautions particulières de conservation' },
  { type: 'para', key: 'conservation', ph: 'Précautions particulières de conservation' },

  { type: 'sub', text: '6.5.\tNature et contenu de l’emballage extérieur' },
  { type: 'para', key: 'emballage', ph: 'Nature et contenu de l’emballage extérieur' },

  { type: 'sub', text: '6.6.\tPrécautions particulières d’élimination et de manipulation' },
  {
    type: 'checks',
    key: 'elim_chk',
    options: [
      'Pas d’exigences particulières pour l’élimination.',
      'Tout médicament non utilisé ou déchet doit être éliminé conformément à la réglementation en vigueur.',
    ],
  },
  {
    type: 'para',
    key: 'elimination_manip',
    ph: 'Précautions d’élimination et de manipulation (en complément des mentions cochées)',
  },

  { type: 'sec', text: '7.\tTITULAIRE DE L’AUTORISATION DE MISE SUR LE MARCHE' },
  { type: 'line', key: 'amm_nom', ph: 'Nom du titulaire de l’AMM' },
  { type: 'para', key: 'amm_adresse', ph: 'Adresse complète du titulaire de l’AMM' },
  { type: 'line', label: 'Tél. : ', key: 'amm_tel', ph: 'téléphone' },
  { type: 'line', label: 'Fax : ', key: 'amm_fax', ph: 'fax' },
  { type: 'line', label: 'E-mail : ', key: 'amm_email', ph: 'adresse e-mail' },

  { type: 'sec', text: '7 bis.\tFABRICANT' },
  {
    type: 'checks',
    key: 'fab_chk',
    options: ['Fabricant différent du titulaire de l’autorisation de mise sur le marché.'],
  },
  { type: 'line', key: 'fab_nom', ph: 'Nom du fabricant' },
  { type: 'para', key: 'fab_adresse', ph: 'Adresse complète du site de fabrication' },
  { type: 'line', label: 'Tél. : ', key: 'fab_tel', ph: 'téléphone' },
  { type: 'line', label: 'Fax : ', key: 'fab_fax', ph: 'fax' },
  { type: 'line', label: 'E-mail : ', key: 'fab_email', ph: 'adresse e-mail' },

  { type: 'sec', text: '8.\tNUMERO(S) D’AUTORISATION DE MISE SUR LE MARCHE' },
  { type: 'para', key: 'num_amm', ph: 'Numéro(s) d’AMM' },

  { type: 'sec', text: '9.\tDATE DE PREMIERE AUTORISATION/DE RENOUVELLEMENT DE L’AUTORISATION' },
  {
    type: 'line',
    label: 'Date de première autorisation : ',
    key: 'date_premiere',
    ph: 'JJ mois AAAA',
  },
  {
    type: 'line',
    label: 'Date de dernier renouvellement : ',
    key: 'date_renouvellement',
    ph: 'JJ mois AAAA',
  },

  { type: 'sec', text: '10.\tDATE DE MISE A JOUR DU TEXTE' },
  { type: 'line', key: 'date_maj', ph: 'JJ mois AAAA' },

  { type: 'rule' },
  { type: 'title', text: 'CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE' },
  {
    type: 'checks',
    key: 'prescription_chk',
    options: [
      'Médicament non soumis à prescription médicale.',
      'Liste I',
      'Liste II',
      'Stupéfiant',
    ],
  },
  {
    type: 'para',
    key: 'prescription_libre',
    ph: 'Précisions éventuelles sur les conditions de prescription et de délivrance',
  },
]

/**
 * Définition du formulaire RCP. Pré-remplissage STRICTEMENT limité à la session
 * Identification de la fiche produit (dénomination, composition, forme) — tout le reste à
 * l'utilisateur (exigence CEO).
 */
export const RCP_FORM_DEFINITION: TemplateFormDefinition = {
  docType: 'rcp',
  model: RCP_FORM_MODEL,
  topbarTitle: 'Résumé des Caractéristiques du Produit',
  slugPrefix: 'RCP',
  slugKey: 'denomination',
  prefill: (product) => ({
    denomination: [product.nomCommercial, product.dosage, product.forme].filter(Boolean).join(', '),
    composition: formatComposition(product.dci, product.dosage),
    forme: product.forme ?? '',
  }),
}
