/* FICHIER GENERE par web/scripts/build-checking-bareme.mjs a partir de
 * landing/checking/referentiel.js — NE PAS EDITER A LA MAIN.
 * Modifier la source, puis lancer `npm run build:checking-bareme` (depuis web/).
 * La CI regenere et exige zero diff : la copie ne peut pas deriver de la source. */
/**
 * Checking Standard — BARÈME VERSIONNÉ (socle UEMOA).
 *
 * DOCTRINE (identique au référentiel d'organisations) : tant que le protocole versionné n'est
 * pas allumé, le contenu réglementaire vit DANS LE CODE, jamais dans une base éditable. Toute
 * évolution du barème = un commit, relu, testé, tracé. `BAREME_VERSION` est reporté dans le
 * rapport envoyé au prospect : un rapport reste explicable des mois plus tard.
 *
 * SOURCES (aucune valeur inventée) :
 *   • Règlement n° 04/2020/CM/UEMOA, Annexes I, III et IV — RA-source/eCTD_UEMOA-ECOWAS/
 *   • Fiches de complétude ABMed HO-PC 0002-FO 0021 (enregistrement) et HO-FO 0042 (renouvellement)
 *   • Modèles officiels : RCP / Notice / Étiquetage ABMed 2026, BTIF OMS (13 jan. 2023),
 *     QOS-PD OMS (janvier 2025)
 *
 * Les libellés bilingues s'écrivent `["fr", "en"]`. Ce module ne contient AUCUNE logique et
 * AUCUN accès au DOM : il est importable tel quel par le navigateur et par les tests.
 *
 * @typedef {[string, string] | string} Bi   Libellé bilingue (ou chaîne unique si identique).
 *
 * @typedef {object} Option
 * @property {'ok'|'nc'|'ko'|'na'} k   Clé de réponse.
 * @property {string} ico             Glyphe décoratif (aria-hidden côté UI).
 * @property {string} cls             Suffixe de classe CSS.
 * @property {Bi} label
 * @property {Bi} sub
 *
 * @typedef {object} Item
 * @property {string} id
 * @property {'adm'|'tec'|'saf'|'rec'} axis   Axe de restitution.
 * @property {number} w                       Poids dans le score.
 * @property {'ctd'|'ech'|'pay'} [gate]        Verrou de réception (Annexe IV).
 * @property {boolean} [na]                    Autorise la réponse « non applicable ».
 * @property {string} [tpl]                    Modèle officiel opposable (clé de MODELES).
 * @property {string[]} [only]                 Restreint l'item à ces types de produit.
 * @property {false} [fiche]                   Exclut l'item de la fiche de complétude simulée.
 * @property {'timing'} [special]
 * @property {Bi} q
 * @property {Bi} why
 * @property {Bi} piece                        Formulation « pièce » pour la fiche et le plan.
 * @property {Bi} [ncNote]                     Annotation d'écart, façon examinateur.
 * @property {Option[]} [opts]                 Options sur mesure (sinon jeu standard).
 * @property {{nc: Bi, ko: Bi}} [fixMap]       Recommandation sur mesure (sinon « À prévoir : … »).
 */

/** Version du barème — à incrémenter à CHAQUE modification de contenu réglementaire. */
export const BAREME_VERSION = 'uemoa-2026.1'

/**
 * Pays couverts. `ag` = nom de l'autorité tel qu'il s'insère dans une phrase (« … refusée par
 * l'ABMed »). Niger et Guinée-Bissau restent volontairement génériques : le nom de l'agence
 * n'est pas sourcé avec certitude, et une erreur d'agence décrédibilise tout le rapport.
 */
export const PAYS = [
  { k: 'bj', nom: ['Bénin', 'Benin'], ag: ["l'ABMed", 'ABMed'] },
  { k: 'bf', nom: ['Burkina Faso', 'Burkina Faso'], ag: ["l'ANRP", 'ANRP'] },
  { k: 'ci', nom: ["Côte d'Ivoire", "Côte d'Ivoire"], ag: ["l'AIRP", 'AIRP'] },
  { k: 'gw', nom: ['Guinée-Bissau', 'Guinea-Bissau'], ag: ["l'autorité nationale", 'the national authority'] },
  { k: 'ml', nom: 'Mali', ag: ['la DPM', 'DPM'] },
  { k: 'ne', nom: 'Niger', ag: ["l'autorité nationale", 'the national authority'] },
  { k: 'sn', nom: ['Sénégal', 'Senegal'], ag: ["l'ARP", 'ARP'] },
  { k: 'tg', nom: 'Togo', ag: ['la DPML', 'DPML'] },
]

