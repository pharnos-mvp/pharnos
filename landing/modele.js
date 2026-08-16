/* ── Page dédiée d'un modèle (/modele?doc=…) — lecteur, téléchargement, mise à niveau.
     Module ES natif, aucune étape de build. CSP `script-src 'self'` + `style-src 'self'`.

     ⚠️ INVARIANT CENTRAL — LE FICHIER DU CLIENT NE QUITTE PAS LE NAVIGATEUR AVANT LE PAIEMENT.
     Il est choisi, affiché comme déposé, conservé dans IndexedDB sous la référence de commande,
     et rien d'autre. Aucun `fetch`, aucun `FormData`, aucune requête ne le porte ici. Le premier
     envoi a lieu au RETOUR du paiement — c'est le PONT (§ « Le pont », plus bas), et il ne part
     que lorsque le SERVEUR a confirmé le règlement. `?paiement=ok` n'accorde rien.

     Parcours (spécification CEO du 31/07/2026) :
       • le document s'affiche dans un LECTEUR, colonne droite sticky ;
       • « Télécharger » demande le pays ET l'activité en popup, PUIS lance le téléchargement ;
       • « Mettre au standard » ouvre un panneau ancré au bord DROIT de l'écran. ── */

import {
  MODELES_FICHIERS,
  MODELES_PAYS,
  MODELES_VERSION,
} from "./checking/modeles-manifest.js?v=2026.10";
import { VIGILANCE } from "./checking/vigilance.js?v=2026.1";
import {
  ATTENTE_MAX_MS,
  CADENCE_RELANCE_MS,
  CLAIM_TIMEOUT_MS,
  delaiClaim,
  docTypeLivrable,
  lireClaim,
  palierAttente,
  urlLivraison,
} from "./pont/pont.js";
import {
  activitesDe,
  fichierModele,
  nouvelleCommande,
  OFFRES,
  paysDuModele,
  PRIX,
  PRIX_UP3_PLEIN,
  prixCourt,
  prixDouble,
  TTL_MS,
} from "./checking/bibliotheque-core.js?v=2026.10";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

let lang =
  window.I18N && typeof window.I18N.get === "function"
    ? window.I18N.get()
    : "fr";
const L = (v) => (Array.isArray(v) ? (v[lang === "en" ? 1 : 0] ?? v[0]) : v);

const EN = window.location.pathname.startsWith("/en/");
const PAGE_BIBLIO = EN
  ? "/en/regulatory-library"
  : "/bibliotheque-reglementaire";
/** La bibliothèque, RÉGLÉE sur le pays courant : revenir ne doit pas défaire le choix fait. */
const retourBiblio = () =>
  S.pays ? `${PAGE_BIBLIO}?pays=${encodeURIComponent(S.pays)}` : PAGE_BIBLIO;

/**
 * Origine de la boutique — REPLI seulement : le parcours nominal passe par l'Edge `checkout`,
 * qui renvoie une page de paiement pur. Cette boutique ne se voit que si l'Edge échoue.
 *
 * `services.pharnos.com` — notre domaine de marque — est actif depuis le 02/08/2026 : CNAME
 * `services` → `cc54deb46d638802.vercel-dns-016.com` (DNS only), vérifié côté Chariow,
 * certificat TLS émis. Il doit rester JUMEAU du `frame-src` de `landing/_headers` et de
 * `HOTES_PAIEMENT` côté Edge — un hôte accepté d'un côté et refusé de l'autre donne un cadre
 * blanc silencieux ; le test « hôtes jumeaux » échoue si les deux listes divergent.
 */
const BOUTIQUE = "https://services.pharnos.com";

/**
 * Liens de règlement Chariow. Ce sont les liens « accès direct au paiement » (`/checkout`) : le
 * client a déjà lu l'offre ici, la page produit de la boutique ne lui apprendrait rien.
 * ⚠️ Tant qu'une offre n'a pas son lien, le bouton NE PROMET PAS un paiement : il propose d'être
 * rappelé. Renseigner ces deux valeurs suffit à ouvrir la vente.
 */
const CHECKOUT = {
  up1: `${BOUTIQUE}/prd_hf86pys5/checkout`,
  up3: `${BOUTIQUE}/prd_1u8jrq16/checkout`,
};
const checkoutOuvert = (offre) => Boolean(CHECKOUT[offre]);

/** Référence de la commande en cours de règlement, gardée côté navigateur.
 *
 *  ⚠️ Le retour de paiement ne DÉPEND PAS de ce que le prestataire veut bien renvoyer. Chariow
 *  peut relayer notre `ref`, ou ne rediriger que vers une URL fixe : dans les deux cas le client
 *  doit retrouver son document. On garde donc la référence ici AVANT de partir, et le retour la
 *  relit — `?commande=<id>` quand elle est relayée, `?paiement=ok` sinon. Sans cette ceinture,
 *  un prestataire qui n'échoit pas le paramètre ferait payer un client puis perdre son fichier.
 *  Elle n'est PAS effacée au retour : le client rafraîchit sa page de confirmation sans la perdre.
 *  Elle expire au TTL de la commande, et la commande suivante l'écrase. */
const CLE_ATTENTE = "pharnos.commande";
const marquerEnAttente = (id) => {
  try {
    localStorage.setItem(CLE_ATTENTE, JSON.stringify({ id, cree: Date.now() }));
  } catch {
    // Navigation privée ou stockage plein : la commande reste dans IndexedDB, seule la reprise
    // automatique se perd. On n'empêche pas l'achat pour autant.
  }
};
const referenceEnAttente = () => {
  try {
    const brut = localStorage.getItem(CLE_ATTENTE);
    if (!brut) return null;
    const { id, cree } = JSON.parse(brut);
    // Au-delà de la durée de conservation, la commande a été purgée : la référence ne vaut plus.
    return Date.now() - cree > TTL_MS ? null : id;
  } catch {
    return null;
  }
};

/* ══ État ══ */
const params = new URLSearchParams(window.location.search);
const docParam = params.get("doc");
const paysParam = params.get("pays");
/** Jeton de RECETTE (`?essai=…`) — présenté tel quel au serveur, qui seul décide. La page
 *  n'ouvre aucun tarif : elle transporte une chaîne. Un jeton faux ou absent fait payer le
 *  prix public, et c'est l'Edge qui l'établit, pas ce fichier. Borné : la seule chose qu'un
 *  paramètre d'URL peut faire ici, c'est occuper de la place dans une requête de 4 Ko. */
const essaiToken = (params.get("essai") ?? "").slice(0, 120);
// ⚠️ AUCUN pays ni activité par défaut (directive CEO du 31/07/2026) : un défaut silencieux
// ferait télécharger le modèle d'un pays que personne n'a choisi — et la mention 4.8 est
// nationale. Tant que les deux choix ne sont pas faits, les boutons restent inertes.
const S = {
  doc: MODELES_FICHIERS[docParam] ? docParam : "rcp",
  // `?pays=CI` en majuscules reste un code ISO valide : le rejeter renverrait au sélecteur un
  // lien parfaitement légitime.
  pays: MODELES_PAYS.some((p) => p.k === paysParam?.toLowerCase())
    ? paysParam.toLowerCase()
    : null,
  activite: null,
  fichier: null,
};
// L'activité peut venir de l'URL, comme le pays : la bibliothèque range les modèles PAR PAYS et
// pose l'activité sur les cartes qui s'y adaptent. Arriver de là, c'est avoir déjà choisi — le
// préalable ne doit pas reposer la question. Valeur inconnue → on ne devine rien.
{
  const a = params.get("activite");
  const permises = activitesDe(S.doc);
  // `S.activiteLettre` SEULE porte le vocabulaire du manifeste (`enr`/`renouv`). `S.activite`
  // appartient aux chips d'achat, qui parlent `amm`/`renouv` et dont `nouvelleCommande` REFUSE
  // toute autre valeur : y écrire « enr » ferait échouer une commande le jour où ce document
  // deviendrait payant.
  if (permises?.includes(a)) S.activiteLettre = a;
}

/** Les pays que CE document sert — un document restreint à une obligation nationale n'en a qu'un. */
const paysServis = () => paysDuModele(S.doc);
// Un `?pays=` hors des pays SERVIS par ce document (`/modele?doc=lettre-dmf&pays=bj`, un lien
// périmé, une URL bricolée) ferait échouer `fichierModele` DANS `peindre()`, appelée à
// l'amorçage : la page resterait à moitié peinte, sans lecteur et sans même le préalable qui
// aurait permis d'en sortir. On retombe donc sur « aucun pays choisi », l'état déjà prévu.
if (S.pays && paysServis().length && !paysServis().includes(S.pays))
  S.pays = null;
/** L'aperçu du lecteur a besoin d'UN fichier avant tout choix : le premier pays SERVI par ce
 *  document, jamais le premier du référentiel — chercher le Bénin sur un document que seule la
 *  Côte d'Ivoire impose ferait échouer la résolution. La première page est identique pour les pays
 *  servis ; la version téléchargée, elle, attend le choix. */
const paysApercu = () => S.pays ?? paysServis()[0] ?? MODELES_PAYS[0].k;

const nomPays = (k) =>
  L((MODELES_PAYS.find((p) => p.k === k) ?? MODELES_PAYS[0]).nom);

/** Le français accorde le possessif : « mon RCP » mais « ma notice ». */
const MON = {
  rcp: ["mon RCP", "my SmPC"],
  notice: ["ma notice", "my leaflet"],
  etiquetage: ["mon étiquetage", "my labelling"],
};
const monDoc = () => L(MON[S.doc] ?? MON.rcp);

/* ══════════════════ Rendu de la fiche ══════════════════ */

