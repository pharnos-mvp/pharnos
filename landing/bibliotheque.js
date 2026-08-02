/* ── Bibliothèque réglementaire — contrôleur de la GRILLE (/bibliotheque-reglementaire).
     Module ES natif, aucune étape de build. CSP `script-src 'self'` + `style-src 'self'` :
     aucun script inline, aucun attribut `style=` produit par innerHTML — tout passe par des
     classes. Tout texte interpolé passe par `esc()`.

     Cette page ne fait plus QUE la grille : le lecteur, le téléchargement et la mise à niveau
     vivent sur la page dédiée `/modele?doc=…`. ── */

/* ⚠️ Le `?v=` des imports N'EST PAS décoratif — Cloudflare impose `max-age=14400` et un module
   importé PAR un module n'hérite pas du `?v=` du HTML. À bumper avec le HTML. */
import {
  MODELES_FICHIERS,
  MODELES_PAYS,
} from "./checking/modeles-manifest.js?v=2026.10";
import {
  fichierModele,
  paysDuModele,
  paysServisPar,
  tailleLisible,
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
  // Le format annoncé est celui du fichier DU PAYS RETENU : le RCP est un PDF de l'AIRP en Côte
  // d'Ivoire et de la NAFDAC au Nigeria, un Word bilingue ailleurs.
  //
  // ⚠️ Tant qu'aucun pays n'est choisi, `pays` vaut le PREMIER servi — le Bénin. S'y fier
  // annonçait « PDF officiel » sur la lettre de demande, vraie au Bénin seulement : sept
  // déposants sur huit lisaient une provenance qui n'était pas la leur. Sans pays, on ne
  // l'affirme donc que si TOUS les fichiers du document le sont.
  const officiel = S.pays
    ? f.officiel
    : Object.values(m.fichiers).every((x) => x.officiel);
  const langues = officiel
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
  //
  // L'ACTIVITÉ, elle, ne voyage PAS : la carte ne porte plus les deux puces
  // « Enregistrement / Renouvellement » (retirées le 02/08/2026 sur demande CEO). Elles
  // dupliquaient une question que la page du document pose déjà, en préalable non contournable,
  // et flottaient hors de la grille sous la seule carte concernée. Rien n'est perdu : sans
  // activité dans l'URL, `/modele` ouvre son écran de préalable — et n'en présume aucune.
  const lien = `${PAGE_MODELE}?doc=${encodeURIComponent(slug)}${
    S.pays ? `&pays=${encodeURIComponent(S.pays)}` : ""
  }`;
  return `<li>
    <a class="piece-card" href="${esc(lien)}">
      <span class="piece-thumb">${facSimile(m.apercu)}</span>
      <span class="nm">${esc(L(m.nom))}</span>
      <span class="mt2"><span class="m">${meta}</span></span>
    </a>
  </li>`;
}

/* ══ Le pays — choisi UNE FOIS, à l'entrée ══
   Il vit dans l'URL (`?pays=ci`) : la page est partageable, et un lien envoyé à un collègue
   ouvre déjà le bon pays. L'URL est REMPLACÉE, pas empilée — le choix d'un pays n'est pas une
   navigation, et le retour arrière doit ramener d'où l'on vient, pas défaire un filtre. */

const S = { pays: null };

/** Les documents que contient le dossier d'un pays — c'est le chiffre annoncé sur sa carte. */
const docsDuPays = (k) =>
  Object.keys(MODELES_FICHIERS).filter((slug) =>
    paysServisPar(slug).includes(k),
  );

/**
 * Carte de PAYS — même patron vertical que les cartes de modèle : une vignette, un titre, une
 * ligne de méta. L'enchaînement « je choisis mon pays » puis « je choisis mon document » se lit
 * alors comme une seule suite, et non comme deux écrans étrangers.
 *
 * La vignette reprend le fac-similé du premier document du dossier — la structure d'un RCP, pas
 * une illustration décorative. Le drapeau se lit DEVANT le nom, à la taille d'un emoji : c'est
 * une lettre du mot, pas une image posée à côté de lui.
 *
 * Un LIEN `?pays=xx`, pas un bouton. Le clic est intercepté pour garder la page en place, mais
 * l'adresse existe vraiment : la carte s'ouvre dans un nouvel onglet, se partage, et un moteur de
 * recherche atteint le dossier de chaque pays — alors que la page d'entrée, elle, ne montre plus
 * un seul document.
 */
