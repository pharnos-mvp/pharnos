// Specs de conformité des documents réglementaires (U1, Regafy Upgrade).
// Source : templates officiels en vigueur (RA-source/Template/) — maquettes ABMed/Bénin 2026
// (structure harmonisée UEMOA) et modèles UEMOA New MA. Transcrites en schémas DÉCLARATIFS
// versionnés : déterministes, auditables (ALCOA++), relisibles par l'expert RA, zéro RAG.
// Toute évolution d'un template officiel = mise à jour ici, revue en PR.
//
// ⚠️ SOURCE UNIQUE PARTAGÉE : ce fichier est consommé par les Edge Functions (Deno) ET par le
// front (alias `@specs`, vite.config + tsconfig.app) pour générer les squelettes « Remplir le
// template ». TS pur uniquement — aucune API Deno/DOM ici.

export type ConformityDocType = 'cover' | 'pght' | 'rcp' | 'notice' | 'labeling'

export interface MentionSpec {
  /** Texte (ou motif) devant figurer dans la rubrique. */
  text: string
  /** Pays où la mention est obligatoire (codes ISO-2) ; absent = tous les pays. */
  requiredFor?: string[]
}

export interface RubricSpec {
  /** Numéro/identifiant officiel ('1', '4.8', 'objet', 'tableau'…). */
  id: string
  /** Titre officiel FR exact du template. */
  title: string
  /** Rubrique exigée (true) ou conditionnelle/optionnelle (false). */
  required: boolean
  children?: RubricSpec[]
  mentions?: MentionSpec[]
}

export interface ConformitySpec {
  docType: ConformityDocType
  label: string
  /** Référence du template en vigueur (traçabilité du constat). */
  reference: string
  rubrics: RubricSpec[]
  /** Règles globales énoncées au modèle (ordre, formats, tableaux). */
  rules: string[]
}

/* ───────────────────────────── RCP (maquette ABMed/UEMOA 2026) ───────────────────────────── */