function peindre() {
  const m = MODELES_FICHIERS[S.doc];
  const f = fichierModele(S.doc, paysApercu(), S.activiteLettre);
  const v = VIGILANCE[paysApercu()];

  document.title = `${L(m.nom)} — ${L(["modèle officiel", "official template"])} · Pharnos`;
  $("#doctitle").textContent = L(m.nom);
  // Modèle officiel d'une autorité : sa PROVENANCE est celle de l'autorité (jamais la maquette
  // régionale), et on n'annonce AUCUNE mention de pharmacovigilance — le fichier est servi intact,
  // rien n'y a été injecté. L'annoncer serait affirmer une retouche qui n'a pas eu lieu.
  $("#docsub").textContent = [
    L(f.source ?? m.source),
    `${f.pages} ${f.pages > 1 ? L(["pages", "pages"]) : L(["page", "page"])}`,
    f.officiel
      ? L(["servi tel quel", "served as-is"])
      : !m.perPays
        ? L([
            "identique dans les huit pays",
            "identical across the eight countries",
          ])
        : !S.pays
          ? L([
              "réglé sur votre pays de dépôt au téléchargement",
              "set for your filing country at download",
            ])
          : // Ce qui varie n'est PAS le même selon le document : une LETTRE change de
            // destinataire, un RCP porte la mention de pharmacovigilance du pays. Annoncer une
            // mention 4.8 sur une lettre de demande décrivait un contenu qu'elle n'a jamais eu.
            m.groupe === "lettres"
            ? // `f.agence` vient du MÊME référentiel que le bloc destinataire de la lettre.
              // Lire ailleurs annonçait « l'autorité nationale » au-dessus d'un courrier qui
              // nomme la DPM/MT trois lignes plus bas.
              `${L(["adressée à", "addressed to"])} ${L(f.agence ?? MODELES_PAYS.find((p) => p.k === S.pays)?.agence ?? [""])}`
            : `${L(["mention de pharmacovigilance", "pharmacovigilance statement"])} : ${v.organisme}`,
  ].join(" · ");
  $("#doctags").innerHTML =
    `<span class="badge b-free">${esc(L(["Gratuit", "Free"]))}</span>` +
    // Drapeau DEVANT le nom, à la taille d'un emoji — même règle que sur la bibliothèque : d'une
    // page à l'autre, un pays se reconnaît au même signe, au même endroit.
    (m.perPays && S.pays
      ? `<span class="badge b-pays"><span class="fl-in" aria-hidden="true"><svg><use href="#fl-${esc(S.pays)}"/></svg></span>${esc(nomPays(S.pays))}</span>`
      : "") +
    (m.upgradable
      ? `<span class="badge b-info">${esc(L(["Mise à niveau disponible", "Upgrade available"]))}</span>`
      : "");

  // Retour vers la bibliothèque, pays conservé — le commentaire le promettait, le code non :
  // on renvoyait au choix de pays celui qui venait de le faire.
  $("#back").href = retourBiblio();

  // Le document lui-même — le lecteur natif, sans sa barre (doublon avec la nôtre).
  const apercu = $("#docview");
  const repli = $("#docfall");
  const supporte = navigator.pdfViewerEnabled !== false;
  apercu.hidden = !supporte;
  repli.hidden = supporte;
  if (supporte)
    apercu.src = `${f.pdf}?v=${encodeURIComponent(MODELES_VERSION)}#toolbar=0&navpanes=0`;
  else {
    apercu.removeAttribute("src");
    repli.textContent = L([
      "Votre navigateur n’affiche pas les PDF dans la page. Le modèle reste téléchargeable à droite, en PDF et en Word.",
      "Your browser does not display PDFs inline. The template is still downloadable on the right, as PDF and Word.",
    ]);
  }

  // Note de la barre du lecteur : ce que contient le téléchargement. Un modèle OFFICIEL servi
  // tel quel l'annonce — on ne fabrique rien sur le document d'une autorité.
  const fOff = Boolean(
    fichierModele(S.doc, paysApercu(), S.activiteLettre)?.officiel,
  );
  $("#dlnote").textContent = fOff
    ? L([
        "PDF officiel de l'autorité · servi tel quel · gratuit",
        "Authority's official PDF · served as-is · free",
      ])
    : m.bilingue
      ? L(["Word · FR + EN · gratuit", "Word · FR + EN · free"])
      : L(["Word · gratuit", "Word · free"]);

  // Offre — seulement pour les documents que le moteur sait mettre au standard.
  const lettre = m.groupe === "lettres";
  const genPossible =
    lettre &&
    S.pays &&
    Boolean(fichierModele(S.doc, S.pays, S.activiteLettre)?.blocs);
  $("#offre").hidden = !m.upgradable;
  $("#genlet").hidden = !genPossible;
  $("#inf").hidden = m.upgradable || genPossible;
  if (m.upgradable) {
    // Un sigle garde sa casse (« votre RCP »), un nom commun se plie à la phrase (« votre notice »).
    const court = L(m.court);
    const courtPhrase =
      court === court.toUpperCase() ? court : court.toLowerCase();
    $("#offresub").textContent = L([
      `Regafy AI reprend votre ${courtPhrase} existant et le reconstruit dans ce modèle — vous relisez, vous déposez.`,
      `Regafy AI takes your existing ${court} and rebuilds it in this template — you review, you file.`,
    ]);
    $("#p1").textContent = prixDouble(PRIX.up1, lang);
    $("#upbtn").textContent = L([
      `Mettre ${monDoc()} au standard`,
      `Bring ${monDoc()} up to standard`,
    ]);
  } else {
    // Même règle que `#docsub` : sur le fichier d'une autorité, la provenance est la sienne et on
    // n'annonce aucun réglage de notre fait — nous ne l'adressons pas, il l'est déjà.
    $("#infsub").textContent = [
      L(f.source ?? m.source),
      f.officiel
        ? L(["servi tel quel", "served as-is"])
        : m.perPays
          ? L([
              "adressé à l'autorité du pays choisi au téléchargement",
              "addressed to the authority of the country chosen at download",
            ])
          : L([
              "identique dans les huit pays",
              "identical across the eight countries",
            ]),
    ].join(" · ");
  }
}

/* ══════════════════ Téléchargement — pays et activité d'abord ══════════════════ */

