/**
 * Bibliothèque réglementaire — MENTION DE PHARMACOVIGILANCE, RUBRIQUE 4.8 DU RCP.
 *
 * SOURCE UNIQUE : `RA-source/Vigilance/INDEX-vigilance-UEMOA.md` (arbitrages CEO des 29 et
 * 30/07/2026). Ce module est la seule origine de la mention 4.8 pour la landing ET pour le
 * générateur des modèles — un modèle téléchargé ne peut donc pas diverger de ce qui est affiché.
 *
 * ⚠️ RÈGLE ABSOLUE : aucun contact qui ne figure pas explicitement dans une source déposée.
 * La mention 4.8 est recopiée telle quelle dans des dossiers d'AMM réels ; une adresse inventée
 * y survivrait au dépôt. `contact: null` n'est PAS une lacune à combler plus tard : c'est le
 * constat qu'aucune source ne publie d'adresse, et cinq pays sur huit sont dans ce cas.
 *
 * ⚠️ Med Safety n'est PAS propre au Burkina Faso (les lignes directrices AIRP 2025 la citent
 * aussi) : c'est un canal de notification, jamais un contact national. D'où `extra`, distinct de
 * `contact` — le Burkina reçoit la formule NEUTRE, complétée d'un canal.
 *
 * Aucun accès au DOM, aucune dépendance : importable par le navigateur, par le générateur Node
 * et par les tests.
 */

/** Intitulé du bloc, identique dans toutes les maquettes UEMOA. */
export const VIG_TITRE = 'Déclaration des effets indésirables suspectés'

/** Les deux phrases d'ouverture, invariables — elles ne dépendent d'aucun pays. */
export const VIG_CORPS =
  "La déclaration des effets indésirables suspectés après autorisation du médicament est " +
  'importante. Elle permet une surveillance continue du rapport bénéfice/risque du médicament.'

/** Phrase de canal quand AUCUN contact national n'est établi — libellé validé CEO le 29/07/2026. */
export const VIG_CANAL_NEUTRE =
  'Les professionnels de santé déclarent tout effet indésirable suspecté via le système national ' +
  'de pharmacovigilance.'

/** Phrase de canal quand une source publie un contact — reprise mot pour mot de la maquette ABMed. */
export const vigCanalNomme = (contact) =>
  'Les professionnels de santé déclarent tout effet indésirable suspecté via le système national ' +
  `de déclaration : ${contact}.`

/**
 * Par pays : le contact 4.8 lorsqu'une source le publie, et la source qui l'établit.
 * Les clés reprennent celles de `referentiel.js` (`PAYS[].k`) — un second jeu de codes pays
 * finirait par diverger du premier.
 *
 * @typedef {object} Vigilance
 * @property {string}      organisme  Organisme national, pour le RAPPORT et l'interface — jamais
 *                                    inséré seul dans la rubrique 4.8.
 * @property {string|null} contact    Mention nominative exacte, ou `null` si aucune source ne la
 *                                    publie (repli neutre : le cas COURANT, pas un cas dégradé).
 * @property {string|null} extra      Canal complémentaire, ajouté APRÈS la phrase de canal.
 * @property {string}      source     Fichier de `RA-source/` qui établit la mention.
 */
/** @type {Record<string, Vigilance>} */
export const VIGILANCE = {
  bj: {
    organisme: 'Agence béninoise du Médicament et des autres produits de Santé (ABMed)',
    contact:
      'Agence béninoise du Médicament et des autres produits de Santé – e-mail : vigilances.abmed@gouv.bj',
    extra: null,
    source: 'Template/RCP/ABMed_Maquette RCP_2026.pdf',
  },
  bf: {
    organisme: 'Agence nationale de Régulation pharmaceutique (ANRP)',
    contact: null,
    extra: "La notification peut se faire au moyen de l'application nationale Med Safety.",
    source: 'Vigilance/Burkina_Pharmacovigilance.pdf',
  },
  ci: {
    organisme: 'Autorité ivoirienne de Régulation pharmaceutique (AIRP)',
    contact:
      'Autorité Ivoirienne de Régulation Pharmaceutique – e-mail : pharmacovigilance@airp.ci',
    extra: null,
    source: 'Vigilance/AIRP LIGNES DIRECTRICES - VIGILANCES 2025.pdf',
  },
  gw: {
    organisme: 'Autorité nationale de réglementation pharmaceutique',
    contact: null,
    extra: null,
    source: 'Vigilance/INDEX-vigilance-UEMOA.md',
  },
  ml: {
    organisme: 'Centre national de Référence de la Pharmacovigilance (CNRP)',
    contact: null,
    extra: null,
    source: 'Vigilance/Mali_LES_MODALITES_DE_MISE_EN_OEUVRE_DE_LA_PHARMACOVIGILANCE (1).pdf',
  },
  ne: {
    organisme: 'Direction de la Pharmacie et de la Médecine traditionnelle (DPH/MT)',
    contact: null,
    extra: null,
    source: 'Vigilance/NIGER_Pharmacovigilance_Arrete-340-MAPI.pdf',
  },
  sn: {
    organisme: 'Agence sénégalaise de Réglementation pharmaceutique (ARP)',
    contact: 'Agence sénégalaise de Réglementation pharmaceutique – e-mail : vigilances@arp.sn',
    extra: null,
    source: 'Vigilance/SENEGAL_GUIDE-DE-BONNES-PRATIQUES-DE-PHARMACOVIGILANCE-1.pdf',
  },
  tg: {
    organisme: 'Autorité nationale de réglementation pharmaceutique',
    contact: null,
    extra: null,
    source: 'Vigilance/INDEX-vigilance-UEMOA.md',
  },
}

/**
 * Le bloc 4.8 complet pour un pays : un titre et ses paragraphes, prêts à être écrits dans le
 * modèle. Renvoyer des PARAGRAPHES et non une chaîne évite au générateur DOCX/PDF d'avoir à
 * redécouper du texte — un découpage sur « . » couperait « e-mail : vigilances.abmed@gouv.bj ».
 *
 * @param {string} k  Code pays (`bj`, `bf`, …).
 * @returns {{ titre: string, paragraphes: string[] }}
 */
export function mention48(k) {
  const v = VIGILANCE[k]
  if (!v) throw new Error(`vigilance: pays inconnu « ${k} »`)
  const canal = v.contact ? vigCanalNomme(v.contact) : VIG_CANAL_NEUTRE
  return {
    titre: VIG_TITRE,
    paragraphes: [`${VIG_CORPS} ${canal}`, ...(v.extra ? [v.extra] : [])],
  }
}

/** Vrai si une source publie une adresse pour ce pays — pilote l'affichage, jamais le contenu. */
export const aUnContact = (k) => Boolean(VIGILANCE[k]?.contact)
