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
} from "./checking/modeles-manifest.js?v=2026.2";
import { VIGILANCE } from "./checking/vigilance.js?v=2026.1";
import {
  fichierModele,
  MAX_OCTETS,
  nouvelleCommande,
  OFFRES,
  PRIX,
  PRIX_UP3_PLEIN,
  prixCourt,
  prixDouble,
  tailleLisible,
  TTL_MS,
  validerFichier,
} from "./checking/bibliotheque-core.js?v=2026.2";

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
 * Liens de règlement Chariow, isolés sur `services.pharnos.com` — la CSP de pharnos.com
 * (`script-src 'self'`) interdit le script Snap ici.
 * ⚠️ Tant qu'une offre n'a pas son lien, le bouton NE PROMET PAS un paiement : il propose d'être
 * rappelé. Renseigner ces deux valeurs suffit à ouvrir la vente.
 */
const CHECKOUT = { up1: "", up3: "" };
const checkoutOuvert = (offre) => Boolean(CHECKOUT[offre]);

/* ══ État ══ */
const params = new URLSearchParams(window.location.search);
const docParam = params.get("doc");
const paysParam = params.get("pays");
const S = {
  doc: MODELES_FICHIERS[docParam] ? docParam : "rcp",
  pays: PAYS.some((p) => p.k === paysParam) ? paysParam : "bj",
  activite: "amm",
  fichier: null,
};

const nomPays = (k) => L((PAYS.find((p) => p.k === k) ?? PAYS[0]).nom);

/** Le français accorde le possessif : « mon RCP » mais « ma notice ». */
const MON = {
  rcp: ["mon RCP", "my SmPC"],
  notice: ["ma notice", "my leaflet"],
  etiquetage: ["mon étiquetage", "my labelling"],
};
const monDoc = () => L(MON[S.doc] ?? MON.rcp);
const POSSESSIF = {
  rcp: ["Votre RCP, lui, ne l’est pas.", "Your SmPC is not."],
  notice: ["Votre notice, elle, ne l’est pas.", "Your leaflet is not."],
  etiquetage: [
    "Votre étiquetage, lui, ne l’est pas.",
    "Your labelling is not.",
  ],
};

/* ══════════════════ Rendu de la fiche ══════════════════ */

function peindre() {
  const m = MODELES_FICHIERS[S.doc];
  const f = fichierModele(S.doc, S.pays);
  const v = VIGILANCE[S.pays];

  document.title = `${L(m.nom)} — ${L(["modèle officiel", "official template"])} · Pharnos`;
  $("#doctitle").textContent = L(m.nom);
  $("#docsub").textContent = [
    L(m.source),
    `${f.pages} ${f.pages > 1 ? L(["pages", "pages"]) : L(["page", "page"])}`,
    m.perPays
      ? `${L(["mention de pharmacovigilance", "pharmacovigilance statement"])} : ${v.organisme}`
      : L([
          "identique dans les huit pays",
          "identical across the eight countries",
        ]),
  ].join(" · ");
  $("#doctags").innerHTML =
    `<span class="badge b-free">${esc(L(["Gratuit", "Free"]))}</span>` +
    (m.perPays
      ? `<span class="badge b-pays">${esc(nomPays(S.pays))}</span>`
      : "") +
    (m.upgradable
      ? `<span class="badge b-info">${esc(L(["Mise à niveau disponible", "Upgrade available"]))}</span>`
      : "");

  // Retour vers la bibliothèque, pays conservé.
  $("#back").href = `${PAGE_BIBLIO}?pays=${encodeURIComponent(S.pays)}`;

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

  // Offre — seulement pour les documents que le moteur sait mettre au standard.
  $("#offre").hidden = !m.upgradable;
  if (m.upgradable) {
    $("#offreh").textContent =
      `${L(["Ce modèle est vide.", "This template is empty."])} ${L(POSSESSIF[S.doc] ?? POSSESSIF.rcp)}`;
    $("#p1").textContent = prixDouble(PRIX.up1, lang);
    $("#upbtn").textContent = L([
      `Mettre ${monDoc()} au standard`,
      `Bring ${monDoc()} up to standard`,
    ]);
    $("#bundlet").innerHTML = ligneBundle();
    $("#upbtn3").textContent = L(["Prendre les trois", "Take all three"]);
  }
}

const ligneBundle = () =>
  `${esc(L(["Les trois documents — ", "All three documents — "]))}${esc(prixDouble(PRIX.up3, lang))}` +
  `<span class="old">${esc(prixCourt(PRIX_UP3_PLEIN, lang))}</span>` +
  `<span class="save">−${esc(prixCourt({ eur: PRIX_UP3_PLEIN.eur - PRIX.up3.eur }, lang))}</span>`;

/* ══════════════════ Téléchargement — pays et activité d'abord ══════════════════ */

