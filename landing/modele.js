/* ── Page dédiée d'un modèle (/modele?doc=…) — lecteur, téléchargement, mise à niveau.
     Module ES natif, aucune étape de build. CSP `script-src 'self'` + `style-src 'self'`.

     ⚠️ INVARIANT CENTRAL — LE FICHIER DU CLIENT NE QUITTE PAS LE NAVIGATEUR AVANT LE PAIEMENT.
     Il est choisi, affiché comme déposé, conservé dans IndexedDB sous la référence de commande,
     et rien d'autre. Aucun `fetch`, aucun `FormData`, aucune requête ne le porte ici. Le premier
     envoi a lieu au RETOUR du paiement, et il appartient au traitement, pas à cette page.

     Parcours (spécification CEO du 31/07/2026) :
       • le document s'affiche dans un LECTEUR, colonne droite sticky ;
       • « Télécharger » demande le pays ET l'activité en popup, PUIS lance le téléchargement ;
       • « Mettre au standard » ouvre un panneau ancré au bord DROIT de l'écran. ── */

import { PAYS } from "./checking/referentiel.js?v=2026.2";
import {
  MODELES_FICHIERS,
  MODELES_VERSION,
} from "./checking/modeles-manifest.js?v=2026.5";
import { VIGILANCE } from "./checking/vigilance.js?v=2026.1";
import {
  activitesDe,
  fichierModele,
  MAX_OCTETS,
  nouvelleCommande,
  OFFRES,
  paysDuModele,
  PRIX,
  PRIX_UP3_PLEIN,
  prixCourt,
  prixDouble,
  tailleLisible,
  TTL_MS,
  validerFichier,
} from "./checking/bibliotheque-core.js?v=2026.5";

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

/**
 * Origine de la boutique de paiement. UN SEUL endroit à changer le jour où le domaine bascule.
 *
 * ⚠️ Le domaine de marque `services.pharnos.com` est déclaré côté Chariow et attend son CNAME
 * (`services` → `cc54deb46d638802.vercel-dns-016.com`, DNS only). Tant qu'il ne résout pas et que
 * son certificat n'est pas émis, l'origine reste celle de la boutique : poser ici un domaine qui
 * ne répond pas enverrait le client payer dans le vide. La bascule = cette ligne, rien d'autre.
 */
const BOUTIQUE = "https://adbhrqbd.mychariow.com";

/**
 * Liens de règlement Chariow. Ce sont les liens « accès direct au paiement » (`/checkout`) : le
 * client a déjà lu l'offre ici, la page produit de la boutique ne lui apprendrait rien.
 * La CSP de pharnos.com (`script-src 'self'`) interdit le script Snap sur cette page, d'où la
 * redirection pleine page plutôt qu'une modale.
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
// ⚠️ AUCUN pays ni activité par défaut (directive CEO du 31/07/2026) : un défaut silencieux
// ferait télécharger le modèle d'un pays que personne n'a choisi — et la mention 4.8 est
// nationale. Tant que les deux choix ne sont pas faits, les boutons restent inertes.
const S = {
  doc: MODELES_FICHIERS[docParam] ? docParam : "rcp",
  pays: PAYS.some((p) => p.k === paysParam) ? paysParam : null,
  activite: null,
  fichier: null,
};

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
const paysApercu = () => S.pays ?? paysServis()[0] ?? PAYS[0].k;

const nomPays = (k) => L((PAYS.find((p) => p.k === k) ?? PAYS[0]).nom);

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
      : m.perPays
        ? S.pays
          ? `${L(["mention de pharmacovigilance", "pharmacovigilance statement"])} : ${v.organisme}`
          : L([
              "réglé sur votre pays de dépôt au téléchargement",
              "set for your filing country at download",
            ])
        : L([
            "identique dans les huit pays",
            "identical across the eight countries",
          ]),
  ].join(" · ");
  $("#doctags").innerHTML =
    `<span class="badge b-free">${esc(L(["Gratuit", "Free"]))}</span>` +
    (m.perPays && S.pays
      ? `<span class="badge b-pays">${esc(nomPays(S.pays))}</span>`
      : "") +
    (m.upgradable
      ? `<span class="badge b-info">${esc(L(["Mise à niveau disponible", "Upgrade available"]))}</span>`
      : "");

  // Retour vers la bibliothèque, pays conservé.
  $("#back").href = PAGE_BIBLIO;

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
    ? PAYS.filter((p) => servis.includes(p.k))
    : PAYS;
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
    majChips("#uact", S.activite);
    majDlGo();
  }),
);

/* ══════════════════ Mise à niveau — panneau ancré à droite ══════════════════ */

