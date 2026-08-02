/* ── Bibliothèque réglementaire — contrôleur de la GRILLE (/bibliotheque-reglementaire).
     Module ES natif, aucune étape de build. CSP `script-src 'self'` + `style-src 'self'` :
     aucun script inline, aucun attribut `style=` produit par innerHTML — tout passe par des
     classes. Tout texte interpolé passe par `esc()`.

     Cette page ne fait plus QUE la grille : le lecteur, le téléchargement et la mise à niveau
     vivent sur la page dédiée `/modele?doc=…`. ── */

/* ⚠️ Le `?v=` des imports N'EST PAS décoratif — Cloudflare impose `max-age=14400` et un module
   importé PAR un module n'hérite pas du `?v=` du HTML. À bumper avec le HTML. */
import { MODELES_FICHIERS } from "./checking/modeles-manifest.js?v=2026.7";
import {
  activitesDe,
  fichierModele,
  paysDuModele,
  tailleLisible,
} from "./checking/bibliotheque-core.js?v=2026.7";
import { PAYS } from "./checking/referentiel.js?v=2026.2";

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

/** La page dédiée porte un AUTRE slug en anglais — on se cale sur le chemin servi. */
const EN = window.location.pathname.startsWith("/en/");
const PAGE_MODELE = EN ? "/en/template" : "/modele";

/* ══ Fac-similé de première page — la vignette des cartes ══
   Peint depuis `apercu` du manifeste : les MÊMES blocs que le fichier téléchargé, donc la
   vignette ne peut pas montrer autre chose que ce que le visiteur obtiendra. */
const CLASSE_BLOC = {
  doctitle: "bt",
  part: "bp2",
  h1: "bh",
  h2: "bh3",
  h3: "bh3",
  p: "bp",
  li: "bl",
  right: "bd",
};

function facSimile(apercu) {
  return (
    `<span class="a4mini" aria-hidden="true">` +
    apercu
      .map((b) => {
        // Tableau « libellé / valeur » : pas de ligne d'en-tête, la colonne de GAUCHE est
        // l'intitulé. Sans ce cas, la vignette montrait un en-tête que le document n'a pas.
        if (b.t === "table" && b.rows && b.libelles) {
          return (
            "<table>" +
            b.rows
              .map(
                (r) =>
                  `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`,
              )
              .join("") +
            "</table>"
          );
        }
        if (b.t === "table" && b.rows) {
          const [tete, ...corps] = b.rows;
          return (
            "<table><tr>" +
            tete.map((c) => `<th>${esc(c)}</th>`).join("") +
            "</tr>" +
            corps
              .map(
                (r) =>
                  "<tr>" +
                  r.map((c) => `<td>${esc(c)}</td>`).join("") +
                  "</tr>",
              )
              .join("") +
            "</table>"
          );
        }
        const cls = CLASSE_BLOC[b.t] ?? "bp";
        const texte = b.t === "li" ? `• ${b.x}` : b.x;
        return `<span class="db ${cls}">${esc(texte ?? "")}</span>`;
      })
      .join("") +
    `</span>`
  );
}

/* ══ Grille — recette des cartes de pièces des fiches org ══ */

