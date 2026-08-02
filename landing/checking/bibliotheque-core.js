/**
 * Bibliothèque réglementaire — LOGIQUE PURE (prix, fichier servi, commande).
 *
 * Aucun accès au DOM, aucun accès réseau : ce module est importable par le navigateur et par les
 * tests. Le contrôleur (`landing/bibliotheque.js`) n'en fait que le rendu.
 *
 * Deux règles de ce fichier sont commerciales, pas techniques, et ne se relâchent pas sans
 * arbitrage CEO :
 *   • UN PAIEMENT = UN DOCUMENT. Ni abonnement, ni crédit reportable, ni solde. Aucun compteur
 *     de mises à niveau restantes ne doit exister ici — un compteur, c'est un forfait promis.
 *   • Le prix s'affiche `29 € (19 000 FCFA)`, euro d'abord, DANS LES DEUX LANGUES.
 */

import { MODELES_FICHIERS } from "./modeles-manifest.js";

/* ══════════════════ prix ══════════════════ */

/** Barème arrêté par le CEO le 30/07/2026. Montants fixés par marché, jamais convertis à la
 *  volée : un taux qui bouge ferait varier un prix affiché sans décision commerciale. */
export const PRIX = {
  up1: { eur: 29, xof: 19000 },
  up3: { eur: 69, xof: 45000 },
};

/** Prix « plein » des trois documents pris séparément — sert le barré du bundle. */
export const PRIX_UP3_PLEIN = { eur: PRIX.up1.eur * 3, xof: PRIX.up1.xof * 3 };

/** Les séparateurs de milliers de `toLocaleString` sont des espaces INSÉCABLES (U+202F/U+00A0)
 *  selon la locale et le moteur. On les normalise par POINT DE CODE : écrits littéralement dans
 *  une regex, ces caractères sont invisibles à la relecture et se perdent au copier-coller. */
export const fmtMontant = (n, lang) =>
  n
    .toLocaleString(lang === "en" ? "en-GB" : "fr-FR")
    .replace(/[\u202F\u00A0]/g, " ");

/**
 * `29 € (19 000 FCFA)` — les DEUX devises, toujours, dans les deux langues.
 *
 * ⚠️ Ne pas revenir à une fonction qui rend l'une OU l'autre selon un drapeau : c'est ce que
 * faisait `price()` du Checking Standard, et un lecteur ivoirien y lisait un prix en euros sans
 * savoir ce qu'il paierait réellement.
 */
export const prixDouble = (p, lang) =>
  `${fmtMontant(p.eur, lang)} € (${fmtMontant(p.xof, lang)} FCFA)`;

/** Montant seul, pour un bouton où le libellé porte déjà le contexte. */
export const prixCourt = (p, lang) => `${fmtMontant(p.eur, lang)} €`;

/* ══════════════════ fichier servi ══════════════════ */

/**
 * Les pays pour lesquels ce document est RÉELLEMENT servi, dans l'ordre du référentiel.
 *
 * Tous les documents ne couvrent pas les huit pays : une obligation nationale (la déclaration DMF
 * de l'AIRP, par exemple) n'existe que sous son drapeau. Proposer les huit ferait échouer
 * `fichierModele` sur les sept autres — et surtout, laisserait croire à une exigence qui n'existe
 * pas. Un document qui ne varie pas rend `[]` : il n'y a pas de pays à choisir.
 */
export function paysDuModele(slug) {
  const m = MODELES_FICHIERS[slug];
  if (!m) throw new Error(`modèle inconnu « ${slug} »`);
  if (!m.perPays) return [];
  // Clés d'activité (`ci-enr`) réduites au code pays, sans doublon et dans l'ordre rencontré.
  return [...new Set(Object.keys(m.fichiers).map((k) => k.split("-")[0]))];
}

/**
 * Les pays sous le drapeau desquels ce document est PROPOSÉ — question différente de
 * `paysDuModele`, qui répond « y a-t-il un pays à choisir ? ».
 *
 * Un document qui ne varie pas rend `[]` là-haut ; ici il rend quand même sa liste, car il est bel
 * et bien proposé à ces pays-là. Sans cette distinction, un fichier commun (`*`) se lisait « servi
 * partout » : la maquette Notice de l'ABMed serait apparue dans le dossier nigérian, sous une
 * autorité qui ne l'a jamais publiée.
 */