function remplirPays(sel, valeur) {
  const placeholder = `<option value="" disabled ${valeur ? "" : "selected"}>${esc(
    L(["Choisissez votre pays de dépôt…", "Choose your filing country…"]),
  )}</option>`;
  // N'offrir que les pays réellement servis : proposer le Togo sur une pièce que seule l'AIRP
  // impose annoncerait une exigence togolaise inexistante, puis échouerait au téléchargement.
  const servis = paysServis();
  const offerts = servis.length
    ? MODELES_PAYS.filter((p) => servis.includes(p.k))
    : MODELES_PAYS;
  sel.innerHTML =
    placeholder +
    offerts
      .map((p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`)
      .join("");
  if (valeur) sel.value = valeur;
}

function majChips(groupe, valeur) {
  $$(groupe + " .chip").forEach((c) =>
    c.setAttribute("aria-checked", String(c.dataset.v === valeur)),
  );
}

function majDlGo() {
  $("#dlzip").disabled = !$("#dlpays").value || !S.activite;
  majDlLibelles();
}

/**
 * Ce que le bouton PROMET doit être ce que le ZIP contient. Le modèle officiel d'une autorité est
 * servi seul, en PDF : annoncer « Word FR + EN » livrerait autre chose que l'annonce. Le fichier
 * dépend du pays choisi — d'où la remise à jour à chaque changement de pays, et le repli sur la
 * nature du document tant qu'aucun pays n'est choisi.
 */
function majDlLibelles() {
  const m = MODELES_FICHIERS[S.doc];
  const pays = $("#dlpays").value;
  // `S.activite` — celle que CETTE modale capture (`#dlact`), pas `S.activiteLettre` du préalable :
  // sinon le libellé se calculerait sur « enregistrement » pendant qu'on a coché « renouvellement ».
  const f = pays ? fichierModele(S.doc, pays, S.activite) : null;
  if (f?.officiel) {
    $("#dlzip").textContent = L([
      "Télécharger — PDF officiel",
      "Download — official PDF",
    ]);
    $("#dlenote").hidden = true;
    return;
  }
  $("#dlzip").textContent = m.bilingue
    ? L(["Télécharger — Word FR + EN (ZIP)", "Download — Word FR + EN (ZIP)"])
    : L(["Télécharger — Word (ZIP)", "Download — Word (ZIP)"]);
  $("#dlenote").hidden = !m.bilingue;
}

$("#dlbtn").addEventListener("click", () => {
  const m = MODELES_FICHIERS[S.doc];
  // Pour une lettre, le préalable a déjà capturé pays et activité : servir sans re-demander.
  if (m.groupe === "lettres" && S.pays) {
    telechargerDirect();
    return;
  }
  remplirPays($("#dlpays"), S.pays);
  majChips("#dlact", S.activite);
  // `majDlGo` porte désormais les libellés (ils dépendent du pays choisi) — voir `majDlLibelles`.
  majDlGo();
  ouvrirModale("#dlm", $("#dlbtn"));
});

/**
 * Sert le fichier SANS repasser par la popup : pour une lettre, le préalable a déjà capturé le
 * pays (et l'activité quand le document se décline), les redemander serait une seconde question
 * pour la même réponse.
 *
 * ⚠️ Cette fonction était APPELÉE sans être définie (`$("#dlbtn")`, ci-dessus) : le clic sur
 * « Télécharger » levait une `ReferenceError` avalée par le listener, et les cinq lettres ne se
 * téléchargeaient pas — en silence, sans message ni fichier.
 */
function telechargerDirect() {
  const m = MODELES_FICHIERS[S.doc];
  const f = fichierModele(S.doc, S.pays, S.activiteLettre);
  // Un modèle d'autorité est un PDF servi tel quel ; les autres partent en ZIP (Word FR + EN).
  const url = f.officiel ? f.pdf : f.zip;
  const ext = f.officiel ? "pdf" : "zip";
  const a = document.createElement("a");
  // `?v=` : `/modeles/*` est mis en cache une heure — sans lui, un fichier régénéré continue
  // d'être servi depuis le cache alors que la page annonce déjà le nouveau.
  a.href = `${url}?v=${encodeURIComponent(MODELES_VERSION)}`;
  a.download = `${S.doc}${m.perPays ? `-${S.pays}` : ""}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(
    m.perPays
      ? L([
          `Modèle ${nomPays(S.pays)} téléchargé — réglé sur votre pays de dépôt.`,
          `${nomPays(S.pays)} template downloaded — set for your filing country.`,
        ])
      : L(["Modèle téléchargé.", "Template downloaded."]),
  );
}

/** Le téléchargement part d'un clic UTILISATEUR — jamais automatiquement à la fermeture de la
 *  popup. Il sert le ZIP : le Word français à déposer et, quand elle existe, la version anglaise
 *  de courtoisie qui l'annonce en première page. */
function telecharger() {
  // Ceinture en plus du `disabled` : aucun téléchargement sans choix explicite.
  if (!$("#dlpays").value || !S.activite) {
    toast(
      L([
        "Choisissez votre pays et votre activité.",
        "Choose your country and activity.",
      ]),
    );
    return;
  }
  S.pays = $("#dlpays").value;
  const m = MODELES_FICHIERS[S.doc];
  const f = fichierModele(S.doc, S.pays);
  const a = document.createElement("a");
  // Même règle que `telechargerDirect` : PDF de l'autorité tel quel, ZIP sinon ; `?v=` obligatoire
  // (cache d'une heure sur `/modeles/*`).
  a.href = `${f.officiel ? f.pdf : f.zip}?v=${encodeURIComponent(MODELES_VERSION)}`;
  a.download = `${S.doc}${m.perPays ? `-${S.pays}` : ""}.${f.officiel ? "pdf" : "zip"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  fermerModale("#dlm");
  fermerFeuille();
  peindre(); // le lecteur suit le pays choisi dans la popup
  toast(
    m.perPays
      ? L([
          `Modèle ${nomPays(S.pays)} téléchargé — réglé sur votre pays de dépôt.`,
          `${nomPays(S.pays)} template downloaded — set for your filing country.`,
        ])
      : L(["Modèle téléchargé.", "Template downloaded."]),
  );
}
$("#dlzip").addEventListener("click", telecharger);
$("#dlpays").addEventListener("change", majDlGo);
$$("#dlact .chip").forEach((c) =>
  c.addEventListener("click", () => {
    S.activite = c.dataset.v;
    majChips("#dlact", S.activite);
    majDlGo();
  }),
);

/* ══════════════════ Mise à niveau — panneau ancré à droite ══════════════════ */

function ouvrirUpgrade(declencheur) {
  // ⚠️ SEUL LE RCP EST LIVRABLE aujourd'hui : le refus tombe AVANT le paiement, où il ne coûte
  // qu'un message — le serveur refuse de toute façon au dépôt (double ceinture).
  if (!docTypeLivrable(S.doc)) {
    toast(
      L([
        "La mise à niveau de ce type de document ouvre bientôt — seul le RCP est traité pour l'instant. Écrivez-nous à contact@pharnos.com pour être prévenu.",
        "Upgrading this document type opens soon — only the SmPC is handled for now. Write to contact@pharnos.com to be notified.",
      ]),
    );
    return;
  }
  $("#upgtitle").textContent = L([
    `Mettre ${monDoc()} au standard officiel`,
    `Bring ${monDoc()} up to the official standard`,
  ]);
  // B2 — CONFIGURATION APRÈS PAIEMENT (directive CEO) : le panneau ne demande plus ni pays, ni
  // activité, ni fichier. Tout se choisit sur la page sécurisée `/u/{token}` — une seule saisie,
  // aucun transfert entre origines, et la salle d'attente marche depuis n'importe quel appareil.
  $("#upgdesc").textContent = L([
    "Regafy AI le reconstruit rubrique par rubrique. Le dépôt du document et le choix du pays se font après le paiement, sur votre page sécurisée.",
    "Regafy AI rebuilds it section by section. Uploading the document and picking the country happen after payment, on your secure page.",
  ]);
  ouvrirIdentite(offreChoisie);
  ouvrirModale("#upg", declencheur);
}

/** Bascule entre les trois états du panneau : commande (1), offre + identité (4),
 *  confirmation de retour (3 — numéro historique, il précède la fusion offre/identité).
 *  ⚠️ Aux étapes 3 et 4 le formulaire document disparaît : à l'étape 4 tout est déjà choisi
 *  (on ne laisse pas changer de fichier pendant qu'on nomme l'acheteur), à l'étape 3 la
 *  commande est passée, il n'y a plus rien à choisir ni à régler. */
function etapePanneau(n) {
  $("#upg-e3").hidden = n !== 3;
  $("#upg-e4").hidden = n !== 4;
  $("#upg-e5").hidden = n !== 5;
  // L'argumentaire reste visible sur l'écran offre + identité : c'est lui qui porte désormais
  // « le dépôt se fait après le paiement » — la seule chose que l'acheteur doit savoir ici.
  $("#upgdesc").hidden = n === 5;
  // ⚠️ Sur la confirmation, le premier élément focalisable est `#cfmback` et NON `#cfmsend` :
  // depuis le pont, ce bouton naît caché, et `focus()` sur un élément caché ne fait rien — en
  // silence. Le clavier serait resté sur `body`, sur l'écran même où l'acheteur attend une suite.
  const premier = $(
    n === 5
      ? "#paymclose"
      : n === 4
        ? "#payprenom"
        : n === 3
          ? "#cfmback"
          : "#upgclose",
  );
  if (premier) premier.focus();
}

$("#upbtn").addEventListener("click", () => ouvrirUpgrade($("#upbtn")));

// B2 — le panneau ne collecte plus AUCUN fichier : dépôt du document, pays et activité vivent
// sur `/u/{token}`, après le paiement. La collecte d'annexes du bundle est partie avec — les
// trois documents d'un `up3` se déposent eux aussi sur la page sécurisée (un maintenant, les
// deux autres avec le support tant que le compteur de dépôts reste par commande).

/* ══════════════════ Commande — le document survit au passage par le paiement ══════════════════ */

const DB_NOM = "pharnos-bibliotheque";
const DB_STORE = "commandes";

function ouvrirDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NOM, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(DB_STORE))
        r.result.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function transiger(db, mode, fn) {
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, mode);
    const out = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => res(out && "result" in out ? out.result : undefined);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

const sauverCommande = async (cmd) => {
  const db = await ouvrirDb();
  await transiger(db, "readwrite", (s) => s.put(cmd));
  db.close();
};

const lireCommande = async (id) => {
  const db = await ouvrirDb();
  const c = await transiger(db, "readonly", (s) => s.get(id));
  db.close();
  return c;
};

/** Purge au-delà de la durée de conservation — un document de client ne traîne pas sur un poste
 *  partagé. */
async function purger() {
  const db = await ouvrirDb();
  const limite = Date.now() - TTL_MS;
  await transiger(db, "readwrite", (s) => {
    const c = s.openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      if (!cur.value || cur.value.cree < limite) cur.delete();
      cur.continue();
    };
  });
  db.close();
}

/* ── Étape identité : l'acheteur se nomme dans NOTRE design, jamais dans la boutique. ── */

/** Endpoint public d'ouverture de session de paiement (Edge Supabase, verify_jwt = false).
 *  L'Edge parle seul à l'API Chariow : le navigateur nomme une OFFRE, jamais un produit. */
const CHECKOUT_API =
  "https://uhsireqwzqqymgsxuvqh.supabase.co/functions/v1/checkout";

/** Base des surfaces d'après-paiement. ⚠️ Cet hôte est le SEUL de `connect-src` (`landing/_headers`) :
 *  un `fetch` même-origine y serait bloqué, et un autre hôte aussi. */
const ORDERS_API = "https://uhsireqwzqqymgsxuvqh.supabase.co/functions/v1";

/**
 * Indicatifs proposés au paiement — les huit pays servis d'abord (le marché), puis la CEDEAO,
 * l'Afrique centrale, le Maghreb, l'Afrique de l'Est et australe, l'Europe, les Amériques,
 * le Moyen-Orient, l'Asie et l'Océanie. `[ISO, indicatif, [nom FR, nom EN]]`.
 *
 * ⚠️ Tout ISO ajouté ici doit exister dans `INDICATIFS` de `supabase/functions/_shared/
 * checkout-core.ts`, qui s'en sert pour DÉDOUBLONNER l'indicatif d'une saisie internationale.
 * Un pays présent ici et absent là-bas envoie « +229229… » au processeur, qui refuse — et le
 * refus ressemble à une faute du client. Le test « indicatifs-jumeaux » échoue si ça arrive.
 */
const INDICATIFS = [
  ["BJ", "229", ["Bénin", "Benin"]],
  ["BF", "226", ["Burkina Faso", "Burkina Faso"]],
  ["CI", "225", ["Côte d'Ivoire", "Côte d'Ivoire"]],
  ["GW", "245", ["Guinée-Bissau", "Guinea-Bissau"]],
  ["ML", "223", ["Mali", "Mali"]],
  ["NE", "227", ["Niger", "Niger"]],
  ["SN", "221", ["Sénégal", "Senegal"]],
  ["TG", "228", ["Togo", "Togo"]],
  ["GH", "233", ["Ghana", "Ghana"]],
  ["GN", "224", ["Guinée", "Guinea"]],
  ["LR", "231", ["Liberia", "Liberia"]],
  ["NG", "234", ["Nigéria", "Nigeria"]],
  ["SL", "232", ["Sierra Leone", "Sierra Leone"]],
  ["CV", "238", ["Cap-Vert", "Cape Verde"]],
  ["GM", "220", ["Gambie", "Gambia"]],
  ["MR", "222", ["Mauritanie", "Mauritania"]],
  ["TD", "235", ["Tchad", "Chad"]],
  ["CM", "237", ["Cameroun", "Cameroon"]],
  ["CF", "236", ["Centrafrique", "Central African Rep."]],
  ["CG", "242", ["Congo", "Congo"]],
  ["CD", "243", ["RD Congo", "DR Congo"]],
  ["GA", "241", ["Gabon", "Gabon"]],
  ["GQ", "240", ["Guinée équatoriale", "Equatorial Guinea"]],
  ["ST", "239", ["Sao Tomé-et-Principe", "São Tomé & Príncipe"]],
  ["AO", "244", ["Angola", "Angola"]],
  ["MA", "212", ["Maroc", "Morocco"]],
  ["DZ", "213", ["Algérie", "Algeria"]],
  ["TN", "216", ["Tunisie", "Tunisia"]],
  ["LY", "218", ["Libye", "Libya"]],
  ["EG", "20", ["Égypte", "Egypt"]],
  ["KE", "254", ["Kenya", "Kenya"]],
  ["TZ", "255", ["Tanzanie", "Tanzania"]],
  ["UG", "256", ["Ouganda", "Uganda"]],
  ["RW", "250", ["Rwanda", "Rwanda"]],
  ["BI", "257", ["Burundi", "Burundi"]],
  ["ET", "251", ["Éthiopie", "Ethiopia"]],
  ["ZA", "27", ["Afrique du Sud", "South Africa"]],
  ["MU", "230", ["Maurice", "Mauritius"]],
  ["MG", "261", ["Madagascar", "Madagascar"]],
  ["ZM", "260", ["Zambie", "Zambia"]],
  ["ZW", "263", ["Zimbabwe", "Zimbabwe"]],
  ["MZ", "258", ["Mozambique", "Mozambique"]],
  ["BW", "267", ["Botswana", "Botswana"]],
  ["NA", "264", ["Namibie", "Namibia"]],
  ["FR", "33", ["France", "France"]],
  ["BE", "32", ["Belgique", "Belgium"]],
  ["CH", "41", ["Suisse", "Switzerland"]],
  ["DE", "49", ["Allemagne", "Germany"]],
  ["ES", "34", ["Espagne", "Spain"]],
  ["PT", "351", ["Portugal", "Portugal"]],
  ["IT", "39", ["Italie", "Italy"]],
  ["NL", "31", ["Pays-Bas", "Netherlands"]],
  ["LU", "352", ["Luxembourg", "Luxembourg"]],
  ["GB", "44", ["Royaume-Uni", "United Kingdom"]],
  ["IE", "353", ["Irlande", "Ireland"]],
  ["AT", "43", ["Autriche", "Austria"]],
  ["SE", "46", ["Suède", "Sweden"]],
  ["DK", "45", ["Danemark", "Denmark"]],
  ["NO", "47", ["Norvège", "Norway"]],
  ["FI", "358", ["Finlande", "Finland"]],
  ["PL", "48", ["Pologne", "Poland"]],
  ["GR", "30", ["Grèce", "Greece"]],
  ["RO", "40", ["Roumanie", "Romania"]],
  ["US", "1", ["États-Unis", "United States"]],
  ["CA", "1", ["Canada", "Canada"]],
  ["BR", "55", ["Brésil", "Brazil"]],
  ["MX", "52", ["Mexique", "Mexico"]],
  ["AR", "54", ["Argentine", "Argentina"]],
  ["HT", "509", ["Haïti", "Haiti"]],
  ["AE", "971", ["Émirats arabes unis", "United Arab Emirates"]],
  ["SA", "966", ["Arabie saoudite", "Saudi Arabia"]],
  ["QA", "974", ["Qatar", "Qatar"]],
  ["LB", "961", ["Liban", "Lebanon"]],
  ["TR", "90", ["Turquie", "Türkiye"]],
  ["IN", "91", ["Inde", "India"]],
  ["PK", "92", ["Pakistan", "Pakistan"]],
  ["BD", "880", ["Bangladesh", "Bangladesh"]],
  ["CN", "86", ["Chine", "China"]],
  ["JP", "81", ["Japon", "Japan"]],
  ["KR", "82", ["Corée du Sud", "South Korea"]],
  ["SG", "65", ["Singapour", "Singapore"]],
  ["MY", "60", ["Malaisie", "Malaysia"]],
  ["ID", "62", ["Indonésie", "Indonesia"]],
  ["TH", "66", ["Thaïlande", "Thailand"]],
  ["VN", "84", ["Viêt Nam", "Vietnam"]],
  ["PH", "63", ["Philippines", "Philippines"]],
  ["AU", "61", ["Australie", "Australia"]],
  ["NZ", "64", ["Nouvelle-Zélande", "New Zealand"]],
];

/* ── Le champ d'indicatif : un texte cherchable, pas un menu de 88 lignes ───────────────────
   Le `<datalist>` du navigateur fait la recherche ; nous ne gardons que la traduction entre ce
   que l'acheteur LIT (« Bénin +229 ») et ce que le serveur ATTEND (« BJ »). Un libellé libre
   qui ne correspond à rien n'est jamais deviné : mieux vaut le dire que facturer sous un pays
   qu'on a supposé. ── */

/** « Bénin +229 » — ce qui s'affiche dans le champ et ce sur quoi porte la recherche. */
const libelleIndicatif = ([, code, nom]) => `${L(nom)} +${code}`;

/** ISO du pays dont le libellé (ou le seul nom) correspond à la saisie. `""` si rien ne colle.
 *  La comparaison ignore casse, accents et espaces : « cote divoire » trouve la Côte d'Ivoire. */
function isoIndicatif(saisie) {
  const norm = (x) =>
    String(x)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9+]/g, "");
  const cible = norm(saisie);
  if (!cible) return "";
  const exact = INDICATIFS.find((e) => norm(libelleIndicatif(e)) === cible);
  if (exact) return exact[0];
  // Repli : le nom seul, sans l'indicatif — l'acheteur peut avoir effacé le « +229 ».
  const parNom = INDICATIFS.find((e) => e[2].some((n) => norm(n) === cible));
  return parNom ? parNom[0] : "";
}

