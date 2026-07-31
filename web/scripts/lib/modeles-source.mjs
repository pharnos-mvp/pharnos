/**
 * Bibliothèque réglementaire — CONTENU DES TROIS MODÈLES OFFICIELS.
 *
 * Transcription fidèle des maquettes ABMed 2026 déposées dans `RA-source/Template/` :
 *   • RCP        — `Template/RCP/ABMed_Maquette RCP_2026.pdf`
 *   • Notice     — `Template/Notice/ABMed_Maquette Notice_2026.pdf`
 *   • Étiquetage — `Template/Etiquetage/ABMed_Template etiquetage_2026.pdf`
 *
 * Le modèle est PUBLIC, officiel et libre de droit (arbitrage CEO du 30/07/2026) : c'est ce
 * fichier-ci que le visiteur télécharge, pas une ossature de titres.
 *
 * ⚠️ Ce module ne part JAMAIS au navigateur : il est lu au moment de générer les fichiers
 * (`build-landing-modeles.mjs`). La page, elle, ne charge que le manifeste et la vigilance.
 *
 * ⚠️ Les libellés entre chevrons `< >` sont des OPTIONS de la maquette, à conserver telles
 * quelles : les retirer reviendrait à décider à la place du titulaire.
 *
 * Le seul bloc qui varie d'un pays à l'autre est `{ t: 'vig' }` — la mention de rubrique 4.8,
 * résolue par `landing/checking/vigilance.js`. Tout le reste est identique aux huit pays.
 *
 * Types de blocs :
 *   doctitle  titre du document, centré
 *   part      intertitre de partie, centré (jeux de mentions de l'étiquetage)
 *   h1        rubrique numérotée de premier niveau
 *   h2        sous-rubrique numérotée
 *   h3        intitulé courant en gras (« Posologie », « Absorption »…)
 *   p         paragraphe
 *   li        puce
 *   vig       bloc de pharmacovigilance, résolu par pays
 *   break     saut de page
 */

/** Corrigé de la maquette : la source porte « Pour las liste complète », coquille manifeste.
 *  On ne recopie pas une faute dans un document qui repart en dossier d'AMM. */
const RENVOI_EXCIPIENTS = '<Pour la liste complète des excipients, voir rubrique 6.1.>'

