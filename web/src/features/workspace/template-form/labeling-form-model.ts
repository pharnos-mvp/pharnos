// Modèle du FORMULAIRE Étiquetage — construit depuis le TEMPLATE OFFICIEL
// `RA-source/Template/Etiquetage/ABMed_Template etiquetage_2026.pdf` (intitulés VERBATIM).
// Trois parties : A. emballage extérieur/conditionnement primaire (rubriques 1-17 +
// pictogramme), B. plaquettes/films thermosoudés (1-5), C. petits conditionnements
// primaires (1-6). Les titres de rubrique sont des BANDEAUX gris (style du template).
import { formatComposition } from '../composition'
import type { FormBlock, TemplateFormDefinition } from './form-types'

export const LABELING_FORM_MODEL: FormBlock[] = [
  { type: 'title', text: 'ETIQUETAGE' },

  /* ---- A. Emballage extérieur et conditionnement primaire ---- */
  {
    type: 'banner',
    text: 'MENTIONS DEVANT FIGURER SUR L’EMBALLAGE EXTERIEUR ET SUR LE CONDITIONNEMENT PRIMAIRE',
  },

  { type: 'banner', text: 'NATURE/TYPE EMBALLAGE SECONDAIRE OU CONDITIONNEMENT PRIMAIRE' },
  {
    type: 'line',
    key: 'nature_emballage',
    ph: 'Conditionnement secondaire et/ou conditionnement(s) primaire(s)',
  },

  { type: 'banner', text: '1.\tDENOMINATION DU MEDICAMENT' },
  { type: 'line', key: 'denomination', ph: 'Dénomination du médicament' },
  { type: 'line', key: 'substances', ph: 'Substance(s) active(s)' },

  { type: 'banner', text: '2.\tCOMPOSITION EN SUBSTANCES ACTIVES' },
  { type: 'para', key: 'composition', ph: 'Composition en substances actives' },

  { type: 'banner', text: '3.\tLISTE DES EXCIPIENTS' },
  { type: 'checks', key: 'excipients_chk', options: ['Sans objet.'] },
  { type: 'para', key: 'excipients_txt', ph: 'Préciser la présence d’excipient à effet notoire' },

  { type: 'banner', text: '4.\tFORME PHARMACEUTIQUE ET CONTENU' },
  { type: 'para', key: 'forme_contenu', ph: 'Forme pharmaceutique et contenu' },

  { type: 'banner', text: '5.\tMODE ET VOIE(S) D’ADMINISTRATION' },
  { type: 'line', key: 'voie', ph: 'Indiquez la voie' },
  { type: 'static', text: 'Lire la notice avant utilisation.' },

  {
    type: 'banner',
    text: '6.\tMISE EN GARDE SPECIALE INDIQUANT QUE LE MEDICAMENT DOIT ETRE CONSERVE HORS DE VUE ET DE PORTEE DES ENFANTS',
  },
  { type: 'static', text: 'Tenir hors de la vue et de la portée des enfants.' },

  { type: 'banner', text: '7.\tAUTRE(S) MISE(S) EN GARDE SPECIALE(S), SI NECESSAIRE' },
  { type: 'checks', key: 'mises_garde_chk', options: ['Sans objet.'] },
  { type: 'para', key: 'mises_garde_txt', ph: 'Autre(s) mise(s) en garde spéciale(s)' },

  { type: 'banner', text: '8.\tDATES DE FABRICATION ET DE PEREMPTION' },
  { type: 'line', label: 'FAB ', key: 'fab_date', ph: 'MM/AAAA', narrow: true },
  { type: 'line', label: 'EXP ', key: 'exp_date', ph: 'MM/AAAA', narrow: true },

  { type: 'banner', text: '9.\tPRECAUTIONS PARTICULIERES DE CONSERVATION' },
  {
    type: 'para',
    key: 'conservation',
    ph: 'À conserver à moins de 30 °C, dans un endroit sec et à l’abri de la lumière',
  },

  {
    type: 'banner',
    text: '10.\tPRECAUTIONS PARTICULIERES D’ELIMINATION DES MEDICAMENTS NON UTILISES OU DES DECHETS PROVENANT DE CES MEDICAMENTS S’IL Y A LIEU',
  },
  { type: 'para', key: 'elimination', ph: 'Précautions particulières d’élimination' },

  {
    type: 'banner',
    text: '11.\tNOM ET ADRESSE DU TITULAIRE DE L’AUTORISATION DE MISE SUR LE MARCHE',
  },
  { type: 'sub', text: 'Titulaire' },
  { type: 'line', key: 'tit_nom', ph: 'Nom du titulaire' },
  { type: 'para', key: 'tit_adresse', ph: 'Adresse complète' },
  { type: 'sub', text: 'Exploitant' },
  { type: 'line', key: 'expl_nom', ph: 'Nom de l’exploitant' },
  { type: 'para', key: 'expl_adresse', ph: 'Adresse complète' },

  { type: 'banner', text: '12.\tNUMERO DU LOT' },
  { type: 'line', label: 'Lot ', key: 'lot', ph: 'numéro', narrow: true },

  { type: 'banner', text: '13.\tCONDITIONS DE PRESCRIPTION ET DE DELIVRANCE' },
  {
    type: 'para',
    key: 'prescription',
    ph: 'Copier/coller les libellés figurant dans la rubrique « conditions de prescription et de délivrance » du RCP',
  },

  { type: 'banner', text: '14.\tINDICATIONS D’UTILISATION' },
  { type: 'checks', key: 'indications_chk', options: ['Sans objet.'] },
  {
    type: 'para',
    key: 'indications_txt',
    ph: 'Médicament NON soumis à prescription médicale uniquement : libellé de la notice « 1. Qu’est-ce que X et dans quels cas est-il utilisé ? »',
  },

  { type: 'banner', text: '15.\tINFORMATIONS EN BRAILLE' },
  { type: 'para', key: 'braille', ph: 'Informations en braille' },

  { type: 'banner', text: '16.\tIDENTIFIANT UNIQUE - CODE-BARRES 2D' },
  {
    type: 'checks',
    key: 'code_barres_chk',
    options: ['Code-barres 2D portant l’identifiant unique inclus.', 'Sans objet.'],
  },

  { type: 'banner', text: '17.\tIDENTIFIANT UNIQUE - DONNÉES LISIBLES PAR LES HUMAINS' },
  { type: 'line', label: 'PC : ', key: 'pc', ph: 'numéro (code CIP)' },
  { type: 'line', label: 'SN : ', key: 'sn', ph: 'numéro de série' },
  { type: 'checks', key: 'identifiant_chk', options: ['Sans objet.'] },

  {
    type: 'banner',
    text: 'PICTOGRAMME DEVANT FIGURER SUR L’EMBALLAGE EXTERIEUR OU, EN L’ABSENCE D’EMBALLAGE EXTERIEUR, SUR LE CONDITIONNEMENT PRIMAIRE',
  },
  {
    type: 'checks',
    key: 'picto_chk',
    options: [
      'Pictogramme relatif aux effets tératogènes ou fœtotoxiques',
      'Pictogramme relatif aux effets sur la capacité à conduire',
      'Sans objet.',
    ],
  },

  /* ---- B. Plaquettes / films thermosoudés ---- */
  { type: 'rule' },
  {
    type: 'banner',
    text: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PLAQUETTES OU LES FILMS THERMOSOUDES',
  },

  { type: 'banner', text: 'NATURE/TYPE PLAQUETTES / FILMS' },
  {
    type: 'checks',
    key: 'b_nature_chk',
    options: ['Plaquettes', 'Films thermosoudés', 'Sans objet.'],
  },

  { type: 'banner', text: '1.\tDENOMINATION DU MEDICAMENT' },
  { type: 'line', key: 'b_denomination', ph: 'Dénomination du médicament' },
  { type: 'line', key: 'b_substances', ph: 'Substance(s) active(s)' },
  { type: 'checks', key: 'b_denomination_chk', options: ['Sans objet.'] },

  { type: 'banner', text: '2.\tNOM DU TITULAIRE DE L’AUTORISATION DE MISE SUR LE MARCHE' },
  { type: 'line', key: 'b_titulaire', ph: 'Nom du titulaire' },
  { type: 'checks', key: 'b_titulaire_chk', options: ['Sans objet.'] },

  { type: 'banner', text: '3.\tDATES DE FABRICATION ET DE PEREMPTION' },
  { type: 'line', label: 'FAB ', key: 'b_fab_date', ph: 'MM/AAAA', narrow: true },
  { type: 'line', label: 'EXP ', key: 'b_exp_date', ph: 'MM/AAAA', narrow: true },
  { type: 'checks', key: 'b_dates_chk', options: ['Sans objet.'] },

  { type: 'banner', text: '4.\tNUMERO DU LOT' },
  { type: 'line', label: 'Lot ', key: 'b_lot', ph: 'numéro', narrow: true },
  { type: 'checks', key: 'b_lot_chk', options: ['Sans objet.'] },

  { type: 'banner', text: '5.\tAUTRES' },
  { type: 'para', key: 'b_autres', ph: 'Autres mentions' },
  { type: 'checks', key: 'b_autres_chk', options: ['Sans objet.'] },

  /* ---- C. Petits conditionnements primaires ---- */
  { type: 'rule' },
  {
    type: 'banner',
    text: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PETITS CONDITIONNEMENTS PRIMAIRES',
  },

  { type: 'banner', text: 'NATURE/TYPE PETITS CONDITIONNEMENTS PRIMAIRES' },
  { type: 'line', key: 'c_nature', ph: 'Petits conditionnements primaires' },
  { type: 'checks', key: 'c_nature_chk', options: ['Sans objet.'] },

  { type: 'banner', text: '1.\tDENOMINATION DU MEDICAMENT ET VOIE(S) D’ADMINISTRATION' },
  { type: 'line', key: 'c_denomination', ph: 'Dénomination du médicament' },
  { type: 'line', key: 'c_substances', ph: 'Substance(s) active(s)' },
  { type: 'line', key: 'c_voie', ph: 'Voie d’administration' },

  { type: 'banner', text: '2.\tMODE D’ADMINISTRATION' },
  { type: 'para', key: 'c_mode', ph: 'Mode d’administration' },
  { type: 'checks', key: 'c_mode_chk', options: ['Sans objet.'] },

  { type: 'banner', text: '3.\tDATES DE FABRICATION ET DE PEREMPTION' },
  { type: 'line', label: 'FAB ', key: 'c_fab_date', ph: 'MM/AAAA', narrow: true },
  { type: 'line', label: 'EXP ', key: 'c_exp_date', ph: 'MM/AAAA', narrow: true },

  { type: 'banner', text: '4.\tNUMERO DU LOT' },
  { type: 'line', label: 'Lot ', key: 'c_lot', ph: 'numéro', narrow: true },

  { type: 'banner', text: '5.\tCONTENU EN POIDS, VOLUME OU UNITE' },
  { type: 'para', key: 'c_contenu', ph: 'Contenu en poids, volume ou unité' },

  { type: 'banner', text: '6.\tAUTRES' },
  { type: 'para', key: 'c_autres', ph: 'Autres mentions' },
  {
    type: 'checks',
    key: 'c_autres_chk',
    options: ['Sans objet.', 'Pour usage autologue uniquement.'],
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