/** Écrit dans le champ le libellé complet d'un ISO — l'acheteur voit toujours un pays nommé. */
function poserIndicatif(iso) {
  const e = INDICATIFS.find(([i]) => i === iso);
  if (e) $("#payind").value = libelleIndicatif(e);
}

/** Indicatif retenu sur cet appareil — un acheteur garde son numéro d'un dépôt à l'autre. */
const CLE_INDICATIF = "pharnos.indicatif";

/** L'offre retenue sur l'écran offre + identité. */
let offreChoisie = "up1";

/** Peint ce qui dépend de l'OFFRE : les deux options, le récapitulatif, le bouton payer.
 *  Appelée au choix ET à l'ouverture — l'écran unique offre + identité vit de cette fonction. */
function choisirOffre(offre) {
  offreChoisie = offre;
  const m = MODELES_FICHIERS[S.doc];
  $("#off1").innerHTML =
    `<b>${esc(L(["Un document", "One document"]))}</b>` +
    `<span>${esc(`${L(m.court)} · ${prixDouble(PRIX.up1, lang)}`)}</span>`;
  // L'économie du bundle se montre SUR l'option : c'est elle qui vend, pas un écran de plus.
  $("#off3").innerHTML =
    `<b>${esc(L(["Les trois documents", "All three documents"]))}</b>` +
    `<span>${esc(L(["RCP + notice + étiquetage · ", "SmPC + leaflet + labelling · "]))}` +
    `<s>${esc(prixCourt(PRIX_UP3_PLEIN, lang))}</s> ${esc(prixDouble(PRIX.up3, lang))}</span>`;
  $$("#upg-e4 .offer-opt").forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.offre === offre)),
  );
  // B2 : le récapitulatif ne porte QUE ce qui est décidé ici — le document et l'offre. Pays,
  // activité et dépôt se choisissent après le paiement, et l'écran le DIT (note sous le récap).
  $("#payrecap").textContent = L(m.nom);
  $("#paygo").textContent = L([
    `Payer — ${prixCourt(PRIX[offre], lang)}`,
    `Pay — ${prixCourt(PRIX[offre], lang)}`,
  ]);
}

function ouvrirIdentite(offre) {
  choisirOffre(offre);
  // Reconstruite à CHAQUE ouverture (et non une fois) : les libellés portent des noms de pays
  // traduits — un panneau rouvert après bascule de langue garderait sinon l'ancienne.
  const liste = $("#payindlist");
  liste.innerHTML = "";
  for (const e of INDICATIFS) {
    const o = document.createElement("option");
    o.value = libelleIndicatif(e);
    liste.appendChild(o);
  }
  // ⚠️ L'indicatif ne se déduit PAS du pays de dépôt : un consultant RA béninois dépose au
  // Niger avec son numéro béninois — c'est la norme du métier. Déduire l'un de l'autre faisait
  // refuser le paiement par le processeur (« Niger +227 » sur un numéro béninois, vu le 31/07).
  // On garde donc le dernier indicatif choisi SUR CET APPAREIL, à défaut le premier de la liste.
  let prefere = isoIndicatif($("#payind").value);
  if (!prefere) {
    try {
      prefere = localStorage.getItem(CLE_INDICATIF) || "";
    } catch {
      /* navigation privée : on retombe sur le premier de la liste */
    }
  }
  poserIndicatif(INDICATIFS.some(([iso]) => iso === prefere) ? prefere : "BJ");
  etapePanneau(4);
}

/** Ouvre la session de paiement côté serveur. Seuls DEUX refus se disent à l'acheteur : ses
 *  champs (400) et son propre excès (429, plafond par IP). TOUT le reste — panne d'Edge,
 *  plafond global saturé, « déjà acheté » — retombe sur le lien de paiement direct : une gêne
 *  technique ou un doublon Chariow ne doivent jamais coûter une vente. */
async function sessionPaiement(cmd, identite) {
  try {
    const res = await fetch(CHECKOUT_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        offre: cmd.offre,
        ref: cmd.id,
        langue: lang,
        ...(essaiToken ? { essai: essaiToken } : {}),
        ...identite,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const { url } = await res.json();
      if (typeof url === "string" && url.startsWith("https://"))
        return { ok: true, url };
      return { repli: true };
    }
    if (res.status === 400) {
      // Le serveur nomme les champs fautifs — les siens (`prenom`…) ou ceux du processeur
      // (`phone.number`…). On garde le premier pour y renvoyer le curseur.
      const { champs } = await res.json().catch(() => ({}));
      return { erreur: "champs", champs: Array.isArray(champs) ? champs : [] };
    }
    if (res.status === 429) return { erreur: "plafond" };
    // Le SERVEUR nomme le repli, le navigateur ne le devine pas. Sur le rail merchant of record,
    // renvoyer l'acheteur vers la boutique directe le ferait payer sans TVA collectée ni reversée :
    // une gêne technique deviendrait un écart de conformité, et sans un mot dans aucun journal.
    const { repli } = await res.json().catch(() => ({}));
    if (repli === "aucun") return { erreur: "indisponible" };
    return { repli: true };
  } catch {
    // Panne réseau : le rail servi est inconnu d'ici, et une vente perdue est certaine quand un
    // repli est seulement risqué. On replie — c'est le comportement historique. Le jour où Paddle
    // encaisse seul, les liens de `CHECKOUT` disparaissent et ce chemin s'éteint de lui-même.
    return { repli: true };
  }
}

/* ── Paiement EN MODALE : la page du processeur s'affiche sur pharnos.com. ── */

let veilleRetour = null;

/** Quitte l'étape paiement et rend la main au formulaire. */
function fermerPaiement(etape = 4) {
  if (veilleRetour) {
    clearInterval(veilleRetour);
    veilleRetour = null;
  }
  // Vider le cadre AVANT de changer d'étape : une page de paiement laissée vivante derrière
  // un écran refermé continuerait sa navigation, et un OTP saisi plus tard n'irait nulle part.
  $("#paymframe").src = "about:blank";
  if (etape) etapePanneau(etape);
}

/**
 * Affiche le paiement DANS le panneau et guette le retour.
 *
 * Le processeur redirige, une fois payé, vers `RETOURS[lang]` — une page de pharnos.com, donc
 * de MÊME origine que le parent : c'est le seul moment où `contentWindow.location` devient
 * lisible. Tant que le cadre est chez le processeur, la lecture lève (cross-origin) — c'est
 * attendu, on l'avale. Aucun `postMessage` n'est possible : la page du processeur n'est pas
 * la nôtre et n'en émet pas.
 */
function ouvrirPaiement(url, cmd) {
  const cadre = $("#paymframe");
  $("#paymtab").href = url;
  cadre.src = url;
  $("#upgtitle").textContent = L(["Paiement sécurisé", "Secure payment"]);
  etapePanneau(5);
  if (veilleRetour) clearInterval(veilleRetour);
  veilleRetour = setInterval(() => {
    let ici = null;
    try {
      ici = cadre.contentWindow?.location?.href ?? null;
    } catch {
      return; // encore chez le processeur — rien à lire, rien à faire
    }
    if (!ici || ici === "about:blank") return;
    if (!ici.includes("paiement=ok") && !ici.includes("commande=")) return;
    // Le document est déjà sous les yeux du client : on ne recharge pas la page, on bascule
    // simplement sur la confirmation — c'est le même écran qu'un retour par navigation.
    fermerPaiement(0);
    ouvrirConfirmation(cmd);
    sauverCommande({ ...cmd, regle: true, regleeLe: Date.now() }).catch((e) =>
      console.error("statut commande", e),
    );
  }, 700);
}
$("#paymclose").addEventListener("click", () => fermerPaiement(4));

let enCours = false;
async function acheter(offre) {
  if (enCours) return;
  const identite = {
    prenom: $("#payprenom").value.trim(),
    nom: $("#paynom").value.trim(),
    email: $("#payemail").value.trim(),
    telephone: $("#paytel").value.trim(),
    paysTel: isoIndicatif($("#payind").value),
  };
  // Le nom du champ métier n'est PAS l'id du nœud (`telephone` → `#paytel`) : la table évite
  // un focus sur un sélecteur fantôme.
  const CHAMP_ID = {
    prenom: "payprenom",
    nom: "paynom",
    email: "payemail",
    telephone: "paytel",
    paysTel: "payind",
  };
  // Le champ d'indicatif accepte une saisie libre : une valeur qui ne se résout pas est une
  // faute à dire, jamais un pays à deviner — on ne facture pas sous un drapeau supposé.
  if (!identite.paysTel) {
    toast(
      L([
        "Choisissez le pays de votre indicatif dans la liste.",
        "Pick your dialling code country from the list.",
      ]),
    );
    $("#payind").focus();
    return;
  }
  const manquant = ["prenom", "nom", "email", "telephone"].find(
    (k) => !identite[k],
  );
  if (manquant || !$("#payemail").checkValidity()) {
    toast(
      L([
        "Complétez vos coordonnées — les livrables partent à cet e-mail.",
        "Fill in your details — the deliverables go to this e-mail.",
      ]),
    );
    $(`#${CHAMP_ID[manquant ?? "email"]}`).focus();
    return;
  }
  enCours = true;
  const bouton = $("#paygo");
  const libelle = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = L(["Ouverture du paiement…", "Opening payment…"]);
  try {
    const cmd = nouvelleCommande({
      doc: S.doc,
      offre,
      id: crypto.randomUUID(),
      cree: Date.now(),
    });
    // B2 : la commande locale ne porte plus AUCUN fichier — seulement la référence et le choix,
    // pour le récapitulatif du retour de paiement. La salle d'attente sait de toute façon
    // travailler sans elle (`?commande=<ref>` suffit, depuis n'importe quel appareil).
    // L'identité n'est PAS conservée : elle ne sert qu'à la session, Chariow en est dépositaire.
    await sauverCommande(cmd);

    const session = await sessionPaiement(cmd, identite);
    if (session.erreur === "plafond") {
      toast(
        L([
          "Trop de tentatives depuis votre connexion — réessayez dans une heure.",
          "Too many attempts from your connection — try again in an hour.",
        ]),
      );
      return;
    }
    if (session.erreur === "champs") {
      // Le refus le plus fréquent : un numéro qui ne colle pas à l'indicatif choisi. Un
      // déposant béninois qui dépose au Niger garde son numéro béninois — le dire, plutôt
      // que de le renvoyer vers un formulaire qui le refusera pareil.
      const tel = (session.champs ?? []).some((c) =>
        String(c).includes("phone"),
      );
      toast(
        tel
          ? L([
              "Ce numéro ne correspond pas à l'indicatif choisi — vérifiez les deux.",
              "This number does not match the selected dialling code — check both.",
            ])
          : L([
              "Vérifiez vos coordonnées (e-mail et téléphone).",
              "Check your details (e-mail and phone).",
            ]),
      );
      $(tel ? "#paytel" : "#payemail").focus();
      return;
    }
    if (session.erreur === "indisponible") {
      // Le serveur a fermé la vente sur son rail et INTERDIT le repli. Le dire franchement vaut
      // mieux qu'un tunnel de secours qui encaisserait sous un régime fiscal différent.
      toast(
        L([
          "Le paiement est momentanément indisponible — réessayez dans quelques minutes.",
          "Payment is briefly unavailable — please try again in a few minutes.",
        ]),
      );
      return;
    }
    // La référence d'attente se pose au moment de PARTIR, jamais avant : une tentative
    // refusée ne doit pas laisser traîner un marqueur « paiement en cours ».
    if (session.ok) {
      marquerEnAttente(cmd.id);
      ouvrirPaiement(session.url, cmd);
      return;
    }
    // Repli : la boutique encaisse en direct, référence relayée dans l'URL. Moins beau,
    // jamais bloquant — y compris pour un « déjà acheté » Chariow, qui n'est pas notre refus.
    if (checkoutOuvert(offre)) {
      marquerEnAttente(cmd.id);
      const u = new URL(CHECKOUT[offre]);
      // Référence opaque, jamais de donnée personnelle en clair dans une URL.
      u.searchParams.set("ref", cmd.id);
      ouvrirPaiement(u.toString(), cmd);
      return;
    }
    ouvrirRappel(cmd);
  } catch (e) {
    // Échouer fort : si la commande n'a pas pu être conservée, la promettre serait mentir.
    console.error("commande", e);
    toast(
      L([
        "Impossible d’enregistrer la commande sur cet appareil.",
        "Could not record the order on this device.",
      ]),
    );
  } finally {
    // Le paiement s'ouvre en modale : la page reste vivante, le bouton reprend son état.
    // Le double-clic est déjà tenu par `enCours` pendant l'appel, et par la modale ensuite.
    enCours = false;
    bouton.disabled = false;
    bouton.textContent = libelle;
  }
}
$$("#upg-e4 .offer-opt").forEach((b) =>
  b.addEventListener("click", () => choisirOffre(b.dataset.offre)),
);
$("#payind").addEventListener("change", () => {
  // On ne retient QUE ce qui se résout : mémoriser une saisie libre reviendrait à la reproposer
  // à la visite suivante, toujours aussi invalide.
  const iso = isoIndicatif($("#payind").value);
  if (!iso) return;
  poserIndicatif(iso);
  try {
    localStorage.setItem(CLE_INDICATIF, iso);
  } catch {
    /* le choix vaut pour cette session, c'est déjà l'essentiel */
  }
});
// `submit` et non `click` : Entrée dans n'importe quel champ vaut « Payer ».
$("#payform").addEventListener("submit", (e) => {
  e.preventDefault();
  acheter(offreChoisie);
});
// B2 : l’écran offre + identité est le PREMIER du panneau — « retour » le referme.
$("#payretour").addEventListener("click", () => fermerModale("#upg"));