function ouvrirUpgrade(declencheur) {
  $("#upgtitle").textContent = L([
    `Mettre ${monDoc()} au standard officiel`,
    `Bring ${monDoc()} up to the official standard`,
  ]);
  $("#upgdesc").textContent = L([
    "Regafy AI le reconstruit rubrique par rubrique, sur le modèle du pays choisi.",
    "Regafy AI rebuilds it section by section, on the template of the selected country.",
  ]);
  remplirPays($("#upays"), S.pays);
  majChips("#uact", S.activite);
  peindreAchat();
  etapePanneau(1);
  ouvrirModale("#upg", declencheur);
}

function peindreAchat() {
  $("#up1").textContent = prixDouble(PRIX.up1, lang);
  const pret =
    S.fichier !== null && Boolean($("#upays")?.value) && Boolean(S.activite);
  $("#buy1").textContent =
    `${L(["Commander la mise à niveau", "Order the upgrade"])} — ${prixCourt(PRIX.up1, lang)}`;
  $("#buy1").disabled = !pret;
  // Étape 2 — l'upsell n'apparaît qu'APRÈS le clic de commande, jamais sur le premier écran.
  $("#bx1").textContent =
    `${L(["Continuer avec un document", "Continue with one document"])} — ${prixCourt(PRIX.up1, lang)}`;
  $("#bx3").textContent =
    `${L(["Prendre les trois", "Take all three"])} — ${prixDouble(PRIX.up3, lang)}`;
  $("#bxsave").innerHTML =
    `${esc(L(["Notice et étiquetage du même produit inclus — ", "Leaflet and labelling of the same product included — "]))}` +
    `<span class="old">${esc(prixCourt(PRIX_UP3_PLEIN, lang))}</span> ` +
    `<b>${esc(prixDouble(PRIX.up3, lang))}</b>`;
}

/** Bascule entre les trois états du panneau : commande, upsell, confirmation de retour.
 *  ⚠️ À l'étape 3 le formulaire disparaît AVEC les boutons d'achat : la commande est passée, il
 *  n'y a plus rien à choisir ni à régler. */
function etapePanneau(n) {
  $("#upg-e1").hidden = n !== 1;
  $("#upg-e2").hidden = n !== 2;
  $("#upg-e3").hidden = n !== 3;
  $("#upgbody").hidden = n === 3;
  const premier = $(n === 3 ? "#cfmsend" : n === 2 ? "#bx3" : "#upgclose");
  if (premier) premier.focus();
}

$("#upbtn").addEventListener("click", () => ouvrirUpgrade($("#upbtn")));
$("#upays").addEventListener("change", (e) => {
  S.pays = e.target.value;
  peindre();
  peindreAchat();
});
$$("#uact .chip").forEach((c) =>
  c.addEventListener("click", () => {
    S.activite = c.dataset.v;
    majChips("#uact", S.activite);
    peindreAchat();
  }),
);

function poserFichier(file) {
  const v = validerFichier(file);
  if (!v.ok) {
    toast(
      L(
        {
          absent: ["Choisissez un document.", "Choose a document."],
          extension: [
            "Formats acceptés : PDF, Word (.doc, .docx).",
            "Accepted formats: PDF, Word (.doc, .docx).",
          ],
          vide: ["Ce fichier est vide.", "This file is empty."],
          trop_gros: [
            `Ce document dépasse ${tailleLisible(MAX_OCTETS, lang)}. Envoyez-nous-le à contact@pharnos.com.`,
            `This document exceeds ${tailleLisible(MAX_OCTETS, lang)}. Send it to contact@pharnos.com.`,
          ],
        }[v.raison],
      ),
    );
    return;
  }
  S.fichier = file;
  $("#ufilename").textContent = file.name;
  $("#ufilesize").textContent = tailleLisible(file.size, lang);
  $("#ufilerow").hidden = false;
  $("#ureadyline").hidden = false;
  $("#udrop").hidden = true;
  peindreAchat();
}

