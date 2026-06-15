/**
 * Arborescences par défaut du Module 1 — zone UEMOA/CEDEAO.
 *
 * Deux formats réglementaires distincts :
 *  - `ectd` : « ECOWAS-WAHO eCTD Specifications v1.0 (FR) » (CEDEAO-OOAS, août 2023). Codes eCTD `m1-x-y`.
 *  - `ctd`  : Règlement UEMOA n°04-2020, Annexe 1.1 « Contenu du dossier technique » (dossier CTD papier/PDF).
 *
 * Les arbres sont **éditables par l'utilisateur** par dossier : ceci n'est que le modèle initial
 * appliqué à la création (l'expert RA peut l'ajuster).
 */

export type DossierFormat = 'ectd' | 'ctd'

export interface CtdNodeDef {
  /** Identifiant stable du nœud (assigné à la création du dossier ; survit aux renommages/déplacements). */
  id?: string
  /** Numérotation CTD, ex. "1.3.1". */
  number: string
  /** Libellé (français). */
  label: string
  /** Code eCTD (format eCTD uniquement), ex. "m1-3-1-smpc". */
  code?: string
  /** Guidance réglementaire optionnelle affichée sous le titre de la section. */
  note?: string
  /** Horodatage de validation de la section par l'utilisateur (bouton Enregistrer). */
  savedAt?: string
  children?: CtdNodeDef[]
}

/* ----------------------------- eCTD — CEDEAO/ECOWAS ----------------------------- */

export const MODULE1_ECTD_CEDEAO: CtdNodeDef[] = [
  {
    number: '1.0',
    code: 'm1-0-correspondence',
    label: 'Correspondance',
    children: [
      { number: '1.0.1', code: 'm1-0-1-cover-letter', label: "Lettre d'accompagnement" },
      { number: '1.0.2', code: 'm1-0-2-reviewer-note', label: "Note à l'évaluateur" },
      { number: '1.0.3', code: 'm1-0-3-tracking-table', label: 'Tableau de suivi du cycle de vie' },
      {
        number: '1.0.4',
        code: 'm1-0-4-authority-correspondence',
        label: "Correspondance de l'autorité réglementaire",
      },
      { number: '1.0.5', code: 'm1-0-5-response', label: "Réponse aux demandes d'information" },
      { number: '1.0.6', code: 'm1-0-6-meeting-info', label: 'Informations de réunion' },
      { number: '1.0.7', code: 'm1-0-7-request-appeal', label: "Demande de documentation d'appel" },
    ],
  },
  {
    number: '1.2',
    code: 'm1-2-admin-info',
    label: 'Informations administratives',
    children: [
      { number: '1.2.1', code: 'm1-2-1-app-form', label: 'Formulaires de demande' },
      { number: '1.2.2', code: 'm1-2-2-fee-form', label: 'Formulaires de frais' },
      {
        number: '1.2.3',
        code: 'm1-2-3-certification-attestation-form',
        label: "Formulaires de certification et d'attestation",
      },
      {
        number: '1.2.4',
        code: 'm1-2-4-compliance-site-info',
        label: 'Conformité et informations sur le site',
      },
      {
        number: '1.2.5',
        code: 'm1-2-5-auth-share-info',
        label: "Autorisation de partage d'informations",
      },
      { number: '1.2.6', code: 'm1-2-6-electronic-declaration', label: 'Déclaration électronique' },
      {
        number: '1.2.7',
        code: 'm1-2-7-trademark-ip-info',
        label: 'Marque et propriété intellectuelle',
      },
      { number: '1.2.8', code: 'm1-2-8-screening-details', label: 'Détails de présélection' },
    ],
  },
  {
    number: '1.3',
    code: 'm1-3-product-info',
    label: 'Informations sur le produit',
    children: [
      {
        number: '1.3.1',
        code: 'm1-3-1-smpc',
        label: 'Résumé des Caractéristiques du Produit (RCP)',
      },
      { number: '1.3.2', code: 'm1-3-2-pil', label: 'Notice' },
      { number: '1.3.3', code: 'm1-3-3-labels', label: 'Étiquetage (conditionnement)' },
    ],
  },
  { number: '1.4', code: 'm1-4-experts', label: 'Informations sur les experts' },
  {
    number: '1.7',
    code: 'm1-7-gmp',
    label: 'Bonnes pratiques de fabrication (BPF/GMP)',
    children: [
      {
        number: '1.7.3',
        code: 'm1-7-3-gmp-certs',
        label: 'Certificats GMP / Licences de fabrication',
        children: [
          { number: '1.7.3.1', code: 'm1-7-3-1-api', label: 'Substance active (API)' },
          { number: '1.7.3.2', code: 'm1-7-3-2-fpp', label: 'Produit fini (FPP)' },
        ],
      },
      { number: '1.7.4', code: 'm1-7-4-other-gmp', label: 'Autres documents GMP' },
    ],
  },
  {
    number: '1.8',
    code: 'm1-8-info-relating-to-pv',
    label: 'Pharmacovigilance',
    children: [
      { number: '1.8.1', code: 'm1-8-1-pv-systems', label: 'Systèmes de pharmacovigilance' },
      { number: '1.8.2', code: 'm1-8-2-risk-mngt-plan', label: 'Plan de gestion des risques' },
    ],
  },
  {
    number: '1.9',
    code: 'm1-9-individual-patient-data',
    label: 'Données patient individuelles — déclaration de disponibilité',
  },
  {
    number: '1.10',
    code: 'm1-10-foreign-reg-info',
    label: 'Informations réglementaires étrangères',
    children: [
      {
        number: '1.10.1',
        code: 'm1-10-1-status',
        label: 'Statut réglementaire régional et étranger',
      },
      {
        number: '1.10.2',
        code: 'm1-10-2-copp',
        label: 'Certificat de Produit Pharmaceutique (COPP/OMS)',
      },
      {
        number: '1.10.3',
        code: 'm1-10-3-data-set-similarities',
        label: 'Similitudes et différences du dossier',
      },
      {
        number: '1.10.4',
        code: 'm1-10-4-foreign-evaluation-reports',
        label: "Rapports d'évaluation étrangers",
      },
    ],
  },
]

