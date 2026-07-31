/**
 * Bibliothèque réglementaire — CONTENU DES MODÈLES OFFICIELS, BILINGUE.
 *
 * Transcription fidèle des maquettes déposées dans `RA-source/Template/` (ABMed 2026, modèles
 * UEMOA) et des gabarits de lettres DÉJÀ EN PRODUCTION dans le builder
 * (`web/src/features/workspace/templates.ts`) — même prose, même structure.
 *
 * BILINGUE : chaque bloc peut porter `en`. La version anglaise d'un modèle est une TRADUCTION DE
 * COURTOISIE (terminologie QRD/OMS officielle) : la version à déposer auprès de l'autorité est la
 * française, et le fichier EN généré l'annonce en tête. Un bloc sans `en` garde son texte
 * (marqueurs, dates, « xxxxxxxxx »).
 *
 * ⚠️ Ce module ne part JAMAIS au navigateur : il est lu par `build-landing-modeles.mjs`.
 * ⚠️ Les libellés entre chevrons `< >` sont des OPTIONS de la maquette, à conserver.
 *
 * Blocs résolus PAR PAYS par le générateur :
 *   vig     mention de pharmacovigilance 4.8 (`landing/checking/vigilance.js`)
 *   agence  bloc destinataire d'une lettre — civilité, agence, adresse (référentiel du builder)
 *   salut   salutation d'ouverture (« Madame la Directrice Générale, »)
 *
 * Autres blocs : doctitle · part · h1 · h2 · h3 · p · li · right (bloc décalé des lettres,
 * aligné à gauche à 56 % de la largeur — la mise en page du moteur de lettres du builder) ·
 * table · break.
 */

/** Corrigé de la maquette : la source porte « Pour las liste complète », coquille manifeste. */
const RENVOI_EXCIPIENTS = {
  t: 'p',
  x: '<Pour la liste complète des excipients, voir rubrique 6.1.>',
  en: '<For the full list of excipients, see section 6.1.>',
}

const RCP = [
  {
    t: 'doctitle',
    x: 'RESUME DES CARACTERISTIQUES DU PRODUIT',
    en: 'SUMMARY OF PRODUCT CHARACTERISTICS',
  },

  { t: 'h1', x: '1. DENOMINATION DU MEDICAMENT', en: '1. NAME OF THE MEDICINAL PRODUCT' },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h1',
    x: '2. COMPOSITION QUALITATIVE ET QUANTITATIVE',
    en: '2. QUALITATIVE AND QUANTITATIVE COMPOSITION',
  },
  { t: 'p', x: '{ ................................................................ }' },
  { t: 'p', x: '<Excipient(s) à effet notoire :>', en: '<Excipient(s) with known effect:>' },
  RENVOI_EXCIPIENTS,

  { t: 'h1', x: '3. FORME PHARMACEUTIQUE', en: '3. PHARMACEUTICAL FORM' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h1', x: '4. DONNEES CLINIQUES', en: '4. CLINICAL PARTICULARS' },

  { t: 'h2', x: '4.1. Indications thérapeutiques', en: '4.1. Therapeutic indications' },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h2',
    x: "4.2. Posologie et mode d'administration",
    en: '4.2. Posology and method of administration',
  },
  { t: 'h3', x: 'Posologie', en: 'Posology' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: "Mode d'administration", en: 'Method of administration' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '4.3. Contre-indications', en: '4.3. Contraindications' },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h2',
    x: "4.4. Mises en garde spéciales et précautions d'emploi",
    en: '4.4. Special warnings and precautions for use',
  },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h2',
    x: "4.5. Interactions avec d'autres médicaments et autres formes d'interactions",
    en: '4.5. Interaction with other medicinal products and other forms of interaction',
  },
  {
    t: 'p',
    x: "<Aucune étude d'interaction n'a été réalisée.>",
    en: '<No interaction studies have been performed.>',
  },
  { t: 'p', x: '<Population pédiatrique>', en: '<Paediatric population>' },
  {
    t: 'p',
    x: "<Les études d'interaction n'ont été réalisées que chez l'adulte.>",
    en: '<Interaction studies have only been performed in adults.>',
  },
  { t: 'p', x: '<Associations contre-indiquées>', en: '<Contraindicated combinations>' },
  { t: 'p', x: '<Associations déconseillées>', en: '<Inadvisable combinations>' },
  {
    t: 'p',
    x: "<Associations faisant l'objet de précautions d'emploi>",
    en: '<Combinations requiring precautions for use>',
  },
  {
    t: 'p',
    x: '<Associations à prendre en compte>',
    en: '<Combinations to be taken into account>',
  },
  {
    t: 'p',
    x: '<Interactions avec les examens paracliniques>',
    en: '<Interference with laboratory tests>',
  },

  {
    t: 'h2',
    x: '4.6. Fertilité, grossesse et allaitement',
    en: '4.6. Fertility, pregnancy and lactation',
  },
  { t: 'p', x: '<Grossesse>', en: '<Pregnancy>' },
  { t: 'p', x: '<Allaitement>', en: '<Breast-feeding>' },
  { t: 'p', x: '<Fertilité>', en: '<Fertility>' },

  {
    t: 'h2',
    x: "4.7. Effets sur l'aptitude à conduire des véhicules et à utiliser des machines",
    en: '4.7. Effects on ability to drive and use machines',
  },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '4.8. Effets indésirables', en: '4.8. Undesirable effects' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'vig' },

  { t: 'h2', x: '4.9. Surdosage', en: '4.9. Overdose' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h1', x: '5. PROPRIETES PHARMACOLOGIQUES', en: '5. PHARMACOLOGICAL PROPERTIES' },

  { t: 'h2', x: '5.1. Propriétés pharmacodynamiques', en: '5.1. Pharmacodynamic properties' },
  {
    t: 'p',
    x: 'Classe pharmacothérapeutique : {classe},',
    en: 'Pharmacotherapeutic group: {class},',
  },
  {
    t: 'p',
    x: 'Code ATC : {code} <non encore attribué>.',
    en: 'ATC code: {code} <not yet assigned>.',
  },
  { t: 'h3', x: "Mécanisme d'action", en: 'Mechanism of action' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Effets pharmacodynamiques', en: 'Pharmacodynamic effects' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Efficacité et sécurité clinique', en: 'Clinical efficacy and safety' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Population pédiatrique', en: 'Paediatric population' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '5.2. Propriétés pharmacocinétiques', en: '5.2. Pharmacokinetic properties' },
  { t: 'h3', x: 'Absorption' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Distribution' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Biotransformation' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Élimination', en: 'Elimination' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Linéarité/non-linéarité', en: 'Linearity/non-linearity' },
  { t: 'p', x: 'xxxxxxxxx' },
  {
    t: 'h3',
    x: 'Relations pharmacocinétique/pharmacodynamique',
    en: 'Pharmacokinetic/pharmacodynamic relationship(s)',
  },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '5.3. Données de sécurité préclinique', en: '5.3. Preclinical safety data' },
  {
    t: 'p',
    x:
      '<Les données non cliniques issues des études conventionnelles de pharmacologie de sécurité, ' +
      'toxicologie en administration répétée, génotoxicité, cancérogénèse, et des fonctions de ' +
      "reproduction et de développement, n'ont pas révélé de risque particulier pour l'homme.>",
    en:
      '<Non-clinical data reveal no special hazard for humans based on conventional studies of ' +
      'safety pharmacology, repeated dose toxicity, genotoxicity, carcinogenic potential, and ' +
      'toxicity to reproduction and development.>',
  },
  {
    t: 'p',
    x:
      "<Des effets ont été observés chez l'animal uniquement à des expositions considérées comme " +
      "suffisamment supérieures à l'exposition maximale observée chez l'homme, et ont peu de " +
      'signification clinique.>',
    en:
      '<Effects in non-clinical studies were observed only at exposures considered sufficiently in ' +
      'excess of the maximum human exposure, indicating little relevance to clinical use.>',
  },
  {
    t: 'p',
    x:
      "<Les effets indésirables suivants n'ont pas été observés dans les études cliniques, mais ont " +
      "été constatés chez des animaux soumis à des niveaux d'exposition semblables à ceux utilisés " +
      "pour l'homme et pourraient avoir une signification clinique.>",
    en:
      '<The following adverse reactions were not observed in clinical studies, but were seen in ' +
      'animals at exposure levels similar to clinical exposure levels and may be of clinical ' +
      'relevance.>',
  },
  { t: 'p', x: '<Évaluation du risque environnemental>', en: '<Environmental risk assessment>' },

  { t: 'h1', x: '6. DONNEES PHARMACEUTIQUES', en: '6. PHARMACEUTICAL PARTICULARS' },

  { t: 'h2', x: '6.1. Liste des excipients', en: '6.1. List of excipients' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '6.2. Incompatibilités', en: '6.2. Incompatibilities' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },

  { t: 'h2', x: '6.3. Durée de conservation', en: '6.3. Shelf life' },
  { t: 'p', x: '<xx mois>', en: '<xx months>' },

  {
    t: 'h2',
    x: '6.4. Précautions particulières de conservation',
    en: '6.4. Special precautions for storage',
  },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h2',
    x: "6.5. Nature et contenu de l'emballage extérieur",
    en: '6.5. Nature and contents of container',
  },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h2',
    x: "6.6. Précautions particulières d'élimination et de manipulation",
    en: '6.6. Special precautions for disposal and other handling',
  },
  {
    t: 'p',
    x: "<Pas d'exigences particulières <pour l'élimination>.>",
    en: '<No special requirements <for disposal>.>',
  },
  {
    t: 'p',
    x:
      '<Tout médicament non utilisé ou déchet doit être éliminé conformément à la réglementation ' +
      'en vigueur.>',
    en:
      '<Any unused medicinal product or waste material should be disposed of in accordance with ' +
      'local requirements.>',
  },

  {
    t: 'h1',
    x: "7. TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE",
    en: '7. MARKETING AUTHORISATION HOLDER',
  },
  { t: 'p', x: 'NOM', en: 'NAME' },
  { t: 'p', x: 'ADRESSE COMPLETE', en: 'FULL ADDRESS' },
  { t: 'p', x: '[Tel, fax, e-Mail]', en: '[Tel, fax, e-mail]' },

  {
    t: 'h1',
    x: "8. NUMERO(S) D'AUTORISATION DE MISE SUR LE MARCHE",
    en: '8. MARKETING AUTHORISATION NUMBER(S)',
  },
  { t: 'p', x: 'xxxxxxxxx' },

  {
    t: 'h1',
    x: "9. DATE DE PREMIERE AUTORISATION/DE RENOUVELLEMENT DE L'AUTORISATION",
    en: '9. DATE OF FIRST AUTHORISATION/RENEWAL OF THE AUTHORISATION',
  },
  {
    t: 'p',
    x: '<Date de première autorisation : {JJ mois AAAA}>',
    en: '<Date of first authorisation: {DD month YYYY}>',
  },
  {
    t: 'p',
    x: '<Date de dernier renouvellement : {JJ mois AAAA}>',
    en: '<Date of latest renewal: {DD month YYYY}>',
  },

  { t: 'h1', x: '10. DATE DE MISE A JOUR DU TEXTE', en: '10. DATE OF REVISION OF THE TEXT' },
  {
    t: 'p',
    x: '[à compléter ultérieurement par le titulaire]',
    en: '[to be completed later by the holder]',
  },
  { t: 'p', x: '<{JJ mois AAAA}>', en: '<{DD month YYYY}>' },

  {
    t: 'part',
    x: 'CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE',
    en: 'CONDITIONS OF PRESCRIPTION AND SUPPLY',
  },
  {
    t: 'p',
    x: '<Médicament non soumis à prescription médicale.>',
    en: '<Medicinal product not subject to medical prescription.>',
  },
  { t: 'p', x: '<Liste I>', en: '<List I>' },
  { t: 'p', x: '<Liste II>', en: '<List II>' },
  { t: 'p', x: '<Stupéfiant>', en: '<Narcotic>' },
]

