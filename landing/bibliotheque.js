/* ── Bibliothèque réglementaire — contrôleur de la GRILLE (/bibliotheque-reglementaire).
     Module ES natif, aucune étape de build. CSP `script-src 'self'` + `style-src 'self'` :
     aucun script inline, aucun attribut `style=` produit par innerHTML — tout passe par des
     classes. Tout texte interpolé passe par `esc()`.

     Cette page ne fait plus QUE la grille : le lecteur, le téléchargement et la mise à niveau
     vivent sur la page dédiée `/modele?doc=…`. ── */

/* ⚠️ Le `?v=` des imports N'EST PAS décoratif — Cloudflare impose `max-age=14400` et un module
   importé PAR un module n'hérite pas du `?v=` du HTML. À bumper avec le HTML. */
import { PAYS } from "./checking/referentiel.js?v=2026.2";
import { MODELES_FICHIERS } from "./checking/modeles-manifest.js?v=2026.2";
import { VIGILANCE } from "./checking/vigilance.js?v=2026.1";
import {
  fichierModele,
  tailleLisible,
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

/** La page dédiée porte un AUTRE slug en anglais — on se cale sur le chemin servi. */
const EN = window.location.pathname.startsWith("/en/");
const PAGE_MODELE = EN ? "/en/template" : "/modele";

const S = { pays: "bj" };

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
  const f = fichierModele(slug, S.pays);
  const badges = [
    m.perPays
      ? `<span class="badge b-pays">${esc(L(["Selon le pays", "Country-specific"]))}</span>`
      : "",
    m.upgradable
      ? `<span class="badge b-info">${esc(L(["Mise à niveau", "Upgrade"]))}</span>`
      : "",
  ].join("");
  const meta = `${f.pages} p. · PDF + Word · ${esc(tailleLisible(f.octetsPdf + f.octetsDocx, lang))}`;
  // Un LIEN, pas un bouton : la carte ouvre la page dédiée du document — ouvrable dans un nouvel
  // onglet, partageable, indexable. Le pays choisi voyage dans l'URL.
  const href = `${PAGE_MODELE}?doc=${encodeURIComponent(slug)}&pays=${encodeURIComponent(S.pays)}`;
  return `<li>
    <a class="piece-card" href="${esc(href)}">
      <span class="piece-thumb">${facSimile(m.apercu)}</span>
      <span class="nm">${esc(L(m.nom))}</span>
      <span class="mt2"><span class="m">${meta}</span>${badges}</span>
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
    `${Object.keys(MODELES_FICHIERS).length} ${L(["modèles", "templates"])}`;

  const v = VIGILANCE[S.pays];
  $("#agline").textContent = v ? v.organisme : "";
}

function remplirPays() {
  const sel = $("#pays");
  sel.innerHTML = PAYS.map(
    (p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`,
  ).join("");
  sel.value = S.pays;
}

$("#pays")?.addEventListener("change", (e) => {
  S.pays = e.target.value;
  peindre();
});

function appliquerLangue(l) {
  lang = l === "en" ? "en" : "fr";
  remplirPays();
  peindre();
}
if (window.I18N && typeof window.I18N.on === "function")
  window.I18N.on(appliquerLangue);

/* ══ Amorçage ══ */
const paysUrl = new URLSearchParams(window.location.search).get("pays");
if (paysUrl && PAYS.some((p) => p.k === paysUrl)) S.pays = paysUrl;
remplirPays();
peindre();
