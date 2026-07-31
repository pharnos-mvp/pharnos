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
} from "./checking/modeles-manifest.js?v=2026.3";
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
} from "./checking/bibliotheque-core.js?v=2026.3";

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
// ⚠️ AUCUN pays ni activité par défaut (directive CEO du 31/07/2026) : un défaut silencieux
// ferait télécharger le modèle d'un pays que personne n'a choisi — et la mention 4.8 est
// nationale. Tant que les deux choix ne sont pas faits, les boutons restent inertes.
const S = {
  doc: MODELES_FICHIERS[docParam] ? docParam : "rcp",
  pays: PAYS.some((p) => p.k === paysParam) ? paysParam : null,
  activite: null,
  fichier: null,
};

/** L'aperçu du lecteur a besoin d'UN fichier avant tout choix : le premier pays du référentiel.
 *  La première page est identique pour les huit — la version téléchargée, elle, attend le choix. */
const paysApercu = () => S.pays ?? PAYS[0].k;

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
  const f = fichierModele(S.doc, paysApercu());
  const v = VIGILANCE[paysApercu()];

  document.title = `${L(m.nom)} — ${L(["modèle officiel", "official template"])} · Pharnos`;
  $("#doctitle").textContent = L(m.nom);
  $("#docsub").textContent = [
    L(m.source),
    `${f.pages} ${f.pages > 1 ? L(["pages", "pages"]) : L(["page", "page"])}`,
    m.perPays
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

  // Note de la barre du lecteur : ce que contient le téléchargement.
  $("#dlnote").textContent = m.bilingue
    ? L(["Word · FR + EN · gratuit", "Word · FR + EN · free"])
    : L(["Word · gratuit", "Word · free"]);

  // Offre — seulement pour les documents que le moteur sait mettre au standard.
  $("#offre").hidden = !m.upgradable;
  $("#inf").hidden = m.upgradable;
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
    $("#infsub").textContent = [
      L(m.source),
      m.perPays
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
  sel.innerHTML =
    placeholder +
    PAYS.map(
      (p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`,
    ).join("");
  if (valeur) sel.value = valeur;
}

function majChips(groupe, valeur) {
  $$(groupe + " .chip").forEach((c) =>
    c.setAttribute("aria-checked", String(c.dataset.v === valeur)),
  );
}

function majDlGo() {
  $("#dlzip").disabled = !$("#dlpays").value || !S.activite;
}

$("#dlbtn").addEventListener("click", () => {
  const m = MODELES_FICHIERS[S.doc];
  remplirPays($("#dlpays"), S.pays);
  majChips("#dlact", S.activite);
  majDlGo();
  $("#dlzip").textContent = m.bilingue
    ? L(["Télécharger — Word FR + EN (ZIP)", "Download — Word FR + EN (ZIP)"])
    : L(["Télécharger — Word (ZIP)", "Download — Word (ZIP)"]);
  $("#dlenote").hidden = !m.bilingue;
  ouvrirModale("#dlm", $("#dlbtn"));
});

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
  a.href = f.zip;
  a.download = `${S.doc}${m.perPays ? `-${S.pays}` : ""}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  fermerModale("#dlm");
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

/** Bascule entre l'étape « commande » et l'étape « upsell » du panneau. */
function etapePanneau(n) {
  $("#upg-e1").hidden = n !== 1;
  $("#upg-e2").hidden = n !== 2;
  const premier = $(n === 2 ? "#bx3" : "#upgclose");
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
  const bouton = offre === "up3" ? $("#buy3") : $("#buy1");
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

/** Sans lien de règlement configuré, la commande part par e-mail avec sa référence — le
 *  document, lui, reste sur l'appareil, il n'est pas joint. Dès que les liens Chariow sont
 *  posés dans CHECKOUT, ce repli disparaît de lui-même. */
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
purger().catch((e) => console.error("purge", e));
reprendre().catch((e) => console.error("reprise", e));
