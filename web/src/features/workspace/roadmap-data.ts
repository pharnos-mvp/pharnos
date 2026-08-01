import type { Translatable } from '@/lib/i18n-context'

export interface AgencyInfo {
  /** Sigle de l'agence. */
  name: string
  /** Nom complet. */
  full: string
  /** Directeur / Responsable (avec titre, ex. « Dr … » / « Pr … »). */
  directeur: string
  /** Sexe du directeur — pour la civilité (« Monsieur le Directeur » / « Madame la Directrice »). */
  sexe: 'M' | 'F'
  /** Adresse postale (sans téléphone/email) — destinataire des lettres. */
  adresse: string
  /**
   * L'agence NOMMÉE au fil d'une phrase, article compris : « informer au préalable **l'AIRP** »,
   * mais « informer au préalable **la DPM** ». L'élision est une donnée de l'agence, pas une règle
   * déductible du sigle — et elle vit ICI, avec le nom complet qui sert le bloc destinataire.
   * Deux référentiels donneraient une lettre qui nomme l'agence en tête et l'appelle « l'autorité
   * nationale » douze lignes plus bas : le défaut se lit à l'œil sur un courrier officiel.
   */
  elide: string
  /** Idem en anglais (« the DPM ») — la traduction de courtoisie a besoin de l'article. */
  elideEn: string
  /** Téléphone standard de l'agence — contact opérationnel, jamais dans le bloc destinataire. */
  telephone?: string
  /** E-mail de contact de l'agence — idem, hors courriers générés. */
  email?: string
}

/**
 * Agences / directions nationales du médicament — **UEMOA** (source : liste officielle du CEO,
 * `RA-source/Agence Reglementaire Nationale _UEMOA.pdf`). Renseigne le **destinataire** des lettres
 * (agence + directeur + adresse) selon le pays du dossier. Reste éditable in-place.
 */
const AGENCIES: Record<string, AgencyInfo> = {
  BJ: {
    name: 'ABMed',
    full: 'Agence Béninoise du Médicament et des autres produits de santé',
    directeur: 'Dr Yossounon Chabi',
    sexe: 'M',
    adresse: 'Cotonou, Zone résidentielle',
    elide: 'l’ABMed',
    elideEn: 'the ABMed',
  },
  BF: {
    name: 'ANRP',
    full: 'Agence Nationale de Régulation Pharmaceutique',
    directeur: 'Dr Aminata P. Nacoulma',
    sexe: 'F',
    adresse: 'Ouagadougou, 01 BP 7009',
    elide: 'l’ANRP',
    elideEn: 'the ANRP',
  },
  CI: {
    name: 'AIRP',
    full: 'Autorité Ivoirienne de Régulation Pharmaceutique',
    directeur: 'Dr Assane Coulibaly',
    sexe: 'M',
    adresse: 'Abidjan, Cocody',
    elide: 'l’AIRP',
    elideEn: 'the AIRP',
    // En-tête officiel AIRP (modalités n° 01509 / circulaire n° 0914).
    telephone: '+225 27 22 22 01 55 / 25 22 00 55 61',
    email: 'secretariat@airp.ci',
  },
  GW: {
    name: 'DIFALRM',
    full: 'Direção dos Serviços de Farmácia e Medicamentos',
    directeur: 'Dr. Edson Moniz',
    sexe: 'M',
    adresse: 'Bissau, Ministère de la Santé Publique',
    elide: 'la DIFALRM',
    elideEn: 'the DIFALRM',
  },
  ML: {
    name: 'DPM',
    full: 'Direction de la Pharmacie et du Médicament',
    directeur: 'Pr Fanta Sangho',
    sexe: 'F',
    adresse: 'Bamako, Darsalam, BPE 5202',
    elide: 'la DPM',
    elideEn: 'the DPM',
  },
  NE: {
    name: 'DPM/MT',
    full: 'Direction de la Pharmacie et de la Médecine Traditionnelle',
    directeur: 'Dr Abdou Bagoudou Rakia',
    sexe: 'F',
    adresse: 'Niamey, Ministère de la Santé',
    elide: 'la DPM/MT',
    elideEn: 'the DPM/MT',
  },
  SN: {
    name: 'ARP',
    full: 'Agence Sénégalaise de Réglementation Pharmaceutique',
    directeur: 'Dr Oumy Kalsoum Ndiaye Ndao',
    sexe: 'F',
    adresse: 'Dakar, Point E, Rue A x Rue 6',
    elide: 'l’ARP',
    elideEn: 'the ARP',
    telephone: '+221 33 868 11 27',
    email: 'contact@arp.sn',
  },
  TG: {
    name: 'DPML',
    full: 'Direction de la Pharmacie, du Médicament et des Laboratoires',
    directeur: 'Dr NYANSA A. T. Atany',
    sexe: 'M',
    adresse: 'Lomé, Avenue du 2 Février',
    elide: 'la DPML',
    elideEn: 'the DPML',
  },
  // CEDEAO hors UEMOA — directeur/adresse à compléter (destinataire en marqueurs éditables).
  NG: {
    name: 'NAFDAC',
    full: 'National Agency for Food and Drug Administration and Control',
    directeur: '',
    sexe: 'M',
    adresse: '',
    elide: 'la NAFDAC',
    elideEn: 'NAFDAC',
  },
  GH: {
    name: 'FDA',
    full: 'Food and Drugs Authority',
    directeur: 'Dr Delese Mimi Darko',
    sexe: 'F',
    adresse: 'Accra',
    elide: 'la FDA',
    elideEn: 'the FDA',
  },
}

