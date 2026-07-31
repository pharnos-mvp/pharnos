/**
 * Checking Standard — SQUELETTES DES MODÈLES OFFICIELS.
 *
 * Extraits des documents sources réels (RA-source/Template/ et modèles OMS). Objectif : que le
 * MAH VOIE le modèle avant de répondre « oui, mon RCP est conforme ». C'est la mécanique qui
 * transforme une auto-déclaration optimiste en constat — et qui rend la page enseignante.
 *
 * Ce ne sont PAS les documents officiels eux-mêmes : ce sont leurs ossatures (titres de
 * rubriques et règles opposables), affichées pendant le questionnaire pour que le déclarant
 * puisse se comparer sans quitter la page.
 *
 * Le MODÈLE COMPLET, lui, se télécharge — gratuitement, dans la version du pays de dépôt — sur
 * `/bibliotheque-reglementaire` (`landing/checking/modeles-manifest.js`). Le modèle officiel est
 * public et libre de droit : arbitrage CEO du 30/07/2026, qui annule la doctrine précédente
 * (« on ne redistribue pas un document officiel sous notre marque ») et le renvoi « à obtenir
 * auprès de l'autorité ».
 *
 * `__GRP__` en tête d'un intitulé = séparateur de bloc dans le rendu (pas une rubrique).
 *
 * @typedef {[string, string]} Bi
 * @typedef {[Bi|string, Bi|string] | [Bi|string, Bi|string, Bi]} Sec
 */

/** Préfixe marquant un séparateur de groupe plutôt qu'une rubrique numérotée. */
export const GROUP_PREFIX = '__GRP__'