function carte(slug) {
  const m = MODELES_FICHIERS[slug];
  // Le PAYS RETENU si ce document le sert, sinon le premier qu'il sert : un document restreint à
  // une obligation nationale n'a pas de fichier béninois, et l'y chercher faisait échouer le
  // rendu de tout son groupe.
  const servis = paysDuModele(slug);
  const pays = servis.includes(S.pays) ? S.pays : servis[0];
  const f = fichierModele(slug, pays);
  // « PDF officiel » seulement si TOUS les pays servis le sont : la lettre de demande est le
  // fichier de l'ABMed au Bénin mais un Word bilingue ailleurs — l'annoncer officielle sur la
  // grille tromperait sept déposants sur huit. La page du document, elle, sait le pays choisi.
  const tousOfficiels = Object.values(m.fichiers).every((x) => x.officiel);
  const langues = tousOfficiels
    ? L(["PDF officiel", "Official PDF"])
    : m.bilingue
      ? "Word FR + EN"
      : "Word";
  // Le pays étant RETENU, la pagination est celle de SON fichier — plus besoin de taire un
  // compte qui varie d'un pays à l'autre (la déclaration DMF tient sur une page au Bénin, deux
  // au Niger). La carte peut enfin dire le vrai chiffre.
  const meta = `${f.pages} p. · ${langues}`;
  // Un LIEN, pas un bouton : la carte ouvre la page dédiée du document — ouvrable dans un nouvel
  // onglet, partageable. Le pays voyage dans l'URL : la fiche s'ouvre déjà réglée, sans reposer
  // la question.
  const lien = (activite) =>
    `${PAGE_MODELE}?doc=${encodeURIComponent(slug)}` +
    (S.pays ? `&pays=${encodeURIComponent(S.pays)}` : "") +
    (activite ? `&activite=${encodeURIComponent(activite)}` : "");
  // Le SEUL choix qui reste : l'activité, et uniquement pour les documents qui s'y adaptent.
  // Deux entrées EXPLICITES sur la carte — la carte elle-même n'en impose aucune. En encoder une
  // « par défaut » ferait repartir un déposant en renouvellement avec la lettre d'enregistrement,
  // sans qu'un seul écran le lui dise.
  const actes = activitesDe(slug);
  const chips = actes
    ? `<span class="acte-chips">${actes
        .map(
          (a) =>
            `<a class="acte-chip" href="${esc(lien(a))}">${esc(L(LIBELLE_ACTE[a] ?? [a, a]))}</a>`,
        )
        .join("")}</span>`
    : "";
  return `<li>
    <a class="piece-card" href="${esc(lien(null))}">
      <span class="piece-thumb">${facSimile(m.apercu)}</span>
      <span class="nm">${esc(L(m.nom))}</span>
      <span class="mt2"><span class="m">${meta}</span></span>
    </a>
    ${chips}
  </li>`;
}

/** Les activités réglementaires, nommées — « enr » ne veut rien dire pour un déposant. */
const LIBELLE_ACTE = {
  enr: ["Enregistrement", "Registration"],
  renouv: ["Renouvellement", "Renewal"],
};

/* ══ Le pays — choisi UNE FOIS, à l'entrée ══
   Il vit dans l'URL (`?pays=ci`) : la page est partageable, et un lien envoyé à un collègue
   ouvre déjà le bon pays. L'URL est REMPLACÉE, pas empilée — le choix d'un pays n'est pas une
   navigation, et le retour arrière doit ramener d'où l'on vient, pas défaire un filtre. */

const S = { pays: null };

/**
 * L'agence d'un pays, NOMMÉE — telle qu'elle apparaît dans les lettres.
 *
 * Lue dans le manifeste, qui la tient du référentiel d'agences du builder : c'est la même source
 * que le bloc destinataire. Le référentiel du Checking, lui, dit « l'autorité nationale » pour la
 * Guinée-Bissau et le Niger — une carte qui l'afficherait promettrait autre chose que la lettre
 * qu'elle ouvre, qui nomme la DIFALRM et la DPM/MT.
 */
function agenceDe(k) {
  for (const m of Object.values(MODELES_FICHIERS))
    for (const [cle, f] of Object.entries(m.fichiers))
      if (f.agence && cle.split("-")[0] === k) return L(f.agence);
  return null;
}

/** Carte de pays : drapeau, nom, et l'autorité à qui les lettres seront adressées. */
function cartePays(p) {
  const agence = agenceDe(p.k) ?? L(Array.isArray(p.ag) ? p.ag : [p.ag, p.ag]);
  return `<li>
    <button class="pays-card" type="button" data-pays="${esc(p.k)}">
      <span class="fl" aria-hidden="true"><svg><use href="#fl-${esc(p.k)}"/></svg></span>
      <span class="tx">
        <span class="nm">${esc(L(p.nom))}</span>
        <span class="ag">${esc(agence)}</span>
      </span>
    </button>
  </li>`;
}