/* ----------------------------- CTD papier — UEMOA (Règlement 04-2020) ----------------------------- */

export const MODULE1_CTD_UEMOA: CtdNodeDef[] = [
  { number: '1.0', label: 'Table des matières (TdM)' },
  {
    number: '1.1',
    label: 'Correspondance',
    children: [
      { number: '1.1.1', label: 'Lettre de demande' },
      { number: '1.1.2', label: 'Lettre de PGHT (Prix Grossiste Hors Taxe)' },
      { number: '1.1.3', label: "Informations sollicitées par l'Autorité de réglementation" },
      { number: '1.1.4', label: "Rencontres entre le demandeur et l'autorité" },
      { number: '1.1.5', label: 'Demande de documents relatifs aux appels/recours' },
      { number: '1.1.6', label: "Note générale à l'évaluateur" },
    ],
  },
  {
    number: '1.2',
    label: 'Informations administratives',
    children: [
      { number: '1.2.1', label: 'Formulaires de demande/soumissions' },
      { number: '1.2.2', label: "Formulaire de payement de frais d'homologation" },
      {
        number: '1.2.3',
        label: "Formulaires de certification et d'attestation",
        children: [
          {
            number: '1.2.3.1',
            label:
              'Certification de conformité aux monographies de la Pharmacopée Européenne (CEP)',
          },
          { number: '1.2.3.2', label: 'Certificat de Produit Pharmaceutique (COPP)' },
          { number: '1.2.3.3', label: "Autorisation de mise en marché du pays d'origine" },
          { number: '1.2.3.4', label: "Certificats d'analyse (COA)" },
        ],
      },
      {
        number: '1.2.4',
        label: 'Conformité et informations sur le site',
        children: [
          { number: '1.2.4.1', label: 'Bonnes pratiques de fabrication (BPF)' },
          { number: '1.2.4.2', label: 'Licence de fabrication (ML)' },
          { number: '1.2.4.3', label: 'Certificat de vente libre (FSC)' },
        ],
      },
      {
        number: '1.2.5',
        label: "Autorisation relative au partage d'informations",
        children: [{ number: '1.2.5.1', label: "Lettre d'accès au DMF" }],
      },
      {
        number: '1.2.6',
        label: 'Statut réglementaire au plan régional et international',
        children: [
          { number: '1.2.6.1', label: "AMM obtenue dans l'UEMOA / CEDEAO" },
          { number: '1.2.6.2', label: 'AMM obtenue hors UEMOA / CEDEAO' },
        ],
      },
      { number: '1.2.7', label: 'Informations post-autorisation' },
      {
        number: '1.2.8',
        label: 'Autres informations administratives',
        note: "Informations administratives sans emplacement prévu dans le format CTD. Ne doit pas contenir d'informations scientifiques.",
        children: [
          {
            number: '1.2.8.1',
            label: "Demandes de dispenses d'études de bioéquivalence",
            note: "La justification de la demande de dispense doit être soumise conformément aux lignes directrices sur les dispenses d'études de bioéquivalence.",
          },
        ],
      },
    ],
  },
  {
    number: '1.3',
    label: 'Informations sur le produit',
    children: [
      { number: '1.3.1', label: 'Résumé des caractéristiques du produit (RCP)' },
      { number: '1.3.2', label: "Notice à l'intention du patient" },
      {
        number: '1.3.3',
        label: 'Étiquettes des conditionnements',
        // Page de garde (aucun document attaché) : les pièces se classent sous les deux
        // sous-sections — primaire (étiquette/blister) et extérieur (carton, mockup).
        children: [
          { number: '1.3.3.1', label: 'Conditionnement primaire' },
          { number: '1.3.3.2', label: 'Emballage extérieur' },
        ],
      },
      { number: '1.3.4', label: 'Étiquetage étranger' },
      { number: '1.3.5', label: 'Étiquetage des produits de référence' },
    ],
  },
  {
    number: '1.4',
    label: 'Résumés régionaux',
    children: [{ number: '1.4.1', label: "Informations sur l'étude de bioéquivalence" }],
  },
]