/** Le courriel qui porte la commande : sa référence, ce qui a été choisi, ce qui a été réglé.
 *  Le document N'EST PAS joint par nous — le navigateur ne sait pas le faire, et c'est très bien
 *  ainsi : c'est le client qui l'attache, en connaissance de cause. */
function mailtoCommande(cmd) {
  const m = cmd.doc ? MODELES_FICHIERS[cmd.doc] : null;
  const docNom = m ? L(m.nom) : L(["Mise à niveau documentaire", "Document upgrade"]);
  const sujet = L([
    `Mise à niveau — ${cmd.id.slice(0, 8)}`,
    `Upgrade — ${cmd.id.slice(0, 8)}`,
  ]);
  const offre = cmd.offre && OFFRES[cmd.offre]
    ? prixDouble(OFFRES[cmd.offre].prix, lang)
    : "";
  const corps = L([
    `Document : ${docNom}
Offre : ${offre}
Référence : ${cmd.id}`,
    `Document: ${docNom}
Offer: ${offre}
Reference: ${cmd.id}`,
  ]);
  return `mailto:contact@pharnos.com?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

/** Sans lien de règlement configuré, la commande part par e-mail avec sa référence — le
 *  document, lui, reste sur l'appareil, il n'est pas joint. Dès que les liens Chariow sont
 *  posés dans CHECKOUT, ce repli disparaît de lui-même. */
function ouvrirRappel(cmd) {
  window.location.href = mailtoCommande(cmd);
  toast(
    L([
      "Votre document reste sur cet appareil — nous ne l’avons pas reçu.",
      "Your document stays on this device — we have not received it.",
    ]),
  );
}

/** Confirmation de retour de paiement. Elle dit ce que nous SAVONS, et le PONT fait le reste :
 *  il attend que le serveur ait vu le règlement, envoie le document, puis emmène l'acheteur sur sa
 *  page de suivi. Elle ne prétend jamais avoir reçu ce qui n'est pas encore parti. */
function ouvrirConfirmation(cmd) {
  const m = cmd.doc ? MODELES_FICHIERS[cmd.doc] : null;
  $("#upgtitle").textContent = L([
    `Commande ${cmd.id.slice(0, 8)}`,
    `Order ${cmd.id.slice(0, 8)}`,
  ]);
  $("#upgdesc").textContent = L([
    "Merci — nous confirmons votre règlement.",
    "Thank you — we are confirming your payment.",
  ]);
  const trois = cmd.offre === "up3";
  // B2 : le récapitulatif ne nomme que ce qui est SU — une salle d'attente ouverte sur un autre
  // appareil (`?commande=<ref>`) ne connaît ni le document ni l'offre, et ne les invente pas.
  $("#cfmrecap").textContent = m
    ? `${L(m.nom)} · ${trois ? L(["les trois documents", "all three documents"]) : L(["un document", "one document"])}`
    : L(["Votre commande est en cours de confirmation.", "Your order is being confirmed."]);
  if (trois) {
    $("#cfmdesc-trio").hidden = false;
    $("#cfmdesc-trio").textContent = L([
      `Le dépôt des documents se fait sur votre page sécurisée. Un document s'y traite maintenant ; pour les deux autres du lot, écrivez-nous à contact@pharnos.com en rappelant la référence ${cmd.id.slice(0, 8)} — ils sont compris dans votre commande.`,
      `Documents are uploaded on your secure page. One document is processed there now; for the two others in the bundle, write to contact@pharnos.com quoting reference ${cmd.id.slice(0, 8)} — they are included in your order.`,
    ]);
  } else {
    $("#cfmdesc-trio").hidden = true;
  }
  // ⚠️ NE JAMAIS annoncer une réception qui n'a pas eu lieu : c'est `franchirLePont` qui écrit
  // ici, état par état — et le LIEN de livraison s'affichera À L'ÉCRAN dès qu'il existe (C2).
  $("#cfmsend").hidden = true;
  $("#cfmlink").hidden = true;
  const retour = $("#cfmback");
  retour.href = retourBiblio();
  retour.textContent = L(["Retour à la bibliothèque", "Back to the library"]);
  etapePanneau(3);
  ouvrirModale("#upg", null);
  franchirLePont(cmd);
}

/* ══ Le pont — du règlement à la page de livraison ══
 *
 * Trois gestes, dans cet ordre, et l'ordre est la spécification :
 *
 *   1. **Attendre que le SERVEUR ait vu le règlement.** Le Pulse Chariow peut arriver après le
 *      client ; `order-claim` répond « pas encore » tant que la commande n'existe pas. Rien ici
 *      n'accorde de droit : `?paiement=ok` ne fait que déclencher cette interrogation.
 *   2. **Envoyer le document**, sur une URL signée que le serveur calcule.
 *   3. **Emmener l'acheteur sur `app.pharnos.com/u/{token}`**, où tout l'après-paiement se passe.
 *
 * Si l'un des trois échoue, l'e-mail n°1 porte le même lien : le parcours n'est jamais sans issue,
 * et le message le DIT plutôt que de laisser un sablier tourner. */

/** Le pont ne se franchit qu'une fois : la confirmation peut s'ouvrir deux fois (guet du cadre,
 *  puis reprise au chargement), et deux ponts en parallèle demanderaient deux URL de dépôt —
 *  donc consommeraient DEUX dépôts sur les trois d'une commande payée. */
let pontEnCours = false;

