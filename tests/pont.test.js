// deno test — le pont entre le paiement et la page de livraison (U2). Tout ce qui décide est pur.
//
// ⚠️ Ce fichier vit HORS de `landing/`, et c'est délibéré : `landing/` est déployé TEL QUEL sur
// pharnos.com par `wrangler pages deploy`. Un test resté là serait servi publiquement — avec tout
// son raisonnement de sécurité en clair : plafonds, vecteurs de forge, incidents nommés. Il ne peut
// pas non plus vivre sous `supabase/functions/_shared/`, où il entrerait dans le paquet d'une Edge.
// La CI l'exécute en ajoutant `tests/` au chemin de `deno test`.
import { assertEquals } from "jsr:@std/assert@1";

import {
  ATTENTE_MAX_MS,
  ATTENTE_PIRE_CAS_MS,
  CADENCE_MS,
  MAX_UPGRADE_OCTETS,
  refusFichierUpgrade,
  delaiClaim,
  docTypeServeur,
  lireClaim,
  putRetentable,
  urlLivraison,
} from "../landing/pont/pont.js";

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

/* ─────────────────── Ce que la mise à niveau accepte, dit AVANT le paiement ─────────────────── */

Deno.test("upgrade : seul le PDF part — la page vend pourtant du Word", () => {
  // ⚠️ Le bloquant que ce test ferme. La bibliothèque accepte `.pdf`, `.doc` et `.docx` — juste
  // pour un outil gratuit. Le pont, lui, déclarait `application/pdf` EN DUR quel que soit le
  // fichier ; le mimetype enregistré dans Storage étant celui que le client déclare, ce mensonge
  // neutralisait les DEUX gardes du serveur. Un consultant déposant son `RCP.docx` — le format
  // natif de ces documents — payait, brûlait un dépôt sur trois, et se voyait refusé sans qu'aucun
  // écran sache dire pourquoi.
  assertEquals(refusFichierUpgrade({ name: "RCP.pdf", size: 1024 }), null);
  assertEquals(refusFichierUpgrade({ name: "RCP.PDF", size: 1024 }), null);
  assertEquals(refusFichierUpgrade({ name: "RCP.docx", size: 1024 }), "type");
  assertEquals(refusFichierUpgrade({ name: "RCP.doc", size: 1024 }), "type");
  assertEquals(
    refusFichierUpgrade({ name: "RCP.pdf.docx", size: 1024 }),
    "type",
  );
  assertEquals(refusFichierUpgrade(null), "type");
});

Deno.test(
  "upgrade : le plafond est celui du MOTEUR, pas celui de la bibliothèque",
  () => {
    // La pièce repart au modèle à chaque appel de conformité et de revue, encodée en base64 : au-delà
    // de ~12 Mo binaires on dépasse la limite de corps de requête du fournisseur. La bibliothèque
    // accepte 40 Mo ; laisser cet écart faisait échouer APRÈS paiement, rubrique par rubrique.
    assertEquals(MAX_UPGRADE_OCTETS, 12 * 1024 * 1024);
    assertEquals(
      refusFichierUpgrade({ name: "a.pdf", size: MAX_UPGRADE_OCTETS }),
      null,
    );
    assertEquals(
      refusFichierUpgrade({ name: "a.pdf", size: MAX_UPGRADE_OCTETS + 1 }),
      "taille",
    );
    assertEquals(refusFichierUpgrade({ name: "a.pdf", size: 0 }), "vide");
  },
);

Deno.test(
  "pont : la borne de la boucle compte AUSSI le temps passé dans les appels",
  () => {
    // ⚠️ `ATTENTE_MAX_MS` ne totalisait que les pauses. Chaque tentative pouvant ajouter son délai
    // réseau, le pire cas réel atteignait ~7 minutes sous un écran promettant « quelques secondes ».
    // Une boucle dont la borne ignore ses propres appels n'est pas bornée.
    assertEquals(ATTENTE_PIRE_CAS_MS > ATTENTE_MAX_MS, true);
    // L'échéance est testée EN TÊTE de chaque tour : le dépassement se borne au dernier tour engagé
    // (sa pause + son appel), pas à la somme des dix-huit délais réseau possibles.
    assertEquals(
      ATTENTE_PIRE_CAS_MS <= 120_000,
      true,
      "pire cas au-delà de deux minutes",
    );
  },
);
