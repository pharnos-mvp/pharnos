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
  fichierModele,
  paysDuModele,
  tailleLisible,
} from "./checking/bibliotheque-core.js?v=2026.7";

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
  // La vignette se lit sur le PREMIER pays servi, jamais sur un pays codé en dur : un document
  // restreint à une obligation nationale n'a pas de fichier béninois, et l'y chercher faisait
  // échouer le rendu de tout son groupe.
  const f = fichierModele(slug, paysDuModele(slug)[0]);
  // « PDF officiel » seulement si TOUS les pays servis le sont : la lettre de demande est le
  // fichier de l'ABMed au Bénin mais un Word bilingue ailleurs — l'annoncer officielle sur la
  // grille tromperait sept déposants sur huit. La page du document, elle, sait le pays choisi.
  const tousOfficiels = Object.values(m.fichiers).every((x) => x.officiel);
  const langues = tousOfficiels
    ? L(["PDF officiel", "Official PDF"])
    : m.bilingue
      ? "Word FR + EN"
      : "Word";
  // La pagination n'est annoncée que si elle est la MÊME pour tous les pays servis : la
  // déclaration DMF tient sur une page au Bénin et sur deux au Niger (nom d'autorité plus long).
  // Afficher « 1 p. » d'après le premier pays ferait mentir la carte à un déposant sur quatre —
  // la fiche du document, elle, connaît le pays choisi et donne le compte exact.
  const pages = [...new Set(Object.values(m.fichiers).map((x) => x.pages))];
  const meta = pages.length === 1 ? `${pages[0]} p. · ${langues}` : langues;
  // Un LIEN, pas un bouton : la carte ouvre la page dédiée du document — ouvrable dans un nouvel
  // onglet, partageable. Pays et activité se choisissent AU TÉLÉCHARGEMENT, pas ici.
  const href = `${PAGE_MODELE}?doc=${encodeURIComponent(slug)}`;
  return `<li>
    <a class="piece-card" href="${esc(href)}">
      <span class="piece-thumb">${facSimile(m.apercu)}</span>
      <span class="nm">${esc(L(m.nom))}</span>
      <span class="mt2"><span class="m">${meta}</span></span>
    </a>
  </li>`;
}

function peindre() {
  const groupes = { produit: [], lettres: [], resumes: [] };
  for (const slug of Object.keys(MODELES_FICHIERS))
    groupes[MODELES_FICHIERS[slug].groupe]?.push(slug);
  for (const [g, slugs] of Object.entries(groupes)) {
    const el = $(`#grid-${g}`);
    if (el) el.innerHTML = slugs.map(carte).join("");
  }
  $("#tagcount").textContent =
    `${Object.keys(MODELES_FICHIERS).length} ${L(["modèles officiels", "official templates"])}`;
}

function appliquerLangue(l) {
  lang = l === "en" ? "en" : "fr";
  peindre();
}
if (window.I18N && typeof window.I18N.on === "function")
  window.I18N.on(appliquerLangue);

/* ══ Amorçage ══ */
peindre();