const RCP_SPEC: ConformitySpec = {
  docType: 'rcp',
  label: 'RCP (Résumé des Caractéristiques du Produit)',
  reference: 'Maquette RCP ABMed/Bénin 2026 — structure harmonisée UEMOA',
  rules: [
    'Les rubriques 1 à 10 doivent être présentes, numérotées et dans cet ordre exact.',
    'Les titres de rubriques doivent reprendre les libellés officiels FR ci-dessous.',
    'La rubrique 2 présente la composition en substances actives avec dosages.',
    "La rubrique 5.1 commence par « Classe pharmacothérapeutique : … , Code ATC : … ».",
    'Le format des dates est « JJ mois AAAA » (rubriques 9 et 10).',
  ],
  rubrics: [
    { id: '1', title: 'DÉNOMINATION DU MÉDICAMENT', required: true },
    { id: '2', title: 'COMPOSITION QUALITATIVE ET QUANTITATIVE', required: true },
    { id: '3', title: 'FORME PHARMACEUTIQUE', required: true },
    {
      id: '4',
      title: 'DONNÉES CLINIQUES',
      required: true,
      children: [
        { id: '4.1', title: 'Indications thérapeutiques', required: true },
        {
          id: '4.2',
          title: "Posologie et mode d'administration",
          required: true,
          children: [
            { id: '4.2-posologie', title: 'Posologie', required: true },
            { id: '4.2-administration', title: "Mode d'administration", required: true },
          ],
        },
        { id: '4.3', title: 'Contre-indications', required: true },
        { id: '4.4', title: "Mises en garde spéciales et précautions d'emploi", required: true },
        {
          id: '4.5',
          title: "Interactions avec d'autres médicaments et autres formes d'interactions",
          required: true,
        },
        {
          id: '4.6',
          title: 'Fertilité, grossesse et allaitement',
          required: true,
          children: [
            { id: '4.6-grossesse', title: 'Grossesse', required: true },
            { id: '4.6-allaitement', title: 'Allaitement', required: true },
            { id: '4.6-fertilite', title: 'Fertilité', required: false },
          ],
        },
        {
          id: '4.7',
          title: "Effets sur l'aptitude à conduire des véhicules et à utiliser des machines",
          required: true,
        },
        {
          id: '4.8',
          title: 'Effets indésirables',
          required: true,
          mentions: [
            { text: 'Déclaration des effets indésirables suspectés' },
            {
              text: 'Agence béninoise du Médicament et des autres produits de Santé – e-mail : vigilances.abmed@gouv.bj',
              requiredFor: ['BJ'],
            },
          ],
        },
        { id: '4.9', title: 'Surdosage', required: true },
      ],
    },
    {
      id: '5',
      title: 'PROPRIÉTÉS PHARMACOLOGIQUES',
      required: true,
      children: [
        {
          id: '5.1',
          title: 'Propriétés pharmacodynamiques',
          required: true,
          mentions: [{ text: 'Classe pharmacothérapeutique' }, { text: 'Code ATC' }],
        },
        { id: '5.2', title: 'Propriétés pharmacocinétiques', required: true },
        { id: '5.3', title: 'Données de sécurité préclinique', required: true },
      ],
    },
    {
      id: '6',
      title: 'DONNÉES PHARMACEUTIQUES',
      required: true,
      children: [
        { id: '6.1', title: 'Liste des excipients', required: true },
        { id: '6.2', title: 'Incompatibilités', required: true },
        { id: '6.3', title: 'Durée de conservation', required: true },
        { id: '6.4', title: 'Précautions particulières de conservation', required: true },
        { id: '6.5', title: "Nature et contenu de l'emballage extérieur", required: true },
        {
          id: '6.6',
          title: "Précautions particulières d'élimination et de manipulation",
          required: true,
        },
      ],
    },
    { id: '7', title: "TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE", required: true },
    { id: '8', title: "NUMÉRO(S) D'AUTORISATION DE MISE SUR LE MARCHE", required: true },
    {
      id: '9',
      title: "DATE DE PREMIÈRE AUTORISATION/DE RENOUVELLEMENT DE L'AUTORISATION",
      required: true,
    },
    { id: '10', title: 'DATE DE MISE À JOUR DU TEXTE', required: true },
    {
      id: 'prescription',
      title: 'CONDITIONS DE PRESCRIPTION ET DE DÉLIVRANCE',
      required: true,
    },
  ],
}

/* ──────────────────────────── Notice (maquette ABMed 2026) ───────────────────────────────── */