function retirerFichier() {
  S.fichier = null;
  $("#ufile").value = "";
  $("#ufilerow").hidden = true;
  $("#ureadyline").hidden = true;
  $("#udrop").hidden = false;
  peindreAchat();
  $("#udrop").focus();
}

$("#udrop").addEventListener("click", () => $("#ufile").click());
$("#ufile").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) poserFichier(f);
});
$("#ufileclear").addEventListener("click", retirerFichier);
for (const type of ["dragenter", "dragover"]) {
  $("#udrop").addEventListener(type, (e) => {
    e.preventDefault();
    $("#udrop").classList.add("over");
  });
}
for (const type of ["dragleave", "drop"]) {
  $("#udrop").addEventListener(type, (e) => {
    e.preventDefault();
    $("#udrop").classList.remove("over");
    if (type === "drop" && e.dataTransfer?.files?.[0])
      poserFichier(e.dataTransfer.files[0]);
  });
}

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

let enCours = false;
async function acheter(offre) {
  if (enCours) return;
  const v = validerFichier(S.fichier);
  if (!v.ok) {
    toast(
      L(["Déposez d’abord votre document.", "Upload your document first."]),
    );
    $("#udrop").focus();
    return;
  }
  enCours = true;
  // Les deux boutons qui déclenchent le règlement vivent à l'ÉTAPE 2 : `#bx1` et `#bx3`.
  // ⚠️ Viser un bouton inexistant lèverait ici, hors du `try` — `enCours` resterait à true et
  // la page n'accepterait plus aucun achat. Le repli garde la fonction debout dans tous les cas.
  const bouton = $(offre === "up3" ? "#bx3" : "#bx1") ?? $("#buy1");
  const libelle = bouton.textContent;
  bouton.disabled = true;
  try {
    if (!$("#upays").value || !S.activite) {
      toast(
        L([
          "Choisissez votre pays et votre activité.",
          "Choose your country and activity.",
        ]),
      );
      etapePanneau(1);
      return;
    }
    const cmd = nouvelleCommande({
      doc: S.doc,
      pays: $("#upays").value,
      activite: S.activite,
      offre,
      fichier: S.fichier,
      nomFichier: S.fichier.name,
      octets: S.fichier.size,
      id: crypto.randomUUID(),
      cree: Date.now(),
    });
    // Conservé AVANT la navigation : le fichier doit survivre au passage par
    // services.pharnos.com. Sans cela, le client paie et se retrouve sans document.
    await sauverCommande(cmd);

    if (checkoutOuvert(offre)) {
      marquerEnAttente(cmd.id);
      const u = new URL(CHECKOUT[offre]);
      // Référence opaque, jamais de donnée personnelle en clair dans une URL.
      u.searchParams.set("ref", cmd.id);
      window.location.assign(u.toString());
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
    enCours = false;
    bouton.disabled = false;
    bouton.textContent = libelle;
  }
}
// Le clic de commande OUVRE l'étape upsell — le paiement part de l'étape 2.
$("#buy1").addEventListener("click", () => {
  if (!$("#upays").value || !S.activite) {
    toast(
      L([
        "Choisissez votre pays et votre activité.",
        "Choose your country and activity.",
      ]),
    );
    $("#upays").focus();
    return;
  }
  const v = validerFichier(S.fichier);
  if (!v.ok) {
    toast(
      L(["Déposez d’abord votre document.", "Upload your document first."]),
    );
    $("#udrop").focus();
    return;
  }
  etapePanneau(2);
});
$("#bx1").addEventListener("click", () => acheter("up1"));
$("#bx3").addEventListener("click", () => acheter("up3"));
$("#bxretour").addEventListener("click", () => etapePanneau(1));

const libelleActivite = (a) =>
  L(
    a === "renouv" ? ["Renouvellement", "Renewal"] : ["Nouvelle AMM", "New MA"],
  );

/** Le courriel qui porte la commande : sa référence, ce qui a été choisi, ce qui a été réglé.
 *  Le document N'EST PAS joint par nous — le navigateur ne sait pas le faire, et c'est très bien
 *  ainsi : c'est le client qui l'attache, en connaissance de cause. */
function mailtoCommande(cmd) {
  const m = MODELES_FICHIERS[cmd.doc];
  const sujet = L([
    `Mise à niveau ${L(m.court)} — ${nomPays(cmd.pays)} — ${cmd.id.slice(0, 8)}`,
    `Upgrade ${L(m.court)} — ${nomPays(cmd.pays)} — ${cmd.id.slice(0, 8)}`,
  ]);
  const activite = libelleActivite(cmd.activite);
  const corps = L([
    `Document : ${L(m.nom)}\nPays de dépôt : ${nomPays(cmd.pays)}\nActivité : ${activite}\nOffre : ${prixDouble(OFFRES[cmd.offre].prix, lang)}\nRéférence : ${cmd.id}\n\n(Joignez ici le document à mettre à niveau : ${cmd.nomFichier})`,
    `Document: ${L(m.nom)}\nCountry of filing: ${nomPays(cmd.pays)}\nActivity: ${activite}\nOffer: ${prixDouble(OFFRES[cmd.offre].prix, lang)}\nReference: ${cmd.id}\n\n(Attach here the document to upgrade: ${cmd.nomFichier})`,
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

/** Confirmation de retour de paiement. Elle dit ce que nous SAVONS — la commande est enregistrée,
 *  le document est retrouvé — et ce qu'il reste à faire : nous le transmettre. Elle ne prétend
 *  pas avoir reçu le fichier, et elle ne revend rien. */
function ouvrirConfirmation(cmd) {
  const m = MODELES_FICHIERS[cmd.doc];
  $("#upgtitle").textContent = L([
    `Commande ${cmd.id.slice(0, 8)}`,
    `Order ${cmd.id.slice(0, 8)}`,
  ]);
  $("#upgdesc").textContent = L([
    "Merci — nous avons ce qu'il faut pour lancer la mise à niveau.",
    "Thank you — we have what we need to start the upgrade.",
  ]);
  const trois = cmd.offre === "up3";
  const offre = trois
    ? L(["les trois documents", "all three documents"])
    : L(["un document", "one document"]);
  $("#cfmrecap").textContent =
    `${L(m.nom)} · ${nomPays(cmd.pays)} · ${libelleActivite(cmd.activite)} · ${offre}` +
    ` · ${cmd.nomFichier} (${tailleLisible(cmd.octets, lang)})`;
  $("#cfmnext").textContent = trois
    ? L([
        "Dernière étape : envoyez-nous vos documents. Nous ouvrons l'e-mail, référence déjà inscrite — joignez le RCP, la notice et l'étiquetage, ensemble ou au fil de l'eau. Les fichiers vous reviennent par le même canal.",
        "Last step: send us your documents. We open the e-mail with the reference already filled in — attach the SmPC, the leaflet and the labelling, together or as they come. The deliverables come back the same way.",
      ])
    : L([
        "Dernière étape : envoyez-nous votre document. Nous ouvrons l'e-mail, référence déjà inscrite — il ne vous reste qu'à joindre le fichier. Les 5 fichiers vous reviennent par le même canal.",
        "Last step: send us your document. We open the e-mail with the reference already filled in — you only attach the file. The 5 deliverables come back the same way.",
      ]);
  $("#cfmsend").textContent = trois
    ? L(["Envoyer mes documents", "Send my documents"])
    : L(["Envoyer mon document", "Send my document"]);
  const retour = $("#cfmback");
  retour.href = PAGE_BIBLIO;
  retour.textContent = L(["Retour à la bibliothèque", "Back to the library"]);
  $("#cfmsend").onclick = () => {
    window.location.href = mailtoCommande(cmd);
  };
  etapePanneau(3);
  ouvrirModale("#upg", null);
}

/** Retour de paiement : on retrouve le document conservé et on le remet sous les yeux du client.
 *  L'envoi au traitement appartient au worker, pas à cette page. */
async function reprendre() {
  // `?commande=` si le prestataire relaie notre référence ; sinon `?paiement=ok` et la référence
  // gardée avant le départ. Les deux chemins mènent au même document.
  const ref =
    params.get("commande") ??
    (params.get("paiement") ? referenceEnAttente() : null);
  if (!ref) return;
  let cmd = null;
  try {
    cmd = await lireCommande(ref);
  } catch (e) {
    console.error("reprise", e);
  }
  if (!cmd) {
    toast(
      L([
        "Cette commande n’a pas été retrouvée sur cet appareil. Écrivez-nous à contact@pharnos.com.",
        "This order was not found on this device. Write to contact@pharnos.com.",
      ]),
    );
    return;
  }
  S.doc = cmd.doc;
  S.pays = cmd.pays;
  S.activite = cmd.activite;
  S.fichier = cmd.fichier;
  peindre();
  poserFichier(cmd.fichier);
  // La référence reste en attente : un simple rafraîchissement de la page de retour doit
  // ramener la même confirmation, pas une page vierge. Elle s'efface d'elle-même au TTL, et
  // la commande suivante l'écrase.
  try {
    await sauverCommande({ ...cmd, regle: true, regleeLe: Date.now() });
  } catch (e) {
    // La commande est déjà en base ; ne pas empêcher la confirmation pour un champ de statut.
    console.error("statut commande", e);
  }
  ouvrirConfirmation(cmd);
  toast(
    L([
      `Commande ${cmd.id.slice(0, 8)} — votre document a bien été conservé.`,
      `Order ${cmd.id.slice(0, 8)} — your document was kept safely.`,
    ]),
  );
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
  const foc = Array.from(
    back.querySelectorAll("button, a[href], input, select, textarea"),
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

function appliquerLangue(l) {
  lang = l === "en" ? "en" : "fr";
  peindre();
  if ($("#dlm").classList.contains("on"))
    remplirPays($("#dlpays"), $("#dlpays").value || S.pays);
  if ($("#upg").classList.contains("on")) {
    remplirPays($("#upays"), $("#upays").value || S.pays);
    peindreAchat();
  }
  if (S.fichier)
    $("#ufilesize").textContent = tailleLisible(S.fichier.size, lang);
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

/** Placeholder d'une case : le libellé du champ quand la ligne en porte un, sinon le token. */
function placeholderDe(bloc, token) {
  if (token === "{date}") return "";
  if (token.startsWith("{")) return token.slice(1, -1);
  const avant = bloc.x
    .split(token)[0]
    .replace(/\s*:\s*$/, "")
    .trim();
  // La case au fil d'une PHRASE (objet, réf.) porte un placeholder qui dit QUOI saisir — pas la
  // phrase entière tronquée, illisible dans une case de 12ch.
  if (/produit$/.test(avant)) return L(["Nom commercial", "Trade name"]);
  if (/n°$/.test(avant)) return L(["n° d'AMM", "MA number"]);
  if (bloc.t === "li" && avant.length > 2 && avant.length < 60) return avant;
  return L(["à compléter", "to fill in"]);
}

/** Le HTML d'un bloc de lettre, cases incrustées. `i` relie chaque case à son bloc source. */
function htmlBlocLettre(b, i) {
  if (b.t === "table") {
    const [tete, ...corps] = b.rows;
    return (
      '<table class="lf-table"><tr>' +
      tete.map((c) => `<th>${esc(c)}</th>`).join("") +
      "</tr>" +
      corps
        .map(
          (r, ri) =>
            "<tr>" +
            r
              .map(
                (c, ci) =>
                  `<td><textarea class="lf-in lf-grow" rows="1" data-bloc="${i}" data-cell="${ri + 1}:${ci}" aria-label="${esc(tete[ci])}"></textarea></td>`,
              )
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
  return html.replace(TOKENS, (token) => {
    const date = token === "{date}";
    const ph = placeholderDe(b, token);
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
  };
  const INTERLIGNE = 276;
  const enfants = blocs.map((b) => {
    if (b.t === "table") {
      return new d.Table({
        width: { size: 100, type: d.WidthType.PERCENTAGE },
        rows: b.rows.map(
          (row, ri) =>
            new d.TableRow({
              tableHeader: ri === 0,
              height: { value: 420, rule: "atLeast" },
              children: row.map(
                (cell) =>
                  new d.TableCell({
                    margins: { top: 90, bottom: 90, left: 130, right: 130 },
                    verticalAlign: d.VerticalAlign.CENTER,
                    shading:
                      ri === 0
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
                            bold: ri === 0,
                            size: 20,
                            font: "Times New Roman",
                          }),
                        ],
                      }),
                    ],
                  }),
              ),
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
      spacing: { after: 120 },
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
if (estLettre() && !S.pays) ouvrirPrealable();
purger().catch((e) => console.error("purge", e));
reprendre().catch((e) => console.error("reprise", e));
