// Modèle du FORMULAIRE Étiquetage — construit depuis le TEMPLATE OFFICIEL
// `RA-source/Template/Etiquetage/ABMed_Template etiquetage_2026.pdf` (intitulés VERBATIM).
// Trois parties : A. emballage extérieur/conditionnement primaire (rubriques 1-17 +
// pictogramme), B. plaquettes/films thermosoudés (1-5), C. petits conditionnements
// primaires (1-6). Les titres de rubrique sont des BANDEAUX gris (style du template).
// Bilingue (jalon Bibliothèque) : EN en champs jumeaux `*En` — intitulés standard QRD/EMA
// « Labelling » (Annex IIIA). FR verbatim INCHANGÉ ; `key` identiques FR/EN.
import { formatComposition } from '../composition'
import type { FormBlock, TemplateFormDefinition } from './form-types'

const NA = ['Sans objet.']
const NA_EN = ['Not applicable.']

export const LABELING_FORM_MODEL: FormBlock[] = [
  { type: 'title', text: 'ETIQUETAGE', textEn: 'LABELLING' },

  /* ---- A. Emballage extérieur et conditionnement primaire ---- */
  {
    type: 'banner',
    text: 'MENTIONS DEVANT FIGURER SUR L’EMBALLAGE EXTERIEUR ET SUR LE CONDITIONNEMENT PRIMAIRE',
    textEn: 'PARTICULARS TO APPEAR ON THE OUTER PACKAGING AND THE IMMEDIATE PACKAGING',
  },

  {
    type: 'banner',
    text: 'NATURE/TYPE EMBALLAGE SECONDAIRE OU CONDITIONNEMENT PRIMAIRE',
    textEn: 'NATURE/TYPE OF OUTER PACKAGING OR IMMEDIATE PACKAGING',
  },
  {
    type: 'line',
    key: 'nature_emballage',
    ph: 'Conditionnement secondaire et/ou conditionnement(s) primaire(s)',
    phEn: 'Outer packaging and/or immediate packaging',
  },

  {
    type: 'banner',
    text: '1.\tDENOMINATION DU MEDICAMENT',
    textEn: '1.\tNAME OF THE MEDICINAL PRODUCT',
  },
  {
    type: 'line',
    key: 'denomination',
    ph: 'Dénomination du médicament',
    phEn: 'Name of the medicinal product',
  },
  { type: 'line', key: 'substances', ph: 'Substance(s) active(s)', phEn: 'Active substance(s)' },

  {
    type: 'banner',
    text: '2.\tCOMPOSITION EN SUBSTANCES ACTIVES',
    textEn: '2.\tSTATEMENT OF ACTIVE SUBSTANCE(S)',
  },
  {
    type: 'para',
    key: 'composition',
    ph: 'Composition en substances actives',
    phEn: 'Statement of active substance(s)',
  },

  { type: 'banner', text: '3.\tLISTE DES EXCIPIENTS', textEn: '3.\tLIST OF EXCIPIENTS' },
  { type: 'checks', key: 'excipients_chk', options: NA, optionsEn: NA_EN },
  {
    type: 'para',
    key: 'excipients_txt',
    ph: 'Préciser la présence d’excipient à effet notoire',
    phEn: 'State any excipient with known effect',
  },

  {
    type: 'banner',
    text: '4.\tFORME PHARMACEUTIQUE ET CONTENU',
    textEn: '4.\tPHARMACEUTICAL FORM AND CONTENTS',
  },
  {
    type: 'para',
    key: 'forme_contenu',
    ph: 'Forme pharmaceutique et contenu',
    phEn: 'Pharmaceutical form and contents',
  },

  {
    type: 'banner',
    text: '5.\tMODE ET VOIE(S) D’ADMINISTRATION',
    textEn: '5.\tMETHOD AND ROUTE(S) OF ADMINISTRATION',
  },
  { type: 'line', key: 'voie', ph: 'Indiquez la voie', phEn: 'State the route' },
  {
    type: 'static',
    text: 'Lire la notice avant utilisation.',
    textEn: 'Read the package leaflet before use.',
  },

  {
    type: 'banner',
    text: '6.\tMISE EN GARDE SPECIALE INDIQUANT QUE LE MEDICAMENT DOIT ETRE CONSERVE HORS DE VUE ET DE PORTEE DES ENFANTS',
    textEn:
      '6.\tSPECIAL WARNING THAT THE MEDICINAL PRODUCT MUST BE STORED OUT OF THE SIGHT AND REACH OF CHILDREN',
  },
  {
    type: 'static',
    text: 'Tenir hors de la vue et de la portée des enfants.',
    textEn: 'Keep out of the sight and reach of children.',
  },

  {
    type: 'banner',
    text: '7.\tAUTRE(S) MISE(S) EN GARDE SPECIALE(S), SI NECESSAIRE',
    textEn: '7.\tOTHER SPECIAL WARNING(S), IF NECESSARY',
  },
  { type: 'checks', key: 'mises_garde_chk', options: NA, optionsEn: NA_EN },
  {
    type: 'para',
    key: 'mises_garde_txt',
    ph: 'Autre(s) mise(s) en garde spéciale(s)',
    phEn: 'Other special warning(s)',
  },

  {
    type: 'banner',
    text: '8.\tDATES DE FABRICATION ET DE PEREMPTION',
    textEn: '8.\tMANUFACTURING AND EXPIRY DATES',
  },
  {
    type: 'line',
    label: 'FAB ',
    labelEn: 'MFG ',
    key: 'fab_date',
    ph: 'MM/AAAA',
    phEn: 'MM/YYYY',
    narrow: true,
  },
  {
    type: 'line',
    label: 'EXP ',
    labelEn: 'EXP ',
    key: 'exp_date',
    ph: 'MM/AAAA',
    phEn: 'MM/YYYY',
    narrow: true,
  },

  {
    type: 'banner',
    text: '9.\tPRECAUTIONS PARTICULIERES DE CONSERVATION',
    textEn: '9.\tSPECIAL STORAGE CONDITIONS',
  },
  {
    type: 'para',
    key: 'conservation',
    ph: 'À conserver à moins de 30 °C, dans un endroit sec et à l’abri de la lumière',
    phEn: 'Store below 30 °C, in a dry place and protected from light',
  },

  {
    type: 'banner',
    text: '10.\tPRECAUTIONS PARTICULIERES D’ELIMINATION DES MEDICAMENTS NON UTILISES OU DES DECHETS PROVENANT DE CES MEDICAMENTS S’IL Y A LIEU',
    textEn:
      '10.\tSPECIAL PRECAUTIONS FOR DISPOSAL OF UNUSED MEDICINAL PRODUCTS OR WASTE MATERIALS DERIVED FROM SUCH MEDICINAL PRODUCTS, IF APPROPRIATE',
  },
  {
    type: 'para',
    key: 'elimination',
    ph: 'Précautions particulières d’élimination',
    phEn: 'Special precautions for disposal',
  },

  {
    type: 'banner',
    text: '11.\tNOM ET ADRESSE DU TITULAIRE DE L’AUTORISATION DE MISE SUR LE MARCHE',
    textEn: '11.\tNAME AND ADDRESS OF THE MARKETING AUTHORISATION HOLDER',
  },
  { type: 'sub', text: 'Titulaire', textEn: 'Marketing authorisation holder' },
  { type: 'line', key: 'tit_nom', ph: 'Nom du titulaire', phEn: 'Name of the holder' },
  { type: 'para', key: 'tit_adresse', ph: 'Adresse complète', phEn: 'Full address' },
  { type: 'sub', text: 'Exploitant', textEn: 'Local representative' },
  {
    type: 'line',
    key: 'expl_nom',
    ph: 'Nom de l’exploitant',
    phEn: 'Name of the local representative',
  },
  { type: 'para', key: 'expl_adresse', ph: 'Adresse complète', phEn: 'Full address' },

  { type: 'banner', text: '12.\tNUMERO DU LOT', textEn: '12.\tBATCH NUMBER' },
  {
    type: 'line',
    label: 'Lot ',
    labelEn: 'Lot ',
    key: 'lot',
    ph: 'numéro',
    phEn: 'number',
    narrow: true,
  },

  {
    type: 'banner',
    text: '13.\tCONDITIONS DE PRESCRIPTION ET DE DELIVRANCE',
    textEn: '13.\tCONDITIONS OF PRESCRIPTION AND DISPENSING',
  },
  {
    type: 'para',
    key: 'prescription',
    ph: 'Copier/coller les libellés figurant dans la rubrique « conditions de prescription et de délivrance » du RCP',
    phEn: 'Copy the wording from the “conditions of prescription and dispensing” section of the SmPC',
  },

  { type: 'banner', text: '14.\tINDICATIONS D’UTILISATION', textEn: '14.\tINSTRUCTIONS ON USE' },
  { type: 'checks', key: 'indications_chk', options: NA, optionsEn: NA_EN },
  {
    type: 'para',
    key: 'indications_txt',
    ph: 'Médicament NON soumis à prescription médicale uniquement : libellé de la notice « 1. Qu’est-ce que X et dans quels cas est-il utilisé ? »',
    phEn: 'Non-prescription medicines only: package leaflet wording “1. What X is and what it is used for”',
  },

  { type: 'banner', text: '15.\tINFORMATIONS EN BRAILLE', textEn: '15.\tINFORMATION IN BRAILLE' },
  { type: 'para', key: 'braille', ph: 'Informations en braille', phEn: 'Information in Braille' },

  {
    type: 'banner',
    text: '16.\tIDENTIFIANT UNIQUE - CODE-BARRES 2D',
    textEn: '16.\tUNIQUE IDENTIFIER - 2D BARCODE',
  },
  {
    type: 'checks',
    key: 'code_barres_chk',
    options: ['Code-barres 2D portant l’identifiant unique inclus.', 'Sans objet.'],
    optionsEn: ['2D barcode carrying the unique identifier included.', 'Not applicable.'],
  },

  {
    type: 'banner',
    text: '17.\tIDENTIFIANT UNIQUE - DONNÉES LISIBLES PAR LES HUMAINS',
    textEn: '17.\tUNIQUE IDENTIFIER - HUMAN READABLE DATA',
  },
  {
    type: 'line',
    label: 'PC : ',
    labelEn: 'PC: ',
    key: 'pc',
    ph: 'numéro (code CIP)',
    phEn: 'number (product code)',
  },
  {
    type: 'line',
    label: 'SN : ',
    labelEn: 'SN: ',
    key: 'sn',
    ph: 'numéro de série',
    phEn: 'serial number',
  },
  { type: 'checks', key: 'identifiant_chk', options: NA, optionsEn: NA_EN },

  {
    type: 'banner',
    text: 'PICTOGRAMME DEVANT FIGURER SUR L’EMBALLAGE EXTERIEUR OU, EN L’ABSENCE D’EMBALLAGE EXTERIEUR, SUR LE CONDITIONNEMENT PRIMAIRE',
    textEn:
      'PICTOGRAM TO APPEAR ON THE OUTER PACKAGING OR, WHERE THERE IS NO OUTER PACKAGING, ON THE IMMEDIATE PACKAGING',
  },
  {
    type: 'checks',
    key: 'picto_chk',
    options: [
      'Pictogramme relatif aux effets tératogènes ou fœtotoxiques',
      'Pictogramme relatif aux effets sur la capacité à conduire',
      'Sans objet.',
    ],
    optionsEn: [
      'Pictogram relating to teratogenic or foetotoxic effects',
      'Pictogram relating to effects on the ability to drive',
      'Not applicable.',
    ],
  },

  /* ---- B. Plaquettes / films thermosoudés ---- */
  { type: 'rule' },
  {
    type: 'banner',
    text: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PLAQUETTES OU LES FILMS THERMOSOUDES',
    textEn: 'MINIMUM PARTICULARS TO APPEAR ON BLISTERS OR STRIPS',
  },

  {
    type: 'banner',
    text: 'NATURE/TYPE PLAQUETTES / FILMS',
    textEn: 'NATURE/TYPE OF BLISTERS / STRIPS',
  },
  {
    type: 'checks',
    key: 'b_nature_chk',
    options: ['Plaquettes', 'Films thermosoudés', 'Sans objet.'],
    optionsEn: ['Blisters', 'Strips', 'Not applicable.'],
  },

  {
    type: 'banner',
    text: '1.\tDENOMINATION DU MEDICAMENT',
    textEn: '1.\tNAME OF THE MEDICINAL PRODUCT',
  },
  {
    type: 'line',
    key: 'b_denomination',
    ph: 'Dénomination du médicament',
    phEn: 'Name of the medicinal product',
  },
  { type: 'line', key: 'b_substances', ph: 'Substance(s) active(s)', phEn: 'Active substance(s)' },
  { type: 'checks', key: 'b_denomination_chk', options: NA, optionsEn: NA_EN },

  {
    type: 'banner',
    text: '2.\tNOM DU TITULAIRE DE L’AUTORISATION DE MISE SUR LE MARCHE',
    textEn: '2.\tNAME OF THE MARKETING AUTHORISATION HOLDER',
  },
  { type: 'line', key: 'b_titulaire', ph: 'Nom du titulaire', phEn: 'Name of the holder' },
  { type: 'checks', key: 'b_titulaire_chk', options: NA, optionsEn: NA_EN },

  {
    type: 'banner',
    text: '3.\tDATES DE FABRICATION ET DE PEREMPTION',
    textEn: '3.\tMANUFACTURING AND EXPIRY DATES',
  },
  {
    type: 'line',
    label: 'FAB ',
    labelEn: 'MFG ',
    key: 'b_fab_date',
    ph: 'MM/AAAA',
    phEn: 'MM/YYYY',
    narrow: true,
  },
  {
    type: 'line',
    label: 'EXP ',
    labelEn: 'EXP ',
    key: 'b_exp_date',
    ph: 'MM/AAAA',
    phEn: 'MM/YYYY',
    narrow: true,
  },
  { type: 'checks', key: 'b_dates_chk', options: NA, optionsEn: NA_EN },

  { type: 'banner', text: '4.\tNUMERO DU LOT', textEn: '4.\tBATCH NUMBER' },
  {
    type: 'line',
    label: 'Lot ',
    labelEn: 'Lot ',
    key: 'b_lot',
    ph: 'numéro',
    phEn: 'number',
    narrow: true,
  },
  { type: 'checks', key: 'b_lot_chk', options: NA, optionsEn: NA_EN },

  { type: 'banner', text: '5.\tAUTRES', textEn: '5.\tOTHER' },
  { type: 'para', key: 'b_autres', ph: 'Autres mentions', phEn: 'Other particulars' },
  { type: 'checks', key: 'b_autres_chk', options: NA, optionsEn: NA_EN },

  /* ---- C. Petits conditionnements primaires ---- */
  { type: 'rule' },
  {
    type: 'banner',
    text: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PETITS CONDITIONNEMENTS PRIMAIRES',
    textEn: 'MINIMUM PARTICULARS TO APPEAR ON SMALL IMMEDIATE PACKAGING UNITS',
  },

  {
    type: 'banner',
    text: 'NATURE/TYPE PETITS CONDITIONNEMENTS PRIMAIRES',
    textEn: 'NATURE/TYPE OF SMALL IMMEDIATE PACKAGING UNITS',
  },
  {
    type: 'line',
    key: 'c_nature',
    ph: 'Petits conditionnements primaires',
    phEn: 'Small immediate packaging units',
  },
  { type: 'checks', key: 'c_nature_chk', options: NA, optionsEn: NA_EN },

  {
    type: 'banner',
    text: '1.\tDENOMINATION DU MEDICAMENT ET VOIE(S) D’ADMINISTRATION',
    textEn: '1.\tNAME OF THE MEDICINAL PRODUCT AND ROUTE(S) OF ADMINISTRATION',
  },
  {
    type: 'line',
    key: 'c_denomination',
    ph: 'Dénomination du médicament',
    phEn: 'Name of the medicinal product',
  },
  { type: 'line', key: 'c_substances', ph: 'Substance(s) active(s)', phEn: 'Active substance(s)' },
  { type: 'line', key: 'c_voie', ph: 'Voie d’administration', phEn: 'Route of administration' },

  { type: 'banner', text: '2.\tMODE D’ADMINISTRATION', textEn: '2.\tMETHOD OF ADMINISTRATION' },
  { type: 'para', key: 'c_mode', ph: 'Mode d’administration', phEn: 'Method of administration' },
  { type: 'checks', key: 'c_mode_chk', options: NA, optionsEn: NA_EN },

  {
    type: 'banner',
    text: '3.\tDATES DE FABRICATION ET DE PEREMPTION',
    textEn: '3.\tMANUFACTURING AND EXPIRY DATES',
  },
  {
    type: 'line',
    label: 'FAB ',
    labelEn: 'MFG ',
    key: 'c_fab_date',
    ph: 'MM/AAAA',
    phEn: 'MM/YYYY',
    narrow: true,
  },
  {
    type: 'line',
    label: 'EXP ',
    labelEn: 'EXP ',
    key: 'c_exp_date',
    ph: 'MM/AAAA',
    phEn: 'MM/YYYY',
    narrow: true,
  },

  { type: 'banner', text: '4.\tNUMERO DU LOT', textEn: '4.\tBATCH NUMBER' },
  {
    type: 'line',
    label: 'Lot ',
    labelEn: 'Lot ',
    key: 'c_lot',
    ph: 'numéro',
    phEn: 'number',
    narrow: true,
  },

  {
    type: 'banner',
    text: '5.\tCONTENU EN POIDS, VOLUME OU UNITE',
    textEn: '5.\tCONTENTS BY WEIGHT, BY VOLUME OR BY UNIT',
  },
  {
    type: 'para',
    key: 'c_contenu',
    ph: 'Contenu en poids, volume ou unité',
    phEn: 'Contents by weight, by volume or by unit',
  },

  { type: 'banner', text: '6.\tAUTRES', textEn: '6.\tOTHER' },
  { type: 'para', key: 'c_autres', ph: 'Autres mentions', phEn: 'Other particulars' },
  {
    type: 'checks',
    key: 'c_autres_chk',
    options: ['Sans objet.', 'Pour usage autologue uniquement.'],
    optionsEn: ['Not applicable.', 'For autologous use only.'],
  },
]

/**
 * Définition du formulaire Étiquetage. Pré-remplissage STRICTEMENT session Identification :
 * dénominations + substance(s) + composition + forme/contenu — le reste à l'utilisateur.
 */
export const LABELING_FORM_DEFINITION: TemplateFormDefinition = {
  docType: 'labeling',
  model: LABELING_FORM_MODEL,
  topbarTitle: 'Étiquetage',
  slugPrefix: 'Etiquetage',
  slugKey: 'denomination',
  prefill: (product) => {
    const denomination = [product.nomCommercial, product.dosage, product.forme]
      .filter(Boolean)
      .join(', ')
    return {
      denomination,
      substances: product.dci ?? '',
      composition: formatComposition(product.dci, product.dosage),
      forme_contenu: [product.forme, product.presentation].filter(Boolean).join(' — '),
      b_denomination: denomination,
      b_substances: product.dci ?? '',
      c_denomination: denomination,
      c_substances: product.dci ?? '',
    }
  },
}
