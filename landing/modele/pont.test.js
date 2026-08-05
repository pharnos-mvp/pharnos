// deno test — le pont entre le paiement et la page de livraison (U2). Tout ce qui décide est pur.
//
// ⚠️ Ce fichier vit dans `landing/` et non dans `supabase/functions/_shared/` : il teste du code de
// la landing, et rien ici ne doit finir dans le paquet d'une Edge Function. La CI l'exécute en
// ajoutant `landing/` au chemin de `deno test`.
import { assertEquals } from "jsr:@std/assert@1";

import {
  ATTENTE_MAX_MS,
  CADENCE_MS,
  delaiClaim,
  docTypeServeur,
  lireClaim,
  putRetentable,
  urlLivraison,
} from "./pont.js";

const JETON = "a".repeat(43);

/* ─────────────────────────────────────── La destination ────────────────────────────────────── */

Deno.test(
  "pont : le jeton part dans le CHEMIN, sur l’origine de l’application",
  () => {
    assertEquals(
      urlLivraison(JETON, "pharnos.com"),
      `https://app.pharnos.com/u/${JETON}`,
    );
    assertEquals(
      urlLivraison(JETON, "www.pharnos.com"),
      `https://app.pharnos.com/u/${JETON}`,
    );
    // ⚠️ Jamais en chaîne de requête : un paramètre d'URL fuit dans les `Referer`, les journaux de
    // proxy et les captures d'écran — et ce jeton EST l'authentification pendant trente jours.
    assertEquals(urlLivraison(JETON, "pharnos.com").includes("?"), false);
  },
);

Deno.test(
  "pont : en développement, la destination reste sur la machine",
  () => {
    for (const hote of ["localhost", "127.0.0.1", "[::1]"]) {
      assertEquals(
        urlLivraison(JETON, hote),
        `http://localhost:4319/u/${JETON}`,
      );
    }
    // Un hôte qui CONTIENT « localhost » sans en être un part bien en production : une comparaison
    // par sous-chaîne enverrait les acheteurs de `localhost.attaquant.fr` sur un serveur local.
    assertEquals(
      urlLivraison(JETON, "localhost.attaquant.fr"),
      `https://app.pharnos.com/u/${JETON}`,
    );
  },
);

/* ────────────────────────────────── Les réponses du serveur ────────────────────────────────── */

Deno.test("pont : « pas encore » n’est PAS un échec", () => {
  // Le cas nominal des premières secondes : le Pulse Chariow peut arriver après le client. Le
  // traiter en erreur renverrait l'acheteur sur « commande introuvable » une seconde avant que sa
  // commande n'existe.
  assertEquals(lireClaim(200, { status: "pending" }), { etat: "attente" });
});

Deno.test("pont : un jeton n’est retenu que s’il est vraiment là", () => {
  assertEquals(lireClaim(200, { status: "ready", token: JETON }), {
    etat: "pret",
    token: JETON,
  });
  // `ready` sans jeton exploitable est une réponse cassée, pas une autorisation : on continue
  // d'attendre plutôt que de rediriger vers `/u/undefined`.
  for (const corps of [
    { status: "ready" },
    { status: "ready", token: "" },
    { status: "ready", token: 7 },
  ]) {
    assertEquals(lireClaim(200, corps).etat, "attente", JSON.stringify(corps));
  }
});

Deno.test(
  "pont : expiré et « voyez votre e-mail » sont définitifs, le reste se retente",
  () => {
    assertEquals(lireClaim(410, { status: "expired" }), { etat: "expire" });
    assertEquals(lireClaim(429, { status: "use_email" }), {
      etat: "voir_email",
    });
    // 429 SANS `use_email`, c'est la limitation de débit : elle passe, on réessaie.
    assertEquals(lireClaim(429, { error: "rate_limited" }), {
      etat: "attente",
    });
    // Une panne ou une réponse illisible ne dit rien de la commande — seulement de cet appel-ci.
    for (const [s, c] of [
      [503, {}],
      [500, null],
      [400, { error: "bad_request" }],
      [0, undefined],
    ]) {
      assertEquals(lireClaim(s, c).etat, "attente", `${s}`);
    }
  },
);