function cartePays(p) {
  const docs = docsDuPays(p.k);
  const n = docs.length;
  const meta = `${n} document${n > 1 ? "s" : ""} · ${L(p.agence)}`;
  // Aperçu : celui du premier document servi à ce pays, faute de quoi la carte serait vide.
  const apercu = MODELES_FICHIERS[docs[0]]?.apercu ?? [];
  return `<li>
    <a class="piece-card" href="?pays=${encodeURIComponent(p.k)}" data-pays="${esc(p.k)}">
      <span class="piece-thumb">${facSimile(apercu)}</span>
      <span class="nm"><span class="fl-in" aria-hidden="true"><svg><use href="#fl-${esc(p.k)}"/></svg></span>${esc(L(p.nom))}</span>
      <span class="mt2"><span class="m">${esc(meta)}</span></span>
    </a>
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
  const p = choisi ? MODELES_PAYS.find((x) => x.k === S.pays) : null;

  // DEUX ÉCRANS, jamais les deux à la fois (CEO, 02/08/2026) : soit on choisit son pays, soit on
  // parcourt SON dossier. Laisser les documents en dessous des drapeaux défaisait le rangement
  // qu'on venait d'annoncer — le déposant voyait un catalogue en vrac et n'avait plus de raison
  // de choisir. Le référencement n'y perd rien : chaque carte de pays est un lien `?pays=xx`, et
  // c'est ce dossier-là qu'un moteur indexe, déjà réglé.
  masquer("#etape-pays", choisi);
  if (!choisi) {
    const g = $("#grid-pays");
    if (g) g.innerHTML = MODELES_PAYS.map(cartePays).join("");
  }

  // Le pays retenu, DANS le titre de la page, et le moyen d'en changer juste à côté.
  masquer("#tagpays", !choisi);
  masquer("#pays-chg", !choisi);
  if (choisi) {
    $("#tagpays-fl")?.setAttribute("href", `#fl-${S.pays}`);
    const nom = $("#tagpays-nom");
    if (nom) nom.textContent = L(p.nom);
  }

  // Le DOSSIER DU PAYS, pas le catalogue filtré à l'affichage : un pays ne voit que ce que son
  // autorité reconnaît. Sans cela, la carte « lettre de demande » serait retombée sur le fichier
  // béninois faute d'entrée nigériane — un déposant de Lagos serait reparti avec une lettre
  // adressée à l'ABMed.
  const visibles = choisi ? docsDuPays(S.pays) : [];

  const tag = $("#tagcount");
  if (tag) {
    // Le compte est celui du DOSSIER quand un pays est retenu, celui du catalogue sinon. Accordé :
    // le dossier nigérian ne contient qu'une pièce, et « 1 modèles officiels » se remarque autant
    // qu'une faute d'orthographe sur la page d'accueil du produit gratuit.
    const n = choisi ? visibles.length : Object.keys(MODELES_FICHIERS).length;
    tag.textContent = `${n} ${
      n > 1
        ? L(["modèles officiels", "official templates"])
        : L(["modèle officiel", "official template"])
    }`;
  }

  const groupes = { produit: [], lettres: [], resumes: [] };
  for (const slug of visibles)
    groupes[MODELES_FICHIERS[slug].groupe]?.push(slug);
  for (const [g, slugs] of Object.entries(groupes)) {
    const el = $(`#grid-${g}`);
    if (el) el.innerHTML = slugs.map(carte).join("");
    // Un groupe vide garderait son titre et sa phrase d'introduction au-dessus du vide — la page
    // promettrait des lettres au Nigeria alors qu'elle n'en sert aucune.
    masquer(`#sec-${g}`, slugs.length === 0);
  }
}

/** Retient le pays et l'écrit dans l'URL — sans recharger, pour garder la position de lecture. */
function choisirPays(k) {
  S.pays = MODELES_PAYS.some((p) => p.k === k) ? k : null;
  const u = new URL(window.location.href);
  if (S.pays) u.searchParams.set("pays", S.pays);
  else u.searchParams.delete("pays");
  window.history.replaceState(null, "", u);
  peindre();
  // L'élément qui vient d'être cliqué est masqué par `peindre()` : sans reprise explicite, le
  // focus retombe sur <body>, l'utilisateur clavier repart du haut du document et le lecteur
  // d'écran n'annonce rien. On le pose sur la contrepartie de l'action.
  const cible = S.pays ? $("#pays-chg") : $("#etape-pays")?.querySelector("h2");
  if (cible) {
    cible.setAttribute("tabindex", "-1");
    cible.focus();
  }
  // Le déposant vient de choisir : on le ramène en haut de la page, où son pays est désormais
  // écrit sur l'étiquette du titre — pas au milieu d'une grille.
  document.querySelector("#main")?.scrollIntoView({ block: "start" });
}

document.querySelector("#grid-pays")?.addEventListener("click", (e) => {
  const a = e.target.closest("[data-pays]");
  if (!a) return;
  // La carte est un VRAI lien : on n'intercepte que le clic ordinaire. Ctrl/⌘/molette et
  // « ouvrir dans un nouvel onglet » doivent continuer à ouvrir `?pays=xx` pour de bon — les
  // confisquer ferait d'un lien un bouton déguisé, ce que ni le navigateur ni l'utilisateur
  // n'attendent.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
    return;
  e.preventDefault();
  choisirPays(a.dataset.pays);
});
document
  .querySelector("#pays-chg")
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
  S.pays = MODELES_PAYS.some((p) => p.k === k) ? k : null;
}
peindre();