export function paysServisPar(slug) {
  const m = MODELES_FICHIERS[slug];
  if (!m) throw new Error(`modèle inconnu « ${slug} »`);
  return m.pays ?? [];
}

/**
 * Le fichier à servir pour un document, un pays et — quand le document se décline — une activité.
 *
 * ⚠️ Un document déclaré `perPays` DOIT avoir une entrée par pays ; on échoue plutôt que de
 * retomber sur un autre pays en silence — servir le RCP béninois à un déposant sénégalais
 * enverrait `vigilances.abmed@gouv.bj` dans un dossier sénégalais. Même règle pour l'activité :
 * la lettre de PGHT d'un renouvellement ne peut pas sortir en disant « enregistrement ».
 *
 * @param {string} slug       `rcp`, `lettre-pght`, …
 * @param {string} pays       Code pays (`bj`, …). Ignoré si le document ne varie pas.
 * @param {string} [activite] `enr` ou `renouv`, pour les documents à `activites`.
 */
export function fichierModele(slug, pays, activite) {
  const m = MODELES_FICHIERS[slug];
  if (!m) throw new Error(`modèle inconnu « ${slug} »`);
  if (!m.perPays) return m.fichiers["*"];
  if (m.activites) {
    const a = activite ?? m.activites[0];
    if (!m.activites.includes(a))
      throw new Error(
        `modèle « ${slug} » : activité « ${a} » hors du champ de ce document`,
      );
    const f = m.fichiers[`${pays}-${a}`];
    if (!f)
      throw new Error(
        `modèle « ${slug} » : aucun fichier pour « ${pays}-${a} »`,
      );
    return f;
  }
  const f = m.fichiers[pays];
  if (!f)
    throw new Error(
      `modèle « ${slug} » : aucun fichier pour le pays « ${pays} »`,
    );
  return f;
}

/** Les activités que ce document distingue, ou `null` — la variation ne concerne pas le PGHT. */
export const activitesDe = (slug) => MODELES_FICHIERS[slug]?.activites ?? null;

/** Vrai si changer de pays change réellement le fichier téléchargé — l'interface ne doit pas
 *  laisser croire à une variation là où il n'y en a pas. */
export const varieParPays = (slug) => Boolean(MODELES_FICHIERS[slug]?.perPays);

/** Taille lisible, sans dépendance : `8,4 Mo`. */
export function tailleLisible(octets, lang) {
  const mo = octets / (1024 * 1024);
  if (mo >= 1)
    return `${fmtMontant(Math.round(mo * 10) / 10, lang)} ${lang === "en" ? "MB" : "Mo"}`;
  return `${fmtMontant(Math.max(1, Math.round(octets / 1024)), lang)} ${lang === "en" ? "kB" : "Ko"}`;
}

/* ══════════════════ document déposé ══════════════════ */

/** Extensions acceptées à la mise à niveau. Un scan est un PDF : il passe par la même porte. */
export const EXTENSIONS = [".pdf", ".doc", ".docx"];

/** 40 Mo — au-delà, le navigateur peinerait à conserver le fichier et l'OCR ne tiendrait pas.
 *  Le refuser AVANT paiement vaut mieux que de l'accepter puis d'échouer après encaissement. */
export const MAX_OCTETS = 40 * 1024 * 1024;

/**
 * @param {{name: string, size: number}|null} f
 * @returns {{ok: true} | {ok: false, raison: 'absent'|'extension'|'trop_gros'|'vide'}}
 */
export function validerFichier(f) {
  if (!f) return { ok: false, raison: "absent" };
  const nom = String(f.name || "").toLowerCase();
  if (!EXTENSIONS.some((e) => nom.endsWith(e)))
    return { ok: false, raison: "extension" };
  if (!f.size) return { ok: false, raison: "vide" };
  if (f.size > MAX_OCTETS) return { ok: false, raison: "trop_gros" };
  return { ok: true };
}