/** Ce que l'acheteur lit pendant que le pont travaille. */
function direPont(texte, note) {
  $("#cfmnext").textContent = texte;
  $("#cfmfoot").textContent = note ?? "";
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Appel JSON d'une surface d'après-paiement. Rend `{ status, corps }` — un échec réseau devient
 *  `status: 0`, jamais une exception : le pont décide, il ne se laisse pas interrompre. */
async function appelOrders(chemin, corps, delaiMs = 20000) {
  try {
    const res = await fetch(`${ORDERS_API}/${chemin}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(delaiMs),
    });
    const lu = await res.json().catch(() => ({}));
    return { status: res.status, corps: lu };
  } catch {
    return { status: 0, corps: {} };
  }
}

/** Étape 1 — le jeton, contre la référence, dès que le webhook est passé.
 *
 *  ⚠️ La borne est une ÉCHÉANCE, pas un compteur de pauses. `ATTENTE_MAX_MS` ne totalisait que les
 *  `dormir()` : chaque tentative pouvait ajouter 20 s de délai réseau, soit ~7 minutes réelles sous
 *  un écran qui promet « quelques secondes ». Une boucle dont la borne ignore le temps passé dans
 *  ses appels n'est pas bornée. */
async function reclamerJeton(ref) {
  const fin = Date.now() + ATTENTE_MAX_MS;
  for (let essai = 0; ; essai++) {
    const attente = delaiClaim(essai);
    if (attente === null || Date.now() > fin) return { etat: "trop_long" };
    if (attente) await dormir(attente);
    const { status, corps } = await appelOrders(
      "order-claim",
      { ref },
      CLAIM_TIMEOUT_MS,
    );
    const lu = lireClaim(status, corps);
    if (lu.etat !== "attente") return lu;
  }
}

// B2 — le pont n'envoie plus AUCUN document : le dépôt vit sur `/u/{token}`, après paiement.
// Le transfert inter-origines (téléversement + pays/activité depuis la landing) est parti avec —
// et avec lui la réservation de dépôt en IndexedDB : plus rien ne se consomme depuis cette page.

/** L'issue de secours, et elle n'est jamais vide : l'e-mail n°1 porte le même lien de suivi. */
function renvoyerVersEmail(texte) {
  direPont(
    texte,
    L([
      "Votre règlement est bien enregistré — rien n'est perdu.",
      "Your payment is recorded — nothing is lost.",
    ]),
  );
  $("#cfmsend").hidden = true;
}

async function franchirLePont(cmd) {
  if (pontEnCours) return;
  pontEnCours = true;
  let minuterie = null;
  try {
    // C2 — LA SALLE D'ATTENTE : elle réclame plusieurs minutes, affiche l'état, et ne se tait
    // jamais. Le message suit le temps écoulé (paliers du pont) — la cadence de la boucle, elle,
    // est calibrée pour SURVIVRE à deux périodes du cron de réconciliation : même un Pulse jamais
    // livré (première vente réelle) voit sa commande naître pendant que l'acheteur attend ici.
    const debut = Date.now();
    // ⚠️ `#cfmnext` est `aria-live="polite"` : réécrire le MÊME texte toutes les 5 s ferait
    // ré-annoncer ~66 fois la même phrase à un lecteur d'écran. On ne repeint qu'au CHANGEMENT
    // de palier.
    let palierCourant = null;
    const peindreAttente = () => {
      const p = palierAttente(Date.now() - debut);
      if (p === palierCourant) return;
      palierCourant = p;
      direPont(L(p.texte), L(p.note));
    };
    peindreAttente();
    minuterie = setInterval(peindreAttente, 5000);

    let jeton = await reclamerJeton(cmd.id);
    // C4 — UNE relance courte avant tout repli : la réconciliation a pu faire naître la commande
    // à la dernière seconde. Silencieuse — l'acheteur a déjà son message de palier.
    if (jeton.etat === "trop_long") jeton = await relancerJeton(cmd.id);
    clearInterval(minuterie);
    minuterie = null;

    if (jeton.etat === "expire") {
      renvoyerVersEmail(
        L([
          "Le lien de cette commande a expiré. Écrivez-nous à contact@pharnos.com avec votre référence.",
          "This order's link has expired. Write to contact@pharnos.com with your reference.",
        ]),
      );
      return;
    }
    if (jeton.etat === "voir_email") {
      // La commande EXISTE — c'est le plafond de jetons qui est atteint —, donc l'e-mail n°1 est
      // bien parti. Ici, l'affirmer est vrai.
      renvoyerVersEmail(
        L([
          "Nous vous avons envoyé par e-mail le lien de suivi de cette commande — ouvrez-le pour déposer votre document.",
          "We have e-mailed you this order's tracking link — open it to upload your document.",
        ]),
      );
      return;
    }
    if (jeton.etat !== "pret") {
      // C4 — LE REPLI EST HONNÊTE, ET JAMAIS EN RECETTE. Recevoir « pas encore » pendant toute la
      // salle d'attente ET la relance signifie que la commande N'EXISTE PAS côté serveur : ni
      // webhook, ni réconciliation. En recette, c'est une PANNE FRANCHE à afficher — la promesse
      // d'un e-mail masquerait précisément ce que la recette existe pour voir. En réel, on donne
      // la référence — la seule chose que l'acheteur possède et que le support sait retrouver.
      if (essaiToken) {
        direPont(
          L([
            "[RECETTE] La confirmation n'est pas arrivée : ni le webhook ni la réconciliation n'ont fait naître la commande. C'est une panne franche du rail — rien ne partira par e-mail.",
            "[TEST] Confirmation never arrived: neither the webhook nor the reconciliation created the order. This is a hard rail failure — nothing will be e-mailed.",
          ]),
          L([`Référence ${cmd.id}.`, `Reference ${cmd.id}.`]),
        );
        $("#cfmsend").hidden = true;
        return;
      }
      renvoyerVersEmail(
        L([
          `Votre règlement est enregistré, mais notre confirmation tarde. Référence ${cmd.id} — si vous ne recevez rien d'ici une heure, écrivez-nous à contact@pharnos.com en la citant.`,
          `Your payment is recorded, but our confirmation is delayed. Reference ${cmd.id} — if you receive nothing within the hour, write to contact@pharnos.com quoting it.`,
        ]),
      );
      return;
    }

    // C2 — LE LIEN S'AFFICHE À L'ÉCRAN (l'e-mail n'est qu'un filet), puis la page s'ouvre seule.
    // ⚠️ `replace` et NON `href` : depuis `/u/{token}`, le geste « Retour » ramènerait sur
    // `?paiement=ok`, où `reprendre()` rejouerait tout le pont — un jeton de plus frappé
    // (plafond de 12 par commande). La page de retour n'est pas une étape à revisiter.
    const lien = urlLivraison(jeton.token, window.location.hostname);
    direPont(
      L(["Votre commande est confirmée.", "Your order is confirmed."]),
      L(["Nous ouvrons votre page sécurisée…", "Opening your secure page…"]),
    );
    const a = $("#cfmlink");
    a.href = lien;
    a.hidden = false;
    a.focus();
    // 3,5 s : le temps de LIRE « votre commande est confirmée » et de voir le bouton — un lien
    // affiché 900 ms n'existe que pour la conscience du développeur. La redirection reste
    // automatique : le clic n'est qu'un filet si elle échoue.
    setTimeout(() => window.location.replace(lien), 3500);
  } catch (e) {
    console.error("pont", e);
    renvoyerVersEmail(
      L([
        "Nous vous avons envoyé par e-mail le lien de suivi de cette commande.",
        "We have e-mailed you this order's tracking link.",
      ]),
    );
  } finally {
    if (minuterie) clearInterval(minuterie);
    pontEnCours = false;
  }
}

/** C4 — la rafale de relance : courte, silencieuse, après l'échéance de la salle d'attente. */
async function relancerJeton(ref) {
  for (const attente of CADENCE_RELANCE_MS) {
    await dormir(attente);
    const { status, corps } = await appelOrders("order-claim", { ref }, CLAIM_TIMEOUT_MS);
    const lu = lireClaim(status, corps);
    if (lu.etat !== "attente") return lu;
  }
  return { etat: "trop_long" };
}

/** Retour de paiement : on retrouve le document conservé, on le remet sous les yeux du client, et
 *  la confirmation lance le PONT. Un rafraîchissement de cette page repasse par le même chemin —
 *  `order-claim` est idempotent côté commande, et `pontEnCours` empêche deux ponts en parallèle. */
async function reprendre() {
  // `?commande=` si le prestataire relaie notre référence ; sinon `?paiement=ok` et la référence
  // gardée avant le départ. Les deux chemins mènent à la même salle d'attente.
  const ref =
    params.get("commande") ??
    (params.get("paiement") ? referenceEnAttente() : null);
  if (!ref) return;
  // ⚠️ La référence se VALIDE avant d'ouvrir la salle d'attente : nos références sont des UUID
  // (`crypto.randomUUID`). Sans ce filtre, `?commande=nimportequoi` ouvrait cinq minutes de
  // « nous confirmons votre règlement » et ~40 appels à `order-claim` pour une chaîne inventée.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return;
  let cmd = null;
  try {
    cmd = await lireCommande(ref);
  } catch (e) {
    console.error("reprise", e);
  }
  // B2 : plus AUCUN fichier à retrouver — la référence SEULE suffit. Une commande inconnue de cet
  // appareil (autre navigateur, autre poste) ouvre la même salle d'attente avec un récapitulatif
  // minimal, au lieu de l'ancienne impasse « commande introuvable sur cet appareil ».
  if (cmd?.doc) S.doc = cmd.doc;
  ouvrirConfirmation(cmd ?? { id: ref, doc: null, offre: null });
}

/* ══════════════════ Popup et panneau : ouverture, fermeture, focus ══════════════════ */

const ouvreurs = new Map();
function ouvrirModale(sel, declencheur) {
  const back = $(sel);
  ouvreurs.set(sel, declencheur ?? document.activeElement);
  back.classList.add("on");
  const premier = back.querySelector(".mclose");
  if (premier) premier.focus();
}
function fermerModale(sel) {
  const back = $(sel);
  if (!back.classList.contains("on")) return;
  // ⚠️ Fermer le panneau doit COUPER le paiement : sans cela le sondage tourne indéfiniment
  // et le cadre reste vivant derrière un écran masqué — un paiement qui se confirme plus tard
  // rouvrirait le panneau de force sur une page où le visiteur fait autre chose.
  if (sel === "#upg") fermerPaiement(0);
  back.classList.remove("on");
  const o = ouvreurs.get(sel);
  ouvreurs.delete(sel);
  if (o && typeof o.focus === "function") o.focus();
}

for (const [sel, bouton] of [
  ["#dlm", "#dlmclose"],
  ["#upg", "#upgclose"],
]) {
  $(bouton).addEventListener("click", () => fermerModale(sel));
  $(sel).addEventListener("click", (e) => {
    if (e.target === $(sel)) fermerModale(sel);
  });
}

// Échap et piège à tabulation — sur la surface ouverte du DESSUS.
document.addEventListener("keydown", (e) => {
  const ouvertes = $$(".modal-back.on, .drawer-back.on");
  if (!ouvertes.length) return;
  const back = ouvertes[ouvertes.length - 1];
  if (e.key === "Escape") {
    // Le PRÉALABLE d'une lettre ne se contourne pas : sans pays ni activité il n'y a rien à
    // afficher. Ses deux issues sont « Afficher ma lettre » et le retour à la bibliothèque.
    if (back.id !== "prem") fermerModale("#" + back.id);
    return;
  }
  if (e.key !== "Tab") return;
  // ⚠️ À l'étape paiement, le piège est LEVÉ : le formulaire de règlement vit dans le cadre,
  // qu'aucun `querySelectorAll` du parent ne peut atteindre. Le retenir ici rendrait le
  // paiement impossible au clavier et au lecteur d'écran.
  if (back.id === "upg" && !$("#upg-e5").hidden) return;
  const foc = Array.from(
    back.querySelectorAll("button, a[href], input, select, textarea, iframe"),
  ).filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
  if (!foc.length) return;
  const premier = foc[0];
  const dernier = foc[foc.length - 1];
  if (e.shiftKey && document.activeElement === premier) {
    e.preventDefault();
    dernier.focus();
  } else if (!e.shiftKey && document.activeElement === dernier) {
    e.preventDefault();
    premier.focus();
  }
});

/* ══════════════════ Toast · langue · amorçage ══════════════════ */

const toastEl = $("#toast");
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("on"), 4200);
}

/** Bandeau de RECETTE. Un mode de test qui ressemble trait pour trait à la production finit par
 *  faire régler le plein tarif à quelqu'un qui croyait tester : dès qu'un jeton `?essai=` est
 *  présenté, le panneau le dit. Il ne PROUVE rien — seul l'Edge sait si le jeton est bon — il
 *  signale qu'un jeton part avec la commande, et c'est exactement ce que l'opérateur doit voir.
 *
 *  ⚠️ Déclaré AVANT `appliquerLangue` : `I18N.on()` rejoue ses abonnés à l'inscription, donc
 *  `appliquerLangue` s'exécute pendant l'évaluation du fichier. Plus bas, `bandeauEssai` serait
 *  encore en zone morte et la page mourrait au chargement. */
let bandeauEssai = null;
function peindreEssai() {
  if (!essaiToken) return;
  if (!bandeauEssai) {
    bandeauEssai = document.createElement("p");
    bandeauEssai.className = "essai-note";
    $("#upg-e4").prepend(bandeauEssai);
  }
  bandeauEssai.textContent = L([
    "Mode recette — si le jeton est valide, le règlement partira au tarif de test (570 / 575 F CFA), pas au prix affiché.",
    "Test mode — if the token is valid, payment will use the test price (570 / 575 F CFA), not the price shown.",
  ]);
}

function appliquerLangue(l) {
  lang = l === "en" ? "en" : "fr";
  peindre();
  if ($("#dlm").classList.contains("on"))
    remplirPays($("#dlpays"), $("#dlpays").value || S.pays);
  if ($("#upg").classList.contains("on")) {
    // L'étape identité porte ses propres libellés dynamiques (récap, indicatifs, bouton) —
    // la rouvrir dans la nouvelle langue les repeint tous.
    if (!$("#upg-e4").hidden) ouvrirIdentite(offreChoisie);
  }
  peindreEssai();
}
if (window.I18N && typeof window.I18N.on === "function")
  window.I18N.on(appliquerLangue);

/* ══════════════════ Lettres — préalable, lecteur adapté, génération sur l'appareil ══════════════════ */

/** Chaque carte de lettre PORTE déjà son activité : la redemander serait faire choisir deux fois
 *  la même chose. Seule la lettre de PGHT accompagne indifféremment un enregistrement ou un
 *  renouvellement — et jamais une variation, qui ne redéclare pas le prix grossiste. */
const estLettre = () => MODELES_FICHIERS[S.doc].groupe === "lettres";
const activitesDemandees = () => activitesDe(S.doc);
const LIBELLE_ACTIVITE = {
  enr: ["Enregistrement", "Registration"],
  renouv: ["Renouvellement", "Renewal"],
};

/** Popup PRÉALABLE : le contexte manquant AVANT l'affichage du template (directive CEO
 *  31/07/2026). Tant qu'elle n'est pas validée, le lecteur reste derrière elle. */