const RCP = [
  { t: 'doctitle', x: 'RESUME DES CARACTERISTIQUES DU PRODUIT' },

  { t: 'h1', x: '1. DENOMINATION DU MEDICAMENT' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h1', x: '2. COMPOSITION QUALITATIVE ET QUANTITATIVE' },
  { t: 'p', x: '{ ................................................................ }' },
  { t: 'p', x: '<Excipient(s) à effet notoire :>' },
  { t: 'p', x: RENVOI_EXCIPIENTS },

  { t: 'h1', x: '3. FORME PHARMACEUTIQUE' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h1', x: '4. DONNEES CLINIQUES' },

  { t: 'h2', x: '4.1. Indications thérapeutiques' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: "4.2. Posologie et mode d'administration" },
  { t: 'h3', x: 'Posologie' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: "Mode d'administration" },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '4.3. Contre-indications' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: "4.4. Mises en garde spéciales et précautions d'emploi" },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: "4.5. Interactions avec d'autres médicaments et autres formes d'interactions" },
  { t: 'p', x: "<Aucune étude d'interaction n'a été réalisée.>" },
  { t: 'p', x: '<Population pédiatrique>' },
  { t: 'p', x: "<Les études d'interaction n'ont été réalisées que chez l'adulte.>" },
  { t: 'p', x: '<Associations contre-indiquées>' },
  { t: 'p', x: '<Associations déconseillées>' },
  { t: 'p', x: "<Associations faisant l'objet de précautions d'emploi>" },
  { t: 'p', x: '<Associations à prendre en compte>' },
  { t: 'p', x: '<Interactions avec les examens paracliniques>' },

  { t: 'h2', x: '4.6. Fertilité, grossesse et allaitement' },
  { t: 'p', x: '<Grossesse>' },
  { t: 'p', x: '<Allaitement>' },
  { t: 'p', x: '<Fertilité>' },

  {
    t: 'h2',
    x: "4.7. Effets sur l'aptitude à conduire des véhicules et à utiliser des machines",
  },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '4.8. Effets indésirables' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'vig' },

  { t: 'h2', x: '4.9. Surdosage' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h1', x: '5. PROPRIETES PHARMACOLOGIQUES' },

  { t: 'h2', x: '5.1. Propriétés pharmacodynamiques' },
  { t: 'p', x: 'Classe pharmacothérapeutique : {classe},' },
  { t: 'p', x: 'Code ATC : {code} <non encore attribué>.' },
  { t: 'h3', x: "Mécanisme d'action" },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Effets pharmacodynamiques' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Efficacité et sécurité clinique' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Population pédiatrique' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '5.2. Propriétés pharmacocinétiques' },
  { t: 'h3', x: 'Absorption' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Distribution' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Biotransformation' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Élimination' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Linéarité/non-linéarité' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'h3', x: 'Relations pharmacocinétique/pharmacodynamique' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '5.3. Données de sécurité préclinique' },
  {
    t: 'p',
    x:
      '<Les données non cliniques issues des études conventionnelles de pharmacologie de sécurité, ' +
      'toxicologie en administration répétée, génotoxicité, cancérogénèse, et des fonctions de ' +
      "reproduction et de développement, n'ont pas révélé de risque particulier pour l'homme.>",
  },
  {
    t: 'p',
    x:
      "<Des effets ont été observés chez l'animal uniquement à des expositions considérées comme " +
      "suffisamment supérieures à l'exposition maximale observée chez l'homme, et ont peu de " +
      'signification clinique.>',
  },
  {
    t: 'p',
    x:
      "<Les effets indésirables suivants n'ont pas été observés dans les études cliniques, mais ont " +
      "été constatés chez des animaux soumis à des niveaux d'exposition semblables à ceux utilisés " +
      "pour l'homme et pourraient avoir une signification clinique.>",
  },
  { t: 'p', x: '<Évaluation du risque environnemental>' },

  { t: 'h1', x: '6. DONNEES PHARMACEUTIQUES' },

  { t: 'h2', x: '6.1. Liste des excipients' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: '6.2. Incompatibilités' },
  { t: 'p', x: 'xxxxxxxxx' },
  { t: 'p', x: '<Sans objet.>' },

  { t: 'h2', x: '6.3. Durée de conservation' },
  { t: 'p', x: '<xx mois>' },

  { t: 'h2', x: '6.4. Précautions particulières de conservation' },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: "6.5. Nature et contenu de l'emballage extérieur" },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h2', x: "6.6. Précautions particulières d'élimination et de manipulation" },
  { t: 'p', x: "<Pas d'exigences particulières <pour l'élimination>.>" },
  {
    t: 'p',
    x:
      '<Tout médicament non utilisé ou déchet doit être éliminé conformément à la réglementation ' +
      'en vigueur.>',
  },

  { t: 'h1', x: "7. TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE" },
  { t: 'p', x: 'NOM' },
  { t: 'p', x: 'ADRESSE COMPLETE' },
  { t: 'p', x: '[Tel, fax, e-Mail]' },

  { t: 'h1', x: "8. NUMERO(S) D'AUTORISATION DE MISE SUR LE MARCHE" },
  { t: 'p', x: 'xxxxxxxxx' },

  { t: 'h1', x: "9. DATE DE PREMIERE AUTORISATION/DE RENOUVELLEMENT DE L'AUTORISATION" },
  { t: 'p', x: '<Date de première autorisation : {JJ mois AAAA}>' },
  { t: 'p', x: '<Date de dernier renouvellement : {JJ mois AAAA}>' },

  { t: 'h1', x: '10. DATE DE MISE A JOUR DU TEXTE' },
  { t: 'p', x: '[à compléter ultérieurement par le titulaire]' },
  { t: 'p', x: '<{JJ mois AAAA}>' },

  { t: 'part', x: 'CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE' },
  { t: 'p', x: '<Médicament non soumis à prescription médicale.>' },
  { t: 'p', x: '<Liste I>' },
  { t: 'p', x: '<Liste II>' },
  { t: 'p', x: '<Stupéfiant>' },
]