export function getModule1Tree(format: DossierFormat): CtdNodeDef[] {
  return format === 'ectd' ? MODULE1_ECTD_CEDEAO : MODULE1_CTD_UEMOA
}

/* ----------------------------- Auto-classement (type de doc → nœud) ----------------------------- */

const NODE_BY_DOCTYPE: Record<DossierFormat, Record<string, string>> = {
  ectd: {
    rcp: '1.3.1',
    notice: '1.3.2',
    labeling: '1.3.3',
    artwork: '1.3.3',
    coa: '1.2.3',
    amm: '1.10.1',
    gmp: '1.7.3',
    ml: '1.7.3',
    copp: '1.10.2',
    fsc: '1.10.1',
    cover: '1.0.1',
    pght: '1.2.1',
  },
  ctd: {
    rcp: '1.3.1',
    notice: '1.3.2',
    labeling: '1.3.3.1',
    artwork: '1.3.3.2',
    coa: '1.2.3.4',
    amm: '1.2.6.1',
    gmp: '1.2.4.1',
    ml: '1.2.4.2',
    copp: '1.2.3.2',
    fsc: '1.2.4.3',
    cover: '1.1.1',
    pght: '1.1.2',
  },
}

export function nodeForDocType(
  format: DossierFormat,
  docType: string,
  category: 'info' | 'admin',
): string {
  const mapped = NODE_BY_DOCTYPE[format][docType]
  if (mapped) return mapped
  // Repli par catégorie : info → 1.3 (produit), admin → 1.2 (administratif).
  return category === 'info' ? '1.3' : '1.2'
}

/**
 * Type de document « probable » d'un nœud (inverse de NODE_BY_DOCTYPE) — sert à analyser une pièce
 * jointe **uploadée directement sur un nœud du workspace** : Regafy applique alors la règle du type
 * (détection de langue pour RCP/Notice/Étiquette/Artwork, validité pour les pièces admin…).
 * Exclut `cover`/`pght` (lettres générées, pas des pièces téléversées). Null si type inconnu.
 */
export function docTypeForNode(format: DossierFormat, nodeNumber: string): string | null {
  for (const [docType, node] of Object.entries(NODE_BY_DOCTYPE[format])) {
    if (node === nodeNumber && docType !== 'cover' && docType !== 'pght') return docType
  }
  return null
}

/** Ensemble des numéros présents dans un arbre (pour fiabiliser l'auto-classement). */
export function treeNodeNumbers(tree: CtdNodeDef[]): Set<string> {
  const set = new Set<string>()
  const walk = (nodes: CtdNodeDef[]) => {
    for (const n of nodes) {
      if (n.number) set.add(n.number)
      if (n.children) walk(n.children)
    }
  }
  walk(tree)
  return set
}

/**
 * Résout un numéro mappé vers un nœud **réellement présent** dans l'arbre du dossier : le nœud
 * lui-même s'il existe, sinon le plus proche **ancêtre existant** (1.2.3.2 → 1.2.3 → 1.2 → 1).
 * Garantit qu'un document auto-classé atterrit toujours sur un nœud visible et compilable, même
 * si l'arbre du dossier ne contient pas (encore) la sous-section détaillée. Repli final : `mapped`.
 */
export function resolveExistingNode(numbers: Set<string>, mapped: string): string {
  if (numbers.has(mapped)) return mapped
  const parts = mapped.split('.')
  for (let i = parts.length - 1; i >= 1; i--) {
    const anc = parts.slice(0, i).join('.')
    if (numbers.has(anc)) return anc
  }
  return mapped
}
