/* Corrigé du Test RA UEMOA — contenu de l'e-mail transactionnel, bilingue.
   ⚠️ Duplique le contenu de /public/quiz.js (les Functions ne peuvent pas importer hors de functions/) :
   toute modification des questions doit être reportée dans LES DEUX fichiers. */

export const CORRIGE = {
  fr: [
    {
      domain: 'Institutions',
      text: "Combien d'États membres compte l'espace UEMOA ?",
      answer: '8',
      explain:
        "Huit : Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal et Togo — un marché pharmaceutique qui partage le franc CFA et un cadre d'harmonisation commun.",
      source: "Traité de l'UEMOA",
    },
    {
      domain: 'Langue de soumission',
      text: "Dans une soumission aux autorités de l'espace UEMOA, quels documents doivent impérativement être en français ?",
      answer: 'La correspondance officielle, le RCP, la notice patient et les emballages primaires & secondaires',
      explain:
        "Le français s'impose partout où l'autorité et le patient lisent. Les parties techniques du dossier (modules qualité du CTD) sont plus souvent tolérées en anglais.",
      source: "Pratiques des autorités de l'espace UEMOA",
    },
    {
      domain: 'Harmonisation régionale',
      text: "Quel texte régional harmonise les procédures d'homologation des produits pharmaceutiques à usage humain dans les États membres de l'UEMOA ?",
      answer: 'Le règlement n° 06/2010/CM/UEMOA',
      explain:
        "Le règlement n° 06/2010/CM/UEMOA pose le socle commun des procédures d'homologation dans les huit États membres.",
      source: 'Règlement n° 06/2010/CM/UEMOA',
    },
    {
      domain: "Dossier d'AMM",
      text: "Sous quel format les dossiers de demande d'AMM sont-ils attendus dans l'espace UEMOA ?",
      answer: 'Format CTD (Common Technical Document)',
      explain:
        "Le CTD structure le dossier en 5 modules. L'eCTD n'est pas encore une exigence généralisée dans la région.",
      source: "Lignes directrices d'homologation UEMOA",
    },
    {
      domain: 'Échantillons',
      text: 'Quelle durée de vie restante est exigée pour les échantillons soumis avec le dossier ?',
      answer: 'Au moins 18 mois, ou les 2/3 de la durée de conservation',
      explain:
        'À la soumission, les échantillons doivent conserver au moins 18 mois de validité — ou les deux tiers de leur durée de conservation totale.',
      source: "Pratiques des autorités de l'espace UEMOA",
    },
    {
      domain: 'Fondamentaux',
      text: "Comment s'appelle le document qui autorise officiellement un laboratoire à vendre son médicament dans un pays de l'UEMOA ?",
      answer: "L'AMM — Autorisation de Mise sur le Marché",
      explain:
        "Sans AMM, pas de commercialisation légale. Le certificat GMP et le CPP sont des pièces du dossier — pas l'autorisation elle-même.",
      source: 'Règlement n° 06/2010/CM/UEMOA',
    },
    {
      domain: 'Cycle de vie',
      text: "Le renouvellement d'une AMM se prépare à partir de combien de temps avant son expiration ?",
      answer: 'Au moins 6 mois',
      explain:
        "Redevances, documents à jour, échantillons selon les pays… C'est l'échéance la plus souvent ratée par les titulaires.",
      source: "Pratiques des autorités de l'espace UEMOA",
    },
    {
      domain: 'Variations',
      text: "Le changement du nom commercial d'un produit relève de quel type de variation ?",
      answer: 'Variation mineure',
      explain:
        "Une variation mineure — mais une variation quand même : elle se déclare et se documente auprès de l'autorité.",
      source: 'Lignes directrices variations, espace UEMOA',
    },
    {
      domain: "Dossier d'AMM",
      text: "Quelles pièces administratives sont le plus fréquemment demandées aux laboratoires lors d'une demande d'AMM ?",
      answer: 'Certificat GMP, CPP, certificat de libre vente (FSC) et licence de fabrication',
      explain:
        'Le quatuor classique : GMP (bonnes pratiques de fabrication), CPP (modèle OMS), certificat de libre vente et licence de fabrication.',
      source: "Pratiques des autorités de l'espace UEMOA",
    },
    {
      domain: 'Harmonisation continentale',
      text: "Une AMM obtenue en Côte d'Ivoire permet-elle de vendre légalement au Bénin et au Sénégal sans autorisation supplémentaire ?",
      answer: "Non — chaque État délivre sa propre AMM ; mais l'AMA et l'harmonisation régionale y travaillent",
      explain:
        "Chaque autorité nationale délivre sa propre AMM. L'harmonisation avance : règlement UEMOA, OOAS et l'Agence africaine du médicament (AMA) préparent la reconnaissance mutuelle de demain.",
      source: 'Traité AMA · règlement n° 06/2010/CM/UEMOA',
    },
  ],
  en: [
    {
      domain: 'Institutions',
      text: 'How many member states make up the WAEMU (UEMOA) area?',
      answer: '8',
      explain:
        "Eight: Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal and Togo — a pharmaceutical market sharing the CFA franc and a common harmonisation framework.",
      source: 'WAEMU Treaty',
    },
    {
      domain: 'Submission language',
      text: 'In a submission to a WAEMU-area authority, which documents must be in French?',
      answer: 'Official correspondence, the SmPC, the patient leaflet, and primary & secondary packaging',
      explain:
        'French is required wherever the authority and the patient read. The technical parts of the dossier (CTD quality modules) are more often accepted in English.',
      source: 'Practice of WAEMU-area authorities',
    },
    {
      domain: 'Regional harmonisation',
      text: 'Which regional text harmonises the marketing-authorisation procedures for human medicines across WAEMU member states?',
      answer: 'Regulation No. 06/2010/CM/UEMOA',
      explain:
        'Regulation No. 06/2010/CM/UEMOA lays the common foundation for authorisation procedures across the eight member states.',
      source: 'Regulation No. 06/2010/CM/UEMOA',
    },
    {
      domain: 'MA dossier',
      text: 'In which format are marketing-authorisation dossiers expected in the WAEMU area?',
      answer: 'CTD format (Common Technical Document)',
      explain:
        'The CTD structures the dossier into 5 modules. eCTD is not yet a general requirement in the region.',
      source: 'WAEMU authorisation guidelines',
    },
    {
      domain: 'Samples',
      text: 'What remaining shelf life is required for samples submitted with the dossier?',
      answer: 'At least 18 months, or two-thirds of the shelf life',
      explain:
        'At submission, samples must retain at least 18 months of validity — or two-thirds of their total shelf life.',
      source: 'Practice of WAEMU-area authorities',
    },
    {
      domain: 'Fundamentals',
      text: 'What is the document that officially authorises a company to market its medicine in a WAEMU country?',
      answer: 'The Marketing Authorisation (MA / AMM)',
      explain:
        'Without an MA, no legal marketing. The GMP certificate and the CPP are supporting documents — not the authorisation itself.',
      source: 'Regulation No. 06/2010/CM/UEMOA',
    },
    {
      domain: 'Lifecycle',
      text: 'How long before its expiry should the renewal of a Marketing Authorisation be prepared?',
      answer: 'At least 6 months',
      explain:
        'Fees, updated documents, samples depending on the country… It is the deadline most often missed by MA holders.',
      source: 'Practice of WAEMU-area authorities',
    },
    {
      domain: 'Variations',
      text: 'A change of a product’s trade name falls under which type of variation?',
      answer: 'Minor variation',
      explain:
        'A minor variation — but a variation nonetheless: it must be declared and documented with the authority.',
      source: 'Variation guidelines, WAEMU area',
    },
    {
      domain: 'MA dossier',
      text: 'Which administrative documents are most frequently requested from pharmaceutical companies in an MA application?',
      answer: 'GMP certificate, CPP, Free Sale Certificate (FSC) and Manufacturing Licence',
      explain:
        'The classic quartet: GMP (good manufacturing practice), CPP (WHO scheme), Free Sale Certificate and Manufacturing Licence.',
      source: 'Practice of WAEMU-area authorities',
    },
    {
      domain: 'Continental harmonisation',
      text: 'Does an MA obtained in Côte d’Ivoire allow you to sell legally in Benin and Senegal without further authorisation?',
      answer: 'No — each state issues its own MA; but the AMA and regional harmonisation are working on it',
      explain:
        'Each national authority issues its own MA. Harmonisation is moving: the WAEMU regulation, WAHO and the African Medicines Agency (AMA) are paving the way for mutual recognition.',
      source: 'AMA Treaty · Regulation No. 06/2010/CM/UEMOA',
    },
  ],
};