const NOTICE = [
  {
    t: 'doctitle',
    x: "NOTICE : INFORMATION DE L'UTILISATEUR",
    en: 'PACKAGE LEAFLET: INFORMATION FOR THE USER',
  },
  { t: 'h3', x: 'Dénomination du médicament', en: 'Name of the medicinal product' },
  { t: 'p', x: 'xxxxxxxxxxxxxx' },
  { t: 'p', x: '{Substance(s) active(s)}', en: '{Active substance(s)}' },

  { t: 'h3', x: 'Encadré', en: 'Warning box' },
  {
    t: 'p',
    x:
      '<Veuillez lire attentivement cette notice avant <de prendre> <d’utiliser> ce médicament ' +
      'car elle contient des informations importantes pour vous.',
    en:
      '<Read all of this leaflet carefully before you <take> <use> this medicine because it ' +
      'contains important information for you.',
  },
  {
    t: 'li',
    x: 'Gardez cette notice. Vous pourriez avoir besoin de la relire.',
    en: 'Keep this leaflet. You may need to read it again.',
  },
  {
    t: 'li',
    x:
      "Si vous avez d'autres questions, interrogez <votre médecin> <,> <ou> <votre pharmacien> ou " +
      '<votre infirmier/ère>.',
    en: 'If you have any further questions, ask <your doctor> <,> <or> <pharmacist> or <nurse>.',
  },
  {
    t: 'li',
    x:
      "<Ce médicament vous a été personnellement prescrit. Ne le donnez pas à d'autres personnes. " +
      'Il pourrait leur être nocif, même si les signes de leur maladie sont identiques aux vôtres.>',
    en:
      '<This medicine has been prescribed for you only. Do not pass it on to others. It may harm ' +
      'them, even if their signs of illness are the same as yours.>',
  },
  {
    t: 'li',
    x:
      'Si vous ressentez un quelconque effet indésirable, parlez-en à <votre médecin> <,> <ou> ' +
      "<votre pharmacien> <ou votre infirmier/ère>. Ceci s'applique aussi à tout effet indésirable " +
      'qui ne serait pas mentionné dans cette notice. Voir rubrique 4.>',
    en:
      'If you get any side effects, talk to <your doctor> <,> <or> <pharmacist> <or nurse>. This ' +
      'includes any possible side effects not listed in this leaflet. See section 4.>',
  },

  { t: 'h3', x: 'Que contient cette notice ?', en: 'What is in this leaflet' },
  {
    t: 'p',
    x: "1. Qu'est-ce que xxx et dans quels cas est-il utilisé ?",
    en: '1. What xxx is and what it is used for',
  },
  {
    t: 'p',
    x: "2. Quelles sont les informations à connaître avant <de prendre> <d'utiliser> xxx ?",
    en: '2. What you need to know before you <take> <use> xxx',
  },
  { t: 'p', x: '3. Comment <prendre> <utiliser> xxx ?', en: '3. How to <take> <use> xxx' },
  {
    t: 'p',
    x: '4. Quels sont les effets indésirables éventuels ?',
    en: '4. Possible side effects',
  },
  { t: 'p', x: '5. Comment conserver xxx ?', en: '5. How to store xxx' },
  {
    t: 'p',
    x: "6. Contenu de l'emballage et autres informations.",
    en: '6. Contents of the pack and other information.',
  },

  {
    t: 'h1',
    x: "1. QU'EST-CE QUE xxx ET DANS QUELS CAS EST-IL UTILISE ?",
    en: '1. WHAT xxx IS AND WHAT IT IS USED FOR',
  },
  {
    t: 'p',
    x: 'Classe pharmacothérapeutique - code ATC : <{code}>',
    en: 'Pharmacotherapeutic group - ATC code: <{code}>',
  },
  {
    t: 'p',
    x:
      '<xxx contient du (DCI). La (DCI) est un (classe pharmacothérapeutique). Ce médicament est ' +
      'indiqué chez ….. pour …(Indications)……….. Lire attentivement le paragraphe « Posologie » de ' +
      'la rubrique 3>',
    en:
      '<xxx contains (INN). (INN) is a (pharmacotherapeutic class). This medicine is indicated in ' +
      '….. for …(Indications)……….. Read carefully the “Posology” paragraph of section 3>',
  },
  {
    t: 'p',
    x:
      '<Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si ' +
      'vous vous sentez moins bien <après {nombre de jours}>.',
    en: '<You must talk to a doctor if you do not feel better or if you feel worse <after {number of days}>.',
  },

  {
    t: 'h1',
    x: "2. QUELLES SONT LES INFORMATIONS A CONNAITRE AVANT <DE PRENDRE> <D'UTILISER> xxx ?",
    en: '2. WHAT YOU NEED TO KNOW BEFORE YOU <TAKE> <USE> xxx',
  },
  { t: 'h3', x: "<Ne prenez> <N'utilisez> jamais xxx :>", en: '<Do not <take> <use> xxx:>' },
  {
    t: 'li',
    x:
      "<si vous êtes allergique <à la> <aux> {substance(s) active(s)} ou à l'un des autres " +
      'composants contenus dans ce médicament, mentionnés dans la rubrique 6>.',
    en:
      '<if you are allergic to {active substance(s)} or any of the other ingredients of this ' +
      'medicine, listed in section 6>.',
  },
  { t: 'li', x: '<si…>', en: '<if…>' },
  { t: 'h3', x: 'Avertissements et précautions', en: 'Warnings and precautions' },
  {
    t: 'p',
    x:
      'Adressez-vous à votre médecin <ou> <,> <pharmacien> <ou votre infirmier/ère> avant <de ' +
      "prendre> <d'utiliser> xxx.",
    en: 'Talk to your doctor <or> <,> <pharmacist> <or nurse> before <taking> <using> xxx.',
  },
  { t: 'p', x: '<Enfants et adolescents>', en: '<Children and adolescents>' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  { t: 'h3', x: 'Autres médicaments et xxx', en: 'Other medicines and xxx' },
  {
    t: 'p',
    x:
      '<Informez votre <médecin> <ou> <pharmacien> si vous <prenez> <utilisez>, avez récemment ' +
      '<pris> <utilisé> ou pourriez <prendre> <utiliser> tout autre médicament.>',
    en:
      '<Tell your <doctor> <or> <pharmacist> if you are <taking> <using>, have recently <taken> ' +
      '<used> or might <take> <use> any other medicines.>',
  },
  {
    t: 'h3',
    x: "xxx avec <des aliments><et><,><boissons><et><de l'alcool>",
    en: 'xxx with <food><and><,><drink><and><alcohol>',
  },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  {
    t: 'h3',
    x: 'Grossesse <et> <,> allaitement <et fertilité>',
    en: 'Pregnancy <and> <,> breast-feeding <and fertility>',
  },
  {
    t: 'p',
    x:
      '<Si vous êtes enceinte ou que vous allaitez, si vous pensez être enceinte ou planifiez une ' +
      'grossesse, demandez conseil à votre <médecin> <ou> <pharmacien> avant de prendre ce ' +
      'médicament.>',
    en:
      '<If you are pregnant or breast-feeding, think you may be pregnant or are planning to have ' +
      'a baby, ask your <doctor> <or> <pharmacist> for advice before taking this medicine.>',
  },
  {
    t: 'h3',
    x: 'Conduite de véhicules et utilisation de machines',
    en: 'Driving and using machines',
  },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  {
    t: 'h3',
    x: 'xxx contient <{nommer le/les excipient(s) à effet notoire} et recommandations>',
    en: 'xxx contains <{name the excipient(s) with known effect} and recommendations>',
  },
  { t: 'p', x: '<………………………….>' },

  { t: 'h1', x: '3. COMMENT <PRENDRE> <UTILISER> xxx ?', en: '3. HOW TO <TAKE> <USE> xxx' },
  {
    t: 'p',
    x:
      '<Veillez à toujours <prendre> <utiliser> ce médicament en suivant exactement les indications ' +
      'de votre médecin <ou pharmacien>. Vérifiez auprès de <votre médecin> <ou> <pharmacien> en ' +
      'cas de doute.>',
    en:
      '<Always <take> <use> this medicine exactly as your doctor <or pharmacist> has told you. ' +
      'Check with your <doctor> <or> <pharmacist> if you are not sure.>',
  },
  { t: 'h3', x: 'Posologie', en: 'Posology' },
  { t: 'p', x: '<La dose recommandée est de…>', en: '<The recommended dose is…>' },
  {
    t: 'p',
    x: '<Utilisation chez les enfants <et les adolescents>>',
    en: '<Use in children <and adolescents>>',
  },
  {
    t: 'p',
    x:
      "<La barre de cassure n'est là que pour faciliter la prise du comprimé si vous éprouvez des " +
      "difficultés à l'avaler en entier.>",
    en:
      '<The score line is only there to help you break the tablet if you have difficulty ' +
      'swallowing it whole.>',
  },
  {
    t: 'p',
    x: '<Le comprimé peut être divisé en doses égales.>',
    en: '<The tablet can be divided into equal doses.>',
  },
  {
    t: 'p',
    x: "<La barre de cassure n'est pas destinée à briser le comprimé.>",
    en: '<The score line is not intended for breaking the tablet.>',
  },
  { t: 'h3', x: "Mode d'administration", en: 'Method of administration' },
  { t: 'p', x: '<Indiquer la voie>.', en: '<State the route>.' },
  {
    t: 'p',
    x: '<Les comprimés, gélules….. sont à avaler ….tels quels avec un verre d’eau>.',
    en: '<Tablets, capsules….. are to be swallowed ….whole with a glass of water>.',
  },
  { t: 'h3', x: 'Durée du traitement', en: 'Duration of treatment' },
  {
    t: 'p',
    x: '<Sauf avis médical, la durée du traitement est limitée à (n jours/semaines….>',
    en: '<Unless medically advised, the duration of treatment is limited to (n days/weeks….>',
  },
  {
    t: 'h3',
    x: "Si vous avez <pris> <utilisé> plus de xxx que vous n'auriez dû",
    en: 'If you <take> <use> more xxx than you should',
  },
  { t: 'p', x: '<Indiquer la conduite à tenir.>', en: '<State what to do.>' },
  {
    t: 'h3',
    x: "Si vous oubliez <de prendre> <d'utiliser> xxx",
    en: 'If you forget to <take> <use> xxx',
  },
  {
    t: 'p',
    x:
      '<Ne prenez pas de dose double pour compenser <le comprimé><la dose><…> que vous avez oublié ' +
      'de prendre ;>',
    en: '<Do not take a double dose to make up for a forgotten <tablet><dose><…>;>',
  },
  {
    t: 'h3',
    x: "Si vous arrêtez <de prendre> <d'utiliser> xxx",
    en: 'If you stop <taking> <using> xxx',
  },
  { t: 'p', x: '<Indiquer la conduite à tenir.>', en: '<State what to do.>' },
  {
    t: 'p',
    x:
      "<Si vous avez d'autres questions sur l'utilisation de ce médicament, demandez plus " +
      "d'informations <à votre médecin> <,> <à votre pharmacien> <ou à votre infirmier/ère>.>",
    en:
      '<If you have any further questions on the use of this medicine, ask <your doctor> <,> ' +
      '<pharmacist> <or nurse>.>',
  },

  {
    t: 'h1',
    x: '4. QUELS SONT LES EFFETS INDESIRABLES EVENTUELS ?',
    en: '4. POSSIBLE SIDE EFFECTS',
  },
  {
    t: 'p',
    x:
      'Comme tous les médicaments, ce médicament peut provoquer des effets indésirables, mais ils ' +
      'ne surviennent pas systématiquement chez tout le monde.',
    en: 'Like all medicines, this medicine can cause side effects, although not everybody gets them.',
  },
  {
    t: 'p',
    x: '<Effets indésirables supplémentaires chez les enfants <et les adolescents>>',
    en: '<Additional side effects in children <and adolescents>>',
  },
  { t: 'h3', x: 'Déclaration des effets secondaires', en: 'Reporting of side effects' },
  {
    t: 'p',
    x:
      'Si vous ressentez un quelconque effet indésirable, parlez-en à <votre médecin> <ou> <,> ' +
      "<votre pharmacien> <ou à votre infirmier/ère>. Ceci s'applique aussi à tout effet " +
      'indésirable qui ne serait pas mentionné dans cette notice.',
    en:
      'If you get any side effects, talk to <your doctor> <or> <,> <pharmacist> <or nurse>. This ' +
      'includes any possible side effects not listed in this leaflet.',
  },

  { t: 'h1', x: '5. COMMENT CONSERVER xxx ?', en: '5. HOW TO STORE xxx' },
  {
    t: 'p',
    x: 'Tenir ce médicament hors de la vue et de la portée des enfants.',
    en: 'Keep this medicine out of the sight and reach of children.',
  },
  {
    t: 'p',
    x:
      "À conserver à une température ne dépassant pas X °C dans un milieu sec, à l'abri de la " +
      "lumière et de l'humidité.",
    en: 'Store below X °C in a dry place, protected from light and moisture.',
  },
  {
    t: 'p',
    x:
      "N'utilisez pas ce médicament après la date de péremption indiquée sur <l'étiquette> " +
      "<l'emballage> <le flacon> <…> <après {abréviation utilisée pour la date d'expiration}.> " +
      'La date de péremption fait référence au dernier jour de ce mois.',
    en:
      'Do not use this medicine after the expiry date which is stated on <the label> <the carton> ' +
      '<the bottle> <…> <after {abbreviation used for expiry date}.> The expiry date refers to ' +
      'the last day of that month.',
  },
  {
    t: 'p',
    x: "<N'utilisez pas ce médicament si vous remarquez {description de signes visibles de détérioration}.>",
    en: '<Do not use this medicine if you notice {description of visible signs of deterioration}.>',
  },
  {
    t: 'p',
    x:
      "<Ne jetez aucun médicament au tout-à-l'égout <ou avec les ordures ménagères>. Demandez à " +
      "votre pharmacien d'éliminer les médicaments que vous n'utilisez plus. Ces mesures " +
      "contribueront à protéger l'environnement.>",
    en:
      '<Do not throw away any medicines via wastewater <or household waste>. Ask your pharmacist ' +
      'how to throw away medicines you no longer use. These measures will help protect the ' +
      'environment.>',
  },

  {
    t: 'h1',
    x: "6. CONTENU DE L'EMBALLAGE ET AUTRES INFORMATIONS",
    en: '6. CONTENTS OF THE PACK AND OTHER INFORMATION',
  },
  { t: 'h3', x: 'Ce que contient xxx', en: 'What xxx contains' },
  {
    t: 'li',
    x: 'La (les) substance(s) active(s) est (sont) : { ................................ }',
    en: 'The active substance(s) is (are): { ................................ }',
  },
  {
    t: 'li',
    x: 'L(es) autre(s) <composant(s)> <excipient(s)> est (sont) :',
    en: 'The other <ingredient(s)> <excipient(s)> is (are):',
  },
  {
    t: 'h3',
    x: "Qu'est-ce que xxx et contenu de l'emballage extérieur",
    en: 'What xxx looks like and contents of the pack',
  },
  {
    t: 'p',
    x:
      'Ce médicament se présente sous forme de (indiquer la forme galénique). Chaque boîte….. ' +
      'contient ……..',
    en: 'This medicine comes as (state the pharmaceutical form). Each pack….. contains ……..',
  },
  {
    t: 'h3',
    x: "Titulaire de l'autorisation de mise sur le marché",
    en: 'Marketing authorisation holder',
  },
  { t: 'p', x: 'NOM', en: 'NAME' },
  { t: 'p', x: 'ADRESSE COMPLÈTE', en: 'FULL ADDRESS' },
  {
    t: 'h3',
    x: "Exploitant de l'autorisation de mise sur le marché",
    en: 'Distributor of the marketing authorisation',
  },
  { t: 'p', x: 'NOM', en: 'NAME' },
  { t: 'p', x: 'ADRESSE COMPLÈTE', en: 'FULL ADDRESS' },
  { t: 'h3', x: 'Fabricant', en: 'Manufacturer' },
  { t: 'p', x: 'NOM', en: 'NAME' },
  { t: 'p', x: 'ADRESSE COMPLÈTE', en: 'FULL ADDRESS' },
  {
    t: 'h3',
    x: 'La dernière date à laquelle cette notice a été révisée est :',
    en: 'This leaflet was last revised in:',
  },
  {
    t: 'p',
    x: '[à compléter ultérieurement par le titulaire]',
    en: '[to be completed later by the holder]',
  },
  { t: 'p', x: '<{MM/AAAA}> <{mois AAAA}.>', en: '<{MM/YYYY}> <{month YYYY}.>' },
]

const ETIQUETAGE = [
  { t: 'doctitle', x: 'ETIQUETAGE', en: 'LABELLING' },
  {
    t: 'part',
    x: "MENTIONS DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR ET SUR LE CONDITIONNEMENT PRIMAIRE",
    en: 'PARTICULARS TO APPEAR ON THE OUTER PACKAGING AND THE IMMEDIATE PACKAGING',
  },
  {
    t: 'h3',
    x: 'NATURE/TYPE EMBALLAGE SECONDAIRE OU CONDITIONNEMENT PRIMAIRE',
    en: 'NATURE/TYPE OF OUTER OR IMMEDIATE PACKAGING',
  },
  {
    t: 'p',
    x: '<{conditionnement secondaire}> <et> <{Conditionnement(s) primaire(s)}>',
    en: '<{outer packaging}> <and> <{immediate packaging}>',
  },

  { t: 'h1', x: '1. DENOMINATION DU MEDICAMENT', en: '1. NAME OF THE MEDICINAL PRODUCT' },
  { t: 'p', x: 'xxx' },
  { t: 'p', x: '{Substance(s) active(s)}', en: '{Active substance(s)}' },

  { t: 'h1', x: '2. COMPOSITION EN SUBSTANCES ACTIVES', en: '2. STATEMENT OF ACTIVE SUBSTANCE(S)' },
  { t: 'p', x: '{ ................................................................ }' },

  { t: 'h1', x: '3. LISTE DES EXCIPIENTS', en: '3. LIST OF EXCIPIENTS' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  {
    t: 'p',
    x: "<Préciser la présence d'excipient à effet notoire.>",
    en: '<State the presence of excipient(s) with known effect.>',
  },

  { t: 'h1', x: '4. FORME PHARMACEUTIQUE ET CONTENU', en: '4. PHARMACEUTICAL FORM AND CONTENTS' },
  { t: 'p', x: '{}' },

  {
    t: 'h1',
    x: "5. MODE ET VOIE(S) D'ADMINISTRATION",
    en: '5. METHOD AND ROUTE(S) OF ADMINISTRATION',
  },
  { t: 'p', x: '<Indiquez la voie>', en: '<State the route>' },
  { t: 'p', x: 'Lire la notice avant utilisation.', en: 'Read the package leaflet before use.' },

  {
    t: 'h1',
    x:
      '6. MISE EN GARDE SPECIALE INDIQUANT QUE LE MEDICAMENT DOIT ETRE CONSERVE HORS DE VUE ET DE ' +
      'PORTEE DES ENFANTS',
    en: '6. SPECIAL WARNING THAT THE MEDICINAL PRODUCT MUST BE STORED OUT OF THE SIGHT AND REACH OF CHILDREN',
  },
  {
    t: 'p',
    x: 'Tenir hors de la vue et de la portée des enfants.',
    en: 'Keep out of the sight and reach of children.',
  },

  {
    t: 'h1',
    x: '7. AUTRE(S) MISE(S) EN GARDE SPECIALE(S), SI NECESSAIRE',
    en: '7. OTHER SPECIAL WARNING(S), IF NECESSARY',
  },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },

  {
    t: 'h1',
    x: '8. DATES DE FABRICATION ET DE PEREMPTION',
    en: '8. MANUFACTURING AND EXPIRY DATES',
  },
  { t: 'p', x: 'FAB {MM/AAAA}', en: 'MFD {MM/YYYY}' },
  { t: 'p', x: 'EXP {MM/AAAA}', en: 'EXP {MM/YYYY}' },

  {
    t: 'h1',
    x: '9. PRECAUTIONS PARTICULIERES DE CONSERVATION',
    en: '9. SPECIAL STORAGE CONDITIONS',
  },
  {
    t: 'p',
    x: "<À conserver à moins de 30 °C, dans un endroit sec et à l'abri de la lumière>",
    en: '<Store below 30 °C, in a dry place, protected from light>',
  },

  {
    t: 'h1',
    x:
      "10. PRECAUTIONS PARTICULIERES D'ELIMINATION DES MEDICAMENTS NON UTILISES OU DES DECHETS " +
      "PROVENANT DE CES MEDICAMENTS S'IL Y A LIEU",
    en:
      '10. SPECIAL PRECAUTIONS FOR DISPOSAL OF UNUSED MEDICINAL PRODUCTS OR WASTE MATERIALS ' +
      'DERIVED FROM SUCH MEDICINAL PRODUCTS, IF APPROPRIATE',
  },
  { t: 'p', x: '<…………...>' },

  {
    t: 'h1',
    x: "11. NOM ET ADRESSE DU TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE",
    en: '11. NAME AND ADDRESS OF THE MARKETING AUTHORISATION HOLDER',
  },
  { t: 'h3', x: 'Titulaire', en: 'Holder' },
  { t: 'p', x: 'NOM', en: 'NAME' },
  { t: 'p', x: 'ADRESSE COMPLETE', en: 'FULL ADDRESS' },
  { t: 'h3', x: 'Exploitant', en: 'Distributor' },
  { t: 'p', x: 'NOM', en: 'NAME' },
  { t: 'p', x: 'ADRESSE COMPLETE', en: 'FULL ADDRESS' },

  { t: 'h1', x: '12. NUMERO DU LOT', en: '12. BATCH NUMBER' },
  { t: 'p', x: 'Lot {numéro}', en: 'Batch {number}' },

  {
    t: 'h1',
    x: '13. CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE',
    en: '13. CONDITIONS OF PRESCRIPTION AND SUPPLY',
  },
  {
    t: 'p',
    x:
      '[Copier/coller les libellés figurant dans la rubrique « conditions de prescription et de ' +
      'délivrance » du RCP]',
    en: '[Copy the wording of the SmPC section “conditions of prescription and supply” verbatim]',
  },

  { t: 'h1', x: "14. INDICATIONS D'UTILISATION", en: '14. INSTRUCTIONS ON USE' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  {
    t: 'p',
    x:
      '[OU, pour un médicament NON soumis à prescription médicale uniquement : mettre le libellé de ' +
      "la notice relatif aux indications thérapeutiques « 1. Qu'est-ce que X et dans quels cas " +
      'est-il utilisé ? »]',
    en:
      '[OR, for a medicinal product NOT subject to medical prescription only: use the leaflet ' +
      'wording on therapeutic indications “1. What X is and what it is used for”]',
  },

  { t: 'h1', x: '15. INFORMATIONS EN BRAILLE', en: '15. INFORMATION IN BRAILLE' },

  {
    t: 'h1',
    x: '16. IDENTIFIANT UNIQUE - CODE-BARRES 2D',
    en: '16. UNIQUE IDENTIFIER — 2D BARCODE',
  },
  {
    t: 'p',
    x: "<code-barres 2D portant l'identifiant unique inclus.>",
    en: '<2D barcode carrying the unique identifier included.>',
  },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },

  {
    t: 'h1',
    x: '17. IDENTIFIANT UNIQUE - DONNÉES LISIBLES PAR LES HUMAINS',
    en: '17. UNIQUE IDENTIFIER — HUMAN READABLE DATA',
  },
  { t: 'p', x: '<PC : {numéro} [code CIP]', en: '<PC: {number} [CIP code]' },
  { t: 'p', x: 'SN : {numéro} [numéro de série]', en: 'SN: {number} [serial number]' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },

  {
    t: 'part',
    x:
      "PICTOGRAMME DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR OU, EN L'ABSENCE D'EMBALLAGE " +
      'EXTERIEUR, SUR LE CONDITIONNEMENT PRIMAIRE',
    en:
      'PICTOGRAM TO APPEAR ON THE OUTER PACKAGING OR, WHERE THERE IS NO OUTER PACKAGING, ON THE ' +
      'IMMEDIATE PACKAGING',
  },
  {
    t: 'p',
    x:
      '[pictogramme relatif aux effets tératogènes ou fœtotoxiques] [pictogramme relatif aux effets ' +
      'sur la capacité à conduire]',
    en: '[pictogram for teratogenic or foetotoxic effects] [pictogram for effects on the ability to drive]',
  },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },

  { t: 'break' },
  {
    t: 'part',
    x: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PLAQUETTES OU LES FILMS THERMOSOUDES',
    en: 'MINIMUM PARTICULARS TO APPEAR ON BLISTERS OR STRIPS',
  },
  { t: 'h3', x: 'NATURE/TYPE PLAQUETTES / FILMS', en: 'NATURE/TYPE OF BLISTERS / STRIPS' },
  { t: 'p', x: '<{Plaquettes}> <{Films thermosoudés}>', en: '<{Blisters}> <{Heat-sealed strips}>' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  { t: 'h1', x: '1. DENOMINATION DU MEDICAMENT', en: '1. NAME OF THE MEDICINAL PRODUCT' },
  { t: 'p', x: 'xxx' },
  { t: 'p', x: '{Substance(s) active(s)}', en: '{Active substance(s)}' },
  {
    t: 'h1',
    x: "2. NOM DU TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE",
    en: '2. NAME OF THE MARKETING AUTHORISATION HOLDER',
  },
  { t: 'p', x: 'NOM', en: 'NAME' },
  {
    t: 'h1',
    x: '3. DATES DE FABRICATION ET DE PEREMPTION',
    en: '3. MANUFACTURING AND EXPIRY DATES',
  },
  { t: 'p', x: 'FAB {MM/AAAA}', en: 'MFD {MM/YYYY}' },
  { t: 'p', x: 'EXP {MM/AAAA}', en: 'EXP {MM/YYYY}' },
  { t: 'h1', x: '4. NUMERO DU LOT', en: '4. BATCH NUMBER' },
  { t: 'p', x: 'Lot {numéro}', en: 'Batch {number}' },
  { t: 'h1', x: '5. AUTRES', en: '5. OTHER' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },

  { t: 'break' },
  {
    t: 'part',
    x: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PETITS CONDITIONNEMENTS PRIMAIRES',
    en: 'MINIMUM PARTICULARS TO APPEAR ON SMALL IMMEDIATE PACKAGING UNITS',
  },
  {
    t: 'h3',
    x: 'NATURE/TYPE PETITS CONDITIONNEMENTS PRIMAIRES',
    en: 'NATURE/TYPE OF SMALL IMMEDIATE PACKAGING UNITS',
  },
  { t: 'p', x: '<{Petits conditionnements primaires}>', en: '<{Small immediate packaging units}>' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  {
    t: 'h1',
    x: "1. DENOMINATION DU MEDICAMENT ET VOIE(S) D'ADMINISTRATION",
    en: '1. NAME OF THE MEDICINAL PRODUCT AND ROUTE(S) OF ADMINISTRATION',
  },
  { t: 'p', x: 'xxx' },
  { t: 'p', x: '{Substance(s) active(s)}', en: '{Active substance(s)}' },
  { t: 'p', x: "{Voie d'administration}", en: '{Route of administration}' },
  { t: 'h1', x: "2. MODE D'ADMINISTRATION", en: '2. METHOD OF ADMINISTRATION' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  {
    t: 'h1',
    x: '3. DATES DE FABRICATION ET DE PEREMPTION',
    en: '3. MANUFACTURING AND EXPIRY DATES',
  },
  { t: 'p', x: 'FAB {MM/AAAA}', en: 'MFD {MM/YYYY}' },
  { t: 'p', x: 'EXP {MM/AAAA}', en: 'EXP {MM/YYYY}' },
  { t: 'h1', x: '4. NUMERO DU LOT', en: '4. BATCH NUMBER' },
  { t: 'p', x: 'Lot {numéro}', en: 'Batch {number}' },
  {
    t: 'h1',
    x: '5. CONTENU EN POIDS, VOLUME OU UNITE',
    en: '5. CONTENTS BY WEIGHT, BY VOLUME OR BY UNIT',
  },
  { t: 'p', x: '<……… .>' },
  { t: 'h1', x: '6. AUTRES', en: '6. OTHER' },
  { t: 'p', x: '<Sans objet.>', en: '<Not applicable.>' },
  { t: 'p', x: '<Pour usage autologue uniquement.>', en: '<For autologous use only.>' },
]

/* ═════════════════ Lettres — la prose des gabarits du builder, mise en page du moteur ═════════════════
   `agence` et `salut` sont résolus PAR PAYS depuis le référentiel du builder
   (`web/src/features/workspace/roadmap-data.ts` : agence, civilité, adresse — déjà en production
   dans les lettres compilées des dossiers). Les lettres varient donc par pays. */

// ⚠️ Pas de case ville (directive CEO du 31/07/2026) : la date seule, décalée à droite.
const LETTRE_OUVERTURE = [
  { t: 'right', x: 'Le {date}', en: '{date}' },
  { t: 'right', x: 'À', en: 'To' },
  { t: 'agence' },
]

const LETTRE_CLOTURE = [
  {
    t: 'p',
    x: "Nous vous prions d'agréer, {CIV}, l'expression de notre sincère collaboration.",
    en: 'Please accept, {CIV}, the expression of our sincere collaboration.',
  },
  { t: 'right', x: 'Poste', en: 'Position' },
  { t: 'right', x: 'Signature et Cachet', en: 'Signature and stamp' },
  { t: 'right', x: 'Nom et Prénom(s)', en: 'Full name' },
]

const LETTRE_DEMANDE = [
  ...LETTRE_OUVERTURE,
  {
    t: 'h3',
    x: "Objet : Demande d'enregistrement d'AMM du produit …",
    en: 'Subject: Application for marketing authorisation (MA) of the product …',
  },
  { t: 'salut' },
  {
    t: 'p',
    x:
      "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande " +
      "d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :",
    en:
      'We have the honour of submitting for your kind consideration the application file for the ' +
      'marketing authorisation (MA) of our following pharmaceutical specialty:',
  },
  { t: 'li', x: 'Nom commercial : …', en: 'Trade name: …' },
  { t: 'li', x: 'DCI et dosage : …', en: 'INN and strength: …' },
  { t: 'li', x: 'Forme et présentation : …', en: 'Form and presentation: …' },
  {
    t: 'li',
    x: "Nom et adresse du demandeur d'AMM : …",
    en: 'Name and address of the MA applicant: …',
  },
  { t: 'li', x: 'Nom et adresse du fabricant : …', en: 'Name and address of the manufacturer: …' },
  {
    t: 'p',
    x:
      "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA " +
      'et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour ' +
      "tout complément d'information.",
    en:
      'The enclosed technical dossier has been compiled in accordance with WAEMU directives and ' +
      'the specific requirements of your Agency. We remain at your entire disposal for any ' +
      'further information.',
  },
  ...LETTRE_CLOTURE,
]

const LETTRE_RENOUVELLEMENT = [
  ...LETTRE_OUVERTURE,
  {
    t: 'h3',
    x: "Objet : Demande de renouvellement d'AMM du produit …",
    en: 'Subject: Application for renewal of the marketing authorisation (MA) of the product …',
  },
  { t: 'h3', x: "Réf. : AMM n° … du {date d'octroi}", en: 'Ref.: MA No. … of {grant date}' },
  { t: 'salut' },
  {
    t: 'p',
    x:
      "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de " +
      "renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité " +
      'pharmaceutique suivante :',
    en:
      'We have the honour of submitting for your kind consideration the application file for ' +
      'renewal of the marketing authorisation (MA) of our following pharmaceutical specialty:',
  },
  { t: 'li', x: 'Nom commercial : …', en: 'Trade name: …' },
  { t: 'li', x: 'DCI et dosage : …', en: 'INN and strength: …' },
  { t: 'li', x: 'Forme et présentation : …', en: 'Form and presentation: …' },
  { t: 'li', x: "N° d'AMM et date d'octroi : …", en: 'MA number and grant date: …' },
  {
    t: 'li',
    x: "Nom et adresse du titulaire de l'AMM : …",
    en: 'Name and address of the MA holder: …',
  },
  { t: 'li', x: 'Nom et adresse du fabricant : …', en: 'Name and address of the manufacturer: …' },
  {
    t: 'p',
    x:
      "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA " +
      'et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour ' +
      "tout complément d'information.",
    en:
      'The enclosed technical dossier has been compiled in accordance with WAEMU directives and ' +
      'the specific requirements of your Agency. We remain at your entire disposal for any ' +
      'further information.',
  },
  ...LETTRE_CLOTURE,
]

const LETTRE_VARIATION = [
  ...LETTRE_OUVERTURE,
  {
    t: 'h3',
    x: "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …",
    en: 'Subject: Application for a <minor> <major> variation to the MA of the product …',
  },
  { t: 'h3', x: "Réf. : AMM n° … du {date d'octroi}", en: 'Ref.: MA No. … of {grant date}' },
  { t: 'salut' },
  {
    t: 'p',
    x:
      "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de " +
      "l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée " +
      'comme suit :',
    en:
      'We have the honour of submitting for your kind consideration an application for a ' +
      'variation of the marketing authorisation (MA) of our pharmaceutical specialty, identified ' +
      'as follows:',
  },
  { t: 'li', x: 'Nom commercial : …', en: 'Trade name: …' },
  { t: 'li', x: 'DCI : …', en: 'INN: …' },
  {
    t: 'p',
    x: 'La (les) variation(s) sollicitée(s) porte(nt) sur :',
    en: 'The requested variation(s) concern(s):',
  },
  { t: 'li', x: '<Nature de la modification>', en: '<Nature of the change>' },
  {
    t: 'p',
    x:
      'Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont ' +
      'joints en annexe.',
    en: 'The “before / after” comparative table and the corresponding supporting documents are annexed.',
  },
  ...LETTRE_CLOTURE,
]

const LETTRE_PGHT = [
  ...LETTRE_OUVERTURE,
  {
    t: 'h3',
    x: 'Objet : Attestation de PGHT — {ACTE_OBJET} du produit …',
    en: 'Subject: Ex-factory price (PGHT) statement — {ACTE_OBJET} of the product …',
  },
  { t: 'salut' },
  {
    t: 'p',
    // ⚠️ {ACTE} : la lettre de PGHT accompagne un ENREGISTREMENT ou un RENOUVELLEMENT — écrire
    // « l'enregistrement » dans les deux cas ferait mentir un courrier officiel sur son objet.
    x:
      'Nous venons par la présente, solliciter auprès de votre haute bienveillance, ' +
      "{ACTE} de l'autorisation de mise sur le marché (AMM) de notre spécialité " +
      'pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés ' +
      'dans le tableau suivant :',
    en:
      'We hereby request from your kind consideration {ACTE} of the marketing ' +
      'authorisation (MA) of our pharmaceutical specialty, whose particulars and ex-factory ' +
      'wholesale price (PGHT) are recorded in the following table:',
  },
  {
    t: 'table',
    rows: [
      ['Nom commercial', 'DCI et dosage', 'Forme et présentation', 'PGHT (FCFA)'],
      ['…', '…', '…', '…'],
    ],
    rowsEn: [
      ['Trade name', 'INN and strength', 'Form and presentation', 'PGHT (FCFA)'],
      ['…', '…', '…', '…'],
    ],
  },
  {
    t: 'p',
    x: "Nous restons à votre entière disposition pour tout complément d'information.",
    en: 'We remain at your entire disposal for any further information.',
  },
  {
    t: 'p',
    x:
      "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, {CIV}, " +
      "l'expression de notre sincère collaboration.",
    en:
      'Hoping for a favourable outcome, please accept, {CIV}, the expression of our ' +
      'sincere collaboration.',
  },
  { t: 'right', x: 'Poste', en: 'Position' },
  { t: 'right', x: 'Signature et Cachet', en: 'Signature and stamp' },
  { t: 'right', x: 'Nom et Prénom(s)', en: 'Full name' },
]

/**
 * Déclaration de certification des numéros DMF — obligation de l'AIRP (Côte d'Ivoire), note
 * d'information n° 1668. Même prose que le modèle déjà en production dans le builder
 * (`web/src/features/workspace/templates.ts`). Ces blocs ne servent que de REPLI : tant que le
 * fichier de l'AIRP est déposé, c'est LUI qui est servi, à l'octet près.
 *
 * Le tableau récapitulatif de l'AIRP est rendu en deux colonnes (libellé / valeur) : le rendu PDF
 * refuse une cellule qui déborde sa colonne, d'où le libellé court du site de fabrication — ce que
 * la cellule doit contenir est écrit dans la colonne de droite, sans rien retrancher à l'exigence.
 */
const LETTRE_DMF = [
  ...LETTRE_OUVERTURE,
  {
    t: 'h3',
    x: 'Objet : Déclaration relative à la certification des numéros DMF',
    en: 'Subject: Declaration on the certification of DMF numbers',
  },
  { t: 'salut' },
  {
    t: 'p',
    x:
      'Je soussigné(e), …, agissant en qualité de … au sein du laboratoire …, certifie que le ' +
      'numéro de Drug Master File (DMF) relatif à la substance active (API) du produit ci-dessous ' +
      'est exact, valide et conforme aux informations fournies par le fabricant.',
    en:
      'I, the undersigned, …, acting as … within the laboratory …, certify that the Drug Master ' +
      'File (DMF) number for the active pharmaceutical ingredient (API) of the product below is ' +
      'accurate, valid and consistent with the information provided by the manufacturer.',
  },
  {
    t: 'p',
    x:
      'Je déclare également que ces informations ont été vérifiées auprès de l’autorité de ' +
      'réglementation pharmaceutique du pays d’origine de cette substance active.',
    en:
      'I further declare that this information has been verified with the pharmaceutical ' +
      'regulatory authority of the country of origin of that active ingredient.',
  },
  {
    t: 'p',
    x: 'Le tableau ci-dessous récapitule les informations concernées :',
    en: 'The table below summarises the information concerned:',
  },
  {
    t: 'table',
    // Sept lignes, sans ligne d'en-tête : c'est la forme du tableau de la note n° 1668, et celle
    // que produit déjà le builder. En inventer une huitième ferait diverger les deux.
    rows: [
      ['Dénomination du produit fini', '…'],
      ['Titulaire de l’AMM', '…'],
      ['Fabricant du produit fini', '…'],
      ['Substance active (API)', '…'],
      ['Site de fabrication de la substance active', 'Nom, adresse, e-mail et téléphone'],
      ['Autorité approbatrice du numéro de DMF', '…'],
      ['N° DMF', '…'],
    ],
    rowsEn: [
      ['Name of the finished product', '…'],
      ['MA holder', '…'],
      ['Manufacturer of the finished product', '…'],
      ['Active ingredient (API)', '…'],
      ['API manufacturing site', 'Name, address, e-mail and telephone'],
      ['Authority that approved the DMF number', '…'],
      ['DMF No.', '…'],
    ],
  },
  {
    t: 'p',
    x: 'Je m’engage à informer au préalable l’autorité de toute variation relative à ces informations.',
    en: 'I undertake to inform the authority in advance of any variation concerning this information.',
  },
  {
    t: 'p',
    x: 'La présente déclaration est établie pour servir et valoir ce que de droit.',
    en: 'This declaration is issued to serve and avail as of right.',
  },
  { t: 'right', x: 'Poste', en: 'Position' },
  { t: 'right', x: 'Signature et Cachet', en: 'Signature and stamp' },
  { t: 'right', x: 'Nom et Prénom(s)', en: 'Full name' },
]

/* ═════════════════ Résumés OMS — formulaires anglais par nature ═════════════════ */

const QOS = [
  { t: 'doctitle', x: 'MODULE 2.3 — QUALITY OVERALL SUMMARY : PRODUCT DOSSIER (QOS-PD)' },
  { t: 'h1', x: 'INTRODUCTION — RÉSUMÉ DES INFORMATIONS PRODUIT' },
  { t: 'li', x: 'DCI et noms commerciaux : …' },
  { t: 'li', x: 'Substance(s) active(s), avec forme (sel, hydrate, polymorphe) : …' },
  { t: 'li', x: 'Demandeur : …' },
  { t: 'li', x: 'Forme galénique et dosage(s) : …' },
  { t: 'li', x: "Voie d'administration : …" },
  { t: 'li', x: 'Indications proposées : …' },
  { t: 'h3', x: 'Personnes de contact' },
  {
    t: 'p',
    x: 'Contact principal et contacts additionnels : adresse postale complète, e-mail, téléphone.',
  },
  { t: 'h3', x: 'Dossiers liés et références bibliographiques' },
  {
    t: 'p',
    x: 'Numéro de référence · statut de préqualification · fabricant de la substance active.',
  },
  { t: 'h1', x: '2.3.S — SUBSTANCE ACTIVE (DRUG SUBSTANCE)' },
  { t: 'p', x: 'Nomenclature · structure · propriétés générales.' },
  { t: 'p', x: 'Fabricant · description du procédé · contrôle des matières.' },
  {
    t: 'p',
    x: 'Contrôle de la substance active · normes de référence · conditionnement · stabilité.',
  },
  { t: 'h1', x: '2.3.P — PRODUIT FINI (DRUG PRODUCT)' },
  { t: 'p', x: 'Description et composition · développement pharmaceutique.' },
  { t: 'p', x: 'Fabrication · contrôle des excipients · contrôle du produit fini.' },
  { t: 'p', x: 'Normes de référence · système de fermeture · stabilité.' },
  { t: 'h1', x: '2.3.A / 2.3.R — ANNEXES ET INFORMATIONS RÉGIONALES' },
  {
    t: 'p',
    x: '<Installations et équipements> <Évaluation de sécurité des agents adventices> <Excipients nouveaux> <Informations régionales>',
  },
]

const BTIF = [
  { t: 'doctitle', x: 'BIOEQUIVALENCE TRIAL INFORMATION FORM (BTIF)' },
  { t: 'h1', x: '1. SUMMARY' },
  { t: 'h3', x: '1.1 Summary of bioequivalence studies' },
  { t: 'p', x: '…' },
  { t: 'h3', x: '1.2 Composition of the proposed formulations and biobatches' },
  { t: 'p', x: 'Tableaux comparatifs par dosage.' },
  { t: 'h1', x: '2. CLINICAL STUDY REPORT' },
  {
    t: 'p',
    x: "Numéro et titre d'étude · localisation du protocole · dates de chaque phase et d'administration du produit.",
  },
  { t: 'h3', x: '2.1 Ethics' },
  {
    t: 'p',
    x: "Comité d'éthique · date d'approbation · localisation de la lettre et du formulaire de consentement.",
  },
  { t: 'h3', x: '2.2 Investigators and study administrative structure' },
  {
    t: 'p',
    x: 'Investigateur principal (CV) · site clinique · laboratoires cliniques et analytiques · société PK/statistique.',
  },
  { t: 'h3', x: '2.3 Study objectives' },
  { t: 'p', x: '…' },
  { t: 'h3', x: '2.4 Investigational plan' },
  {
    t: 'p',
    x: "Plan d'étude · critères d'inclusion et d'exclusion · vérification de l'état de santé · retrait des sujets · remplaçants.",
  },
  { t: 'h1', x: 'SUITE' },
  {
    t: 'p',
    x: 'Produits étudiés · procédures · méthodes analytiques · pharmacocinétique et statistiques · annexes.',
  },
  {
    t: 'p',
    x: '« Ni le format ni le contenu du document (textes et tableaux) ne doivent être modifiés » — instruction OMS en tête du formulaire. Les zones grisées sont réservées à l’autorité.',
  },
]

/**
 * Les documents servis, groupés comme sur la page :
 * `produit` (RCP · Notice · Étiquetage — mise à niveau possible) · `lettres` · `resumes`.
 * `bilingue: false` (résumés OMS) = un seul fichier, le formulaire est anglais par nature.
 */
export const DOCS = [
  {
    slug: 'rcp',
    nom: ['Résumé des Caractéristiques du Produit', 'Summary of Product Characteristics'],
    court: ['RCP', 'SmPC'],
    resume: [
      'Le document qui fait foi pour le professionnel de santé — 10 rubriques, numérotation non modifiable.',
      'The reference document for healthcare professionals — 10 sections, numbering not modifiable.',
    ],
    source: ['Maquette ABMed 2026', 'ABMed 2026 template'],
    groupe: 'produit',
    blocks: RCP,
    upgradable: true,
    bilingue: true,
    // Côte d'Ivoire : l'AIRP publie SON modèle de RCP et l'impose — les modalités d'AMM et de
    // renouvellement exigent le RCP « selon le modèle disponible sur le site de l'AIRP », en
    // français, en Word ou PDF modifiable. On sert donc le fichier de l'autorité tel quel, à
    // l'octet près, et la mise à niveau Regafy AI reconstruit vers CE gabarit-là, pas la maquette
    // ABMed. Les sept autres pays gardent la maquette régionale.
    officiels: {
      ci: 'RA-source/AIRP/CIV_Template RCP.pdf',
    },
  },
  {
    slug: 'notice',
    nom: ["Notice : information de l'utilisateur", 'Package leaflet: information for the user'],
    court: ['Notice', 'Leaflet'],
    resume: [
      "L'encadré d'avertissement et les six rubriques, dans l'ordre imposé.",
      'The warning box and the six sections, in the imposed order.',
    ],
    source: ['Maquette ABMed 2026', 'ABMed 2026 template'],
    groupe: 'produit',
    blocks: NOTICE,
    upgradable: true,
    bilingue: true,
  },
  {
    slug: 'etiquetage',
    nom: ['Étiquetage et conditionnement', 'Labelling and packaging'],
    court: ['Étiquetage', 'Labelling'],
    resume: [
      'Les trois jeux de mentions : emballage extérieur, plaquettes, petits conditionnements.',
      'The three sets of particulars: outer packaging, blisters, small immediate packs.',
    ],
    source: ['Modèle ABMed 2026', 'ABMed 2026 template'],
    groupe: 'produit',
    blocks: ETIQUETAGE,
    upgradable: true,
    bilingue: true,
  },
  {
    slug: 'lettre-demande',
    nom: ["Lettre de demande d'AMM", 'MA application letter'],
    court: ['Lettre de demande', 'Application letter'],
    resume: [
      "La lettre qui ouvre le dossier, adressée à l'autorité de votre pays de dépôt.",
      'The letter that opens the dossier, addressed to your filing country’s authority.',
    ],
    source: ['Modèle UEMOA — nouvelle AMM', 'UEMOA template — new MA'],
    groupe: 'lettres',
    blocks: LETTRE_DEMANDE,
    upgradable: false,
    bilingue: true,
    layout: 'lettre',
    // ⚠️ TEL QUEL, à l'octet près (directive CEO du 31/07/2026) : quand une autorité publie son
    // propre modèle de lettre, on SERT LE FICHIER OFFICIEL — affiché et téléchargé sans aucune
    // réinterprétation. La génération ne vaut que pour les pays sans modèle déposé.
    officiels: {
      bj: 'RA-source/Template/Cover Lettre/Benin_Cover letter_template official_ABMed.pdf',
    },
  },
  {
    slug: 'lettre-renouvellement',
    nom: ['Lettre de demande de renouvellement', 'MA renewal application letter'],
    court: ['Lettre de renouvellement', 'Renewal letter'],
    resume: [
      "La demande de renouvellement, avec la référence de l'AMM existante et sa date d'octroi.",
      'The renewal application, with the existing MA reference and its grant date.',
    ],
    source: ['Modèle UEMOA — renouvellement', 'UEMOA template — renewal'],
    groupe: 'lettres',
    blocks: LETTRE_RENOUVELLEMENT,
    upgradable: false,
    bilingue: true,
    layout: 'lettre',
  },
  {
    slug: 'lettre-variation',
    nom: ['Lettre de demande de variation', 'MA variation application letter'],
    court: ['Lettre de variation', 'Variation letter'],
    resume: [
      "La déclaration d'une modification sur une AMM existante — classe, natures, annexe comparative.",
      'The declaration of a change to an existing MA — class, natures, comparative annex.',
    ],
    source: ['Annexe N°2, Règlement 04/2020 UEMOA', 'Annex No. 2, Regulation 04/2020 WAEMU'],
    groupe: 'lettres',
    blocks: LETTRE_VARIATION,
    upgradable: false,
    bilingue: true,
    layout: 'lettre',
  },
  {
    slug: 'lettre-pght',
    nom: ['Lettre de PGHT', 'Ex-factory price (PGHT) letter'],
    court: ['Lettre de PGHT', 'PGHT letter'],
    resume: [
      'Le Prix Grossiste Hors Taxe, déclaré dans le tableau attendu par les autorités.',
      'The ex-factory wholesale price, declared in the table expected by the authorities.',
    ],
    source: ['Modèle UEMOA — PGHT', 'UEMOA template — PGHT'],
    groupe: 'lettres',
    blocks: LETTRE_PGHT,
    upgradable: false,
    bilingue: true,
    layout: 'lettre',
    // La VARIATION ne concerne pas le PGHT : une variation ne redéclare pas le prix grossiste.
    // Les trois autres lettres portent leur activité dans leur nom — seule celle-ci se décline.
    activites: ['enr', 'renouv'],
  },
  {
    slug: 'lettre-dmf',
    nom: [
      'Déclaration de certification des numéros DMF',
      'Declaration on the certification of DMF numbers',
    ],
    court: ['Déclaration DMF', 'DMF declaration'],
    resume: [
      'La certification du numéro de Drug Master File de la substance active, exigée par l’AIRP.',
      'Certification of the active ingredient’s Drug Master File number, required by the AIRP.',
    ],
    source: ['Modèle AIRP — note n° 1668', 'AIRP template — note No. 1668'],
    groupe: 'lettres',
    blocks: LETTRE_DMF,
    upgradable: false,
    bilingue: true,
    layout: 'lettre',
    // Obligation NATIONALE : seule la Côte d'Ivoire l'impose. Ne pas l'étendre aux sept autres
    // pays sans le texte qui l'y étend — la bibliothèque annoncerait une pièce inexistante.
    pays: ['ci'],
    // L'AIRP publie SON modèle : on le sert tel quel, à l'octet près (directive CEO du 31/07/2026).
    officiels: {
      // Nom volontairement ASCII : le fichier d'origine portait ses accents en unicode
      // DÉCOMPOSÉ, et toute normalisation (git sur macOS, re-téléchargement, aller-retour ZIP)
      // aurait rendu ce chemin introuvable — build cassé sans que rien ne dise pourquoi.
      ci: 'RA-source/AIRP/AIRP_Note-1668_declaration-numeros-DMF.pdf',
    },
  },
  {
    slug: 'qos-pd',
    nom: ['QOS-PD — Quality Overall Summary', 'QOS-PD — Quality Overall Summary'],
    court: ['QOS-PD', 'QOS-PD'],
    resume: [
      'Le résumé qualité du Module 2.3 — un résumé, pas un renvoi : chaque rubrique porte la donnée.',
      'The Module 2.3 quality summary — a summary, not a cross-reference: each section holds the data.',
    ],
    source: ['Modèle OMS — janvier 2025', 'WHO template — January 2025'],
    groupe: 'resumes',
    blocks: QOS,
    upgradable: false,
    bilingue: false,
  },
  {
    slug: 'btif',
    nom: [
      'BTIF — Bioequivalence Trial Information Form',
      'BTIF — Bioequivalence Trial Information Form',
    ],
    court: ['BTIF', 'BTIF'],
    resume: [
      "Le formulaire OMS de l'étude de bioéquivalence — format et contenu non modifiables.",
      'The WHO bioequivalence trial form — format and content not modifiable.',
    ],
    source: ['Modèle OMS — 13 janvier 2023', 'WHO template — 13 January 2023'],
    groupe: 'resumes',
    blocks: BTIF,
    upgradable: false,
    bilingue: false,
  },
]

/** Vrai si le document dépend du pays — mention 4.8 ou bloc destinataire d'une lettre. */
export const varieParPays = (doc) => doc.blocks.some((b) => b.t === 'vig' || b.t === 'agence')
