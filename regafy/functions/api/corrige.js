/* Corrigé du Test RA UEMOA — contenu de l'e-mail transactionnel.
   ⚠️ Duplique le contenu de /quiz.js (les Functions ne peuvent pas importer hors de functions/) :
   toute modification des questions doit être reportée dans LES DEUX fichiers. */

export const CORRIGE = [
  {
    domain: 'Institutions',
    text: "Combien d'États membres compte l'espace UEMOA ?",
    answer: '8',
    explain:
      "Huit : Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal et Togo — un marché pharmaceutique qui partage le franc CFA et un cadre d'harmonisation commun.",
    source: "Traité de l'UEMOA",
  },
  {
    domain: 'Institutions · Sénégal',
    text: "Au Sénégal, quelle autorité délivre aujourd'hui les autorisations de mise sur le marché (AMM) ?",
    answer: "L'ARP (Agence sénégalaise de Réglementation Pharmaceutique)",
    explain:
      "L'ARP a pris le relais de la Direction de la Pharmacie et du Médicament comme autorité nationale de réglementation pharmaceutique du Sénégal.",
    source: 'Cadre institutionnel ARP, Sénégal',
  },
  {
    domain: 'Harmonisation régionale',
    text: "Quel texte régional harmonise les procédures d'homologation des produits pharmaceutiques à usage humain dans les États membres de l'UEMOA ?",
    answer: 'Le règlement n° 06/2010/CM/UEMOA',
    explain:
      "Le règlement n° 06/2010/CM/UEMOA pose le socle commun des procédures d'homologation dans les huit États membres — le texte de référence de l'harmonisation régionale.",
    source: 'Règlement n° 06/2010/CM/UEMOA',
  },
  {
    domain: "Dossier d'AMM",
    text: "Sous quel format les dossiers de demande d'AMM sont-ils attendus dans l'espace UEMOA ?",
    answer: 'Format CTD (Common Technical Document)',
    explain:
      "Le CTD structure le dossier en 5 modules. L'eCTD n'est pas encore une exigence généralisée dans la région — le papier structuré au format CTD reste la norme.",
    source: "Lignes directrices d'homologation UEMOA",
  },
  {
    domain: "Barèmes · Côte d'Ivoire",
    text: "En Côte d'Ivoire, les redevances d'AMM sont perçues…",
    answer: 'Par forme galénique, par dosage et par présentation',
    explain:
      'Le décret n° 2015-602 les institue par forme galénique et présentation — et le barème est identique pour les princeps et les génériques. Un produit en 3 dosages × 2 présentations = 6 redevances.',
    source: 'Décret n° 2015-602 du 02/09/2015, art. 3 · modalités AIRP n° 01509 du 22/07/2024',
  },
  {
    domain: "Barèmes · Côte d'Ivoire",
    text: "Quel avantage tarifaire une industrie pharmaceutique implantée dans l'espace UEMOA a-t-elle sur la redevance d'AMM de l'AIRP (500 000 FCFA) ?",
    answer: 'Moitié prix : 250 000 FCFA',
    explain:
      "Les industries de l'espace UEMOA paient moitié prix : 250 000 FCFA au lieu de 500 000. Un vrai levier pour la production régionale — et un détail que beaucoup de dossiers budgétaires oublient.",
    source: "Modalités de demande d'AMM, AIRP n° 01509 du 22/07/2024",
  },
  {
    domain: "Échantillons · Côte d'Ivoire",
    text: "Combien d'échantillons du produit fini (modèle-vente) l'AIRP exige-t-elle au dépôt d'une demande d'AMM ?",
    answer: '30',
    explain:
      "Trente échantillons modèle-vente définitif présentés en français — ou une maquette accompagnée d'une lettre d'engagement à fournir les échantillons. Le vrac n'est pas accepté.",
    source: 'Modalités AIRP n° 01509 du 22/07/2024',
  },
  {
    domain: 'Barèmes · Sénégal',
    text: "Au Sénégal, le décret n° 2025-1833 fixe l'autorisation d'importation d'échantillons à…",
    answer: '100 000 FCFA par produit, par forme et par dosage, validité 6 mois',
    explain:
      "100 000 FCFA par produit, par forme et par dosage, valable 6 mois — l'un des apports du tout nouveau barème des redevances de l'ARP.",
    source: 'Décret n° 2025-1833 du 18/11/2025 (Sénégal)',
  },
  {
    domain: 'Cycle de vie',
    text: "Quelle est la durée de validité classique d'une AMM dans les pays de l'espace UEMOA ?",
    answer: '5 ans, renouvelable',
    explain:
      "Cinq ans renouvelables — et le renouvellement se prépare des mois à l'avance : redevances, échantillons selon les pays, dossier à jour. C'est l'échéance la plus souvent ratée par les titulaires.",
    source: 'Règlement n° 06/2010/CM/UEMOA et pratiques nationales',
  },
  {
    domain: "Actualité · Côte d'Ivoire",
    text: "Depuis mars 2026, comment l'AIRP reçoit-elle les dépôts de demandes d'AMM ?",
    answer: "Sur sessions d'enregistrement programmées, sur rendez-vous",
    explain:
      "La note circulaire n° 0914/AIRP du 24 mars 2026 instaure des sessions programmées (appel à manifestation d'intérêt, plan annuel de réception) avec réception sur rendez-vous, 8 h 30 – 15 h 30.",
    source: 'Note circulaire n° 0914/AIRP du 24/03/2026',
  },
];
