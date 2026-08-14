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
  CADENCE_RELANCE_MS,
  delaiClaim,
  lireClaim,
  palierAttente,
  PALIERS_ATTENTE,
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
  "pont : la salle d’attente survit à DEUX périodes du cron de réconciliation (C2)",
  () => {
    // ⚠️ La première vente réelle l'a prouvé : le Pulse peut ne JAMAIS arriver. La commande naît
    // alors du balayage `chariow-reconcile` (toutes les 2 minutes) — l'acheteur qui attend ici
    // doit encore être là quand elle naît. 2 périodes pleines + marge = 5 minutes au moins.
    assertEquals(
      ATTENTE_MAX_MS >= 5 * 60_000,
      true,
      "trop court : l’acheteur partirait avant la réconciliation",
    );
    assertEquals(
      ATTENTE_MAX_MS <= 8 * 60_000,
      true,
      "trop long : l’acheteur mérite une consigne",
    );
    // Le pire cas réel reste borné lui aussi.
    assertEquals(Number.isFinite(ATTENTE_PIRE_CAS_MS), true);
  },
);

Deno.test("pont : la salle d’attente ne se tait JAMAIS — un palier pour chaque instant (C2)", () => {
  // Le premier palier s'applique dès 0 ms, les suivants sont croissants : aucun trou de silence.
  assertEquals(PALIERS_ATTENTE[0].apresMs, 0);
  for (let i = 1; i < PALIERS_ATTENTE.length; i++) {
    assertEquals(
      PALIERS_ATTENTE[i].apresMs > PALIERS_ATTENTE[i - 1].apresMs,
      true,
      `palier ${i}`,
    );
  }
  // Chaque palier parle les deux langues, texte ET note.
  for (const p of PALIERS_ATTENTE) {
    assertEquals(p.texte.length, 2);
    assertEquals(p.note.length, 2);
  }
  // La sélection rend la DERNIÈRE entrée atteinte — jamais une future.
  assertEquals(palierAttente(0), PALIERS_ATTENTE[0]);
  assertEquals(palierAttente(PALIERS_ATTENTE[1].apresMs), PALIERS_ATTENTE[1]);
  assertEquals(
    palierAttente(Number.MAX_SAFE_INTEGER),
    PALIERS_ATTENTE[PALIERS_ATTENTE.length - 1],
  );
});

Deno.test("pont : la relance avant repli est COURTE — jamais une deuxième salle d’attente (C4)", () => {
  const total = CADENCE_RELANCE_MS.reduce((t, d) => t + d, 0);
  assertEquals(total <= 45_000, true, "la rafale doit rester une rafale");
  assertEquals(CADENCE_RELANCE_MS.length >= 3, true, "au moins quelques essais");
});

// B2 — les tests du téléversement (`putRetentable`), du vocabulaire (`docTypeServeur`) et des
// gardes de fichier (`refusFichierUpgrade`) sont PARTIS avec le transfert inter-origines : le
// panneau ne collecte plus aucun fichier, le dépôt vit sur `/u/{token}` — et ses gardes sont
// testées là-bas (`upgrade-flow.test.ts`, `PublicUpgradePage.test.tsx`).
