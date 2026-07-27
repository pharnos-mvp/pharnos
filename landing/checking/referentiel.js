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

/** Version du barème — à incrémenter à CHAQUE modification de contenu réglementaire.
 *  2026.2 : questionnaire passé en mode DESCRIPTIF (« comment se présente… » au lieu de « est-ce
 *  conforme ? »). Les entrées du calcul changent, donc la version aussi — un rapport de la 2026.1
 *  ne se compare pas item par item à un rapport de la 2026.2. */
export const BAREME_VERSION = 'uemoa-2026.2'

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

/**
 * Jeu d'options par défaut, pour les pièces dont l'état se résume à un avancement.
 *
 * DOCTRINE DU QUESTIONNAIRE — on décrit, on ne s'auto-note pas. Une question fermée (« votre RCP
 * est-il conforme ? ») reçoit « oui » de presque tout le monde : le déclarant croit sincèrement
 * l'être. Une question descriptive (« comment votre RCP est-il rédigé ? ») avec des états
 * concrets et exclusifs oblige à reconnaître le sien, et c'est LE BARÈME qui juge. Les items à
 * fort enjeu portent donc leurs propres options ordonnées du plus conforme au moins conforme.
 */
export const OPTS_STD = [
  {
    k: 'ok',
    ico: '✓',
    cls: 'ok',
    label: ['Prête et disponible pour le dépôt', 'Ready and available for filing'],
    sub: ['Rien ne reste à produire sur ce point', 'Nothing left to produce on this point'],
  },
  {
    k: 'nc',
    ico: '⚠',
    cls: 'nc',
    label: ['En cours — la pièce existe, un élément manque', 'In progress — the document exists, something is missing'],
    sub: ['À compléter avant le dépôt', 'To be completed before filing'],
  },
  { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore engagée', 'Not started yet'], sub: ['Rien de disponible à ce stade', 'Nothing available at this stage'] },
]

/**
 * Options d'un item : sur mesure si l'item en définit (cas général des pièces à fort enjeu),
 * sinon le jeu par défaut, complété par « non applicable » quand l'exigence est conditionnelle.
 * @param {Item} item
 * @returns {Option[]}
 */
export function optionsFor(item) {
  if (item.opts) return item.opts
  return item.na ? [...OPTS_STD, OPT_NA] : OPTS_STD
}

/** @type {Item[]} Enregistrement — nouvelle AMM. */
export const ITEMS_ENR = [
  {
    id: 'm1',
    axis: 'rec',
    w: 12,
    gate: 'ctd',
    tpl: 'ctd',
    q: ['Comment se présente votre Module 1 ?', 'How is your Module 1 presented?'],
    why: [
      "Premier verrou de réception : un Module 1 hors format CTD est refusé à la réception — c'est le motif n° 1 relevé sur les fiches réelles. Regardez l'arborescence attendue avant de répondre.",
      'First reception gate: a Module 1 outside the CTD format is rejected at reception — the number-one reason found on real completeness forms. Look at the expected tree before answering.',
    ],
    piece: ['un Module 1 conforme au format CTD', 'a Module 1 compliant with the CTD format'],
    ncNote: ['Non conforme au format CTD attendu', 'Not compliant with the expected CTD format'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Un PDF unique, combiné et structuré selon l’arborescence CTD', 'A single combined PDF, structured along the CTD tree'],
        sub: ['Avec table des matières et signets, de 1.0 à 1.4', 'With table of contents and bookmarks, from 1.0 to 1.4'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Des fichiers séparés, rangés selon l’arborescence CTD', 'Separate files, arranged along the CTD tree'],
        sub: ['La structure y est ; le PDF combiné manque', 'The structure is there; the combined PDF is missing'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Un PDF unique, mais sans l’arborescence CTD', 'A single PDF, but without the CTD tree'],
        sub: ['Le combiné y est ; la numérotation attendue manque', 'The combined file is there; the expected numbering is missing'],
      },
      {
        k: 'ko',
        ico: '✗',
        cls: 'ko',
        label: ['Une organisation propre au laboratoire, ou rien d’assemblé', 'An in-house organisation, or nothing assembled yet'],
        sub: ['À reprendre entièrement au format CTD', 'To be rebuilt entirely in the CTD format'],
      },
    ],
  },
  {
    id: 'rcp',
    axis: 'adm',
    w: 8,
    tpl: 'rcp',
    q: ['Comment votre RCP est-il rédigé ?', 'How is your SmPC drafted?'],
    why: [
      "Présent ne suffit pas : le RCP doit suivre le modèle de l'autorité, rubrique par rubrique, et être fourni en français (ou en anglais accompagné du français). Le « format Word non fourni » est l'annotation la plus fréquente.",
      'Being present is not enough: the SmPC must follow the authority’s template section by section and be supplied in French (or English together with French). “Word format not supplied” is the most frequent annotation.',
    ],
    piece: ['un RCP conforme au modèle officiel, en Word et PDF', 'an SmPC compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme au modèle officiel', 'Not compliant with the official template'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Sur le modèle officiel du pays, fourni en Word et en PDF', 'On the country’s official template, supplied in Word and PDF'],
        sub: ['Les 10 rubriques dans l’ordre, numérotation inchangée', 'The 10 sections in order, numbering unchanged'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Sur le modèle officiel, mais en PDF seulement', 'On the official template, but in PDF only'],
        sub: ['Le format Word est exigé au dépôt', 'The Word format is required at filing'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Un RCP repris d’un autre pays, ou de format maison', 'An SmPC carried over from another country, or in-house'],
        sub: ['Rubriques et numérotation à réaligner sur le modèle', 'Sections and numbering to realign with the template'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore rédigé', 'Not drafted yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
    ],
  },
  {
    id: 'not',
    axis: 'adm',
    w: 8,
    tpl: 'notice',
    q: ['Comment votre notice patient est-elle rédigée ?', 'How is your patient leaflet drafted?'],
    why: [
      "Les six rubriques, dans l'ordre, avec l'encadré d'avertissement — et une cohérence stricte avec le RCP. Toute divergence entre notice et RCP est relevée en instruction.",
      'The six sections, in order, with the warning box — and strict consistency with the SmPC. Any divergence between leaflet and SmPC is flagged during assessment.',
    ],
    piece: ['une notice conforme à la maquette officielle, en Word et PDF', 'a leaflet compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme à la maquette officielle', 'Not compliant with the official template'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Sur la maquette officielle, en Word et PDF, cohérente avec le RCP', 'On the official template, in Word and PDF, consistent with the SmPC'],
        sub: ['Les 6 rubriques dans l’ordre, encadré d’avertissement en tête', 'The 6 sections in order, warning box at the top'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Sur la maquette officielle, mais en PDF seulement', 'On the official template, but in PDF only'],
        sub: ['« Fournir la notice en format Word » revient sur les fiches', '“Supply the leaflet in Word format” recurs on the forms'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Une notice reprise d’un autre marché, ou de format maison', 'A leaflet carried over from another market, or in-house'],
        sub: ['Structure et cohérence avec le RCP à reprendre', 'Structure and consistency with the SmPC to rework'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore rédigée', 'Not drafted yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
    ],
  },
  {
    id: 'etiq',
    axis: 'adm',
    w: 6,
    tpl: 'etiq',
    q: ['Que portent vos maquettes d’étiquetage ?', 'What do your labelling mock-ups carry?'],
    why: [
      "Trois jeux de mentions à ne pas confondre : emballage extérieur (17 mentions), plaquettes (5), petits conditionnements primaires (6). L'autorité contrôle directement sur la maquette.",
      'Three sets of particulars not to be confused: outer packaging (17), blisters (5), small immediate packs (6). The authority checks directly on the mock-up.',
    ],
    piece: ["des maquettes d'étiquetage conformes au modèle officiel", 'labelling mock-ups compliant with the official template'],
    ncNote: ['Mentions obligatoires incomplètes', 'Mandatory particulars incomplete'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Les trois jeux de mentions du modèle officiel', 'The three sets of particulars from the official template'],
        sub: ['Emballage extérieur, plaquettes, petits conditionnements', 'Outer packaging, blisters, small immediate packs'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Les mentions de l’emballage extérieur seulement', 'The outer packaging particulars only'],
        sub: ['Plaquettes et petits conditionnements manquent', 'Blisters and small packs are missing'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Des maquettes existantes, non alignées sur le modèle du pays', 'Existing mock-ups, not aligned with the country’s template'],
        sub: ['Mentions à recenser une par une', 'Particulars to check one by one'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore préparées', 'Not prepared yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
    ],
  },
  {
    id: 'btif',
    axis: 'adm',
    w: 6,
    na: true,
    tpl: 'btif',
    q: ['Sous quelle forme le BTIF sera-t-il fourni ?', 'In what form will the BTIF be supplied?'],
    why: [
      "L'OMS l'écrit en tête du formulaire : ni le format ni le contenu ne doivent être modifiés. À défaut de BTIF, il faut une dispense justifiée — pas un silence.",
      'The WHO states it at the top of the form: neither the format nor the content may be changed. Without a BTIF, a justified waiver is required — not silence.',
    ],
    piece: ['le BTIF sur formulaire OMS non modifié, ou la justification de sa dispense', 'the BTIF on the unmodified WHO form, or the justification for its waiver'],
    ncNote: ['Formulaire OMS modifié ou incomplet', 'WHO form modified or incomplete'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Sur le formulaire OMS, format et contenu inchangés', 'On the WHO form, format and content unchanged'],
        sub: ['Annexes localisées par leur numéro', 'Annexes located by their number'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Sur le formulaire OMS, mais adapté ou partiellement rempli', 'On the WHO form, but adapted or partly completed'],
        sub: ['Toute modification du gabarit est relevée', 'Any change to the template is flagged'],
      },
      {
        k: 'ko',
        ico: '✗',
        cls: 'ko',
        label: ['Ni BTIF, ni justification de dispense', 'Neither BTIF nor waiver justification'],
        sub: ['Le silence ne vaut pas dispense', 'Silence does not count as a waiver'],
      },
      {
        k: 'na',
        ico: '—',
        cls: 'na',
        label: ['Non applicable — dispense justifiée par écrit', 'Not applicable — waiver justified in writing'],
        sub: ['La justification accompagne le dossier', 'The justification accompanies the dossier'],
      },
    ],
  },
  {
    id: 'dis',
    axis: 'tec',
    w: 6,
    na: true,
    only: ['gen'],
    q: ['Où en est l’étude de dissolution comparée, ou le Biowaiver (BCS) ?', 'Where does the comparative dissolution study, or the BCS Biowaiver, stand?'],
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
    q: ['Où en est le Plan de Gestion des Risques, si votre produit y est soumis ?', 'Where does the Risk Management Plan stand, if your product is subject to one?'],
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
    q: ["Par quel canal la lettre d'accès au DMF sera-t-elle transmise ?", 'Through which channel will the DMF access letter be sent?'],
    why: [
      "La lettre d'accès au DMF appartient au socle UEMOA (1.2.5) ; chaque autorité définit son canal de dépôt confidentiel — un envoi par le canal ordinaire ne vaut pas dépôt.",
      'The DMF access letter belongs to the WAEMU core (1.2.5); each authority defines its own confidential channel — sending it through the ordinary channel does not count as filing.',
    ],
    piece: ['la preuve de soumission du DMF par le canal confidentiel', 'proof of DMF submission through the confidential channel'],
    ncNote: ['Transmis hors du canal confidentiel', 'Sent outside the confidential channel'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ["Par le canal confidentiel de l'autorité", 'Through the authority’s confidential channel'],
        sub: ['Avec la preuve de soumission', 'With proof of submission'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Dans le dossier, par le canal ordinaire', 'Inside the dossier, through the ordinary channel'],
        sub: ['Un envoi hors canal confidentiel ne vaut pas dépôt', 'Sending outside the confidential channel does not count as filing'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore obtenue du fabricant', 'Not yet obtained from the manufacturer'], sub: ['À demander sans attendre', 'To request without delay'] },
      { k: 'na', ico: '—', cls: 'na', label: ['Non applicable — pas de DMF dans ce dossier', 'Not applicable — no DMF in this dossier'], sub: ['Exigence conditionnelle', 'Conditional requirement'] },
    ],
  },
  {
    id: 'm2',
    axis: 'tec',
    w: 8,
    q: ['Où en est le Module 2 — résumés consolidés et signés par vos experts ?', 'Where does Module 2 stand — summaries consolidated and signed by your experts?'],
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
    q: ['Sous quelle forme le QOS-PD sera-t-il fourni ?', 'In what form will the QOS-PD be supplied?'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Sur le modèle OMS, en Word et PDF, chaque rubrique renseignée', 'On the WHO template, in Word and PDF, every section filled in'],
        sub: ['2.3.S et 2.3.P portent la donnée elle-même', '2.3.S and 2.3.P carry the data itself'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Sur le modèle OMS, mais avec des renvois « voir Module 3 »', 'On the WHO template, but with “see Module 3” cross-references'],
        sub: ['Un résumé qualité n’est pas un renvoi', 'A quality summary is not a cross-reference'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Un résumé qualité de format maison', 'An in-house quality summary'],
        sub: ['À reprendre sur le gabarit OMS', 'To be rebuilt on the WHO template'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore rédigé', 'Not drafted yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
    ],
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
    q: ['Où en est le Module 3 — substance active ET produit fini ?', 'Where does Module 3 stand — drug substance AND finished product?'],
    why: ['Le cœur du dossier : 3.2.S et 3.2.P, certificats à jour à la date du dépôt.', 'The heart of the dossier: 3.2.S and 3.2.P, with certificates valid at the filing date.'],
    piece: ['un Module 3 complet', 'a complete Module 3'],
  },
  {
    id: 'm4',
    axis: 'tec',
    w: 5,
    q: ['Où en est le Module 4, ou la justification écrite de sa dispense ?', 'Where does Module 4 stand, or the written justification for its waiver?'],
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
    q: ['Où en est le Module 5 — cliniques ou bioéquivalence selon votre produit ?', 'Where does Module 5 stand — clinical or bioequivalence data depending on your product?'],
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
    q: ['Où en sont les échantillons et leur certificat d’analyse ?', 'Where do the samples and their certificate of analysis stand?'],
    why: [
      "Deuxième verrou de réception : échantillons plus certificat d'analyse du lot, avec une durée de vie restante d'au moins 18 mois.",
      'Second reception gate: samples plus the batch certificate of analysis, with at least 18 months of remaining shelf life.',
    ],
    piece: ["les échantillons et le certificat d'analyse du lot", 'the samples and the batch certificate of analysis'],
    ncNote: ['Échantillons ou certificat incomplets', 'Samples or certificate incomplete'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Échantillons modèle-vente prêts, avec le certificat d’analyse du lot', 'Sales-model samples ready, with the batch certificate of analysis'],
        sub: ['Durée de vie restante d’au moins 18 mois', 'At least 18 months of remaining shelf life'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Échantillons disponibles, certificat d’analyse manquant', 'Samples available, certificate of analysis missing'],
        sub: ['Les deux sont exigés à la réception', 'Both are required at reception'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Échantillons dont la durée de vie restante est inférieure à 18 mois', 'Samples with less than 18 months of remaining shelf life'],
        sub: ['Un lot plus récent sera demandé', 'A more recent batch will be requested'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore disponibles', 'Not available yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
    ],
  },
  {
    id: 'pay',
    axis: 'rec',
    w: 10,
    gate: 'pay',
    q: ['Où en est le paiement des frais d’homologation ?', 'Where does the payment of the registration fees stand?'],
    why: [
      "Troisième verrou : sans récépissé de paiement au moment du dépôt, le dossier n'est pas réceptionné. Vérifiez le barème en vigueur du pays.",
      "Third gate: without a payment receipt at filing, the dossier is not accepted. Check the country's current fee schedule.",
    ],
    piece: ["la preuve de paiement des frais d'homologation", 'proof of payment of the registration fees'],
    ncNote: ['Récépissé de paiement non disponible', 'Payment receipt not available'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Payés, récépissé disponible pour le dépôt', 'Paid, receipt available for filing'],
        sub: ['Le récépissé accompagne le dossier', 'The receipt accompanies the dossier'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Paiement engagé, récépissé pas encore reçu', 'Payment initiated, receipt not yet received'],
        sub: ['C’est le récépissé qui est exigé, pas l’ordre de virement', 'The receipt is required, not the transfer order'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore payés', 'Not paid yet'], sub: ['Vérifiez le barème en vigueur du pays', 'Check the country’s current fee schedule'] },
    ],
  },
]

/**
 * Réutilise le jeu d'options d'un item d'enregistrement. La façon de DÉCRIRE un RCP, une notice
 * ou un QOS-PD ne dépend pas de l'opération — seuls l'énoncé, le poids et l'enjeu changent.
 * Recopier ces listes garantirait qu'un jour l'enregistrement et le renouvellement proposeraient
 * des états différents pour la même pièce.
 * @param {string} id
 * @returns {Option[]}
 */
const enrOpts = (id) => /** @type {Option[]} */ (ITEMS_ENR.find((it) => it.id === id).opts)

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
    tpl: 'ctd',
    q: ['Comment se présente le Module 1 que vous allez redéposer ?', 'How is the Module 1 you are about to re-file presented?'],
    why: [
      'Modules 1 et 2 doivent être « en tout point identiques » au dossier initial — et refléter les variations approuvées depuis.',
      'Modules 1 and 2 must be “identical in every respect” to the initial dossier — and reflect the variations approved since.',
    ],
    piece: ['un Module 1 à jour, conforme au format CTD', 'an up-to-date Module 1, compliant with the CTD format'],
    ncNote: ['Non conforme au format CTD attendu', 'Not compliant with the expected CTD format'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['Repris du dossier initial, à jour des variations approuvées', 'Carried over from the initial dossier, updated with the approved variations'],
        sub: ['Structure CTD identique, PDF combiné', 'Identical CTD structure, combined PDF'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Repris du dossier initial, sans les variations approuvées depuis', 'Carried over from the initial dossier, without the variations approved since'],
        sub: ['L’écart avec la version en vigueur sera relevé', 'The gap with the version in force will be flagged'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Reconstitué, avec une structure qui diffère du dossier initial', 'Rebuilt, with a structure differing from the initial dossier'],
        sub: ['« En tout point identiques » est la règle', '“Identical in every respect” is the rule'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore reconstitué', 'Not rebuilt yet'], sub: ['À reprendre au format CTD', 'To be rebuilt in the CTD format'] },
    ],
  },
  {
    id: 'rcp',
    axis: 'adm',
    w: 7,
    tpl: 'rcp',
    q: ['Comment le RCP que vous allez déposer est-il rédigé ?', 'How is the SmPC you are about to file drafted?'],
    why: [
      "La version en vigueur — celle issue de vos variations approuvées — sur le modèle du pays, en Word et PDF.",
      "The version in force — the one resulting from your approved variations — on the country's template, in Word and PDF.",
    ],
    piece: ['un RCP conforme au modèle officiel, en Word et PDF', 'an SmPC compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme au modèle officiel', 'Not compliant with the official template'],
    opts: enrOpts('rcp'),
  },
  {
    id: 'not',
    axis: 'adm',
    w: 7,
    tpl: 'notice',
    q: ['Comment la notice que vous allez déposer est-elle rédigée ?', 'How is the leaflet you are about to file drafted?'],
    why: [
      'Annotation récurrente des fiches réelles de renouvellement : « fournir la notice en format Word ».',
      'A recurring annotation on real renewal forms: “supply the leaflet in Word format”.',
    ],
    piece: ['une notice conforme à la maquette officielle, en Word et PDF', 'a leaflet compliant with the official template, in Word and PDF'],
    ncNote: ['Non conforme à la maquette officielle', 'Not compliant with the official template'],
    opts: enrOpts('not'),
  },
  {
    id: 'etiq',
    axis: 'adm',
    w: 5,
    tpl: 'etiq',
    q: ['Que portent les maquettes d’étiquetage du produit réellement commercialisé ?', 'What do the labelling mock-ups of the product actually marketed carry?'],
    why: ['Les maquettes à jour, avec toutes les mentions obligatoires du modèle officiel.', 'Up-to-date mock-ups, carrying every mandatory particular of the official template.'],
    piece: ["des maquettes d'étiquetage à jour et conformes", 'up-to-date and compliant labelling mock-ups'],
    ncNote: ['Mentions obligatoires incomplètes', 'Mandatory particulars incomplete'],
    opts: enrOpts('etiq'),
  },
  {
    id: 'm2',
    axis: 'tec',
    w: 7,
    q: ['Où en est le Module 2, identique en structure au dossier initial ?', 'Where does Module 2 stand, structurally identical to the initial dossier?'],
    why: ['Comme le Module 1 : reconduit à l’identique, mis à jour des variations approuvées.', 'Like Module 1: carried over identically, updated with the approved variations.'],
    piece: ['le Module 2', 'Module 2'],
  },
  {
    id: 'qos',
    axis: 'tec',
    w: 5,
    tpl: 'qos',
    q: ['Sous quelle forme le QOS-PD sera-t-il fourni ?', 'In what form will the QOS-PD be supplied?'],
    why: ['Manque observé sur les fiches réelles de renouvellement, au même titre que le RCP.', 'A gap observed on real renewal forms, just like the SmPC.'],
    piece: ['le QOS-PD sur modèle OMS, en Word et PDF', 'the QOS-PD on the WHO template, in Word and PDF'],
    ncNote: ['Non conforme au modèle OMS', 'Not compliant with the WHO template'],
    opts: enrOpts('qos'),
  },
  {
    id: 'psur',
    axis: 'saf',
    w: 9,
    q: ['Où en est le PSUR couvrant toute la période écoulée de l’AMM ?', 'Where does the PSUR covering the entire elapsed MA period stand?'],
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
    q: ['Où en est le Site Master File de l’usine qui fabrique aujourd’hui ?', 'Where does the Site Master File of the plant manufacturing today stand?'],
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
    q: ['Où en est le dossier de lot (BMR) d’un lot réel de moins de 6 mois ?', 'Where does the batch record (BMR) of an actual batch less than 6 months old stand?'],
    why: ['Un lot réel, fabriqué dans les six mois précédant la soumission — pas un lot d’archive.', 'An actual batch, manufactured within the six months preceding submission — not an archived one.'],
    piece: ['le dossier de fabrication (BMR) d’un lot de moins de 6 mois', 'the batch record (BMR) of a batch less than 6 months old'],
  },
  {
    id: 'amm',
    axis: 'adm',
    w: 6,
    q: ['Où en est la dernière AMM en cours de validité ?', 'Where does the latest valid MA stand?'],
    why: ['La décision en cours de validité, base juridique du renouvellement.', 'The decision currently in force, the legal basis for the renewal.'],
    piece: ['la dernière AMM du produit', 'the latest MA for the product'],
  },
  {
    id: 'att',
    axis: 'adm',
    w: 7,
    q: ['Où en est l’attestation de non-modification, ou la liste chronologique des variations approuvées ?', 'Where does the statement of no change, or the chronological list of approved variations, stand?'],
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
    q: ['Où en est la preuve d’interchangeabilité ?', 'Where does the proof of interchangeability stand?'],
    why: ['Exigée pour les multisources au renouvellement.', 'Required for multisource products at renewal.'],
    piece: ["la preuve d'interchangeabilité", 'the proof of interchangeability'],
  },
  {
    id: 'ech',
    axis: 'rec',
    w: 8,
    gate: 'ech',
    q: ['Où en sont les échantillons (moitié du nombre initial) et leur certificat d’analyse ?', 'Where do the samples (half the initial number) and their certificate of analysis stand?'],
    why: [
      "Au renouvellement, l'autorité exige la moitié des échantillons de l'AMM initiale — verrou de réception.",
      'At renewal, the authority requires half the samples of the initial MA — a reception gate.',
    ],
    piece: ["les échantillons (½ du nombre initial) et le certificat d'analyse", 'the samples (½ of the initial number) and the certificate of analysis'],
    ncNote: ['Échantillons ou certificat incomplets', 'Samples or certificate incomplete'],
    opts: [
      {
        k: 'ok',
        ico: '✓',
        cls: 'ok',
        label: ['La moitié du nombre initial, avec le certificat d’analyse du lot', 'Half the initial number, with the batch certificate of analysis'],
        sub: ['Prêts à accompagner le dépôt', 'Ready to accompany the filing'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Échantillons disponibles, certificat d’analyse manquant', 'Samples available, certificate of analysis missing'],
        sub: ['Les deux sont exigés à la réception', 'Both are required at reception'],
      },
      {
        k: 'nc',
        ico: '⚠',
        cls: 'nc',
        label: ['Moins que la moitié du nombre initial', 'Fewer than half the initial number'],
        sub: ['Le compte est vérifié à la réception', 'The count is checked at reception'],
      },
      { k: 'ko', ico: '✗', cls: 'ko', label: ['Pas encore disponibles', 'Not available yet'], sub: ['À produire avant le dépôt', 'To be produced before filing'] },
    ],
  },
  {
    id: 'pay',
    axis: 'rec',
    w: 8,
    gate: 'pay',
    q: ['Où en est le paiement des frais de renouvellement ?', 'Where does the payment of the renewal fees stand?'],
    why: [
      'Verrou de réception — et les pénalités éventuelles se règlent en plus, sur quittance séparée.',
      'A reception gate — and any penalties are paid on top, with a separate receipt.',
    ],
    piece: ['la quittance de paiement des frais de renouvellement', 'the receipt for payment of the renewal fees'],
    ncNote: ['Quittance de paiement non disponible', 'Payment receipt not available'],
    opts: enrOpts('pay'),
  },
  {
    id: 'pen',
    axis: 'adm',
    w: 3,
    na: true,
    q: ['Où en est la quittance des pénalités, si votre dépôt est tardif ?', 'Where does the penalty receipt stand, if your filing is late?'],
    why: [
      'En cas de dépôt tardif, la quittance des pénalités est exigée. « Non applicable » si vous êtes dans les délais.',
      'In case of late filing, the penalty receipt is required. Choose “not applicable” if you are within the deadline.',
    ],
    piece: ['la quittance des pénalités', 'the penalty receipt'],
  },
]