const NOTICE = [
  { t: 'doctitle', x: "NOTICE : INFORMATION DE L'UTILISATEUR" },
  { t: 'h3', x: 'Dénomination du médicament' },
  { t: 'p', x: 'xxxxxxxxxxxxxx' },
  { t: 'p', x: '{Substance(s) active(s)}' },

  { t: 'h3', x: 'Encadré' },
  {
    t: 'p',
    x:
      '<Veuillez lire attentivement cette notice avant <de prendre> <d’utiliser> ce médicament ' +
      'car elle contient des informations importantes pour vous.',
  },
  { t: 'li', x: 'Gardez cette notice. Vous pourriez avoir besoin de la relire.' },
  {
    t: 'li',
    x:
      "Si vous avez d'autres questions, interrogez <votre médecin> <,> <ou> <votre pharmacien> ou " +
      '<votre infirmier/ère>.',
  },
  {
    t: 'li',
    x:
      "<Ce médicament vous a été personnellement prescrit. Ne le donnez pas à d'autres personnes. " +
      'Il pourrait leur être nocif, même si les signes de leur maladie sont identiques aux vôtres.>',
  },
  {
    t: 'li',
    x:
      'Si vous ressentez un quelconque effet indésirable, parlez-en à <votre médecin> <,> <ou> ' +
      "<votre pharmacien> <ou votre infirmier/ère>. Ceci s'applique aussi à tout effet indésirable " +
      'qui ne serait pas mentionné dans cette notice. Voir rubrique 4.>',
  },

  { t: 'h3', x: 'Que contient cette notice ?' },
  { t: 'p', x: "1. Qu'est-ce que xxx et dans quels cas est-il utilisé ?" },
  {
    t: 'p',
    x: "2. Quelles sont les informations à connaître avant <de prendre> <d'utiliser> xxx ?",
  },
  { t: 'p', x: '3. Comment <prendre> <utiliser> xxx ?' },
  { t: 'p', x: '4. Quels sont les effets indésirables éventuels ?' },
  { t: 'p', x: '5. Comment conserver xxx ?' },
  { t: 'p', x: "6. Contenu de l'emballage et autres informations." },

  { t: 'h1', x: "1. QU'EST-CE QUE xxx ET DANS QUELS CAS EST-IL UTILISE ?" },
  { t: 'p', x: 'Classe pharmacothérapeutique - code ATC : <{code}>' },
  {
    t: 'p',
    x:
      '<xxx contient du (DCI). La (DCI) est un (classe pharmacothérapeutique). Ce médicament est ' +
      'indiqué chez ….. pour …(Indications)……….. Lire attentivement le paragraphe « Posologie » de ' +
      'la rubrique 3>',
  },
  {
    t: 'p',
    x:
      '<Vous devez vous adresser à votre médecin si vous ne ressentez aucune amélioration ou si ' +
      'vous vous sentez moins bien <après {nombre de jours}>.',
  },

  {
    t: 'h1',
    x: "2. QUELLES SONT LES INFORMATIONS A CONNAITRE AVANT <DE PRENDRE> <D'UTILISER> xxx ?",
  },
  { t: 'h3', x: "<Ne prenez> <N'utilisez> jamais xxx :>" },
  {
    t: 'li',
    x:
      "<si vous êtes allergique <à la> <aux> {substance(s) active(s)} ou à l'un des autres " +
      'composants contenus dans ce médicament, mentionnés dans la rubrique 6>.',
  },
  { t: 'li', x: '<si…>' },
  { t: 'h3', x: 'Avertissements et précautions' },
  {
    t: 'p',
    x:
      'Adressez-vous à votre médecin <ou> <,> <pharmacien> <ou votre infirmier/ère> avant <de ' +
      "prendre> <d'utiliser> xxx.",
  },
  { t: 'p', x: '<Enfants et adolescents>' },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'h3', x: 'Autres médicaments et xxx' },
  {
    t: 'p',
    x:
      '<Informez votre <médecin> <ou> <pharmacien> si vous <prenez> <utilisez>, avez récemment ' +
      '<pris> <utilisé> ou pourriez <prendre> <utiliser> tout autre médicament.>',
  },
  { t: 'h3', x: "xxx avec <des aliments><et><,><boissons><et><de l'alcool>" },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'h3', x: 'Grossesse <et> <,> allaitement <et fertilité>' },
  {
    t: 'p',
    x:
      '<Si vous êtes enceinte ou que vous allaitez, si vous pensez être enceinte ou planifiez une ' +
      'grossesse, demandez conseil à votre <médecin> <ou> <pharmacien> avant de prendre ce ' +
      'médicament.>',
  },
  { t: 'h3', x: 'Conduite de véhicules et utilisation de machines' },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'h3', x: 'xxx contient <{nommer le/les excipient(s) à effet notoire} et recommandations>' },
  { t: 'p', x: '<………………………….>' },

  { t: 'h1', x: '3. COMMENT <PRENDRE> <UTILISER> xxx ?' },
  {
    t: 'p',
    x:
      '<Veillez à toujours <prendre> <utiliser> ce médicament en suivant exactement les indications ' +
      'de votre médecin <ou pharmacien>. Vérifiez auprès de <votre médecin> <ou> <pharmacien> en ' +
      'cas de doute.>',
  },
  { t: 'h3', x: 'Posologie' },
  { t: 'p', x: '<La dose recommandée est de…>' },
  { t: 'p', x: '<Utilisation chez les enfants <et les adolescents>>' },
  {
    t: 'p',
    x:
      "<La barre de cassure n'est là que pour faciliter la prise du comprimé si vous éprouvez des " +
      "difficultés à l'avaler en entier.>",
  },
  { t: 'p', x: '<Le comprimé peut être divisé en doses égales.>' },
  { t: 'p', x: "<La barre de cassure n'est pas destinée à briser le comprimé.>" },
  { t: 'h3', x: "Mode d'administration" },
  { t: 'p', x: '<Indiquer la voie>.' },
  { t: 'p', x: '<Les comprimés, gélules….. sont à avaler ….tels quels avec un verre d’eau>.' },
  { t: 'h3', x: 'Durée du traitement' },
  { t: 'p', x: '<Sauf avis médical, la durée du traitement est limitée à (n jours/semaines….>' },
  { t: 'h3', x: "Si vous avez <pris> <utilisé> plus de xxx que vous n'auriez dû" },
  { t: 'p', x: '<Indiquer la conduite à tenir.>' },
  { t: 'h3', x: "Si vous oubliez <de prendre> <d'utiliser> xxx" },
  {
    t: 'p',
    x:
      '<Ne prenez pas de dose double pour compenser <le comprimé><la dose><…> que vous avez oublié ' +
      'de prendre ;>',
  },
  { t: 'h3', x: "Si vous arrêtez <de prendre> <d'utiliser> xxx" },
  { t: 'p', x: '<Indiquer la conduite à tenir.>' },
  {
    t: 'p',
    x:
      "<Si vous avez d'autres questions sur l'utilisation de ce médicament, demandez plus " +
      "d'informations <à votre médecin> <,> <à votre pharmacien> <ou à votre infirmier/ère>.>",
  },

  { t: 'h1', x: '4. QUELS SONT LES EFFETS INDESIRABLES EVENTUELS ?' },
  {
    t: 'p',
    x:
      'Comme tous les médicaments, ce médicament peut provoquer des effets indésirables, mais ils ' +
      'ne surviennent pas systématiquement chez tout le monde.',
  },
  { t: 'p', x: '<Effets indésirables supplémentaires chez les enfants <et les adolescents>>' },
  { t: 'h3', x: 'Déclaration des effets secondaires' },
  {
    t: 'p',
    x:
      'Si vous ressentez un quelconque effet indésirable, parlez-en à <votre médecin> <ou> <,> ' +
      "<votre pharmacien> <ou à votre infirmier/ère>. Ceci s'applique aussi à tout effet " +
      'indésirable qui ne serait pas mentionné dans cette notice.',
  },

  { t: 'h1', x: '5. COMMENT CONSERVER xxx ?' },
  { t: 'p', x: 'Tenir ce médicament hors de la vue et de la portée des enfants.' },
  {
    t: 'p',
    x:
      "À conserver à une température ne dépassant pas X °C dans un milieu sec, à l'abri de la " +
      "lumière et de l'humidité.",
  },
  {
    t: 'p',
    x:
      "N'utilisez pas ce médicament après la date de péremption indiquée sur <l'étiquette> " +
      "<l'emballage> <le flacon> <…> <après {abréviation utilisée pour la date d'expiration}.> " +
      'La date de péremption fait référence au dernier jour de ce mois.',
  },
  {
    t: 'p',
    x: "<N'utilisez pas ce médicament si vous remarquez {description de signes visibles de détérioration}.>",
  },
  {
    t: 'p',
    x:
      "<Ne jetez aucun médicament au tout-à-l'égout <ou avec les ordures ménagères>. Demandez à " +
      "votre pharmacien d'éliminer les médicaments que vous n'utilisez plus. Ces mesures " +
      "contribueront à protéger l'environnement.>",
  },

  { t: 'h1', x: "6. CONTENU DE L'EMBALLAGE ET AUTRES INFORMATIONS" },
  { t: 'h3', x: 'Ce que contient xxx' },
  {
    t: 'li',
    x: 'La (les) substance(s) active(s) est (sont) : { ................................ }',
  },
  { t: 'li', x: 'L(es) autre(s) <composant(s)> <excipient(s)> est (sont) :' },
  { t: 'h3', x: "Qu'est-ce que xxx et contenu de l'emballage extérieur" },
  {
    t: 'p',
    x:
      'Ce médicament se présente sous forme de (indiquer la forme galénique). Chaque boîte….. ' +
      'contient ……..',
  },
  { t: 'h3', x: "Titulaire de l'autorisation de mise sur le marché" },
  { t: 'p', x: 'NOM' },
  { t: 'p', x: 'ADRESSE COMPLÈTE' },
  { t: 'h3', x: "Exploitant de l'autorisation de mise sur le marché" },
  { t: 'p', x: 'NOM' },
  { t: 'p', x: 'ADRESSE COMPLÈTE' },
  { t: 'h3', x: 'Fabricant' },
  { t: 'p', x: 'NOM' },
  { t: 'p', x: 'ADRESSE COMPLÈTE' },
  { t: 'h3', x: 'La dernière date à laquelle cette notice a été révisée est :' },
  { t: 'p', x: '[à compléter ultérieurement par le titulaire]' },
  { t: 'p', x: '<{MM/AAAA}> <{mois AAAA}.>' },
]