/** Masquage NULL-SAFE : un HTML plus ancien que ce script (skew de déploiement — incident du
 *  2026-07-17 documenté dans `_headers`) n'a pas tous ces nœuds. Une exception ici arrêterait le
 *  module AVANT de peindre la moindre carte : la page entière deviendrait blanche. */
const masquer = (sel, v) => {
  const n = $(sel);
  if (n) n.hidden = v;
};

function peindre() {
  const choisi = Boolean(S.pays);
  const p = choisi ? PAYS.find((x) => x.k === S.pays) : null;

  // L'étape pays est une INVITATION, pas une porte : les grilles se peignent TOUJOURS.
  // Les enfermer derrière le choix aurait vidé la page pour deux publics à la fois — les moteurs
  // de recherche, qui rendent le JS mais ne cliquent pas (et cette page est l'entrée organique du
  // produit gratuit), et tout visiteur servi par un edge resté sur l'ancien script.
  masquer("#etape-pays", choisi);
  masquer("#pays-bar", !choisi);

  if (choisi) {
    $("#pays-bar-use")?.setAttribute("href", `#fl-${S.pays}`);
    const nom = $("#pays-bar-nom");
    if (nom) nom.textContent = L(p.nom);
  } else {
    const g = $("#grid-pays");
    if (g) g.innerHTML = PAYS.map(cartePays).join("");
  }

  const tag = $("#tagcount");
  if (tag) {
    const compte = `${Object.keys(MODELES_FICHIERS).length} ${L(["modèles officiels", "official templates"])}`;
    tag.textContent = p ? `${compte} · ${L(p.nom)}` : compte;
  }

  const groupes = { produit: [], lettres: [], resumes: [] };
  for (const slug of Object.keys(MODELES_FICHIERS))
    groupes[MODELES_FICHIERS[slug].groupe]?.push(slug);
  for (const [g, slugs] of Object.entries(groupes)) {
    const el = $(`#grid-${g}`);
    if (el) el.innerHTML = slugs.map(carte).join("");
  }
}

/** Retient le pays et l'écrit dans l'URL — sans recharger, pour garder la position de lecture. */
function choisirPays(k) {
  S.pays = PAYS.some((p) => p.k === k) ? k : null;
  const u = new URL(window.location.href);
  if (S.pays) u.searchParams.set("pays", S.pays);
  else u.searchParams.delete("pays");
  window.history.replaceState(null, "", u);
  peindre();
  // Le bouton qui vient d'être cliqué est masqué par `peindre()` : sans reprise explicite, le
  // focus retombe sur <body>, l'utilisateur clavier repart du haut du document et le lecteur
  // d'écran n'annonce rien. On le pose sur la contrepartie de l'action.
  const cible = S.pays
    ? $("#pays-bar-chg")
    : $("#etape-pays")?.querySelector("h2");
  if (cible) {
    cible.setAttribute("tabindex", "-1");
    cible.focus();
  }
  // Le déposant vient de choisir : on le ramène en haut des modèles, pas au milieu d'une grille.
  document.querySelector("#modeles")?.scrollIntoView({ block: "start" });
}

document.querySelector("#grid-pays")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pays]");
  if (b) choisirPays(b.dataset.pays);
});
document
  .querySelector("#pays-bar-chg")
  ?.addEventListener("click", () => choisirPays(null));

function appliquerLangue(l) {
  lang = l === "en" ? "en" : "fr";
  peindre();
}
if (window.I18N && typeof window.I18N.on === "function")
  window.I18N.on(appliquerLangue);

/* ══ Amorçage ══ */
// Le pays vient de l'URL — un lien partagé ouvre la bibliothèque déjà réglée. Une valeur
// inconnue retombe sur l'étape de choix : on ne devine jamais un pays de dépôt.
{
  const k = new URLSearchParams(window.location.search)
    .get("pays")
    ?.toLowerCase();
  S.pays = PAYS.some((p) => p.k === k) ? k : null;
}
peindre();