/**
 * Langue officielle du pays cible (détection de langue des documents). UEMOA = français par
 * défaut ; exceptions lusophones (Guinée-Bissau, Cap-Vert) et anglophones (CEDEAO non-UEMOA).
 */
const OFFICIAL_LANG: Record<string, string> = {
  GW: 'pt',
  CV: 'pt',
  GH: 'en',
  NG: 'en',
  GM: 'en',
  SL: 'en',
  LR: 'en',
}
export function officialLanguage(country: string): string {
  return OFFICIAL_LANG[country] ?? 'fr'
}

/**
 * Barème & exigences **nationales** réparties par **activité réglementaire** (redevances, échantillons,
 * délais) — alimentent la Roadmap du dossier. Source CEO. **Bénin (ABMed)**, **Côte d'Ivoire
 * (AIRP)** et **Sénégal (ARP)** renseignés ; les autres pays retombent sur un texte générique
 * tant que leurs barèmes officiels ne sont pas fournis.
 */
export interface RegulatoryProfile {
  /** Devise des redevances (ex. « FCFA »). */
  currency: string
  /** Redevances par activité (montant dans `currency`). Variation scindée mineure/majeure. */
  fees: {
    new_ma?: number
    renewal?: number
    variation_minor?: number
    variation_major?: number
    /**
     * Cas particuliers du barème national (princeps/accélérée, industrie locale, pénalités…),
     * affichés sous le montant de l'activité — le montant nu reste le cas DOMINANT du marché.
     */
    notes?: Partial<Record<'new_ma' | 'renewal' | 'variation', Translatable>>
  }
  /**
   * Modalités de dépôt nationales (sessions programmées, rendez-vous…) — affichées sous le mode
   * de soumission (Roadmap) et dans les exigences nationales (fiche Autorité).
   */
  submissionNote?: Translatable
  /** Exigences d'échantillons (lignes bilingues), réparties par activité. */
  samples: {
    /** Nouvelle AMM. */
    new_ma?: Translatable[]
    /** Renouvellement & variation nécessitant des échantillons. */
    renewal_variation?: Translatable[]
    /** Réserve applicable à tous les cas. */
    reserve?: Translatable
  }
  /** Délai de traitement indicatif (jours). */
  processingDays?: number
}