const ETIQUETAGE = [
  { t: 'doctitle', x: 'ETIQUETAGE' },
  {
    t: 'part',
    x: "MENTIONS DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR ET SUR LE CONDITIONNEMENT PRIMAIRE",
  },
  { t: 'h3', x: 'NATURE/TYPE EMBALLAGE SECONDAIRE OU CONDITIONNEMENT PRIMAIRE' },
  { t: 'p', x: '<{conditionnement secondaire}> <et> <{Conditionnement(s) primaire(s)}>' },

  { t: 'h1', x: '1. DENOMINATION DU MEDICAMENT' },
  { t: 'p', x: 'xxx' },
  { t: 'p', x: '{Substance(s) active(s)}' },

  { t: 'h1', x: '2. COMPOSITION EN SUBSTANCES ACTIVES' },
  { t: 'p', x: '{ ................................................................ }' },

  { t: 'h1', x: '3. LISTE DES EXCIPIENTS' },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'p', x: "<Préciser la présence d'excipient à effet notoire.>" },

  { t: 'h1', x: '4. FORME PHARMACEUTIQUE ET CONTENU' },
  { t: 'p', x: '{}' },

  { t: 'h1', x: "5. MODE ET VOIE(S) D'ADMINISTRATION" },
  { t: 'p', x: '<Indiquez la voie>' },
  { t: 'p', x: 'Lire la notice avant utilisation.' },

  {
    t: 'h1',
    x:
      '6. MISE EN GARDE SPECIALE INDIQUANT QUE LE MEDICAMENT DOIT ETRE CONSERVE HORS DE VUE ET DE ' +
      'PORTEE DES ENFANTS',
  },
  { t: 'p', x: 'Tenir hors de la vue et de la portée des enfants.' },

  { t: 'h1', x: '7. AUTRE(S) MISE(S) EN GARDE SPECIALE(S), SI NECESSAIRE' },
  { t: 'p', x: '<Sans objet.>' },

  { t: 'h1', x: '8. DATES DE FABRICATION ET DE PEREMPTION' },
  { t: 'p', x: 'FAB {MM/AAAA}' },
  { t: 'p', x: 'EXP {MM/AAAA}' },

  { t: 'h1', x: '9. PRECAUTIONS PARTICULIERES DE CONSERVATION' },
  { t: 'p', x: "<À conserver à moins de 30 °C, dans un endroit sec et à l'abri de la lumière>" },

  {
    t: 'h1',
    x:
      "10. PRECAUTIONS PARTICULIERES D'ELIMINATION DES MEDICAMENTS NON UTILISES OU DES DECHETS " +
      "PROVENANT DE CES MEDICAMENTS S'IL Y A LIEU",
  },
  { t: 'p', x: '<…………...>' },

  { t: 'h1', x: "11. NOM ET ADRESSE DU TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE" },
  { t: 'h3', x: 'Titulaire' },
  { t: 'p', x: 'NOM' },
  { t: 'p', x: 'ADRESSE COMPLETE' },
  { t: 'h3', x: 'Exploitant' },
  { t: 'p', x: 'NOM' },
  { t: 'p', x: 'ADRESSE COMPLETE' },

  { t: 'h1', x: '12. NUMERO DU LOT' },
  { t: 'p', x: 'Lot {numéro}' },

  { t: 'h1', x: '13. CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE' },
  {
    t: 'p',
    x:
      '[Copier/coller les libellés figurant dans la rubrique « conditions de prescription et de ' +
      'délivrance » du RCP]',
  },

  { t: 'h1', x: "14. INDICATIONS D'UTILISATION" },
  { t: 'p', x: '<Sans objet.>' },
  {
    t: 'p',
    x:
      '[OU, pour un médicament NON soumis à prescription médicale uniquement : mettre le libellé de ' +
      "la notice relatif aux indications thérapeutiques « 1. Qu'est-ce que X et dans quels cas " +
      'est-il utilisé ? »]',
  },

  { t: 'h1', x: '15. INFORMATIONS EN BRAILLE' },

  { t: 'h1', x: '16. IDENTIFIANT UNIQUE - CODE-BARRES 2D' },
  { t: 'p', x: "<code-barres 2D portant l'identifiant unique inclus.>" },
  { t: 'p', x: '<Sans objet.>' },

  { t: 'h1', x: '17. IDENTIFIANT UNIQUE - DONNÉES LISIBLES PAR LES HUMAINS' },
  { t: 'p', x: '<PC : {numéro} [code CIP]' },
  { t: 'p', x: 'SN : {numéro} [numéro de série]' },
  { t: 'p', x: '<Sans objet.>' },

  {
    t: 'part',
    x:
      "PICTOGRAMME DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR OU, EN L'ABSENCE D'EMBALLAGE " +
      'EXTERIEUR, SUR LE CONDITIONNEMENT PRIMAIRE',
  },
  {
    t: 'p',
    x:
      '[pictogramme relatif aux effets tératogènes ou fœtotoxiques] [pictogramme relatif aux effets ' +
      'sur la capacité à conduire]',
  },
  { t: 'p', x: '<Sans objet.>' },

  { t: 'break' },
  {
    t: 'part',
    x: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PLAQUETTES OU LES FILMS THERMOSOUDES',
  },
  { t: 'h3', x: 'NATURE/TYPE PLAQUETTES / FILMS' },
  { t: 'p', x: '<{Plaquettes}> <{Films thermosoudés}>' },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'h1', x: '1. DENOMINATION DU MEDICAMENT' },
  { t: 'p', x: 'xxx' },
  { t: 'p', x: '{Substance(s) active(s)}' },
  { t: 'h1', x: "2. NOM DU TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE" },
  { t: 'p', x: 'NOM' },
  { t: 'h1', x: '3. DATES DE FABRICATION ET DE PEREMPTION' },
  { t: 'p', x: 'FAB {MM/AAAA}' },
  { t: 'p', x: 'EXP {MM/AAAA}' },
  { t: 'h1', x: '4. NUMERO DU LOT' },
  { t: 'p', x: 'Lot {numéro}' },
  { t: 'h1', x: '5. AUTRES' },
  { t: 'p', x: '<Sans objet.>' },

  { t: 'break' },
  {
    t: 'part',
    x: 'MENTIONS MINIMALES DEVANT FIGURER SUR LES PETITS CONDITIONNEMENTS PRIMAIRES',
  },
  { t: 'h3', x: 'NATURE/TYPE PETITS CONDITIONNEMENTS PRIMAIRES' },
  { t: 'p', x: '<{Petits conditionnements primaires}>' },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'h1', x: "1. DENOMINATION DU MEDICAMENT ET VOIE(S) D'ADMINISTRATION" },
  { t: 'p', x: 'xxx' },
  { t: 'p', x: '{Substance(s) active(s)}' },
  { t: 'p', x: "{Voie d'administration}" },
  { t: 'h1', x: "2. MODE D'ADMINISTRATION" },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'h1', x: '3. DATES DE FABRICATION ET DE PEREMPTION' },
  { t: 'p', x: 'FAB {MM/AAAA}' },
  { t: 'p', x: 'EXP {MM/AAAA}' },
  { t: 'h1', x: '4. NUMERO DU LOT' },
  { t: 'p', x: 'Lot {numéro}' },
  { t: 'h1', x: '5. CONTENU EN POIDS, VOLUME OU UNITE' },
  { t: 'p', x: '<……… .>' },
  { t: 'h1', x: '6. AUTRES' },
  { t: 'p', x: '<Sans objet.>' },
  { t: 'p', x: '<Pour usage autologue uniquement.>' },
]

/**
 * Les trois documents servis par la Bibliothèque.
 * `slug` sert de nom de fichier (`rcp-bj.pdf`) ; `upgradable` reprend `UPGRADABLE` du référentiel.
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
    blocks: RCP,
    upgradable: true,
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
    blocks: NOTICE,
    upgradable: true,
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
    blocks: ETIQUETAGE,
    upgradable: true,
  },
]

/** Vrai si le document porte la mention de vigilance — donc s'il varie d'un pays à l'autre. */
export const varieParPays = (doc) => doc.blocks.some((b) => b.t === 'vig')