export const AXES = {
  adm: ['Administratif & produit', 'Administrative & product'],
  tec: ['Modules techniques', 'Technical modules'],
  saf: ['Sécurité & vigilance', 'Safety & vigilance'],
  rec: ['Recevabilité', 'Reception'],
}

/** Les trois verrous de réception de l'Annexe IV : un seul manquant bloque la réception. */
export const GATES = {
  ctd: ['Format CTD', 'CTD format'],
  ech: ['Échantillons', 'Samples'],
  pay: ['Paiement', 'Payment'],
}

export const SOURCES = {
  enr: [
    'Fiche officielle enregistrement · Annexes I & IV, Règl. 04/2020/UEMOA',
    'Official registration form · Annexes I & IV, Reg. 04/2020/WAEMU',
  ],
  ren: [
    'Fiche officielle renouvellement · Annexes III & IV, Règl. 04/2020/UEMOA',
    'Official renewal form · Annexes III & IV, Reg. 04/2020/WAEMU',
  ],
}

/** Valeur de chaque réponse dans le score. `nc` vaut moins de la moitié : une pièce présente
 *  mais hors modèle se retravaille presque autant qu'une pièce absente. */
export const VAL = { ok: 1, nc: 0.45, ko: 0 }

/** Documents dont la mise à niveau automatique est proposée (Lot 2). */
export const UPGRADABLE = ['rcp', 'notice', 'etiq']

const OPT_NA = {
  k: 'na',
  ico: '—',
  cls: 'na',
  label: ['Non applicable à mon produit', 'Not applicable to my product'],
  sub: ['Exigence conditionnelle', 'Conditional requirement'],
}