const REG_PROFILES: Record<string, RegulatoryProfile> = {
  BJ: {
    currency: 'FCFA',
    fees: { new_ma: 500000, renewal: 250000, variation_minor: 50000, variation_major: 100000 },
    samples: {
      new_ma: [
        {
          fr: 'Cinq (05) échantillons modèle vente pour toutes les formes galéniques des conditionnements officinaux',
          en: 'Five (05) sales-model samples for all galenic forms of retail (officinal) packaging',
        },
        {
          fr: 'Trois (03) échantillons modèle vente pour toutes les formes galéniques des conditionnements hospitaliers',
          en: 'Three (03) sales-model samples for all galenic forms of hospital packaging',
        },
      ],
      renewal_variation: [
        {
          fr: 'Trois (03) échantillons modèle lors du renouvellement des autorisations et des variations nécessitant des échantillons',
          en: 'Three (03) model samples for the renewal of authorisations and for variations requiring samples',
        },
      ],
      reserve: {
        fr: 'L’ABMed se réserve, selon le cas, le droit de demander des échantillons complémentaires.',
        en: 'ABMed reserves the right, as the case may be, to request additional samples.',
      },
    },
    processingDays: 120,
  },
  /**
   * Côte d'Ivoire (AIRP) — décret n° 2015-602 du 02 septembre 2015 portant institution des
   * redevances pour l'AMM des médicaments (art. 3 : perçues PAR forme galénique ET présentation ;
   * art. 4 : barème + industries de l'espace UEMOA à moitié prix), précisé par les « Modalités de
   * demande d'AMM » AIRP n° 01509 du 22 juillet 2024 (génériques et spécialités : mêmes montants,
   * mêmes échantillons — 30 modèles-vente, CoA ≥ 2/3 de la durée de vie) et la note circulaire
   * n° 0914/AIRP du 24 mars 2026 (dépôt sur sessions programmées, sur rendez-vous).
   *
   * Renouvellement et variations : modalités AIRP n° 01416 du 9 juillet 2024 (renouvellement),
   * n° 01421 et n° 01420 du 10 juillet 2024 (variations majeures / mineures) — répartition des
   * chèques, échantillons par activité, gratuité de la demande de BAISSE du PGHT. Le circuit de
   * rendez-vous (adresse e-mail par activité + espace agence airp.ci) vient des formulaires de
   * dépôt officiels de l'AIRP.
   * Sources locales : `RA-source/RAG_Ivory cost/` et `RA-source/AIRP/`. Délai de traitement non
   * fixé par ces textes.
   */
  CI: {
    currency: 'FCFA',
    fees: {
      new_ma: 500000,
      renewal: 250000,
      variation_minor: 50000,
      variation_major: 500000,
      notes: {
        new_ma: {
          fr: 'Par forme galénique, par dosage et par présentation — barème identique princeps/génériques. Industries de l’espace UEMOA : moitié prix (250 000 FCFA). Règlement en deux chèques barrés (100 000 F Receveur Général des Finances + 400 000 F AIRP), originaux + 4 copies.',
          en: 'Per pharmaceutical form, strength and presentation — same schedule for innovators and generics. UEMOA-based industries: half price (250,000 FCFA). Paid by two crossed cheques (100,000 F Receiver General of Finance + 400,000 F AIRP), originals + 4 copies.',
        },
        renewal: {
          fr: 'Par forme, dosage et présentation — industries de l’espace UEMOA : moitié prix (125 000 FCFA). Règlement en deux chèques barrés (100 000 F Receveur Général des Finances + 150 000 F AIRP ; moitié prix : 50 000 F + 75 000 F), originaux + 4 copies.',
          en: 'Per form, strength and presentation — UEMOA-based industries: half price (125,000 FCFA). Paid by two crossed cheques (100,000 F Receiver General of Finance + 150,000 F AIRP; half price: 50,000 F + 75,000 F), originals + 4 copies.',
        },
        variation: {
          fr: 'Majeure = modification affectant la qualité, l’efficacité, la sécurité, l’innocuité ou les propriétés du médicament ; mineure = sans cet effet. Industries de l’espace UEMOA : moitié prix. Règlement en deux chèques barrés — majeure : 100 000 F Receveur Général des Finances + 400 000 F AIRP ; mineure : 20 000 F + 30 000 F. La demande de BAISSE du Prix Grossiste Hors Taxe est gratuite.',
          en: 'Major = change affecting the quality, efficacy, safety, harmlessness or properties of the medicine; minor = no such effect. UEMOA-based industries: half price. Paid by two crossed cheques — major: 100,000 F Receiver General of Finance + 400,000 F AIRP; minor: 20,000 F + 30,000 F. An application to LOWER the ex-factory wholesale price is free of charge.',
        },
      },
    },
    submissionNote: {
      fr: 'Sessions d’enregistrement programmées (appel à manifestation d’intérêt, plan annuel de réception) — réception sur rendez-vous, 8 h 30–15 h 30 (note circulaire n° 0914/AIRP du 24 mars 2026). Le rendez-vous s’obtient en transmettant le formulaire de demande de l’AIRP à l’adresse dédiée à l’activité (renouvellement_produit_sante@airp.ci, variation_produit_sante@airp.ci) ; les informations du dossier se saisissent ensuite sur l’espace agence de www.airp.ci, d’où s’impriment la fiche de rendez-vous et le formulaire de demande à joindre au dossier.',
      en: 'Scheduled registration sessions (call for expressions of interest, annual reception plan) — reception by appointment, 8:30 am–3:30 pm (AIRP circular No. 0914 of 24 March 2026). The appointment is obtained by sending the AIRP application form to the address dedicated to the activity (renouvellement_produit_sante@airp.ci, variation_produit_sante@airp.ci); dossier details are then entered in the agency workspace on www.airp.ci, from which the appointment slip and the application form to be enclosed with the dossier are printed.',
    },
    samples: {
      new_ma: [
        {
          fr: 'Trente (30) échantillons du produit fini (modèle vente définitif) présentés en français — ou maquette avec lettre d’engagement à fournir les échantillons.',
          en: 'Thirty (30) samples of the finished product (final sales model) presented in French — or a mock-up with a letter of undertaking to supply the samples.',
        },
        {
          fr: 'Échantillons accompagnés des certificats d’analyse des lots soumis, validité d’au moins 2/3 de la durée de vie du produit.',
          en: 'Samples accompanied by the certificates of analysis of the submitted batches, with at least 2/3 of the product shelf life remaining.',
        },
        {
          fr: 'Vrac non accepté. Conditionnement hospitalier : boîte de 100 → 5 échantillons ; boîte de 1 000 → 2. PGHT > 100 000 FCFA → 3 échantillons.',
          en: 'Bulk packaging not accepted. Hospital packs: box of 100 → 5 samples; box of 1,000 → 2. Ex-factory price above 100,000 FCFA → 3 samples.',
        },
      ],
      renewal_variation: [
        {
          fr: 'Renouvellement : sept (07) échantillons provenant d’officines de pharmacie en Côte d’Ivoire, de chaque modèle vente définitif, présentés en français (emballages primaire et secondaire, notice).',
          en: 'Renewal: seven (07) samples sourced from pharmacies in Côte d’Ivoire, of each final sales model, presented in French (primary and secondary packaging, package leaflet).',
        },
        {
          fr: 'Renouvellement — conditionnement hospitalier en boîte de 100 et plus : 3 échantillons. PGHT > 100 000 FCFA : 2 échantillons. PGHT > 500 000 FCFA : 1 échantillon. Certificats d’analyse des lots joints, validité d’au moins 2/3 de la durée de vie.',
          en: 'Renewal — hospital packs of 100 units or more: 3 samples. Ex-factory price above 100,000 FCFA: 2 samples. Above 500,000 FCFA: 1 sample. Batch certificates of analysis attached, with at least 2/3 of the shelf life remaining.',
        },
        {
          fr: 'Variation majeure : nombre fonction de la nature de la variation. En cas d’analyse en laboratoire — conditionnement hospitalier boîte de 100 : 10 échantillons, boîte de 1 000 : 3 ; PGHT > 100 000 FCFA : 5. Certificat d’analyse du lot soumis, péremption à plus de douze (12) mois. Vrac non accepté.',
          en: 'Major variation: number depending on the nature of the variation. Where laboratory testing applies — hospital packs of 100: 10 samples, of 1,000: 3; ex-factory price above 100,000 FCFA: 5. Certificate of analysis of the submitted batch, with more than twelve (12) months before expiry. Bulk packaging not accepted.',
        },
        {
          fr: 'Variation mineure, en cas de dépôt d’échantillons : deux (02) échantillons ou maquettes du modèle vente proposé et un (01) échantillon du modèle vente déjà commercialisé.',
          en: 'Minor variation, where samples are filed: two (02) samples or mock-ups of the proposed sales model and one (01) sample of the sales model already marketed.',
        },
      ],
      reserve: {
        fr: 'Le laboratoire peut être invité à fournir un supplément d’échantillons pour les expertises (modalités AIRP n° 01509 du 22 juillet 2024). Au renouvellement, vingt (20) échantillons peuvent être demandés pour un contrôle qualité post-commercialisation, aux frais du titulaire / exploitant.',
        en: 'The laboratory may be asked to supply additional samples for expert assessments (AIRP procedures No. 01509 of 22 July 2024). At renewal, twenty (20) samples may be requested for post-marketing quality control, at the expense of the MA holder / operator.',
      },
    },
  },
  /**
   * Sénégal (ARP) — décret n° 2025-1833 du 18 novembre 2025 fixant les redevances issues de la
   * régulation du secteur pharmaceutique (JO n° 7871 du 29 décembre 2025), section 4
   * « Homologation des médicaments ». Montants nus = industrie ÉTRANGÈRE, générique (cas dominant
   * du marché) ; princeps, procédure accélérée et industrie locale portés par `fees.notes`.
   * Échantillons : le décret tarife l'AUTORISATION D'IMPORTATION (section 3 — 100 000 FCFA par
   * produit/forme/dosage, validité 6 mois) mais ne fixe pas le nombre de modèles-vente ; le délai
   * de traitement n'est pas fixé non plus (repli générique).
   * Source locale : `RA-source/Decret-2025-1833-redevances-ARP-Senegal.pdf`.
   */
  SN: {
    currency: 'FCFA',
    fees: {
      new_ma: 1000000,
      renewal: 500000,
      variation_minor: 100000,
      variation_major: 1000000,
      notes: {
        new_ma: {
          fr: 'Générique, industrie étrangère — princeps : 1 500 000 FCFA · procédure accélérée : 2 000 000 FCFA · industrie locale : 500 000 FCFA. AMM valable 5 ans.',
          en: 'Generic, foreign industry — innovator: 1,500,000 FCFA · fast-track procedure: 2,000,000 FCFA · local industry: 500,000 FCFA. MA valid for 5 years.',
        },
        renewal: {
          fr: 'Industrie étrangère (locale : 250 000 FCFA). Retard de renouvellement : pénalité de 1 % du montant par jour de retard.',
          en: 'Foreign industry (local: 250,000 FCFA). Late renewal: penalty of 1% of the fee per day of delay.',
        },
        variation: {
          fr: 'Mineure générique (princeps : 150 000 FCFA) — industrie locale : majeure 500 000 FCFA, mineure 50 000 FCFA.',
          en: 'Minor, generic (innovator: 150,000 FCFA) — local industry: major 500,000 FCFA, minor 50,000 FCFA.',
        },
      },
    },
    samples: {
      new_ma: [
        {
          fr: "Autorisation d'importation des échantillons : 100 000 FCFA par produit, par forme et par dosage (validité 6 mois).",
          en: 'Sample import authorisation: 100,000 FCFA per product, per form and per strength (valid 6 months).',
        },
      ],
      renewal_variation: [
        {
          fr: "Si des échantillons sont requis : autorisation d'importation de 100 000 FCFA par produit, par forme et par dosage (validité 6 mois).",
          en: 'If samples are required: import authorisation of 100,000 FCFA per product, per form and per strength (valid 6 months).',
        },
      ],
      reserve: {
        fr: "Le décret n° 2025-1833 ne fixe pas le nombre d'échantillons modèle-vente — à confirmer auprès de l'ARP.",
        en: 'Decree No. 2025-1833 does not set the number of sales-model samples — to be confirmed with the ARP.',
      },
    },
  },
}