function ouvrirPrealable() {
  const actes = activitesDemandees();
  remplirPays($("#prempays"), S.pays);
  // Le groupe d'activité n'existe que pour les documents qui en distinguent plusieurs.
  $("#premactwrap").hidden = !actes;
  if (actes) {
    $("#premact").innerHTML = actes
      .map(
        (a) =>
          `<button class="chip" type="button" role="radio" aria-checked="false" data-v="${esc(a)}">${esc(L(LIBELLE_ACTIVITE[a]))}</button>`,
      )
      .join("");
    $$("#premact .chip").forEach((c) =>
      c.addEventListener("click", () => {
        S.activiteLettre = c.dataset.v;
        majChips("#premact", S.activiteLettre);
      }),
    );
    majChips("#premact", S.activiteLettre ?? null);
  }
  $("#premtitle").textContent = actes
    ? L([
        "Deux choix, et votre lettre prend forme",
        "Two choices, and your letter takes shape",
      ])
    : L([
        "Un choix, et votre lettre prend forme",
        "One choice, and your letter takes shape",
      ]);
  $("#premsub").textContent = actes
    ? L([
        "La lettre s'adresse à l'autorité de votre pays et s'écrit selon votre activité — choisissez les deux, nous remplissons le reste.",
        "The letter is addressed to your country's authority and worded for your activity — choose both, we fill in the rest.",
      ])
    : L([
        "La lettre s'adresse à l'autorité de votre pays de dépôt — choisissez-le, nous remplissons le reste.",
        "The letter is addressed to your filing country's authority — choose it, we fill in the rest.",
      ]);
  ouvrirModale("#prem", null);
}

$("#premgo").addEventListener("click", () => {
  const pays = $("#prempays").value;
  const actes = activitesDemandees();
  if (!pays || (actes && !S.activiteLettre)) {
    toast(
      actes
        ? L([
            "Choisissez votre pays et votre activité.",
            "Choose your country and activity.",
          ])
        : L(["Choisissez votre pays de dépôt.", "Choose your filing country."]),
    );
    return;
  }
  S.pays = pays;
  fermerModale("#prem");
  peindre();
});

/* ── « Générer ma lettre » — LE TEMPLATE DEVIENT LA FEUILLE (patron du builder).
     Pas de popup de collecte : la feuille A4 HTML remplace l'aperçu PDF DANS le lecteur, avec
     les cases remplissables incrustées à leur place exacte. Civilité, agence, adresse, activité
     et date du jour sont déjà posées — l'utilisateur ne complète que son produit, puis télécharge
     le DOCX, généré sur l'appareil. ── */

/** Les blocs de la lettre du pays courant, ou null (modèle officiel servi tel quel). */
const blocsLettre = () =>
  fichierModele(S.doc, S.pays, S.activiteLettre)?.blocs ?? null;

/**
 * Le texte d'AIDE anglais des cases, indexé par numéro de bloc.
 *
 * La lettre reste FRANÇAISE : c'est la version à déposer, on ne la traduit pas. Mais un
 * utilisateur anglophone doit pouvoir la remplir sans lire le français — l'aide de chaque case
 * vient donc de la traduction déjà produite pour le fichier de courtoisie.
 */
const aidesEnLettre = () =>
  fichierModele(S.doc, S.pays, S.activiteLettre)?.aidesEn ?? null;

/** Tout emplacement à compléter du modèle devient une case : « … » et « {…} ». */
const TOKENS = /…|\{[^}]+\}/g;

/** La date du jour, en toutes lettres — la lettre est française. */
const dateDuJour = () =>
  new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Ce qui peut contenir une adresse, une présentation ou une phrase : la case doit grandir
 *  avec la frappe plutôt que de faire défiler le texte hors de vue. */
const CHAMP_LONG =
  /adresse|présentation|forme|indication|nature|dénomination|composition|objet/i;
const estChampLong = (bloc, token) => {
  if (bloc.t !== "li") return false;
  const avant = bloc.x.split(token)[0];
  return CHAMP_LONG.test(avant);
};

/** Une zone auto-extensible : la hauteur suit le contenu, la largeur reste celle de la feuille. */
function autoGrandir(el) {
  // ⚠️ `height = 0` avant de lire, pas `auto` : avec une hauteur minimale (CSS ou implicite),
  // `scrollHeight` renvoie cette hauteur au lieu de celle du contenu — la case naît figée et ne
  // grandit plus jamais. Remise à zéro d'abord, mesure ensuite, plancher d'une ligne à la fin.
  el.style.height = "0px";
  const ligne = parseFloat(getComputedStyle(el).lineHeight) || 20;
  el.style.height = `${Math.max(el.scrollHeight, Math.round(ligne) + 8)}px`;
}

/**
 * Placeholder d'une case : le libellé du champ quand la ligne en porte un, sinon le token.
 *
 * ⚠️ Le libellé est lu dans le bloc de la LANGUE DE L'UTILISATEUR, pas dans la lettre. La lettre
 * reste française — c'est la version à déposer — mais un anglophone qui lit « DCI et dosage » dans
 * une case ne sait pas quoi y mettre. Il lira « INN and strength », et remplira juste sans avoir
 * eu à comprendre le français. `blocEn` manquant (modèle plus ancien) → repli sur le français,
 * exactement le comportement d'avant.
 */
function placeholderDe(bloc, token, blocEn, rang) {
  if (token === "{date}") return "";
  if (token.startsWith("{")) {
    // Jeton nommé (« {date d'octroi} ») : prendre son équivalent anglais au MÊME rang dans le
    // bloc — sinon l'anglophone lit un intitulé français au milieu d'une lettre par ailleurs
    // entièrement guidée.
    const jetons =
      lang === "en" && blocEn?.x ? (blocEn.x.match(/…|\{[^}]+\}/g) ?? []) : [];
    const jeton = jetons[rang];
    return (jeton?.startsWith("{") ? jeton : token).slice(1, -1);
  }
  const source = lang === "en" && blocEn ? blocEn : bloc;
  // Le token est cherché dans la source lue : « … » est commun aux deux langues, mais si la
  // traduction ne le portait pas, on retomberait sur le texte entier — d'où le garde-fou.
  const segments = source.x.split(token);
  const avant = (segments.length > 1 ? segments[0] : bloc.x.split(token)[0])
    .replace(/\s*:\s*$/, "")
    .trim();
  // La case au fil d'une PHRASE (objet, réf.) porte un placeholder qui dit QUOI saisir — pas la
  // phrase entière tronquée, illisible dans une case de 12ch.
  if (/produit$|product$/.test(avant))
    return L(["Nom commercial", "Trade name"]);
  if (/n°$|No\.$/.test(avant)) return L(["n° d'AMM", "MA number"]);
  if (bloc.t === "li" && avant.length > 2 && avant.length < 60) return avant;
  return L(["à compléter", "to fill in"]);
}

/** Le HTML d'un bloc de lettre, cases incrustées. `i` relie chaque case à son bloc source. */
function htmlBlocLettre(b, i) {
  if (b.t === "table") {
    // Aide dans la langue de l'utilisateur (le tableau AFFICHÉ, lui, reste celui de la lettre
    // française) : sans cela, une case de tableau n'a aucun texte d'aide — ni placeholder ni
    // libellé compréhensible — et l'anglophone remplit à l'aveugle.
    const rowsAide = (lang === "en" && aidesEnLettre()?.[i]?.rows) || b.rows;
    const caseHtml = (aide, r, c) =>
      `<td><textarea class="lf-in lf-grow" rows="1" data-bloc="${i}" data-cell="${r}:${c}"` +
      ` aria-label="${esc(aide)}" placeholder="${esc(aide)}"></textarea></td>`;

    // Tableau « libellé / valeur » (déclaration DMF) : aucune ligne d'en-tête, et la colonne de
    // gauche est un INTITULÉ — la rendre saisissable laisserait effacer « Titulaire de l'AMM »
    // et déposer un tableau qui ne dit plus ce qu'il montre. C'est cet intitulé qui guide la
    // saisie, pas un en-tête de colonne : il devient donc le texte d'aide de la ligne.
    if (b.libelles)
      return (
        '<table class="lf-table lf-table-lib">' +
        b.rows
          .map(
            (r, ri) =>
              `<tr><th scope="row">${esc(r[0])}</th>` +
              caseHtml((rowsAide[ri] ?? r)[0], ri, 1) +
              "</tr>",
          )
          .join("") +
        "</table>"
      );

    const [tete, ...corps] = b.rows;
    const teteAide = rowsAide[0] ?? tete;
    return (
      '<table class="lf-table"><tr>' +
      tete.map((c) => `<th>${esc(c)}</th>`).join("") +
      "</tr>" +
      corps
        .map(
          (r, ri) =>
            "<tr>" +
            r
              .map((c, ci) => caseHtml(teteAide[ci] ?? tete[ci], ri + 1, ci))
              .join("") +
            "</tr>",
        )
        .join("") +
      "</table>"
    );
  }
  // Choix <mineure> <majeure> : un vrai sélecteur, pas deux options à raturer.
  if (/<mineure> <majeure>/.test(b.x)) {
    const html = esc(b.x).replace(
      esc("<mineure> <majeure>"),
      `<select class="lf-in lf-sel" data-bloc="${i}" data-slot="0" aria-label="${esc(L(["Classe de la variation", "Variation class"]))}"><option value="mineure">mineure</option><option value="majeure">majeure</option></select>`,
    );
    return rendreTokens(html, b, i, 1);
  }
  if (/^<Nature/.test(b.x)) {
    return `<textarea class="lf-in lf-area" rows="2" data-bloc="${i}" data-slot="0" aria-label="${esc(
      L(["Nature de la ou des modifications", "Nature of the change(s)"]),
    )}" placeholder="${esc(L(["Nature de la ou des modifications", "Nature of the change(s)"]))}"></textarea>`;
  }
  if (b.x === "Poste" || b.x === "Nom et Prénom(s)") {
    const lib =
      b.x === "Poste"
        ? L(["Poste", "Position"])
        : L(["Nom et prénom(s)", "Full name"]);
    return `<input type="text" class="lf-in" data-bloc="${i}" data-slot="0" data-tout="1" aria-label="${esc(lib)}" placeholder="${esc(lib)}" />`;
  }
  return rendreTokens(esc(b.x), b, i, 0);
}

/** Remplace chaque token d'un texte DÉJÀ échappé par sa case, slots numérotés dans l'ordre. */
function rendreTokens(html, b, i, slotDepart) {
  let slot = slotDepart;
  // Aide anglaise du MÊME index — la source du texte d'aide quand l'utilisateur est en EN.
  const bEn = aidesEnLettre()?.[i];
  let rang = 0;
  return html.replace(TOKENS, (token) => {
    const date = token === "{date}";
    const ph = placeholderDe(b, token, bEn, rang++);
    const commun = `data-bloc="${i}" data-slot="${slot++}" aria-label="${esc(ph || L(["Date", "Date"]))}"`;
    // Champ potentiellement long : une zone qui grandit à la frappe, bornée à la largeur utile.
    if (!date && estChampLong(b, token))
      return `<textarea class="lf-in lf-grow" rows="1" ${commun} placeholder="${esc(ph)}"></textarea>`;
    return `<input type="text" class="lf-in${date ? " lf-date" : ""}" ${commun} ${date ? `value="${esc(dateDuJour())}"` : `placeholder="${esc(ph)}"`} />`;
  });
}

const CLASSE_LETTRE = {
  doctitle: "lft",
  part: "lfp",
  h1: "lfh",
  h2: "lfh",
  h3: "lfh3",
  p: "lfx",
  li: "lfl",
  right: "lfd",
};