/** Jeu d'options pour les pièces opposables à un modèle officiel (présence ≠ conformité). */
export const OPTS_TPL = [
  {
    k: 'ok',
    ico: '✓',
    cls: 'ok',
    label: ['Oui — rédigé sur le modèle officiel, en Word et PDF', 'Yes — drafted on the official template, in Word and PDF'],
    sub: ['Rubriques, ordre et langue conformes', 'Sections, order and language compliant'],
  },
  {
    k: 'nc',
    ico: '⚠',
    cls: 'nc',
    label: ['Le document existe, mais pas sur le modèle officiel', 'The document exists, but not on the official template'],
    sub: ['Ou format Word manquant, ou langue non conforme', 'Or missing Word format, or non-compliant language'],
  },
  { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore rédigé', 'Not drafted yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
]

/** Jeu d'options standard, pour les pièces sans modèle opposable. */
export const OPTS_STD = [
  {
    k: 'ok',
    ico: '✓',
    cls: 'ok',
    label: ['Oui — prêt et conforme', 'Yes — ready and compliant'],
    sub: ['La pièce est disponible, au bon format', 'The document is available, in the right format'],
  },
  {
    k: 'nc',
    ico: '⚠',
    cls: 'nc',
    label: ['En cours — incomplet ou à mettre en conformité', 'In progress — incomplete or to be brought into compliance'],
    sub: ['La pièce existe mais un élément manque', 'The document exists but something is missing'],
  },
  { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore', 'Not yet'], sub: ['Rien de disponible à ce stade', 'Nothing available at this stage'] },
]

/**
 * Options d'un item : sur mesure si l'item en définit, sinon le jeu correspondant à sa nature,
 * complété par « non applicable » quand l'exigence est conditionnelle.
 * @param {Item} item
 * @returns {Option[]}
 */
export function optionsFor(item) {
  if (item.opts) return item.opts
  const base = item.tpl ? OPTS_TPL : OPTS_STD
  return item.na ? [...base, OPT_NA] : base
}

/** @type {Item[]} Enregistrement — nouvelle AMM. */
export const ITEMS_ENR = [
  {
    id: 'm1',
    axis: 'rec',
    w: 12,
    gate: 'ctd',
    q: ['Votre Module 1 sera-t-il déposé consolidé et au format CTD UEMOA ?', 'Will your Module 1 be filed consolidated and in the WAEMU CTD format?'],
    why: [
      "Premier verrou de réception : un Module 1 hors format CTD est refusé à la réception — c'est le motif n° 1 relevé sur les fiches réelles.",
      'First reception gate: a Module 1 outside the CTD format is rejected at reception — the number-one reason found on real completeness forms.',
    ],
    piece: ['un Module 1 conforme au format CTD', 'a Module 1 compliant with the CTD format'],
    ncNote: ['Non conforme au format CTD', 'Not compliant with the CTD format'],
  },
  {
    id: 'rcp',
    axis: 'adm',
    w: 8,
    tpl: 'rcp',
    q: ['Votre RCP sera-t-il rédigé sur le modèle officiel du pays, en Word et PDF ?', "Will your SmPC be drafted on the country's official template, in Word and PDF?"],
    why: [
      "Présent ne suffit pas : le RCP doit suivre le modèle de l'autorité, rubrique par rubrique, et être fourni en français (ou en anglais accompagné du français). Le « format Word non fourni » est l'annotation la plus fréquente.",
      'Being present is not enough: the SmPC must follow the authority’s template section by section and be supplied in French (or English together with French). “Word format not supplied” is the most frequent annotation.',
    ],
    piece: ['un RCP conforme au modèle officiel, en Word et PDF', 'an SmPC compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme au modèle officiel', 'Not compliant with the official template'],
  },
  {
    id: 'not',
    axis: 'adm',
    w: 8,
    tpl: 'notice',
    q: ['Votre notice patient sera-t-elle rédigée sur la maquette officielle, en Word et PDF ?', 'Will your patient leaflet be drafted on the official template, in Word and PDF?'],
    why: [
      "Les six rubriques, dans l'ordre, avec l'encadré d'avertissement — et une cohérence stricte avec le RCP. Toute divergence entre notice et RCP est relevée en instruction.",
      'The six sections, in order, with the warning box — and strict consistency with the SmPC. Any divergence between leaflet and SmPC is flagged during assessment.',
    ],
    piece: ['une notice conforme à la maquette officielle, en Word et PDF', 'a leaflet compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme à la maquette officielle', 'Not compliant with the official template'],
  },
  {
    id: 'etiq',
    axis: 'adm',
    w: 6,
    tpl: 'etiq',
    q: ['Vos maquettes d’étiquetage reprendront-elles toutes les mentions du modèle officiel ?', 'Will your labelling mock-ups carry every particular of the official template?'],
    why: [
      "Trois jeux de mentions à ne pas confondre : emballage extérieur (17 mentions), plaquettes (5), petits conditionnements primaires (6). L'autorité contrôle directement sur la maquette.",
      'Three sets of particulars not to be confused: outer packaging (17), blisters (5), small immediate packs (6). The authority checks directly on the mock-up.',
    ],
    piece: ["des maquettes d'étiquetage conformes au modèle officiel", 'labelling mock-ups compliant with the official template'],
    ncNote: ['Mentions obligatoires incomplètes', 'Mandatory particulars incomplete'],
  },
  {
    id: 'btif',
    axis: 'adm',
    w: 6,
    na: true,
    tpl: 'btif',
    q: ['Le BTIF sera-t-il fourni sur le formulaire OMS, sans modification du format ?', 'Will the BTIF be supplied on the WHO form, with no change to the format?'],
    why: [
      "L'OMS l'écrit en tête du formulaire : ni le format ni le contenu ne doivent être modifiés. À défaut de BTIF, il faut une dispense justifiée — pas un silence.",
      'The WHO states it at the top of the form: neither the format nor the content may be changed. Without a BTIF, a justified waiver is required — not silence.',
    ],
    piece: ['le BTIF sur formulaire OMS non modifié, ou la justification de sa dispense', 'the BTIF on the unmodified WHO form, or the justification for its waiver'],
    ncNote: ['Formulaire OMS modifié ou incomplet', 'WHO form modified or incomplete'],
  },
  {
    id: 'dis',
    axis: 'tec',
    w: 6,
    na: true,
    only: ['gen'],
    q: ['Disposerez-vous de l’étude de dissolution comparée ou du Biowaiver (BCS) ?', 'Will you have the comparative dissolution study or the BCS Biowaiver?'],
    why: [
      "Exigée pour les génériques et multisources ; l'exemption se justifie par écrit, elle ne se suppose pas.",
      'Required for generics and multisource products; an exemption is justified in writing, never assumed.',
    ],
    piece: ["l'étude de dissolution comparée / le Biowaiver ou la justification d'exemption", 'the comparative dissolution study / Biowaiver or the exemption justification'],
  },
  {
    id: 'pgr',
    axis: 'saf',
    w: 4,
    na: true,
    q: ['Un Plan de Gestion des Risques sera-t-il joint (si votre produit y est soumis) ?', 'Will a Risk Management Plan be included (if your product is subject to one)?'],
    why: [
      'Requis selon le profil du produit — choisissez « non applicable » si le vôtre n’y est pas soumis.',
      'Required depending on the product profile — choose “not applicable” if yours is not subject to one.',
    ],
    piece: ['le Plan de Gestion des Risques', 'the Risk Management Plan'],
  },
  {
    id: 'dmf',
    axis: 'tec',
    w: 4,
    na: true,
    q: ["La lettre d'accès au DMF passera-t-elle par le canal confidentiel de l'autorité ?", "Will the DMF access letter go through the authority's confidential channel?"],
    why: [
      "La lettre d'accès au DMF appartient au socle UEMOA (1.2.5) ; chaque autorité définit son canal de dépôt confidentiel — un envoi par le canal ordinaire ne vaut pas dépôt.",
      'The DMF access letter belongs to the WAEMU core (1.2.5); each authority defines its own confidential channel — sending it through the ordinary channel does not count as filing.',
    ],
    piece: ['la preuve de soumission du DMF par le canal confidentiel', 'proof of DMF submission through the confidential channel'],
  },
  {
    id: 'm2',
    axis: 'tec',
    w: 8,
    q: ['Le Module 2 sera-t-il consolidé en un fichier unique, résumés signés par vos experts ?', 'Will Module 2 be consolidated into a single file, with summaries signed by your experts?'],
    why: [
      'Le Module 2 engage nommément vos experts : résumés qualité, non-clinique et clinique.',
      'Module 2 formally commits your experts: quality, non-clinical and clinical summaries.',
    ],
    piece: ['un Module 2 consolidé et signé', 'a consolidated and signed Module 2'],
  },
  {
    id: 'qos',
    axis: 'tec',
    w: 6,
    tpl: 'qos',
    q: ['Le QOS-PD sera-t-il rempli sur le modèle OMS, en Word et PDF ?', 'Will the QOS-PD be completed on the WHO template, in Word and PDF?'],
    why: [
      'Un résumé qualité, pas un renvoi : chaque rubrique doit porter la donnée, pas un « voir Module 3 ». Les deux formats sont exigés.',
      'A quality summary, not a cross-reference: each section must carry the data, not a “see Module 3”. Both formats are required.',
    ],
    piece: ['le QOS-PD sur modèle OMS, en Word et PDF', 'the QOS-PD on the WHO template, in Word and PDF'],
    ncNote: ['Non conforme au modèle OMS', 'Not compliant with the WHO template'],
  },
  {
    id: 'm3',
    axis: 'tec',
    w: 8,
    q: ['Le Module 3 sera-t-il complet — substance active ET produit fini ?', 'Will Module 3 be complete — drug substance AND finished product?'],
    why: ['Le cœur du dossier : 3.2.S et 3.2.P, certificats à jour à la date du dépôt.', 'The heart of the dossier: 3.2.S and 3.2.P, with certificates valid at the filing date.'],
    piece: ['un Module 3 complet', 'a complete Module 3'],
  },
  {
    id: 'm4',
    axis: 'tec',
    w: 5,
    q: ['Le Module 4 sera-t-il fourni — ou sa dispense justifiée par écrit ?', 'Will Module 4 be supplied — or its waiver justified in writing?'],
    why: [
      'Pour un générique, la dispense se justifie formellement (littérature, usage médical établi).',
      'For a generic, the waiver must be formally justified (literature, well-established use).',
    ],
    piece: ['le Module 4 ou la justification de sa dispense', 'Module 4 or the justification for its waiver'],
  },
  {
    id: 'm5',
    axis: 'tec',
    w: 5,
    q: ['Le Module 5 sera-t-il fourni — cliniques ou bioéquivalence selon votre produit ?', 'Will Module 5 be supplied — clinical or bioequivalence data depending on your product?'],
    why: [
      'Pour un multisource, la bioéquivalence est la pièce maîtresse du Module 5.',
      'For a multisource product, bioequivalence is the centrepiece of Module 5.',
    ],
    piece: ['le Module 5 (ou les données de bioéquivalence)', 'Module 5 (or the bioequivalence data)'],
  },
  {
    id: 'ech',
    axis: 'rec',
    w: 10,
    gate: 'ech',
    q: ['Aurez-vous les échantillons modèle-vente et le certificat d’analyse du lot déposé ?', 'Will you have the sales-model samples and the certificate of analysis of the filed batch?'],
    why: [
      "Deuxième verrou de réception : échantillons plus certificat d'analyse du lot, avec une durée de vie restante d'au moins 18 mois.",
      'Second reception gate: samples plus the batch certificate of analysis, with at least 18 months of remaining shelf life.',
    ],
    piece: ["les échantillons et le certificat d'analyse du lot", 'the samples and the batch certificate of analysis'],
  },
  {
    id: 'pay',
    axis: 'rec',
    w: 10,
    gate: 'pay',
    q: ['Le paiement des frais d’homologation sera-t-il effectué avant le dépôt ?', 'Will the registration fees be paid before filing?'],
    why: [
      "Troisième verrou : sans récépissé de paiement au moment du dépôt, le dossier n'est pas réceptionné. Vérifiez le barème en vigueur du pays.",
      "Third gate: without a payment receipt at filing, the dossier is not accepted. Check the country's current fee schedule.",
    ],
    piece: ["la preuve de paiement des frais d'homologation", 'proof of payment of the registration fees'],
  },
]

/** @type {Item[]} Renouvellement d'AMM. */
export const ITEMS_REN = [
  {
    id: 'tim',
    axis: 'adm',
    w: 8,
    special: 'timing',
    fiche: false,
    q: ["À quelle distance de l'expiration de l'AMM prévoyez-vous de déposer ?", 'How far ahead of the MA expiry do you plan to file?'],
    why: [
      "Le règlement impose un dépôt au moins 120 jours avant l'expiration de l'enregistrement en cours.",
      'The regulation requires filing at least 120 days before the current registration expires.',
    ],
    piece: ['un dépôt dans les délais (≥ 120 jours avant expiration)', 'a timely filing (≥ 120 days before expiry)'],
    fixMap: {
      nc: [
        "Le délai réglementaire de 120 jours avant expiration n'est pas respecté. Déposez sans attendre et signalez le calendrier à l'autorité.",
        'The regulatory 120-day pre-expiry deadline is not met. File without delay and flag the timeline to the authority.',
      ],
      ko: [
        "L'AMM est expirée : la voie du renouvellement est fermée. Confirmez le circuit applicable auprès de l'autorité avant d'engager des redevances.",
        'The MA has expired: the renewal route is closed. Confirm the applicable route with the authority before committing any fees.',
      ],
    },
    opts: [
      { k: 'ok', ico: '✓', cls: 'ok', label: ["Plus de 120 jours avant l'expiration", 'More than 120 days before expiry'], sub: ['Dans les délais réglementaires', 'Within the regulatory deadline'] },
      { k: 'nc', ico: '⚠', cls: 'nc', label: ['Moins de 120 jours', 'Less than 120 days'], sub: ['Dépôt sous contrainte de temps', 'Filing under time pressure'] },
      { k: 'ko', ico: '✗', cls: 'ko', label: ["L'AMM est déjà expirée", 'The MA has already expired'], sub: ['La voie du renouvellement est fermée', 'The renewal route is closed'] },
    ],
  },
  {
    id: 'm1',
    axis: 'rec',
    w: 10,
    gate: 'ctd',
    q: ['Votre Module 1 sera-t-il à jour et identique en structure au dossier initial ?', 'Will your Module 1 be up to date and structurally identical to the initial dossier?'],
    why: [
      'Modules 1 et 2 doivent être « en tout point identiques » au dossier initial — et refléter les variations approuvées depuis.',
      'Modules 1 and 2 must be “identical in every respect” to the initial dossier — and reflect the variations approved since.',
    ],
    piece: ['un Module 1 à jour, conforme au format CTD', 'an up-to-date Module 1, compliant with the CTD format'],
    ncNote: ['Non conforme au format CTD', 'Not compliant with the CTD format'],
  },
  {
    id: 'rcp',
    axis: 'adm',
    w: 7,
    tpl: 'rcp',
    q: ['Votre RCP sera-t-il fourni sur le modèle officiel, dans sa dernière version approuvée ?', 'Will your SmPC be supplied on the official template, in its latest approved version?'],
    why: [
      "La version en vigueur — celle issue de vos variations approuvées — sur le modèle du pays, en Word et PDF.",
      "The version in force — the one resulting from your approved variations — on the country's template, in Word and PDF.",
    ],
    piece: ['un RCP conforme au modèle officiel, en Word et PDF', 'an SmPC compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme au modèle officiel', 'Not compliant with the official template'],
  },
  {
    id: 'not',
    axis: 'adm',
    w: 7,
    tpl: 'notice',
    q: ['La notice sera-t-elle fournie sur la maquette officielle, en Word et PDF ?', 'Will the leaflet be supplied on the official template, in Word and PDF?'],
    why: [
      'Annotation récurrente des fiches réelles de renouvellement : « fournir la notice en format Word ».',
      'A recurring annotation on real renewal forms: “supply the leaflet in Word format”.',
    ],
    piece: ['une notice conforme à la maquette officielle, en Word et PDF', 'a leaflet compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme à la maquette officielle', 'Not compliant with the official template'],
  },
  {
    id: 'etiq',
    axis: 'adm',
    w: 5,
    tpl: 'etiq',
    q: ['Vos maquettes d’étiquetage seront-elles celles du produit réellement commercialisé ?', 'Will your labelling mock-ups be those of the product actually marketed?'],
    why: ['Les maquettes à jour, avec toutes les mentions obligatoires du modèle officiel.', 'Up-to-date mock-ups, carrying every mandatory particular of the official template.'],
    piece: ["des maquettes d'étiquetage à jour et conformes", 'up-to-date and compliant labelling mock-ups'],
    ncNote: ['Mentions obligatoires incomplètes', 'Mandatory particulars incomplete'],
  },
  {
    id: 'm2',
    axis: 'tec',
    w: 7,
    q: ['Le Module 2 sera-t-il joint, identique en structure au dossier initial ?', 'Will Module 2 be included, structurally identical to the initial dossier?'],
    why: ['Comme le Module 1 : reconduit à l’identique, mis à jour des variations approuvées.', 'Like Module 1: carried over identically, updated with the approved variations.'],
    piece: ['le Module 2', 'Module 2'],
  },
  {
    id: 'qos',
    axis: 'tec',
    w: 5,
    tpl: 'qos',
    q: ['Le QOS-PD sera-t-il fourni sur le modèle OMS, en Word et PDF ?', 'Will the QOS-PD be supplied on the WHO template, in Word and PDF?'],
    why: ['Manque observé sur les fiches réelles de renouvellement, au même titre que le RCP.', 'A gap observed on real renewal forms, just like the SmPC.'],
    piece: ['le QOS-PD sur modèle OMS, en Word et PDF', 'the QOS-PD on the WHO template, in Word and PDF'],
    ncNote: ['Non conforme au modèle OMS', 'Not compliant with the WHO template'],
  },
  {
    id: 'psur',
    axis: 'saf',
    w: 9,
    q: ['Le PSUR couvrira-t-il toute la période écoulée de l’AMM ?', 'Will the PSUR cover the entire elapsed MA period?'],
    why: [
      'La pièce la plus souvent manquante des renouvellements — elle démontre la surveillance continue du produit.',
      'The most frequently missing document in renewals — it demonstrates continuous product surveillance.',
    ],
    piece: ['le rapport périodique actualisé de sécurité (PSUR)', 'the periodic safety update report (PSUR)'],
  },
  {
    id: 'smf',
    axis: 'tec',
    w: 7,
    q: ['Le Site Master File de l’usine de fabrication sera-t-il joint ?', 'Will the Site Master File of the manufacturing plant be included?'],
    why: [
      "Le SMF de l'usine où le produit est réellement fabriqué aujourd'hui, pas celle du dossier initial si elle a changé.",
      'The SMF of the plant where the product is actually manufactured today, not the initial one if it has changed.',
    ],
    piece: ['le Site Master File (SMF)', 'the Site Master File (SMF)'],
  },
  {
    id: 'bmr',
    axis: 'tec',
    w: 7,
    q: ['Aurez-vous le dossier de lot (BMR) d’un lot réel de moins de 6 mois ?', 'Will you have the batch record (BMR) of an actual batch less than 6 months old?'],
    why: ['Un lot réel, fabriqué dans les six mois précédant la soumission — pas un lot d’archive.', 'An actual batch, manufactured within the six months preceding submission — not an archived one.'],
    piece: ['le dossier de fabrication (BMR) d’un lot de moins de 6 mois', 'the batch record (BMR) of a batch less than 6 months old'],
  },
  {
    id: 'amm',
    axis: 'adm',
    w: 6,
    q: ['La dernière AMM en cours de validité sera-t-elle jointe ?', 'Will the latest valid MA be included?'],
    why: ['La décision en cours de validité, base juridique du renouvellement.', 'The decision currently in force, the legal basis for the renewal.'],
    piece: ['la dernière AMM du produit', 'the latest MA for the product'],
  },
  {
    id: 'att',
    axis: 'adm',
    w: 7,
    q: ['Aurez-vous l’attestation de non-modification, ou la liste chronologique des variations approuvées ?', 'Will you have the statement of no change, or the chronological list of approved variations?'],
    why: [
      "Toutes les modifications depuis la première AMM, avec dates et références d'approbation. Rien d'oublié.",
      'Every change since the first MA, with approval dates and references. Nothing left out.',
    ],
    piece: ["l'attestation de non-modification ou la liste chronologique des variations approuvées", 'the statement of no change or the chronological list of approved variations'],
  },
  {
    id: 'int',
    axis: 'tec',
    w: 5,
    na: true,
    only: ['gen'],
    q: ['La preuve d’interchangeabilité sera-t-elle jointe ?', 'Will the proof of interchangeability be included?'],
    why: ['Exigée pour les multisources au renouvellement.', 'Required for multisource products at renewal.'],
    piece: ["la preuve d'interchangeabilité", 'the proof of interchangeability'],
  },
  {
    id: 'ech',
    axis: 'rec',
    w: 8,
    gate: 'ech',
    q: ['Aurez-vous les échantillons (moitié du nombre initial) et leur certificat d’analyse ?', 'Will you have the samples (half the initial number) and their certificate of analysis?'],
    why: [
      "Au renouvellement, l'autorité exige la moitié des échantillons de l'AMM initiale — verrou de réception.",
      'At renewal, the authority requires half the samples of the initial MA — a reception gate.',
    ],
    piece: ["les échantillons (½ du nombre initial) et le certificat d'analyse", 'the samples (½ of the initial number) and the certificate of analysis'],
  },
  {
    id: 'pay',
    axis: 'rec',
    w: 8,
    gate: 'pay',
    q: ['Le paiement des frais de renouvellement sera-t-il effectué avant le dépôt ?', 'Will the renewal fees be paid before filing?'],
    why: [
      'Verrou de réception — et les pénalités éventuelles se règlent en plus, sur quittance séparée.',
      'A reception gate — and any penalties are paid on top, with a separate receipt.',
    ],
    piece: ['la quittance de paiement des frais de renouvellement', 'the receipt for payment of the renewal fees'],
  },
  {
    id: 'pen',
    axis: 'adm',
    w: 3,
    na: true,
    q: ['Des pénalités s’appliqueront-elles — et leur quittance sera-t-elle jointe ?', 'Will penalties apply — and will their receipt be included?'],
    why: [
      'En cas de dépôt tardif, la quittance des pénalités est exigée. « Non applicable » si vous êtes dans les délais.',
      'In case of late filing, the penalty receipt is required. Choose “not applicable” if you are within the deadline.',
    ],
    piece: ['la quittance des pénalités', 'the penalty receipt'],
  },
]