/* ══════════════════ commande ══════════════════ */

/** Durée de conservation du document déposé, côté navigateur. Assez large pour couvrir un
 *  paiement par virement, assez courte pour ne pas laisser un document de client traîner. */
export const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Vrai si la commande a dépassé sa durée de conservation et doit être purgée. */
export const estPerimee = (cmd, maintenant) =>
  !cmd || maintenant - cmd.cree > TTL_MS;

/** Les deux offres, et ce qu'elles couvrent. `documents` sert à écrire le libellé, jamais un
 *  solde : le second document d'un bundle se dépose après la commande, il ne se « consomme »
 *  pas sur un compteur. */
/** Les documents que la mise à niveau sait traiter — DÉRIVÉS du manifeste, jamais recopiés :
 *  un quatrième document `upgradable` ferait autrement un bundle à trois annexes qu'aucune
 *  interface ne collecte, et toute commande groupée échouerait sans qu'on sache pourquoi. */
export const TRIO_UPGRADABLE = Object.keys(MODELES_FICHIERS).filter(
  (s) => MODELES_FICHIERS[s].upgradable,
);

export const OFFRES = {
  up1: { prix: PRIX.up1, documents: 1 },
  up3: { prix: PRIX.up3, documents: 3 },
};

/**
 * Fabrique l'enregistrement de commande. `id` et `cree` sont injectés — une fonction pure se
 * teste, `crypto.randomUUID()` et `Date.now()` appartiennent à l'appelant.
 *
 * @param {{doc: string, pays: string, activite: string, offre: string, fichier: File|Blob,
 *          nomFichier: string, octets: number, id: string, cree: number,
 *          annexes?: Array<{doc: string, fichier: File|Blob}>}} p
 */
export function nouvelleCommande(p) {
  if (!OFFRES[p.offre]) throw new Error(`offre inconnue « ${p.offre} »`);
  if (!MODELES_FICHIERS[p.doc])
    throw new Error(`document inconnu « ${p.doc} »`);
  if (p.activite !== "amm" && p.activite !== "renouv") {
    // Le pays et l'activité entrent dans le prompt de CHAQUE rubrique : les laisser passer vides
    // produirait un document mis à niveau sur un contexte que personne n'a choisi.
    throw new Error(`activité inconnue « ${p.activite} »`);
  }
  // Le bundle vend TROIS documents : la commande doit les porter tous les trois, sinon on
  // encaisse puis on réclame le reste par e-mail — le client travaille après avoir payé.
  const annexes = Array.isArray(p.annexes) ? p.annexes : [];
  for (const a of annexes) {
    if (!MODELES_FICHIERS[a?.doc])
      throw new Error(`annexe inconnue « ${a?.doc} »`);
    if (!(a.fichier instanceof Blob))
      throw new Error(`annexe ${a.doc} sans fichier`);
  }
  if (p.offre !== "up3" && annexes.length > 0) {
    throw new Error("une offre à un document ne porte pas d'annexe");
  }
  if (p.offre === "up3") {
    // ⚠️ Compter les annexes ne suffit pas : `[rcp, rcp]` en ferait deux et se vendrait comme
    // « les trois documents ». La garantie vit ICI, dans la fonction qui écrit la commande —
    // jamais dans le calcul de l'affichage, qui n'engage rien.
    const attendus = TRIO_UPGRADABLE.filter((s) => s !== p.doc).sort();
    const recus = [...new Set(annexes.map((a) => a.doc))].sort();
    if (recus.join("+") !== attendus.join("+")) {
      throw new Error(
        `le bundle attend ${attendus.join(" + ")}, reçu ${recus.join(" + ") || "rien"}`,
      );
    }
  }
  return {
    id: p.id,
    cree: p.cree,
    doc: p.doc,
    pays: p.pays,
    activite: p.activite,
    offre: p.offre,
    nomFichier: p.nomFichier,
    octets: p.octets,
    fichier: p.fichier,
    annexes: annexes.map((a) => ({
      doc: a.doc,
      nomFichier: a.fichier.name,
      octets: a.fichier.size,
      fichier: a.fichier,
    })),
  };
}
