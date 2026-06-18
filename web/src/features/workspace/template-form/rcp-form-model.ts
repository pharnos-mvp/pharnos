// Modèle du FORMULAIRE INTERACTIF RCP — porté tel quel du gabarit fourni par le CEO
// (RCP_formulaire_interactif.html, branding navy/Times « gabarit réglementaire Bénin/UEMOA »).
// C'est la SOURCE DE VÉRITÉ du rendu, de l'export DOCX/PDF et de la persistance TipTap du
// panneau « Remplir le template » pour les RCP. Les textes (titres officiels, mentions
// statiques, options à cocher) sont VERBATIM — ne pas reformuler sans décision CEO.
// Bilingue (jalon Bibliothèque) : EN en champs jumeaux `*En`, rubriques SmPC standard + termes
// MedDRA EN (cf. RA-source/Template/RCP : WHO SmPC 2016). Les `key` sont identiques FR/EN → la
// saisie de l'utilisateur est indépendante de la langue d'affichage.
import { formatComposition } from '../composition'
import type { FormBlock, TemplateFormDefinition } from './form-types'

export const RCP_FORM_MODEL: FormBlock[] = [
  {
    type: 'title',
    text: 'RESUME DES CARACTERISTIQUES DU PRODUIT',
    textEn: 'SUMMARY OF PRODUCT CHARACTERISTICS',
  },

  {
    type: 'sec',
    text: '1.\tDENOMINATION DU MEDICAMENT',
    textEn: '1.\tNAME OF THE MEDICINAL PRODUCT',
  },
  {
    type: 'line',
    key: 'denomination',
    ph: 'Nom du médicament, dosage, forme pharmaceutique',
    phEn: 'Name of the medicinal product, strength, pharmaceutical form',
  },

  {
    type: 'sec',
    text: '2.\tCOMPOSITION QUALITATIVE ET QUANTITATIVE',
    textEn: '2.\tQUALITATIVE AND QUANTITATIVE COMPOSITION',
  },
  {
    type: 'para',
    key: 'composition',
    ph: 'Composition qualitative et quantitative (substance(s) active(s) et quantité par unité de prise)',
    phEn: 'Qualitative and quantitative composition (active substance(s) and amount per unit dose)',
  },
  {
    type: 'subsub',
    text: 'Excipient(s) à effet notoire :',
    textEn: 'Excipient(s) with known effect:',
  },
  {
    type: 'para',
    key: 'excipients_notoires',
    ph: 'Excipient(s) à effet notoire et leur quantité',
    phEn: 'Excipient(s) with known effect and their amount',
  },
  {
    type: 'static',
    text: 'Pour la liste complète des excipients, voir rubrique 6.1.',
    textEn: 'For the full list of excipients, see section 6.1.',
  },

  { type: 'sec', text: '3.\tFORME PHARMACEUTIQUE', textEn: '3.\tPHARMACEUTICAL FORM' },
  {
    type: 'para',
    key: 'forme',
    ph: 'Forme pharmaceutique et description (aspect)',
    phEn: 'Pharmaceutical form and description (appearance)',
  },

  { type: 'sec', text: '4.\tDONNEES CLINIQUES', textEn: '4.\tCLINICAL PARTICULARS' },

  {
    type: 'sub',
    text: '4.1.\tIndications thérapeutiques',
    textEn: '4.1.\tTherapeutic indications',
  },
  {
    type: 'para',
    key: 'indications',
    ph: 'Indications thérapeutiques',
    phEn: 'Therapeutic indications',
  },

  {
    type: 'sub',
    text: '4.2.\tPosologie et mode d’administration',
    textEn: '4.2.\tPosology and method of administration',
  },
  { type: 'subsub', text: 'Posologie', textEn: 'Posology' },
  { type: 'para', key: 'posologie', ph: 'Posologie', phEn: 'Posology' },
  { type: 'subsub', text: 'Mode d’administration', textEn: 'Method of administration' },
  {
    type: 'para',
    key: 'mode_admin',
    ph: 'Mode d’administration',
    phEn: 'Method of administration',
  },

  { type: 'sub', text: '4.3.\tContre-indications', textEn: '4.3.\tContraindications' },
  { type: 'para', key: 'ci', ph: 'Contre-indications', phEn: 'Contraindications' },

  {
    type: 'sub',
    text: '4.4.\tMises en garde spéciales et précautions d’emploi',
    textEn: '4.4.\tSpecial warnings and precautions for use',
  },
  {
    type: 'para',
    key: 'mises_en_garde',
    ph: 'Mises en garde spéciales et précautions d’emploi',
    phEn: 'Special warnings and precautions for use',
  },

  {
    type: 'sub',
    text: '4.5.\tInteractions avec d’autres médicaments et autres formes d’interactions',
    textEn: '4.5.\tInteraction with other medicinal products and other forms of interaction',
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
    optionsEn: [
      'No interaction studies have been performed.',
      'Paediatric population: interaction studies have only been performed in adults.',
      'Contraindicated combinations',
      'Combinations not recommended',
      'Combinations requiring precautions for use',
      'Combinations to be taken into account',
      'Interactions with laboratory tests',
    ],
  },
  {
    type: 'para',
    key: 'interactions',
    ph: 'Détail des interactions (selon les associations cochées ci-dessus)',
    phEn: 'Details of interactions (according to the combinations ticked above)',
  },

  {
    type: 'sub',
    text: '4.6.\tFertilité, grossesse et allaitement',
    textEn: '4.6.\tFertility, pregnancy and lactation',
  },
  { type: 'subsub', text: 'Grossesse', textEn: 'Pregnancy' },
  {
    type: 'para',
    key: 'grossesse',
    ph: 'Données relatives à la grossesse',
    phEn: 'Data on pregnancy',
  },
  { type: 'subsub', text: 'Allaitement', textEn: 'Breast-feeding' },
  {
    type: 'para',
    key: 'allaitement',
    ph: 'Données relatives à l’allaitement',
    phEn: 'Data on breast-feeding',
  },
  { type: 'subsub', text: 'Fertilité', textEn: 'Fertility' },
  {
    type: 'para',
    key: 'fertilite',
    ph: 'Données relatives à la fertilité',
    phEn: 'Data on fertility',
  },

  {
    type: 'sub',
    text: '4.7.\tEffets sur l’aptitude à conduire des véhicules et à utiliser des machines',
    textEn: '4.7.\tEffects on ability to drive and use machines',
  },
  {
    type: 'para',
    key: 'conduite',
    ph: 'Effets sur l’aptitude à conduire et à utiliser des machines',
    phEn: 'Effects on the ability to drive and use machines',
  },

  { type: 'sub', text: '4.8.\tEffets indésirables', textEn: '4.8.\tUndesirable effects' },
  {
    type: 'para',
    key: 'ei',
    ph: 'Effets indésirables (par classe de système d’organes MedDRA et fréquence)',
    phEn: 'Undesirable effects (by MedDRA system organ class and frequency)',
  },
  {
    type: 'subsub',
    text: 'Déclaration des effets indésirables suspectés',
    textEn: 'Reporting of suspected adverse reactions',
  },
  {
    type: 'static',
    text:
      'La déclaration des effets indésirables suspectés après autorisation du médicament est importante. ' +
      'Elle permet une surveillance continue du rapport bénéfice/risque du médicament. Les professionnels ' +
      'de santé déclarent tout effet indésirable suspecté via le système national de déclaration : Agence ' +
      'béninoise du Médicament et des autres produits de Santé – e-mail : vigilances.abmed@gouv.bj.',
    textEn:
      'Reporting suspected adverse reactions after authorisation of the medicinal product is important. ' +
      'It allows continued monitoring of the benefit/risk balance of the medicinal product. Healthcare ' +
      'professionals are asked to report any suspected adverse reactions via the national reporting system: ' +
      'Beninese Medicines Agency (ABMed) – e-mail: vigilances.abmed@gouv.bj.',
  },

  { type: 'sub', text: '4.9.\tSurdosage', textEn: '4.9.\tOverdose' },
  {
    type: 'para',
    key: 'surdosage',
    ph: 'Informations relatives au surdosage',
    phEn: 'Information on overdose',
  },

  {
    type: 'sec',
    text: '5.\tPROPRIETES PHARMACOLOGIQUES',
    textEn: '5.\tPHARMACOLOGICAL PROPERTIES',
  },

  {
    type: 'sub',
    text: '5.1.\tPropriétés pharmacodynamiques',
    textEn: '5.1.\tPharmacodynamic properties',
  },
  {
    type: 'line',
    label: 'Classe pharmacothérapeutique : ',
    labelEn: 'Pharmacotherapeutic group: ',
    key: 'classe_pharma',
    ph: 'classe pharmacothérapeutique',
    phEn: 'pharmacotherapeutic group',
  },
  {
    type: 'atc',
    key: 'code_atc',
    chkKey: 'atc_non_attribue',
    label: 'Code ATC : ',
    labelEn: 'ATC code: ',
    ph: 'code ATC',
    phEn: 'ATC code',
    chkLabel: 'Code ATC non encore attribué',
    chkLabelEn: 'ATC code not yet assigned',
  },
  { type: 'subsub', text: 'Mécanisme d’action', textEn: 'Mechanism of action' },
  { type: 'para', key: 'mecanisme', ph: 'Mécanisme d’action', phEn: 'Mechanism of action' },
  { type: 'subsub', text: 'Effets pharmacodynamiques', textEn: 'Pharmacodynamic effects' },
  {
    type: 'para',
    key: 'effets_pd',
    ph: 'Effets pharmacodynamiques',
    phEn: 'Pharmacodynamic effects',
  },
  {
    type: 'subsub',
    text: 'Efficacité et sécurité clinique',
    textEn: 'Clinical efficacy and safety',
  },
  {
    type: 'para',
    key: 'efficacite',
    ph: 'Données d’efficacité et de sécurité clinique',
    phEn: 'Clinical efficacy and safety data',
  },
  { type: 'subsub', text: 'Population pédiatrique', textEn: 'Paediatric population' },
  {
    type: 'para',
    key: 'pediatrie_pd',
    ph: 'Données relatives à la population pédiatrique',
    phEn: 'Data on the paediatric population',
  },

  {
    type: 'sub',
    text: '5.2.\tPropriétés pharmacocinétiques',
    textEn: '5.2.\tPharmacokinetic properties',
  },
  { type: 'subsub', text: 'Absorption', textEn: 'Absorption' },
  { type: 'para', key: 'absorption', ph: 'Données d’absorption', phEn: 'Absorption data' },
  { type: 'subsub', text: 'Distribution', textEn: 'Distribution' },
  { type: 'para', key: 'distribution', ph: 'Données de distribution', phEn: 'Distribution data' },
  { type: 'subsub', text: 'Biotransformation', textEn: 'Biotransformation' },
  {
    type: 'para',
    key: 'biotransformation',
    ph: 'Données de biotransformation',
    phEn: 'Biotransformation data',
  },
  { type: 'subsub', text: 'Élimination', textEn: 'Elimination' },
  { type: 'para', key: 'elimination', ph: 'Données d’élimination', phEn: 'Elimination data' },
  { type: 'subsub', text: 'Linéarité/non-linéarité', textEn: 'Linearity/non-linearity' },
  {
    type: 'para',
    key: 'linearite',
    ph: 'Données de linéarité/non-linéarité',
    phEn: 'Linearity/non-linearity data',
  },
  {
    type: 'subsub',
    text: 'Relations pharmacocinétique/pharmacodynamique',
    textEn: 'Pharmacokinetic/pharmacodynamic relationship(s)',
  },
  { type: 'para', key: 'pkpd', ph: 'Relations PK/PD', phEn: 'PK/PD relationship(s)' },

  {
    type: 'sub',
    text: '5.3.\tDonnées de sécurité préclinique',
    textEn: '5.3.\tPreclinical safety data',
  },
  {
    type: 'checks',
    key: 'preclinique_chk',
    options: [
      'Les données non cliniques issues des études conventionnelles de pharmacologie de sécurité, toxicologie en administration répétée, génotoxicité, cancérogénèse, et des fonctions de reproduction et de développement, n’ont pas révélé de risque particulier pour l’homme.',
      'Des effets ont été observés chez l’animal uniquement à des expositions considérées comme suffisamment supérieures à l’exposition maximale observée chez l’homme, et ont peu de signification clinique.',
      'Les effets indésirables suivants n’ont pas été observés dans les études cliniques, mais ont été constatés chez des animaux soumis à des niveaux d’exposition semblables à ceux utilisés pour l’homme et pourraient avoir une signification clinique.',
      'Évaluation du risque environnemental',
    ],
    optionsEn: [
      'Non-clinical data reveal no special hazard for humans based on conventional studies of safety pharmacology, repeated dose toxicity, genotoxicity, carcinogenic potential, and toxicity to reproduction and development.',
      'Effects in non-clinical studies were observed only at exposures considered sufficiently in excess of the maximum human exposure, indicating little relevance to clinical use.',
      'The following adverse reactions were not observed in clinical studies, but were seen in animals at exposure levels similar to clinical exposure levels and with possible relevance to clinical use.',
      'Environmental risk assessment',
    ],
  },
  {
    type: 'para',
    key: 'preclinique',
    ph: 'Données de sécurité préclinique (en complément des mentions cochées)',
    phEn: 'Preclinical safety data (in addition to the statements ticked)',
  },

  { type: 'sec', text: '6.\tDONNEES PHARMACEUTIQUES', textEn: '6.\tPHARMACEUTICAL PARTICULARS' },

  { type: 'sub', text: '6.1.\tListe des excipients', textEn: '6.1.\tList of excipients' },
  {
    type: 'para',
    key: 'liste_excipients',
    ph: 'Liste complète des excipients',
    phEn: 'Full list of excipients',
  },

  { type: 'sub', text: '6.2.\tIncompatibilités', textEn: '6.2.\tIncompatibilities' },
  { type: 'checks', key: 'incompat_chk', options: ['Sans objet.'], optionsEn: ['Not applicable.'] },
  {
    type: 'para',
    key: 'incompatibilites',
    ph: 'Incompatibilités (si autres que « Sans objet. »)',
    phEn: 'Incompatibilities (if other than “Not applicable.”)',
  },

  { type: 'sub', text: '6.3.\tDurée de conservation', textEn: '6.3.\tShelf life' },
  { type: 'duree', key: 'duree_nombre', ph: 'nombre', phEn: 'number' },

  {
    type: 'sub',
    text: '6.4.\tPrécautions particulières de conservation',
    textEn: '6.4.\tSpecial precautions for storage',
  },
  {
    type: 'para',
    key: 'conservation',
    ph: 'Précautions particulières de conservation',
    phEn: 'Special precautions for storage',
  },

  {
    type: 'sub',
    text: '6.5.\tNature et contenu de l’emballage extérieur',
    textEn: '6.5.\tNature and contents of container',
  },
  {
    type: 'para',
    key: 'emballage',
    ph: 'Nature et contenu de l’emballage extérieur',
    phEn: 'Nature and contents of container',
  },

  {
    type: 'sub',
    text: '6.6.\tPrécautions particulières d’élimination et de manipulation',
    textEn: '6.6.\tSpecial precautions for disposal and other handling',
  },
  {
    type: 'checks',
    key: 'elim_chk',
    options: [
      'Pas d’exigences particulières pour l’élimination.',
      'Tout médicament non utilisé ou déchet doit être éliminé conformément à la réglementation en vigueur.',
    ],
    optionsEn: [
      'No special requirements for disposal.',
      'Any unused medicinal product or waste material should be disposed of in accordance with local requirements.',
    ],
  },
  {
    type: 'para',
    key: 'elimination_manip',
    ph: 'Précautions d’élimination et de manipulation (en complément des mentions cochées)',
    phEn: 'Disposal and handling precautions (in addition to the statements ticked)',
  },

  {
    type: 'sec',
    text: '7.\tTITULAIRE DE L’AUTORISATION DE MISE SUR LE MARCHE',
    textEn: '7.\tMARKETING AUTHORISATION HOLDER',
  },
  {
    type: 'line',
    key: 'amm_nom',
    ph: 'Nom du titulaire de l’AMM',
    phEn: 'Name of the marketing authorisation holder',
  },
  {
    type: 'para',
    key: 'amm_adresse',
    ph: 'Adresse complète du titulaire de l’AMM',
    phEn: 'Full address of the marketing authorisation holder',
  },
  {
    type: 'line',
    label: 'Tél. : ',
    labelEn: 'Tel.: ',
    key: 'amm_tel',
    ph: 'téléphone',
    phEn: 'telephone',
  },
  { type: 'line', label: 'Fax : ', labelEn: 'Fax: ', key: 'amm_fax', ph: 'fax', phEn: 'fax' },
  {
    type: 'line',
    label: 'E-mail : ',
    labelEn: 'E-mail: ',
    key: 'amm_email',
    ph: 'adresse e-mail',
    phEn: 'e-mail address',
  },

  { type: 'sec', text: '7 bis.\tFABRICANT', textEn: '7a.\tMANUFACTURER' },
  {
    type: 'checks',
    key: 'fab_chk',
    options: ['Fabricant différent du titulaire de l’autorisation de mise sur le marché.'],
    optionsEn: ['Manufacturer different from the marketing authorisation holder.'],
  },
  { type: 'line', key: 'fab_nom', ph: 'Nom du fabricant', phEn: 'Name of the manufacturer' },
  {
    type: 'para',
    key: 'fab_adresse',
    ph: 'Adresse complète du site de fabrication',
    phEn: 'Full address of the manufacturing site',
  },
  {
    type: 'line',
    label: 'Tél. : ',
    labelEn: 'Tel.: ',
    key: 'fab_tel',
    ph: 'téléphone',
    phEn: 'telephone',
  },
  { type: 'line', label: 'Fax : ', labelEn: 'Fax: ', key: 'fab_fax', ph: 'fax', phEn: 'fax' },
  {
    type: 'line',
    label: 'E-mail : ',
    labelEn: 'E-mail: ',
    key: 'fab_email',
    ph: 'adresse e-mail',
    phEn: 'e-mail address',
  },

  {
    type: 'sec',
    text: '8.\tNUMERO(S) D’AUTORISATION DE MISE SUR LE MARCHE',
    textEn: '8.\tMARKETING AUTHORISATION NUMBER(S)',
  },
  {
    type: 'para',
    key: 'num_amm',
    ph: 'Numéro(s) d’AMM',
    phEn: 'Marketing authorisation number(s)',
  },

  {
    type: 'sec',
    text: '9.\tDATE DE PREMIERE AUTORISATION/DE RENOUVELLEMENT DE L’AUTORISATION',
    textEn: '9.\tDATE OF FIRST AUTHORISATION/RENEWAL OF THE AUTHORISATION',
  },
  {
    type: 'line',
    label: 'Date de première autorisation : ',
    labelEn: 'Date of first authorisation: ',
    key: 'date_premiere',
    ph: 'JJ mois AAAA',
    phEn: 'DD month YYYY',
  },
  {
    type: 'line',
    label: 'Date de dernier renouvellement : ',
    labelEn: 'Date of latest renewal: ',
    key: 'date_renouvellement',
    ph: 'JJ mois AAAA',
    phEn: 'DD month YYYY',
  },

  {
    type: 'sec',
    text: '10.\tDATE DE MISE A JOUR DU TEXTE',
    textEn: '10.\tDATE OF REVISION OF THE TEXT',
  },
  { type: 'line', key: 'date_maj', ph: 'JJ mois AAAA', phEn: 'DD month YYYY' },

  { type: 'rule' },
  {
    type: 'title',
    text: 'CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE',
    textEn: 'CONDITIONS OF PRESCRIPTION AND DISPENSING',
  },
  {
    type: 'checks',
    key: 'prescription_chk',
    options: [
      'Médicament non soumis à prescription médicale.',
      'Liste I',
      'Liste II',
      'Stupéfiant',
    ],
    optionsEn: [
      'Medicinal product not subject to medical prescription.',
      'List I',
      'List II',
      'Narcotic',
    ],
  },
  {
    type: 'para',
    key: 'prescription_libre',
    ph: 'Précisions éventuelles sur les conditions de prescription et de délivrance',
    phEn: 'Any details on the conditions of prescription and dispensing',
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