const NOTICE_SPEC: ConformitySpec = {
  docType: 'notice',
  label: "Notice : information de l'utilisateur",
  reference: 'Maquette Notice ABMed/Bénin 2026 — structure harmonisée UEMOA',
  rules: [
    "Le titre « NOTICE : INFORMATION DE L'UTILISATEUR » ouvre le document, suivi de la dénomination du médicament et de la/des substance(s) active(s).",
    "L'encadré initial « Veuillez lire attentivement cette notice… » est obligatoire.",
    'La table des matières « Que contient cette notice ? » liste les sections 1 à 6.',
    'Les sections 1 à 6 doivent être présentes, numérotées et dans cet ordre exact.',
  ],
  rubrics: [
    {
      id: 'entete',
      title: "NOTICE : INFORMATION DE L'UTILISATEUR (dénomination + substance(s) active(s))",
      required: true,
    },
    {
      id: 'encadre',
      title: 'Encadré « Veuillez lire attentivement cette notice avant de prendre/d’utiliser ce médicament »',
      required: true,
    },
    { id: 'tdm', title: 'Que contient cette notice ? (table des matières 1–6)', required: true },
    {
      id: '1',
      title: 'Qu’est-ce que X et dans quels cas est-il utilisé ?',
      required: true,
      mentions: [{ text: 'Classe pharmacothérapeutique' }],
    },
    {
      id: '2',
      title: 'Quelles sont les informations à connaître avant de prendre/d’utiliser X ?',
      required: true,
      children: [
        { id: '2-jamais', title: 'Ne prenez/N’utilisez jamais X', required: true },
        { id: '2-avertissements', title: 'Avertissements et précautions', required: true },
        { id: '2-autres-medicaments', title: 'Autres médicaments et X', required: true },
        {
          id: '2-aliments',
          title: 'X avec des aliments, boissons et de l’alcool',
          required: false,
        },
        { id: '2-grossesse', title: 'Grossesse, allaitement et fertilité', required: true },
        {
          id: '2-conduite',
          title: 'Conduite de véhicules et utilisation de machines',
          required: true,
        },
      ],
    },
    {
      id: '3',
      title: 'Comment prendre/utiliser X ?',
      required: true,
      children: [
        { id: '3-posologie', title: 'Posologie (dose recommandée)', required: true },
        { id: '3-administration', title: 'Mode d’administration', required: true },
        {
          id: '3-surdose',
          title: 'Si vous avez pris/utilisé plus de X que vous n’auriez dû',
          required: true,
        },
        { id: '3-oubli', title: 'Si vous oubliez de prendre/d’utiliser X', required: true },
        { id: '3-arret', title: 'Si vous arrêtez de prendre/d’utiliser X', required: false },
      ],
    },
    {
      id: '4',
      title: 'Quels sont les effets indésirables éventuels ?',
      required: true,
      mentions: [
        {
          text: 'Comme tous les médicaments, ce médicament peut provoquer des effets indésirables, mais ils ne surviennent pas systématiquement chez tout le monde.',
        },
        { text: 'Déclaration des effets secondaires' },
      ],
    },
    {
      id: '5',
      title: 'Comment conserver X ?',
      required: true,
      mentions: [
        { text: 'Tenir ce médicament hors de la vue et de la portée des enfants.' },
        { text: 'date de péremption' },
      ],
    },
    {
      id: '6',
      title: 'Contenu de l’emballage et autres informations',
      required: true,
      children: [
        { id: '6-contenu', title: 'Ce que contient X (substances actives + excipients)', required: true },
        {
          id: '6-aspect',
          title: 'Qu’est-ce que X et contenu de l’emballage extérieur',
          required: true,
        },
        {
          id: '6-titulaire',
          title: 'Titulaire de l’autorisation de mise sur le marché (nom + adresse)',
          required: true,
        },
        { id: '6-exploitant', title: 'Exploitant de l’autorisation de mise sur le marché', required: false },
        { id: '6-fabricant', title: 'Fabricant (nom + adresse)', required: true },
        { id: '6-revision', title: 'La dernière date à laquelle cette notice a été révisée', required: true },
      ],
    },
  ],
}

/* ─────────────────────────── Étiquetage (template ABMed 2026) ────────────────────────────── */