function remplirPays(sel, valeur) {
  sel.innerHTML = PAYS.map(
    (p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`,
  ).join("");
  sel.value = valeur;
}

function majChips(groupe, valeur) {
  $$(groupe + " .chip").forEach((c) =>
    c.setAttribute("aria-checked", String(c.dataset.v === valeur)),
  );
}

$("#dlbtn").addEventListener("click", () => {
  remplirPays($("#dlpays"), S.pays);
  majChips("#dlact", S.activite);
  ouvrirModale("#dlm", $("#dlbtn"));
});

/** Le téléchargement part d'un clic UTILISATEUR sur PDF ou Word — jamais automatiquement à la
 *  fermeture de la popup : le choix du format lui appartient. */
function telecharger(format) {
  S.pays = $("#dlpays").value;
  const m = MODELES_FICHIERS[S.doc];
  const f = fichierModele(S.doc, S.pays);
  const a = document.createElement("a");
  a.href = f[format];
  a.download = `${S.doc}${m.perPays ? `-${S.pays}` : ""}.${format === "pdf" ? "pdf" : "docx"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  fermerModale("#dlm");
  peindre(); // le lecteur suit le pays choisi dans la popup
  toast(
    m.perPays
      ? L([
          `Modèle ${nomPays(S.pays)} téléchargé — la mention 4.8 de votre pays est en place.`,
          `${nomPays(S.pays)} template downloaded — your country’s 4.8 statement is in place.`,
        ])
      : L(["Modèle téléchargé.", "Template downloaded."]),
  );
}
$("#dlpdf").addEventListener("click", () => telecharger("pdf"));
$("#dldocx").addEventListener("click", () => telecharger("docx"));
$$("#dlact .chip").forEach((c) =>
  c.addEventListener("click", () => {
    S.activite = c.dataset.v;
    majChips("#dlact", S.activite);
    majChips("#uact", S.activite);
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
  ouvrirModale("#upg", declencheur);
}

function peindreAchat() {
  $("#up1").textContent = prixDouble(PRIX.up1, lang);
  $("#bundlet2").innerHTML = ligneBundle();
  const pret = S.fichier !== null;
  for (const [sel, offre, libelle] of [
    ["#buy1", "up1", ["Commander la mise à niveau", "Order the upgrade"]],
    ["#buy3", "up3", ["Prendre les trois", "Take all three"]],
  ]) {
    const b = $(sel);
    b.textContent = checkoutOuvert(offre)
      ? `${L(libelle)} — ${prixCourt(OFFRES[offre].prix, lang)}`
      : `${L(["Être rappelé — ", "Request a call back — "])}${prixCourt(OFFRES[offre].prix, lang)}`;
    b.disabled = !pret;
  }
}

$("#upbtn").addEventListener("click", () => ouvrirUpgrade($("#upbtn")));
$("#upbtn3").addEventListener("click", () => ouvrirUpgrade($("#upbtn3")));
$("#upays").addEventListener("change", (e) => {
  S.pays = e.target.value;
  peindre();
});
$$("#uact .chip").forEach((c) =>
  c.addEventListener("click", () => {
    S.activite = c.dataset.v;
    majChips("#uact", S.activite);
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
  const bouton = offre === "up3" ? $("#buy3") : $("#buy1");
  const libelle = bouton.textContent;
  bouton.disabled = true;
  try {
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
$("#buy1").addEventListener("click", () => acheter("up1"));
$("#buy3").addEventListener("click", () => acheter("up3"));

/** Sans lien de règlement configuré, on n'invente pas un paiement : e-mail portant le contexte.
 *  Le document, lui, reste sur l'appareil — il n'est pas joint. */
function ouvrirRappel(cmd) {
  const m = MODELES_FICHIERS[cmd.doc];
  const sujet = L([
    `Mise à niveau ${L(m.court)} — ${nomPays(cmd.pays)}`,
    `Upgrade ${L(m.court)} — ${nomPays(cmd.pays)}`,
  ]);
  const activite = L(
    cmd.activite === "renouv"
      ? ["Renouvellement", "Renewal"]
      : ["Nouvelle AMM", "New MA"],
  );
  const corps = L([
    `Document : ${L(m.nom)}\nPays de dépôt : ${nomPays(cmd.pays)}\nActivité : ${activite}\nOffre : ${prixDouble(OFFRES[cmd.offre].prix, lang)}\nRéférence : ${cmd.id}`,
    `Document: ${L(m.nom)}\nCountry of filing: ${nomPays(cmd.pays)}\nActivity: ${activite}\nOffer: ${prixDouble(OFFRES[cmd.offre].prix, lang)}\nReference: ${cmd.id}`,
  ]);
  window.location.href = `mailto:contact@pharnos.com?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  toast(
    L([
      "Votre document reste sur cet appareil — nous ne l’avons pas reçu.",
      "Your document stays on this device — we have not received it.",
    ]),
  );
}

/** Retour de paiement : on retrouve le document conservé et on le remet sous les yeux du client.
 *  L'envoi au traitement appartient au worker, pas à cette page. */
async function reprendre() {
  const ref = params.get("commande");
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
  ouvrirUpgrade(null);
  poserFichier(cmd.fichier);
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
    fermerModale("#" + back.id);
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

peindre();
purger().catch((e) => console.error("purge", e));
reprendre().catch((e) => console.error("reprise", e));