/** Barème national réparti par activité (`undefined` → repli générique sur la Roadmap). */
export function regulatoryProfileFor(country: string): RegulatoryProfile | undefined {
  return REG_PROFILES[country]
}

/**
 * Agences nationales CURÉES (zéro hallucination) — source du référentiel « Autorités » du Catalogue.
 * Renvoie toutes les entrées de `AGENCIES` (ordre d'insertion : UEMOA puis CEDEAO hors-UEMOA) ;
 * certaines (NG, GW) peuvent avoir `directeur`/`adresse` vides, à compléter.
 */
export function listAgencies(): { code: string; agency: AgencyInfo }[] {
  return Object.entries(AGENCIES).map(([code, agency]) => ({ code, agency }))
}

export function agencyFor(country: string): AgencyInfo {
  return (
    AGENCIES[country] ?? {
      name: 'ANRP',
      full: 'Autorité nationale de réglementation pharmaceutique (à confirmer)',
      directeur: '',
      sexe: 'M',
      adresse: '',
    }
  )
}

/** Civilité du destinataire selon le sexe du directeur (générique si directeur inconnu). */
export function agencyCivilite(a: AgencyInfo): string {
  if (!a.directeur) return 'Monsieur / Madame le Directeur Général'
  return a.sexe === 'F' ? 'Madame la Directrice Générale' : 'Monsieur le Directeur Général'
}

/** Civilité EN du destinataire (le titre « Director General » n'est pas genré en anglais). */
export function agencyCiviliteEn(): string {
  return 'The Director General'
}