const LABELING_SPEC: ConformitySpec = {
  docType: 'labeling',
  label: 'Étiquetage (emballage extérieur et conditionnement primaire)',
  reference: 'Template étiquetage ABMed/Bénin 2026 — structure harmonisée UEMOA',
  rules: [
    "La section A (emballage extérieur / conditionnement primaire) suit l'ordre des rubriques 1 à 17 ci-dessous.",
    'Le format des dates de fabrication/péremption est « FAB {MM/AAAA} » et « EXP {MM/AAAA} ».',
    'Les plaquettes/films thermosoudés (section B) portent au minimum : dénomination, titulaire, FAB/EXP, numéro de lot.',
    'Les petits conditionnements primaires (section C) portent au minimum : dénomination + voie, FAB/EXP, lot, contenu.',
    'Les rubriques sans objet sont marquées « Sans objet. » plutôt qu’omises.',
  ],
  rubrics: [
    { id: 'A1', title: 'DÉNOMINATION DU MÉDICAMENT (+ substance(s) active(s))', required: true },
    { id: 'A2', title: 'COMPOSITION EN SUBSTANCES ACTIVES', required: true },
    { id: 'A3', title: 'LISTE DES EXCIPIENTS', required: true },
    { id: 'A4', title: 'FORME PHARMACEUTIQUE ET CONTENU', required: true },
    {
      id: 'A5',
      title: "MODE ET VOIE(S) D'ADMINISTRATION",
      required: true,
      mentions: [{ text: 'Lire la notice avant utilisation.' }],
    },
    {
      id: 'A6',
      title: 'MISE EN GARDE — CONSERVATION HORS DE VUE ET DE PORTÉE DES ENFANTS',
      required: true,
      mentions: [{ text: 'Tenir hors de la vue et de la portée des enfants.' }],
    },
    { id: 'A7', title: 'AUTRE(S) MISE(S) EN GARDE SPÉCIALE(S), SI NÉCESSAIRE', required: false },
    {
      id: 'A8',
      title: 'DATES DE FABRICATION ET DE PÉREMPTION (FAB/EXP {MM/AAAA})',
      required: true,
    },
    { id: 'A9', title: 'PRÉCAUTIONS PARTICULIÈRES DE CONSERVATION', required: true },
    {
      id: 'A10',
      title: "PRÉCAUTIONS PARTICULIÈRES D'ÉLIMINATION DES MÉDICAMENTS NON UTILISÉS OU DES DÉCHETS",
      required: false,
    },
    {
      id: 'A11',
      title: "NOM ET ADRESSE DU TITULAIRE DE L'AUTORISATION DE MISE SUR LE MARCHE (titulaire + exploitant)",
      required: true,
    },
    { id: 'A12', title: 'NUMÉRO DU LOT (Lot {numéro})', required: true },
    { id: 'A13', title: 'CONDITIONS DE PRESCRIPTION ET DE DÉLIVRANCE', required: true },
    { id: 'A14', title: "INDICATIONS D'UTILISATION", required: false },
    { id: 'A15', title: 'INFORMATIONS EN BRAILLE', required: false },
    { id: 'A16', title: 'IDENTIFIANT UNIQUE — CODE-BARRES 2D', required: false },
    { id: 'A17', title: 'IDENTIFIANT UNIQUE — DONNÉES LISIBLES PAR LES HUMAINS (PC/SN)', required: false },
  ],
}

/* ─────────────────────── Cover letter (modèles UEMOA / ABMed officiels) ──────────────────── */

const COVER_SPEC: ConformitySpec = {
  docType: 'cover',
  label: "Lettre de demande d'AMM (cover letter)",
  reference: 'Modèle UEMOA New MA + template officiel ABMed/Bénin',
  rules: [
    "L'objet énonce la demande (« Demande d'enregistrement d'AMM du produit … » ou équivalent renouvellement/variation).",
    'Le destinataire est le Directeur Général de l’agence du pays cible, avec la ville.',
    'Les cinq informations produit (tirets) sont toutes présentes.',
    'La lettre se termine par une formule de politesse et le bloc signature (poste, nom, signature et cachet).',
    'Ville et date figurent en tête de lettre.',
  ],
  rubrics: [
    { id: 'ville-date', title: 'Ville et date', required: true },
    { id: 'destinataire', title: 'Destinataire (Directeur Général de l’agence, ville)', required: true },
    {
      id: 'objet',
      title: "Objet : Demande d'enregistrement/renouvellement/variation d'AMM du produit",
      required: true,
    },
    { id: 'ouverture', title: 'Formule d’appel (Madame / Monsieur …)', required: true },
    {
      id: 'intro',
      title: 'Paragraphe introductif (soumission du dossier de demande d’AMM)',
      required: true,
    },
    {
      id: 'produit',
      title: 'Informations produit (tirets)',
      required: true,
      children: [
        { id: 'produit-nom', title: 'Nom commercial', required: true },
        { id: 'produit-dci', title: 'DCI et dosage', required: true },
        { id: 'produit-forme', title: 'Forme et présentation', required: true },
        { id: 'produit-demandeur', title: "Nom et adresse du demandeur d'AMM", required: true },
        { id: 'produit-fabricant', title: 'Nom et adresse du fabricant', required: true },
      ],
    },
    {
      id: 'conformite',
      title: 'Mention de conformité du dossier aux directives de l’UEMOA',
      required: true,
    },
    { id: 'politesse', title: 'Formule de politesse finale', required: true },
    {
      id: 'signature',
      title: 'Bloc signature (poste, nom et prénoms, signature et cachet)',
      required: true,
    },
  ],
}

/* ───────────────────────────── PGHT (modèle UEMOA officiel) ──────────────────────────────── */