/* ─────────────────────────────────────── La cadence ────────────────────────────────────────── */

Deno.test("pont : la boucle part tout de suite, ralentit, et FINIT", () => {
  assertEquals(delaiClaim(0), 0);
  assertEquals(delaiClaim(1), CADENCE_MS[0]);
  assertEquals(
    delaiClaim(CADENCE_MS.length),
    CADENCE_MS[CADENCE_MS.length - 1],
  );
  // ⚠️ La fin de la boucle est ce qui empêche un onglet oublié d'interroger le serveur sans fin.
  assertEquals(delaiClaim(CADENCE_MS.length + 1), null);
  // Et elle est monotone : une cadence qui se resserrerait en fin de course chargerait le serveur
  // exactement quand l'incident dure.
  for (let i = 1; i < CADENCE_MS.length; i++) {
    assertEquals(CADENCE_MS[i] >= CADENCE_MS[i - 1], true, `palier ${i}`);
  }
});

Deno.test(
  "pont : l’attente bornée laisse au webhook le temps d’arriver, sans éterniser",
  () => {
    assertEquals(
      ATTENTE_MAX_MS >= 60_000,
      true,
      "trop court pour un webhook en retard",
    );
    assertEquals(
      ATTENTE_MAX_MS <= 150_000,
      true,
      "trop long : l’acheteur mérite une consigne",
    );
  },
);

/* ──────────────────────────────────── Le téléversement ─────────────────────────────────────── */

Deno.test("pont : seul ce qui a une chance de passer se retente", () => {
  // Coupure réseau (la requête n'a jamais abouti) et pannes serveur : oui.
  for (const s of [null, 408, 429, 500, 502, 503, 504]) {
    assertEquals(putRetentable(s), true, `${s}`);
  }
  // URL signée expirée ou consommée : réessayer à l'identique refusera pareil, trois fois plus
  // lentement — et pendant ce temps l'acheteur regarde un écran qui prétend travailler.
  for (const s of [400, 401, 403, 404, 409, 413]) {
    assertEquals(putRetentable(s), false, `${s}`);
  }
});

/* ─────────────────────────── Le vocabulaire des types de document ──────────────────────────── */

Deno.test(
  "pont : l’étiquetage s’appelle `labeling` côté serveur — le traduire ou ne rien envoyer",
  () => {
    // ⚠️ Le défaut que ce test ferme a tué une commande entière. La landing nomme l'étiquetage
    // `etiquetage` ; la liste blanche du serveur le nomme `labeling`. Envoyé tel quel, il était
    // inconnu et le serveur retombait en silence sur `rcp` : l'acheteur d'un étiquetage voyait son
    // document jugé contre le gabarit du RCP, refusé trois fois, sa commande payée verrouillée.
    assertEquals(docTypeServeur("rcp"), "rcp");
    assertEquals(docTypeServeur("notice"), "notice");
    assertEquals(docTypeServeur("etiquetage"), "labeling");
  },
);

Deno.test("pont : ce qu’on ne sait pas traduire ne part PAS", () => {
  // Rien plutôt qu'un type approximatif : la page de suivi redemandera le document, alors qu'un
  // mauvais type consomme un dépôt sur trois ET fait juger contre le mauvais gabarit.
  for (const inconnu of ["pght", "cover", "labeling", "", null, undefined, 7]) {
    assertEquals(docTypeServeur(inconnu), null, String(inconnu));
  }
  // ⚠️ Les clés du prototype : `objet['constructor']` rend une fonction — donc vraie — et un
  // `?? null` ne rattraperait rien. La table est une `Map`, qui n'a pas de prototype à confondre.
  for (const poison of [
    "constructor",
    "toString",
    "valueOf",
    "__proto__",
    "hasOwnProperty",
  ]) {
    assertEquals(docTypeServeur(poison), null, poison);
  }
});