function ouvrirFeuille() {
  const blocs = blocsLettre();
  if (!blocs) return;
  $("#lffeuille").innerHTML = blocs
    .map((b, i) => {
      if (b.t === "break") return '<hr class="lf-saut" />';
      if (b.t === "table") return htmlBlocLettre(b, i);
      return `<div class="${CLASSE_LETTRE[b.t] ?? "lfx"}">${htmlBlocLettre(b, i)}</div>`;
    })
    .join("");
  for (const z of $("#lffeuille").querySelectorAll(".lf-grow")) {
    autoGrandir(z);
    z.addEventListener("input", () => autoGrandir(z));
  }
  $("#docview").hidden = true;
  $("#lfedit").hidden = false;
  $("#rbedit").hidden = false;
  $("#dlbtn").hidden = true;
  $("#dlnote").hidden = true;
  const premiere = $("#lffeuille").querySelector(".lf-in:not(.lf-date)");
  if (premiere) premiere.focus();
}

function fermerFeuille() {
  $("#lfedit").hidden = true;
  $("#docview").hidden = false;
  $("#rbedit").hidden = true;
  $("#dlbtn").hidden = false;
  $("#dlnote").hidden = false;
  $("#genletbtn").focus();
}

$("#genletbtn").addEventListener("click", ouvrirFeuille);
$("#lfretour").addEventListener("click", fermerFeuille);
$("#lfreset").addEventListener("click", () => ouvrirFeuille());

let generation = false;
$("#lfgo").addEventListener("click", async () => {
  if (generation) return;
  generation = true;
  const bouton = $("#lfgo");
  const libelle = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = L(["Génération…", "Generating…"]);
  try {
    const blocs = structuredClone(blocsLettre());
    // Les valeurs des cases retournent DANS les blocs mêmes, token par token, dans l'ordre.
    const parBloc = new Map();
    for (const inp of $("#lffeuille").querySelectorAll(".lf-in")) {
      const i = Number(inp.dataset.bloc);
      if (!parBloc.has(i)) parBloc.set(i, []);
      parBloc.get(i).push(inp);
    }
    for (const [i, inputs] of parBloc) {
      const b = blocs[i];
      if (b.t === "table") {
        for (const inp of inputs) {
          const [r, c] = inp.dataset.cell.split(":").map(Number);
          const v = inp.value.trim();
          if (v) b.rows[r][c] = v;
        }
        continue;
      }
      if (inputs[0]?.dataset.tout) {
        const v = inputs[0].value.trim();
        if (v) b.x = v;
        continue;
      }
      if (/^<Nature/.test(b.x)) {
        const v = inputs[0]?.value.trim();
        b.x = v || b.x;
        continue;
      }
      inputs.sort((a, z) => Number(a.dataset.slot) - Number(z.dataset.slot));
      let idx = 0;
      const valeurs = inputs.map((inp) => inp.value.trim());
      b.x = b.x
        .replace(
          /<mineure> <majeure>/,
          () => valeurs[idx++] || "<mineure> <majeure>",
        )
        .replace(TOKENS, (token) => {
          const v = valeurs[idx++];
          return v || (token === "{date}" ? `{date}` : token);
        });
    }
    const octets = await genererDocxLettre(blocs);
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([octets], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    a.href = url;
    a.download = `${S.doc}-${S.pays}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(
      L([
        "Votre lettre est prête — relisez-la, signez-la, déposez-la.",
        "Your letter is ready — review it, sign it, file it.",
      ]),
    );
  } catch (e) {
    console.error("génération lettre", e);
    toast(
      L([
        "La génération a échoué sur cet appareil — téléchargez le modèle et remplissez-le dans Word.",
        "Generation failed on this device — download the template and fill it in Word.",
      ]),
    );
  } finally {
    generation = false;
    bouton.disabled = false;
    bouton.textContent = libelle;
  }
});

/** Le DOCX, généré sur l'appareil avec la MÊME mise en page que le générateur des modèles
 *  (Times 12, blocs décalés à 56 % alignés à gauche). Le moteur `docx` est chargé au premier
 *  clic seulement. */
async function genererDocxLettre(blocs) {
  const d = await import("/vendor/docx.esm.js?v=2");
  const INDENT = Math.round(16 * 0.56 * 567);
  // Les MÊMES valeurs que le générateur des modèles (build-landing-modeles.mjs) : un courrier
  // généré au clic doit être indiscernable du modèle téléchargé.
  const ESPACE = {
    doctitle: { before: 0, after: 320 },
    part: { before: 240, after: 200 },
    h3: { before: 240, after: 120 },
    p: { before: 0, after: 200 },
    li: { before: 0, after: 120 },
    right: { before: 0, after: 60 },
    // Bloc d'adresse en tête de lettre : des lignes serrées, jamais des paragraphes.
    entete: { before: 0, after: 0 },
  };
  const INTERLIGNE = 276;
  const enfants = blocs.map((b) => {
    if (b.t === "table") {
      return new d.Table({
        width: { size: 100, type: d.WidthType.PERCENTAGE },
        // Un tableau « libellé / valeur » n'a pas de ligne d'en-tête : ce qui se détache est sa
        // COLONNE de gauche. Même règle que le générateur des modèles — sans elle, la lettre
        // produite au clic grisait le nom du produit comme un intitulé.
        rows: b.rows.map(
          (row, ri) =>
            new d.TableRow({
              tableHeader: !b.libelles && ri === 0,
              height: { value: 420, rule: "atLeast" },
              children: row.map((cell, ci) => {
                const intitule = b.libelles ? ci === 0 : ri === 0;
                return new d.TableCell({
                  margins: { top: 90, bottom: 90, left: 130, right: 130 },
                  verticalAlign: d.VerticalAlign.CENTER,
                  shading: intitule
                    ? {
                        type: d.ShadingType.CLEAR,
                        fill: "F1F4F9",
                        color: "auto",
                      }
                    : undefined,
                  children: [
                    new d.Paragraph({
                      spacing: { before: 0, after: 0, line: 240 },
                      children: [
                        new d.TextRun({
                          text: String(cell),
                          bold: intitule,
                          size: 20,
                          font: "Times New Roman",
                        }),
                      ],
                    }),
                  ],
                });
              }),
            }),
        ),
      });
    }
    const gras = b.t === "h3" || b.t === "part" || b.t === "doctitle";
    return new d.Paragraph({
      alignment:
        b.t === "part" || b.t === "doctitle"
          ? d.AlignmentType.CENTER
          : d.AlignmentType.LEFT,
      indent: b.t === "right" ? { left: INDENT } : undefined,
      bullet: b.t === "li" ? { level: 0 } : undefined,
      // Les MÊMES espacements que le générateur — ils étaient déclarés puis ignorés, si bien que
      // l'en-tête laboratoire sortait aéré comme des paragraphes et la lettre débordait.
      spacing: { ...(ESPACE[b.t] ?? ESPACE.p), line: INTERLIGNE },
      children: [
        new d.TextRun({
          text: b.x ?? "",
          bold: gras,
          size: 24,
          font: "Times New Roman",
        }),
      ],
    });
  });
  const m = MODELES_FICHIERS[S.doc];
  const legende = [L(m.source), nomPays(S.pays)].filter(Boolean).join(" — ");
  const docx = new d.Document({
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 } } },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1418, left: 1134 },
          },
        },
        // Pied de page signé — la MÊME légende que les modèles générés au build.
        footers: {
          default: new d.Footer({
            children: [
              new d.Paragraph({
                alignment: d.AlignmentType.RIGHT,
                spacing: { before: 120 },
                children: [
                  new d.TextRun({
                    text: `${legende} — by `,
                    size: 15,
                    color: "9AA1A9",
                    font: "Arial",
                  }),
                  new d.ExternalHyperlink({
                    link: "https://pharnos.com/",
                    children: [
                      new d.TextRun({
                        text: "Pharnos",
                        size: 15,
                        color: "9AA1A9",
                        font: "Arial",
                        underline: {},
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children: enfants,
      },
    ],
  });
  return d.Packer.toBlob(docx);
}

/* ══════════════════ Démo — spécimen DEMOCILLINE, écrans réels ══════════════════ */

const DEMO_RUBS = [
  [
    "4.6",
    [
      "Fertilité, grossesse et allaitement",
      "Fertility, pregnancy and lactation",
    ],
  ],
  ["4.7", ["Aptitude à conduire", "Ability to drive"]],
  ["4.8", ["Effets indésirables", "Undesirable effects"]],
  ["4.9", ["Surdosage", "Overdose"]],
  ["5.1", ["Propriétés pharmacodynamiques", "Pharmacodynamic properties"]],
  ["5.2", ["Propriétés pharmacocinétiques", "Pharmacokinetic properties"]],
  ["5.3", ["Sécurité préclinique", "Preclinical safety"]],
  ["6.1", ["Liste des excipients", "List of excipients"]],
];
let demoTimer = null;
let demoIdx = 0;

function peindreDemo() {
  const done = demoIdx;
  $("#dprub").innerHTML = DEMO_RUBS.map(([n, lib], i) => {
    const etat =
      i < done
        ? `<span class="badge b-free">✓ ${esc(L(["Reprise", "Reworked"]))}</span>`
        : i === done
          ? `<span class="spin" aria-hidden="true"></span><span class="vh">${esc(L(["en cours", "in progress"]))}</span>`
          : `<span class="badge">${esc(L(["En attente", "Waiting"]))}</span>`;
    return `<li class="${i === done ? "doing" : i > done ? "todo" : ""}"><span class="n">${esc(n)}</span> <span class="rl">${esc(L(lib))}</span> <span class="st">${etat}</span></li>`;
  }).join("");
  const total = 29;
  const courant = 14 + done;
  $("#dplab").textContent = L([
    `Rubrique ${courant} sur ${total}`,
    `Section ${courant} of ${total}`,
  ]);
  $("#dpeta").textContent = L([
    `environ ${Math.max(1, 8 - done)} × 12 s restantes`,
    `about ${Math.max(1, 8 - done)} × 12 s left`,
  ]);
  $("#dpfill").style.width = `${Math.round((courant / total) * 100)}%`;
}

function lancerDemo() {
  clearInterval(demoTimer);
  demoIdx = 0;
  $("#demo-gen").hidden = false;
  $("#demo-liv").hidden = true;
  peindreDemo();
  // Démonstration accélérée — une vraie mise à niveau prend environ quatre minutes.
  demoTimer = setInterval(() => {
    demoIdx += 1;
    if (demoIdx >= DEMO_RUBS.length) {
      clearInterval(demoTimer);
      $("#demo-gen").hidden = true;
      $("#demo-liv").hidden = false;
      return;
    }
    peindreDemo();
  }, 900);
}

$("#demobtn").addEventListener("click", () => {
  $("#demo").hidden = false;
  lancerDemo();
  $("#demo").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#demoferme").addEventListener("click", () => {
  clearInterval(demoTimer);
  $("#demo").hidden = true;
  $("#demobtn").focus();
});
$("#demoup").addEventListener("click", () => {
  $("#demo").hidden = true;
  ouvrirUpgrade($("#demoup"));
});

peindre();
// Une lettre ne s'affiche qu'APRÈS le choix du pays et de l'activité (directive CEO) : le
// préalable s'ouvre immédiatement, le lecteur attend derrière.
// Le préalable s'ouvre tant qu'un choix NÉCESSAIRE manque — le pays, mais aussi l'activité
// quand le document s'y décline. Ne tester que le pays laissait servir « enregistrement »
// à un déposant venu pour un renouvellement, sans le lui dire nulle part.
if (estLettre() && (!S.pays || (activitesDe(S.doc) && !S.activiteLettre)))
  ouvrirPrealable();
purger().catch((e) => console.error("purge", e));
reprendre().catch((e) => console.error("reprise", e));