const PGHT_SPEC: ConformitySpec = {
  docType: 'pght',
  label: 'Lettre de PGHT (Prix Grossiste Hors Taxe)',
  reference: 'Modèle UEMOA PGHT New MA',
  rules: [
    "L'objet exact est « Attestation de PGHT ».",
    'Le tableau comporte les quatre colonnes : Nom commercial ; DCI et dosage ; Forme et présentation ; PGHT (FCFA).',
    'Le PGHT est exprimé en FCFA.',
    'La lettre se termine par une formule de politesse et le bloc signature (poste, nom, signature et cachet).',
  ],
  rubrics: [
    { id: 'ville-date', title: 'Ville et date', required: true },
    { id: 'destinataire', title: 'Destinataire (agence réglementaire nationale)', required: true },
    { id: 'objet', title: 'Objet : Attestation de PGHT', required: true },
    { id: 'ouverture', title: 'Formule d’appel', required: true },
    {
      id: 'demande',
      title: 'Paragraphe de demande (enregistrement AMM + PGHT consigné au tableau)',
      required: true,
    },
    {
      id: 'tableau',
      title: 'Tableau : Nom commercial | DCI et dosage | Forme et présentation | PGHT (FCFA)',
      required: true,
      mentions: [{ text: 'PGHT' }, { text: 'FCFA' }],
    },
    { id: 'politesse', title: 'Formule de politesse finale', required: true },
    { id: 'signature', title: 'Bloc signature (poste, nom, signature et cachet)', required: true },
  ],
}

/* ───────────────────────────────────── API du module ─────────────────────────────────────── */

export const CONFORMITY_SPECS: Record<ConformityDocType, ConformitySpec> = {
  cover: COVER_SPEC,
  pght: PGHT_SPEC,
  rcp: RCP_SPEC,
  notice: NOTICE_SPEC,
  labeling: LABELING_SPEC,
}

/** Mapping des docTypes Pharnos (vocabulaire module1-tree) vers une spec de conformité. */
const DOCTYPE_TO_SPEC: Record<string, ConformityDocType> = {
  cover: 'cover',
  pght: 'pght',
  rcp: 'rcp',
  notice: 'notice',
  labeling: 'labeling',
  artwork: 'labeling',
}

export function specForDocType(docType: string): ConformitySpec | null {
  const key = DOCTYPE_TO_SPEC[docType]
  return key ? CONFORMITY_SPECS[key] : null
}

/** Aplati les rubriques (avec celles des enfants) — utilitaire prompts/tests. */
export function flattenRubrics(spec: ConformitySpec): RubricSpec[] {
  const out: RubricSpec[] = []
  const walk = (rs: RubricSpec[]) => {
    for (const r of rs) {
      out.push(r)
      if (r.children) walk(r.children)
    }
  }
  walk(spec.rubrics)
  return out
}

/**
 * Rendu texte de la spec pour les prompts (vérification U3, upgrade U4, titres officiels U2) :
 * liste numérotée des rubriques avec [OBLIGATOIRE]/[optionnelle], mentions imposées filtrées
 * par pays, puis règles globales. Source UNIQUE des prompts — ne pas dupliquer ailleurs.
 */
export function specPromptText(spec: ConformitySpec, country?: string): string {
  const lines: string[] = [`Template en vigueur : ${spec.label} — ${spec.reference}.`, 'Rubriques :']
  const walk = (rs: RubricSpec[], depth: number) => {
    for (const r of rs) {
      const flag = r.required ? '[OBLIGATOIRE]' : '[optionnelle]'
      lines.push(`${'  '.repeat(depth)}- ${r.id}. ${r.title} ${flag}`)
      for (const m of r.mentions ?? []) {
        if (m.requiredFor && (!country || !m.requiredFor.includes(country))) continue
        lines.push(`${'  '.repeat(depth + 1)}• Mention imposée : « ${m.text} »`)
      }
      if (r.children) walk(r.children, depth + 1)
    }
  }
  walk(spec.rubrics, 0)
  lines.push('Règles :')
  for (const rule of spec.rules) lines.push(`- ${rule}`)
  return lines.join('\n')
}