export const MODELES = {
  /**
   * L'arborescence Module 1 attendue au dépôt — Annexe I du Règlement n° 04/2020/CM/UEMOA.
   * Ce n'est pas un « modèle de document » mais la STRUCTURE que le PDF combiné doit suivre :
   * c'est ce que le déclarant doit voir avant de dire comment son Module 1 se présente.
   * Source unique côté application : `web/src/features/workspace/module1-tree.ts`.
   */
  ctd: {
    nom: ['Arborescence du Module 1 (CTD papier)', 'Module 1 tree (paper CTD)'],
    short: ['mon Module 1', 'my Module 1'],
    src: ['Annexe I, Règlement n° 04/2020/CM/UEMOA', 'Annex I, Regulation No. 04/2020/CM/WAEMU'],
    doct: ['MODULE 1 — INFORMATIONS ADMINISTRATIVES ET INFORMATIONS SUR LE PRODUIT', 'MODULE 1 — ADMINISTRATIVE AND PRODUCT INFORMATION'],
    perCountry: false,
    secs: [
      ['1.0  Table des matières (TdM)', '1.0  Table of contents'],
      [
        '1.1  Correspondance',
        '1.1  Correspondence',
        [
          "1.1.1 Lettre de demande · 1.1.2 Lettre de PGHT · 1.1.3 Informations sollicitées par l'Autorité · 1.1.4 Rencontres demandeur / autorité · 1.1.5 Demande de documents d'appel · 1.1.6 Note générale à l'évaluateur",
          '1.1.1 Application letter · 1.1.2 Ex-factory price letter · 1.1.3 Information requested by the authority · 1.1.4 Applicant / authority meetings · 1.1.5 Appeal document request · 1.1.6 General note to the assessor',
        ],
      ],
      [
        '1.2  Informations administratives',
        '1.2  Administrative information',
        [
          "1.2.1 Formulaires de demande · 1.2.2 Formulaire de paiement des frais d'homologation · 1.2.3 Certification et attestation (COPP, AMM du pays d'origine, certificats d'analyse) · 1.2.4 Conformité et site (BPF, licence de fabrication, certificat de vente libre) · 1.2.5 Partage d'informations (lettre d'accès au DMF) · 1.2.6 Statut réglementaire régional et international · 1.2.7 Informations post-autorisation · 1.2.8 Autres informations administratives (dispenses de bioéquivalence, contrat de licence ou de fabrication)",
          '1.2.1 Application forms · 1.2.2 Registration fee payment form · 1.2.3 Certification and attestation (COPP, MA from country of origin, certificates of analysis) · 1.2.4 Compliance and site (GMP, manufacturing licence, free sale certificate) · 1.2.5 Information sharing (DMF access letter) · 1.2.6 Regional and international regulatory status · 1.2.7 Post-authorisation information · 1.2.8 Other administrative information (bioequivalence waivers, licence or manufacturing agreement)',
        ],
      ],
      [
        '1.3  Informations sur le produit',
        '1.3  Product information',
        [
          "1.3.1 Résumé des caractéristiques du produit (RCP) · 1.3.2 Notice à l'intention du patient · 1.3.3 Étiquettes des conditionnements (primaire et emballage extérieur) · 1.3.4 Étiquetage étranger · 1.3.5 Étiquetage des produits de référence",
          '1.3.1 Summary of product characteristics (SmPC) · 1.3.2 Patient information leaflet · 1.3.3 Packaging labels (immediate and outer) · 1.3.4 Foreign labelling · 1.3.5 Reference product labelling',
        ],
      ],
      [
        '1.4  Résumés régionaux',
        '1.4  Regional summaries',
        ["1.4.1 Informations sur l'étude de bioéquivalence (BTIF)", '1.4.1 Bioequivalence trial information (BTIF)'],
      ],
    ],
    rules: [
      [
        "Un PDF unique, combiné, avec table des matières et signets reprenant cette numérotation — c'est le format attendu à la réception.",
        'A single combined PDF, with a table of contents and bookmarks following this numbering — that is the format expected at reception.',
      ],
      [
        "La numérotation ne s'invente pas : une organisation propre au laboratoire, même soignée, est relevée comme non conforme au format CTD.",
        'The numbering is not open to interpretation: an in-house organisation, however tidy, is flagged as non-compliant with the CTD format.',
      ],
      [
        "Une section sans objet reste dans l'arborescence, avec la mention « sans objet » — elle ne se supprime pas.",
        'A section that does not apply stays in the tree, marked “not applicable” — it is not deleted.',
      ],
      [
        "La rubrique 1.2.8 accueille l'administratif sans emplacement prévu ; elle ne doit contenir aucune information scientifique.",
        'Section 1.2.8 holds administrative items with no dedicated slot; it must contain no scientific information.',
      ],
    ],
  },

  rcp: {
    nom: ['Résumé des Caractéristiques du Produit (RCP)', 'Summary of Product Characteristics (SmPC)'],
    short: ['mon RCP', 'my SmPC'],
    src: ['Modèle ABMed — Bénin, 2026', 'ABMed template — Benin, 2026'],
    doct: ['RESUME DES CARACTERISTIQUES DU PRODUIT', 'SUMMARY OF PRODUCT CHARACTERISTICS'],
    perCountry: true,
    secs: [
      ['1. DENOMINATION DU MEDICAMENT', '1. NAME OF THE MEDICINAL PRODUCT'],
      [
        '2. COMPOSITION QUALITATIVE ET QUANTITATIVE',
        '2. QUALITATIVE AND QUANTITATIVE COMPOSITION',
        ['Excipient(s) à effet notoire · renvoi à la rubrique 6.1', 'Excipients with known effect · cross-reference to section 6.1'],
      ],
      ['3. FORME PHARMACEUTIQUE', '3. PHARMACEUTICAL FORM'],
      [
        '4. DONNEES CLINIQUES',
        '4. CLINICAL PARTICULARS',
        [
          "4.1 Indications · 4.2 Posologie et mode d'administration · 4.3 Contre-indications · 4.4 Mises en garde · 4.5 Interactions · 4.6 Fertilité, grossesse, allaitement · 4.7 Aptitude à conduire · 4.8 Effets indésirables · 4.9 Surdosage",
          '4.1 Indications · 4.2 Posology · 4.3 Contraindications · 4.4 Warnings · 4.5 Interactions · 4.6 Fertility, pregnancy, lactation · 4.7 Driving · 4.8 Undesirable effects · 4.9 Overdose',
        ],
      ],
      [
        '5. PROPRIETES PHARMACOLOGIQUES',
        '5. PHARMACOLOGICAL PROPERTIES',
        [
          '5.1 Pharmacodynamie (classe + code ATC) · 5.2 Pharmacocinétique · 5.3 Sécurité préclinique',
          '5.1 Pharmacodynamics (class + ATC code) · 5.2 Pharmacokinetics · 5.3 Preclinical safety',
        ],
      ],
      [
        '6. DONNEES PHARMACEUTIQUES',
        '6. PHARMACEUTICAL PARTICULARS',
        [
          "6.1 Excipients · 6.2 Incompatibilités · 6.3 Durée de conservation · 6.4 Précautions de conservation · 6.5 Nature et contenu de l'emballage · 6.6 Élimination et manipulation",
          '6.1 Excipients · 6.2 Incompatibilities · 6.3 Shelf life · 6.4 Storage · 6.5 Container · 6.6 Disposal and handling',
        ],
      ],
      ["7. TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE", '7. MARKETING AUTHORISATION HOLDER'],
      ["8. NUMERO(S) D'AUTORISATION DE MISE SUR LE MARCHE", '8. MARKETING AUTHORISATION NUMBER(S)'],
      ['9. DATE DE PREMIERE AUTORISATION / DE RENOUVELLEMENT', '9. DATE OF FIRST AUTHORISATION / RENEWAL'],
      ['10. DATE DE MISE A JOUR DU TEXTE', '10. DATE OF REVISION OF THE TEXT'],
      [
        'CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE',
        'CONDITIONS OF PRESCRIPTION AND SUPPLY',
        ['Non soumis à prescription · Liste I · Liste II · Stupéfiant', 'Not subject to prescription · List I · List II · Narcotic'],
      ],
    ],
    rules: [
      [
        "La rubrique 4.8 doit renvoyer au système national de déclaration — au Bénin : vigilances.abmed@gouv.bj.",
        'Section 4.8 must refer to the national reporting system — in Benin: vigilances.abmed@gouv.bj.',
      ],
      [
        "Les libellés entre chevrons < > sont des options : on garde ceux qui s'appliquent, on supprime les autres.",
        'Text in angle brackets < > is optional: keep what applies, delete the rest.',
      ],
      [
        "Numérotation et intitulés des 10 rubriques non modifiables — un RCP « maison » est la cause n° 1 de non-conformité relevée.",
        'The numbering and headings of the 10 sections cannot be changed — an in-house SmPC is the number-one non-conformity observed.',
      ],
      [
        'Fourni en Word ET PDF, en français (ou anglais accompagné du français).',
        'Supplied in Word AND PDF, in French (or English together with French).',
      ],
    ],
  },

  notice: {
    nom: ['Notice patient', 'Patient information leaflet'],
    short: ['ma notice', 'my leaflet'],
    src: ['Maquette Notice ABMed — Bénin, 2026', 'ABMed leaflet template — Benin, 2026'],
    doct: ["NOTICE : INFORMATION DE L'UTILISATEUR", 'PACKAGE LEAFLET: INFORMATION FOR THE USER'],
    perCountry: true,
    secs: [
      ['Dénomination du médicament + substance(s) active(s)', 'Name of the medicinal product + active substance(s)'],
      [
        "Encadré d'avertissement",
        'Warning box',
        [
          "« Veuillez lire attentivement cette notice… » — gardez la notice, interrogez votre médecin ou pharmacien, ne la donnez pas à d'autres, déclarez tout effet indésirable (voir rubrique 4).",
          '“Read all of this leaflet carefully…” — keep the leaflet, ask your doctor or pharmacist, do not pass it on, report any side effect (see section 4).',
        ],
      ],
      [
        "1. QU'EST-CE QUE X ET DANS QUELS CAS EST-IL UTILISE ?",
        '1. WHAT X IS AND WHAT IT IS USED FOR',
        ['Classe pharmacothérapeutique et code ATC', 'Pharmacotherapeutic class and ATC code'],
      ],
      [
        "2. QUELLES SONT LES INFORMATIONS A CONNAITRE AVANT D'UTILISER X ?",
        '2. WHAT YOU NEED TO KNOW BEFORE YOU USE X',
        [
          "Ne prenez jamais · Avertissements et précautions · Enfants et adolescents · Autres médicaments · Aliments et boissons · Grossesse, allaitement, fertilité · Conduite de véhicules · Excipients à effet notoire",
          'Do not take · Warnings and precautions · Children and adolescents · Other medicines · Food and drink · Pregnancy, lactation, fertility · Driving · Excipients with known effect',
        ],
      ],
      [
        '3. COMMENT UTILISER X ?',
        '3. HOW TO USE X',
        [
          "Posologie · Mode d'administration · Durée du traitement · Si vous avez pris plus · Si vous oubliez · Si vous arrêtez",
          'Posology · Method of administration · Duration · If you take more · If you forget · If you stop',
        ],
      ],
      [
        '4. QUELS SONT LES EFFETS INDESIRABLES EVENTUELS ?',
        '4. POSSIBLE SIDE EFFECTS',
        ["Effets chez l'enfant · Déclaration des effets secondaires", 'Effects in children · Reporting of side effects'],
      ],
      [
        '5. COMMENT CONSERVER X ?',
        '5. HOW TO STORE X',
        [
          'Hors de vue et de portée des enfants · température · date de péremption · élimination',
          'Out of sight and reach of children · temperature · expiry date · disposal',
        ],
      ],
      [
        "6. CONTENU DE L'EMBALLAGE ET AUTRES INFORMATIONS",
        '6. CONTENTS OF THE PACK AND OTHER INFORMATION',
        [
          'Substances actives · excipients · présentation · Titulaire · Exploitant · Fabricant · date de révision',
          'Active substances · excipients · pack · MA holder · Distributor · Manufacturer · revision date',
        ],
      ],
    ],
    rules: [
      [
        "Rédigée pour le patient : phrases courtes, pas de jargon — c'est un critère d'évaluation, pas une préférence de style.",
        'Written for the patient: short sentences, no jargon — this is an assessment criterion, not a style preference.',
      ],
      [
        'La notice doit être strictement cohérente avec le RCP : toute divergence est relevée en instruction.',
        'The leaflet must be strictly consistent with the SmPC: any divergence is flagged during assessment.',
      ],
      ["Les 6 rubriques, dans cet ordre, avec l'encadré d'avertissement en tête.", 'The 6 sections, in this order, with the warning box at the top.'],
      [
        'Fournie en Word ET PDF, en français (ou anglais accompagné du français).',
        'Supplied in Word AND PDF, in French (or English together with French).',
      ],
    ],
  },

  etiq: {
    nom: ['Étiquetage et maquettes de conditionnement', 'Labelling and packaging mock-ups'],
    short: ['mon étiquetage', 'my labelling'],
    src: ['Template étiquetage ABMed — Bénin, 2026', 'ABMed labelling template — Benin, 2026'],
    doct: [
      "MENTIONS DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR ET SUR LE CONDITIONNEMENT PRIMAIRE",
      'PARTICULARS TO APPEAR ON THE OUTER PACKAGING AND THE IMMEDIATE PACKAGING',
    ],
    perCountry: true,
    secs: [
      ['1. DENOMINATION DU MEDICAMENT', '1. NAME OF THE MEDICINAL PRODUCT'],
      ['2. COMPOSITION EN SUBSTANCES ACTIVES', '2. STATEMENT OF ACTIVE SUBSTANCES'],
      ['3. LISTE DES EXCIPIENTS', '3. LIST OF EXCIPIENTS'],
      ['4. FORME PHARMACEUTIQUE ET CONTENU', '4. PHARMACEUTICAL FORM AND CONTENTS'],
      [
        "5. MODE ET VOIE(S) D'ADMINISTRATION",
        '5. METHOD AND ROUTE(S) OF ADMINISTRATION',
        ['« Lire la notice avant utilisation. »', '“Read the package leaflet before use.”'],
      ],
      ['6. MISE EN GARDE — TENIR HORS DE VUE ET DE PORTEE DES ENFANTS', '6. WARNING — KEEP OUT OF SIGHT AND REACH OF CHILDREN'],
      ['7. AUTRE(S) MISE(S) EN GARDE SPECIALE(S)', '7. OTHER SPECIAL WARNING(S)'],
      ['8. DATES DE FABRICATION ET DE PEREMPTION', '8. MANUFACTURING AND EXPIRY DATES', ['FAB {MM/AAAA} · EXP {MM/AAAA}', 'MFD {MM/YYYY} · EXP {MM/YYYY}']],
      ['9. PRECAUTIONS PARTICULIERES DE CONSERVATION', '9. SPECIAL STORAGE PRECAUTIONS'],
      ["10. PRECAUTIONS D'ELIMINATION", '10. SPECIAL PRECAUTIONS FOR DISPOSAL'],
      ["11. NOM ET ADRESSE DU TITULAIRE DE L'AMM", '11. NAME AND ADDRESS OF THE MA HOLDER', ['Titulaire ET exploitant', 'MA holder AND distributor']],
      ['12. NUMERO DU LOT', '12. BATCH NUMBER'],
      [
        '13. CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE',
        '13. CONDITIONS OF PRESCRIPTION AND SUPPLY',
        ["À copier à l'identique depuis le RCP", 'To be copied verbatim from the SmPC'],
      ],
      ["14. INDICATIONS D'UTILISATION", '14. INSTRUCTIONS ON USE'],
      ['15. INFORMATIONS EN BRAILLE', '15. INFORMATION IN BRAILLE'],
      ['16 – 17. IDENTIFIANT UNIQUE (code-barres 2D et données lisibles)', '16 – 17. UNIQUE IDENTIFIER (2D barcode and human-readable data)'],
      [GROUP_PREFIX + 'MENTIONS MINIMALES — PLAQUETTES ET FILMS THERMOSOUDES', GROUP_PREFIX + 'MINIMUM PARTICULARS — BLISTERS AND STRIPS'],
      [
        '1 à 5 : dénomination · titulaire · dates FAB/EXP · numéro de lot · autres',
        '1 to 5: name · MA holder · MFD/EXP dates · batch number · other',
      ],
      [GROUP_PREFIX + 'MENTIONS MINIMALES — PETITS CONDITIONNEMENTS PRIMAIRES', GROUP_PREFIX + 'MINIMUM PARTICULARS — SMALL IMMEDIATE PACKAGING'],
      [
        "1 à 6 : dénomination et voie · mode d'administration · dates · lot · contenu · autres",
        '1 to 6: name and route · method of administration · dates · batch · contents · other',
      ],
    ],
    rules: [
      [
        'Trois jeux de mentions distincts : emballage extérieur (17), plaquettes (5), petits conditionnements (6). Oublier les deux derniers est une erreur classique.',
        'Three distinct sets of particulars: outer packaging (17), blisters (5), small packs (6). Forgetting the last two is a classic mistake.',
      ],
      [
        'La rubrique 13 doit reprendre mot pour mot les conditions de prescription du RCP.',
        'Section 13 must reproduce the SmPC prescription conditions verbatim.',
      ],
      [
        "Les maquettes sont fournies en couleur, à l'échelle, lisibles — l'autorité contrôle les mentions directement dessus.",
        'Mock-ups are supplied in colour, to scale and legible — the authority checks the particulars directly on them.',
      ],
    ],
  },

  btif: {
    nom: ['BTIF — Bioequivalence Trial Information Form', 'BTIF — Bioequivalence Trial Information Form'],
    src: ['Modèle OMS / WHO — 13 janvier 2023', 'WHO template — 13 January 2023'],
    doct: ['BIOEQUIVALENCE TRIAL INFORMATION', 'BIOEQUIVALENCE TRIAL INFORMATION'],
    perCountry: false,
    secs: [
      [
        '1. SUMMARY',
        '1. SUMMARY',
        [
          '1.1 Résumé des études de bioéquivalence · 1.2 Composition des formulations proposées et des lots de bioéquivalence (tableaux comparatifs par dosage)',
          '1.1 Summary of bioequivalence studies · 1.2 Composition of the proposed formulations and biobatches (comparative tables per strength)',
        ],
      ],
      [
        '2. CLINICAL STUDY REPORT',
        '2. CLINICAL STUDY REPORT',
        [
          "Numéro et titre d'étude, localisation du protocole, dates de chaque phase et d'administration du produit",
          'Study number and title, protocol location, dates of each phase and of product administration',
        ],
      ],
      [
        '2.1 ETHICS',
        '2.1 ETHICS',
        [
          "Comité d'éthique, date d'approbation, localisation de la lettre et du formulaire de consentement",
          'Ethics committee, approval date, location of the approval letter and consent form',
        ],
      ],
      [
        '2.2 INVESTIGATORS AND STUDY ADMINISTRATIVE STRUCTURE',
        '2.2 INVESTIGATORS AND STUDY ADMINISTRATIVE STRUCTURE',
        [
          "Investigateur principal (CV), site clinique, laboratoires cliniques et analytiques, société d'analyse PK/statistique",
          'Principal investigator (CV), clinical site, clinical and analytical laboratories, PK/statistics company',
        ],
      ],
      ['2.3 STUDY OBJECTIVES', '2.3 STUDY OBJECTIVES'],
      [
        '2.4 INVESTIGATIONAL PLAN',
        '2.4 INVESTIGATIONAL PLAN',
        [
          "Plan d'étude · critères d'inclusion et d'exclusion · vérification de l'état de santé · retrait des sujets · sujets remplaçants",
          'Study design · inclusion and exclusion criteria · health verification · withdrawal of subjects · alternates',
        ],
      ],
      [
        'Suite : produits étudiés, procédures, méthodes analytiques, pharmacocinétique et statistiques, annexes',
        'Continued: study products, procedures, analytical methods, pharmacokinetics and statistics, annexes',
      ],
    ],
    rules: [
      [
        "« Ni le format ni le contenu du document (textes et tableaux) ne doivent être modifiés » — instruction explicite de l'OMS en tête du formulaire.",
        '“Neither the format nor the content of the document (text and tables) should be changed” — the WHO’s explicit instruction at the top of the form.',
      ],
      ["Les zones grisées sont réservées à l'autorité : ne pas les remplir.", 'Greyed areas are reserved for the authority: do not fill them in.'],
      [
        "Chaque document annexé doit être localisé par son numéro d'annexe, et le fichier électronique porter exactement ce nom.",
        'Every appended document must be located by its annex number, and the electronic file must carry exactly that name.',
      ],
      [
        'Un original signé accompagne le dossier ; une version électronique est incluse dès la soumission initiale.',
        'A signed original accompanies the dossier; an electronic version is included from the initial submission.',
      ],
    ],
  },

  qos: {
    nom: ['QOS-PD — Quality Overall Summary (Module 2.3)', 'QOS-PD — Quality Overall Summary (Module 2.3)'],
    src: ['Modèle OMS / WHO — janvier 2025', 'WHO template — January 2025'],
    doct: ['MODULE 2.3 — QUALITY OVERALL SUMMARY: PRODUCT DOSSIER', 'MODULE 2.3 — QUALITY OVERALL SUMMARY: PRODUCT DOSSIER'],
    perCountry: false,
    secs: [
      [
        'INTRODUCTION — Résumé des informations produit',
        'INTRODUCTION — Summary of product information',
        [
          "DCI et noms commerciaux · substance(s) active(s) avec forme (sel, hydrate, polymorphe) · demandeur · forme galénique · dosages · voie d'administration · indications proposées",
          'INN and trade names · active substance(s) with form (salt, hydrate, polymorph) · applicant · dosage form · strengths · route of administration · proposed indications',
        ],
      ],
      [
        'Personnes de contact',
        'Contact persons',
        ['Contact principal et contacts additionnels, adresse postale complète, e-mail, téléphone', 'Primary and additional contacts, full postal address, e-mail, phone'],
      ],
      [
        'Dossiers liés et références bibliographiques',
        'Related dossiers and literature references',
        ['Numéro de référence, statut de préqualification, fabricant de la substance active', 'Reference number, prequalification status, API manufacturer'],
      ],
      [
        '2.3.S — SUBSTANCE ACTIVE',
        '2.3.S — DRUG SUBSTANCE',
        [
          'Nomenclature · structure · propriétés · fabricant · procédé · contrôle · normes · conditionnement · stabilité',
          'Nomenclature · structure · properties · manufacturer · process · control · standards · packaging · stability',
        ],
      ],
      [
        '2.3.P — PRODUIT FINI',
        '2.3.P — DRUG PRODUCT',
        [
          'Description et composition · développement pharmaceutique · fabrication · contrôle des excipients · contrôle du produit fini · normes de référence · système de fermeture · stabilité',
          'Description and composition · pharmaceutical development · manufacture · control of excipients · control of drug product · reference standards · container closure · stability',
        ],
      ],
      ['2.3.A / 2.3.R — Annexes et informations régionales', '2.3.A / 2.3.R — Appendices and regional information'],
    ],
    rules: [
      [
        'Le QOS-PD se remplit en suivant les sections 1.5, 3 et 4 de la ligne directrice OMS sur la partie qualité des multisources.',
        'The QOS-PD is completed following sections 1.5, 3 and 4 of the WHO guideline on the quality part for multisource products.',
      ],
      [
        "C'est un résumé, pas un renvoi : chaque rubrique doit contenir la donnée, pas un « voir Module 3 ».",
        'It is a summary, not a cross-reference: each section must contain the data, not a “see Module 3”.',
      ],
      [
        "Fourni en Word ET PDF — le format Word manquant est l'annotation la plus fréquente des examinateurs.",
        'Supplied in Word AND PDF — the missing Word format is the most frequent assessor annotation.',
      ],
    ],
  },
}
