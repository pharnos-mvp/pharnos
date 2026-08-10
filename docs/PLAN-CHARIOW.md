# PLAN — Encaissement Chariow (offres à l'acte)

> **Portée** : encaissement des offres vendues à l'unité (audits, upgrades, packs CTD Builder).
> **Hors portée** : l'abonnement Pharnos (Pro / Team / Business) — voir §11.
> **Plans liés** : [PLAN-MOTEUR-IA.md](PLAN-MOTEUR-IA.md) (production du livrable) ·
> [PLAN-CTD-BUILDER.md](PLAN-CTD-BUILDER.md) (produit vendu au crédit).
> **Dernière mise au propre** : 2026-07-28.

---

## 0. État et prochaine action

| | |
|---|---|
| **Boutique** | `store_pezqgl0f7v0p` (compte Chariow « pharnos ») · clé API en secret Supabase `CHARIOW_API_KEY` |
| **Produits** | les 2 offres Upgrade **publiées** au prix public · 2 offres de **recette** publiées (§4.4) |
| **Sous-domaine** | `services.pharnos.com` **branché**, certificat actif |
| **Code** | Edge `checkout` **en production** (parcours d'achat complet dans le panneau de `/modele`) · **L1+L3 écrits** (2026-08-10) : table `orders` + facturation (migration `0083`) et Edge `chariow-pulse` — à déployer et brancher (voir « Prochaine action ») · L5→L6 ouverts |
| **Décision de plateforme** | Supabase reste `free` jusqu'au 1ᵉʳ abonné payant (§2) |

**Ce qui marche aujourd'hui de bout en bout** : configuration de l'upgrade → dépôt du ou des
documents → identité → page du processeur DANS le panneau → retour et confirmation. La session de
paiement s'ouvre, l'acheteur est bien géolocalisé, la devise est correcte.

**Ce qui existe depuis le 2026-08-10 (L1+L3, écrits — pas encore déployés)** : la table `orders`
avec sa numérotation de facture sans trou (migration **`0083`** — le `0082` réservé par ce plan a
été pris entre-temps par la fenêtre de grâce de compilation) et l'Edge **`chariow-pulse`** :
réception du Pulse, jeton d'URL secret, **re-vérification `GET /v1/sales/{id}`** avec la clé
serveur, écriture idempotente (`chariow_sale_id` unique), bundle enregistré à **3 crédits**.
La logique vit dans `_shared/chariow-pulse-core.ts` (testée sans réseau) ; une commande de
recette est enregistrée mais **ne consomme pas** de numéro de facture. Deux écarts assumés sur
le schéma esquissé en §6 : `amount`+`currency` au lieu d'`amount_xof` (hors zone franc le
règlement est en EUR), pas de `lead_id` tant qu'aucun parcours ne le renseigne. La façade
`_shared/payments.ts` (§12) attend le **second rail** : les deux noyaux sont déjà purs, la
couture existe.

**Ce qui n'existe toujours pas** : le chemin de dépôt du document vers nos serveurs et **le lien
entre l'encaissement et le moteur Regafy AI** (L5). Le document reste dans l'IndexedDB de
l'acheteur et le transport est le bouton d'e-mail.

**Prochaine action : brancher L1+L3** — dans l'ordre :
1. `supabase db push` (migration `0083`) puis déploiement de `chariow-pulse` ;
2. poser le secret **`CHARIOW_PULSE_TOKEN`** (≥ 16 caractères aléatoires) dans les secrets Supabase ;
3. console Chariow : créer le Pulse `successful.sale` →
   `https://<ref>.supabase.co/functions/v1/chariow-pulse?jeton=<CHARIOW_PULSE_TOKEN>` ;
4. recette : un achat au jeton d'essai (570/575 F) doit produire une ligne `orders`
   (`essai: true`, sans facture) ; le premier achat réel, une ligne avec `PH-2026-000001`.
   ⚠️ La forme exacte de la réponse `GET /v1/sales/{id}` n'est documentée nulle part : le
   parseur est **fermé par défaut** (statut hors nomenclature ⇒ aucun octroi, tracé dans les
   logs avec son détail). Si la recette montre un statut inattendu, il s'ajoute dans
   `STATUTS_ABOUTIS` (`chariow-pulse-core.ts`) les yeux ouverts — jamais l'inverse.

**Point bloquant côté CEO**, indépendant du code : le **régime TVA** — sans lui le gabarit de
facture ne peut pas être figé (§10). Et **aucune transaction n'a encore atteint « Terminé »** chez
Chariow : il faut un règlement réel de bout en bout pour lever le doute sur l'encaissement lui-même
(cf. §4.4, c'est à cela que servent les offres de recette).

---

## 1. Décision

Chariow est retenu comme rail d'encaissement de démarrage. Le critère est la **mise en service
immédiate**, pas le coût : les agrégateurs UEMOA ont chacun un blocage dur — CinetPay instable,
FedaPay sans Visa/MC natif + caution + checkout plafonné à 50 000 FCFA, Kkiapay avec abonnement fixe,
Paystack absent du Bénin.

**Coût assumé : 15 % par vente** (palier Starter, < 5 000 $ de CA cumulé ; 10 % au-delà).

Cible à terme : Stripe Atlas pour l'international et le récurrent, **plus** un rail local pour le
Mobile Money. Les deux coexisteront de façon permanente — Stripe ne fera jamais de Mobile Money
UEMOA (§12).

---

## 2. Contraintes de plateforme

**Supabase reste sur le plan `free` jusqu'au premier client payant Pharnos** — décision CEO actée
le 2026-07-28.

| Limite Edge Function | `free` (aujourd'hui) | Pro (après 1ᵉʳ abonné) |
|---|---|---|
| Wall clock | **150 s** | 400 s |
| Idle timeout | 150 s | 150 s |
| CPU par requête | 2 s | 2 s |

Trois conséquences à garder présentes dans toute conception :

✅ **Défaut en production corrigé (lot M0).** `UPGRADE_TIMEOUT_MS` valait `180_000` — au-dessus du
mur de 150 s, donc un garde-fou qui ne pouvait jamais se déclencher (la plateforme tuait le worker
avant, en 546). Désormais 120 s, et **tout** appel sortant est écrêté à `MAX_CALL_TIMEOUT_MS`
dans [vertex.ts](../supabase/functions/_shared/vertex.ts) : poser un garde-fou mort est devenu
structurellement impossible.

⚠️ **Le battement de cœur SSE ne défend que contre l'*idle timeout***, jamais contre le wall clock.
Toute conception qui s'appuie dessus comme garantie est fragile. Le livrable payant passe par un
**job asynchrone**, pas par une connexion tenue — voir PLAN-MOTEUR-IA §4.

⚠️ **Génération DOCX/PDF interdite côté Edge** (2 s de CPU). Elle reste dans `web/`
(`docx@9.7.1`, `pdf-lib`).

Infrastructure asynchrone déjà disponible sur le projet : `pg_cron 1.6.4` ✅, `pg_net 0.20.3` ✅.

---

## 3. Le sous-domaine

Ce sous-domaine est un **CNAME vers une plateforme tierce que nous n'exploitons pas** : le nom
choisi délègue une part de la confiance de la marque.

| Candidat | Verdict |
|---|---|
| `shop.pharnos.com` | **Rejeté.** « Shop » accolé à une marque pharmaceutique évoque la vente de médicaments en ligne — le pire signal possible pour un outil vendu à des labos et lu par des autorités. |
| `pay.pharnos.com` | **Rejeté.** Motif de sous-domaine le plus imité par le phishing ; et il promet une infrastructure de paiement que nous n'opérons pas, qui changera d'opérateur alors que le nom restera. |
| `audit.pharnos.com` | Trop étroit : ni l'Upgrade ni le CTD Builder ne sont des audits. |
| **`services.pharnos.com`** | **Retenu.** Exact, identique en FR et EN, aucune connotation retail ni bancaire, extensible à tout ce qui se vend à l'unité. |

⚠️ **Contrainte technique vérifiée** : [`landing/_headers`](../landing/_headers) impose
`Strict-Transport-Security: max-age=31536000; includeSubDomains`. Tout sous-domaine de `pharnos.com`
**doit** servir un HTTPS valide, sinon il devient totalement inaccessible pour quiconque a déjà
chargé la landing. Chariow fournit le certificat automatiquement — **à vérifier avant d'annoncer l'URL**.

Note : `services.pharnos.com` n'est **pas sur le chemin critique de l'encaissement** (§4), puisque
tout le catalogue passe par l'API. Il reste la surface publique de marque : catalogue, pages légales.

---

## 4. Catalogue et prix

Parité **fixe** EUR/XOF (1 € = 655,957 FCFA) — les deux colonnes ne divergeront jamais.
Réutiliser `lib/money`, ne jamais recoder la conversion.

**Barème arrêté par le CEO le 2026-07-28.**

| Offre | `product_id` | Crédits | Prix | FCFA | Net après 15 % |
|---|---|---|---|---|---|
| **Audit Module 1 — Regafy AI** | `prd_g823flj8` ✅ | 1 | 49 € | 32 150 F | 27 328 F |
| **Upgrade RCP / SmPC** | `prd_hf86pys5` ✏️ | 1 | 29 € | 19 050 F | 16 193 F |
| **Upgrade Notice / Leaflet** | `prd_1u8jrq16` ✏️ | 1 | 29 € | 19 050 F | 16 193 F |
| **Upgrade Étiquetage / Labelling** | à créer | 1 | 29 € | 19 050 F | 16 193 F |
| **Bundle Upgrade — les 3 documents** | à créer | 3 | 69 € | 45 300 F | 38 505 F |
| **Audit Expert RA** | `prd_tuowhsmf` ✅ | 1 | 300 € | 196 800 F | 167 280 F |
| **Audit Expert Senior RA** | `prd_g5gzdlfh` ✅ | 1 | 500 € | 328 000 F | 278 800 F |
| **CTD Builder — 3 compilations** | à créer | 3 | 49 € | 32 150 F | 27 328 F |
| **CTD Builder — 20 compilations** | à créer | 20 | 249 € | 163 350 F | 138 848 F |
| **CTD Builder — Licence annuelle** | à créer | ∞ / 12 mois | 490 € | 321 450 F | 273 233 F |

✅ nom et prix corrects · ✏️ à renommer. `prd_hf86pys5` est à 7 900 F et doit être reprisé ;
`prd_1u8jrq16` est **déjà à 19 050 F**, seul le nom change.

- **Tarif unitaire plat à 29 €** : la lisibilité l'emporte sur l'optimisation par document.
  L'étiquetage coûte 0,27 $ à produire et le RCP 1,79 $ — les deux dégagent plus de 90 % de marge.
- **Bundle à 69 €** contre 87 € à l'unité : **−21 %**, l'écart lisible qui fait basculer.
- Grille CTD Builder justifiée dans [PLAN-CTD-BUILDER.md](PLAN-CTD-BUILDER.md) §3.

### 4.1 Tout en type « Licence », y compris les prestations humaines

L'API Chariow refuse le type **Service** (`init-checkout` rejette Service, Coaching et Prix libre).
En passant les deux offres expertes en Licence, **la totalité du catalogue devient encaissable par
l'API** : un seul chemin de code, aucune dépendance au widget Snap ni à la vitrine.

Contrepartie assumée : l'acheteur d'un Audit Expert reçoit une clé de licence là où il attend
« un expert va relire votre dossier ». Elle sert de **référence de commande** ; c'est notre e-mail
Resend qui porte le vrai message.

**Pourquoi Licence et pas Fichier** : les types Fichier, Formation et Bundle refusent le rachat tant
qu'un accès est actif (`step: "already_purchased"`). Un labo commandant un 2ᵉ audit pour un 2ᵉ
dossier serait bloqué. Seule la Licence autorise toujours le rachat. Modèle de tarification :
**Paiement unique** obligatoire.

❓ **À faire confirmer par le support Chariow** : vendre une prestation humaine livrée en 7 jours
sous un produit de type Licence pose-t-il un problème au regard de leurs CGU ? Si oui, bascule des
deux offres expertes en Service + vitrine — deux heures de travail.

### 4.2 Points de vigilance

⚠️ **La devise de la boutique est le FCFA.** Un acheteur européen verra une conversion faite **par
Chariow**, qui n'est pas tenue d'appliquer la parité fixe. À vérifier sur le premier checkout réel ;
si l'écart est sensible, publier les prix en EUR et laisser Chariow convertir.

⚠️ **75 € de commission sur l'Audit Senior.** C'est le premier produit à migrer le jour où un rail
moins cher existe.

⚠️ **Supprimer le produit de test** « Audit Module 1 - Expert RA » (64 900 F, publié, type Service) :
doublon de `prd_tuowhsmf`, et seul produit du catalogue que l'API ne sait pas encaisser.

### 4.3 L'Upgrade se vend dans le rapport d'audit

L'Audit Module 1 détecte les écarts au gabarit sur le RCP, la notice et l'étiquetage ; l'Upgrade les
corrige. Le vendre **dans le rapport**, sur les documents effectivement non conformes, plutôt que
comme une carte de plus sur la page : le panier moyen suit la non-conformité réellement constatée,
et l'argument de vente est déjà écrit.

Périmètre de l'Upgrade : reformulation de niveau expert RA, réadaptation au gabarit, **zéro
invention**, **et traduction** — chaque document est livré en **FR et EN**, mis en page selon le
modèle, exporté en DOCX et PDF.

### 4.4 Offres de recette — 570 / 575 F CFA, jamais 0

**Chariow impose un montant minimum de 570 F CFA par commande** (mesuré le 2026-08-02 : saisir `0`
ou `100` renvoie « Le prix minimum du produit doit être de 570 F CFA »). Une offre à **0 F CFA est
donc impossible** — et le serait deux fois, puisque l'API `/v1/checkout` refuse par ailleurs les
produits à prix libre (422, « Prix libre non pris en charge »). Les deux offres de recette sont donc
au plancher, séparées d'un franc pour se distinguer dans le tableau des ventes :

| Offre de recette | `product_id` | Prix |
|---|---|---|
| TEST — Mise à niveau documentaire — 1 document | `prd_g3norblb` | 570 F CFA |
| TEST — Mise à niveau documentaire — les trois documents | `prd_abtk4i8b` | 575 F CFA |

Elles sont publiées mais **masquées de la vitrine**, comme les offres publiques, et portent la même
URL de redirection.

**Comment on les atteint.** `pharnos.com/modele?essai=<jeton>`. Le navigateur transporte la chaîne,
il ne choisit rien : l'Edge la compare en temps constant au secret `CHECKOUT_ESSAI_TOKEN` et n'utilise
le catalogue de recette **que** si elle correspond. Jeton absent, faux, ou secret non configuré ⇒
prix public. Le panneau affiche un bandeau « Mode recette » dès qu'un jeton est présenté, pour qu'un
règlement de test ne se confonde jamais avec un règlement à 19 000 F. La commande part chez Chariow
avec `custom_metadata.essai = "1"`, ce qui la rendra reconnaissable dans les webhooks de L3.

Vérifié en production le 2026-08-02 : avec le jeton, la vente s'inscrit à **570 F CFA** sur le
produit TEST ; avec un jeton faux, à **19 000 F CFA** sur le produit public.

---

## 5. Architecture

```
checking-standard.html / page CTD Builder
  « Commander »  ──POST──►  Edge chariow-checkout        (verify_jwt = false)
                             │ CORS landing + rate-limit fail-closed + Turnstile
                             │ offre ∈ LISTE BLANCHE → product_id résolu SERVEUR
                             │ POST /v1/checkout/init (+ custom_metadata)
                             └─►  302 vers checkout_url

Chariow ──Pulse successful.sale──►  Edge chariow-pulse   (verify_jwt = false)
                             │ 1. RE-VÉRIFIE  GET /v1/sales/{id}
                             │ 2. UPSERT orders (unique sur chariow_sale_id)
                             │ 3. numérote la facture, émet delivery_token, envoie l'e-mail
                             └─►  app.pharnos.com/commande/:token

/commande/:token (route publique web/)
  dépôt du document ──► Edge order-run ──► job asynchrone par rubrique (PLAN-MOTEUR-IA)
                                          ──► DOCX + PDF côté navigateur
```

**Réutilisations — rien de tout cela n'est à inventer :**

| Besoin | Existant |
|---|---|
| Edge publique sans compte | `checking-report` (CORS whitelist, rate-limit `share_hit` fail-closed) |
| Jeton d'accès public | `_shared/share-auth.ts` (testé) |
| Route publique tokenisée | `web/src/features/correspondence/public/PublicReviewPage.tsx` |
| Génération DOCX / PDF | `docx@9.7.1` + `pdf-lib` déjà dans `web/` |
| Moteur de conformité | `_shared/conformity-specs.ts`, `_shared/pharma-glossary.ts` |
| Conversion EUR/XOF | `lib/money` (parité fixe) |
| Envoi d'e-mail | `RESEND_API_KEY` + `EMAIL_FROM`, déjà utilisés par 6 fonctions |

**Convention maison** : la logique vit dans `_shared/*-core.ts` avec son test unitaire ; l'Edge
n'est qu'un adaptateur HTTP.

---

## 6. Modèle de données — migration `0083`

> **Livré (2026-08-10).** Le schéma ci-dessous est l'esquisse d'origine ; la source de vérité
> est [`0083_orders.sql`](../supabase/migrations/0083_orders.sql), qui documente ses trois
> écarts (`amount`+`currency`, pas de `lead_id`, `offer` borné sans enum SQL) et ajoute le
> compteur `invoice_counters` — un compteur sous verrou de ligne, pas une SEQUENCE, parce
> qu'une séquence survit au rollback et laisse des trous.

La table s'appelle **`orders`** : un seul mécanisme de crédits porte l'audit, les upgrades et les
packs CTD Builder. Un seul point de décrémentation, une seule chaîne de livraison.

```sql
-- orders : une commande payée à l'acte. RLS deny-all, service_role uniquement.
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  offer               text not null,   -- 'audit_m1' | 'upgrade_rcp' | 'upgrade_notice'
                                       -- | 'upgrade_etiquetage' | 'upgrade_bundle'
                                       -- | 'expert_ra' | 'expert_senior'
                                       -- | 'ctd_3' | 'ctd_20' | 'ctd_licence'
  status              text not null default 'pending'
                        check (status in ('pending','paid','delivered','refunded','failed')),
  chariow_sale_id     text unique,     -- idempotence des rejeux de Pulse
  chariow_purchase_id text,
  amount_xof          integer not null,
  currency            text not null default 'XOF',
  email               text not null,
  first_name          text, last_name text, phone text, country text,
  lead_id             uuid references public.checking_leads(id) on delete set null,
  delivery_token_hash text,            -- jamais le jeton en clair
  credits_total       integer not null default 1,
  credits_used        integer not null default 0,
  expires_at          timestamptz,     -- validité : 12 mois pour les packs et la licence
  invoice_number      text unique,     -- PH-2026-000001, attribué à la transition 'paid'
  metadata            jsonb not null default '{}'::jsonb
);
alter table public.orders enable row level security;   -- aucune policy = deny-all
```

`chariow_sale_id UNIQUE` porte l'idempotence **en base**, pas dans le code : Chariow rejoue jusqu'à
5 fois (1 min, 5 min, 30 min, 2 h, 24 h).

`credits_total` / `credits_used` remplacent `checkAiQuota` : l'acheteur public n'a pas d'organisation,
donc le quota est porté par la commande. Sans ce garde-fou, un jeton de livraison qui fuite consomme
du budget IA sans limite.

**Règles de décrémentation :**
- Un crédit se consomme **à la production du livrable** (rapport d'audit, document upgradé,
  paquet CTD compilé), jamais à la création ou au dépôt.
- Les **ré-exports du même livrable pendant 30 jours ne consomment rien** : sinon une coquille dans
  un nom de fichier coûte un crédit, et c'est le meilleur moyen de détruire la confiance.
- La décrémentation vit **dans la fonction qui écrit**, jamais dans le calcul d'affichage.
- **Un document refusé par la porte de recevabilité ne produit rien, donc ne consomme rien**
  ([PLAN-RECEVABILITE.md](PLAN-RECEVABILITE.md)). Il n'y a aucun remboursement à écrire : il n'y a
  pas de débit. Ce qui doit être borné, c'est le NOMBRE de refus par commande — **trois** — parce que
  la classification coûte un appel IA à chaque tentative. Au-delà, la commande reste ouverte et le
  support prend la main : jamais un client bloqué avec un crédit payé et rien en face.

---

## 7. Contrats des Edge Functions

### `chariow-checkout` — `verify_jwt = false`
- **Entrée** : `{ offer, email, first_name, last_name, phone, country, lead_id?, turnstile }`
- `offer` est un **littéral d'une liste blanche**. Le client n'envoie **jamais** de `product_id` ni de
  montant : le serveur les résout. (Même classe de faille que le `na` forgeable du Checking.)
- CORS restreint à la landing, rate-limit fail-closed par IP puis global.
- Appelle `POST /v1/checkout/init` avec `custom_metadata = { order_id, offer, lead_id }`
  (10 paires max, 255 caractères chacune) et `redirect_url` (2048 caractères max).
- **Sortie** : `{ checkout_url }` — le front redirige.

### `chariow-pulse` — `verify_jwt = false`
- **Les Pulses n'ont aucune signature.** Vérifié dans la console : le formulaire de création ne
  contient que URL + événement + portée produit, aucun champ secret. Le webhook est **un signal,
  jamais une preuve**.
- Séquence obligatoire : recevoir → répondre 200 immédiatement → **re-vérifier `GET /v1/sales/{id}`
  avec la clé serveur** → n'accorder qu'ensuite.
- URL non devinable **et** rate-limit : l'endpoint est public.
- Rejet permanent → Sentry.

### `order-run` — `verify_jwt = false`
- Authentifie par `delivery_token` (`_shared/share-auth.ts`).
- Décrémente `credits_used` de façon atomique dans la fonction qui écrit.
- Déclenche le **job asynchrone** décrit dans PLAN-MOTEUR-IA §4 — ne tient aucune connexion longue.
- **Ne modifie pas** la fonction `upgrade` authentifiée : zéro régression sur l'in-app.

### `list_products` au déploiement
Vérifier que chaque `product_id` configuré existe et est publié. Une erreur de configuration doit se
voir au smoke test, pas au premier client tombé sur un checkout mort.

---

## 8. Invariants de sécurité

1. La clé API Chariow vit dans les secrets Supabase. **Jamais** dans `landing/` ni dans `web/`.
2. Le prix et le produit sont choisis **côté serveur**, à partir d'une liste blanche d'offres.
3. **Aucun octroi sur la seule foi d'un Pulse** — re-vérification serveur systématique.
4. Idempotence par contrainte SQL unique, pas par logique applicative.
5. **Snap n'est jamais embarqué sur `checking-standard.html`.** Le code généré par Chariow est un
   `<script>` **inline** qui injecte script et CSS depuis `js.chariowcdn.com` ; l'accepter imposerait
   `script-src 'unsafe-inline' https://js.chariowcdn.com` sur la page qui collecte les leads.
6. `delivery_token` stocké **haché**, jamais en clair.

---

## 9. Lots et séquencement

| Lot | Responsable | Contenu | Dépend de |
|---|---|---|---|
| **L0** | CEO | Coller les 10 descriptions · publier · supprimer le produit de test · brancher `services.pharnos.com` · passer la vitrine en FR · demander au support : facture, CGU/Licence, signature des Pulses | — |
| **L1** | Dev | ✅ **2026-08-10** — migration `0083` (`orders` + `invoice_counters`) · `_shared/chariow-pulse-core.ts` + tests. La façade `payments.ts` attend le second rail (§12) | — |
| **L2** | Dev | ✅ livré sous le nom `checkout` (+ `_shared/checkout-core.ts`) | L1 |
| **L3** | Dev | ✅ **2026-08-10** — Edge `chariow-pulse` + numérotation de facture (à déployer/brancher, §0) | L1 |
| **L4** | Dev | Câblage des boutons de [`checking-standard.html`](../landing/checking-standard.html) · `data-price` renseignés · retrait de « paiement en ligne en cours de déploiement » · page de retour | L2, L0 |
| **L5** | Dev | Route `/commande/:token` + Edge `order-run` + exports DOCX/PDF | L3 |
| **L6** | Dev | Upsell Upgrade dans le rapport d'audit (§4.3) | L5 |
| **L7** | Dev | Moteur de facture (§10) | L3 |

### 9.1 Les deux chantiers ne sont pas en série

**Les offres expertes (300 € et 500 €) sont livrées par des humains et ne dépendent d'aucune brique
IA.** Elles peuvent donc encaisser pendant que le moteur se règle — et ce sont les tickets les plus
élevés du catalogue.

```
Socle IA (M0·M1·M2) ──► Qualité (M3→M7) ──► Upgrade & Audit vendables
                                                   │
Chariow L1·L2·L3 ──► L4 offres EXPERTES seules ────┴──► L4 complet · L5 · L6
                      ↑ encaisse pendant le chantier
```

**Rien qui dépend de l'IA ne se vend avant M3.** C'est le banc d'essai qui valide le modèle
économique : vendre un Upgrade avant d'avoir mesuré le taux de rejet `source_evidence` reviendrait à
vendre une garantie non vérifiée sur un dossier d'AMM.

### 9.2 Règle anti-dette : aucun code couplé à un fournisseur avant M1

⚠️ **L5 (`order-run`) ne doit pas être écrit avant M1.** Écrit plus tôt, il appellerait Vertex en
direct et serait à réécrire dès l'arrivée de l'abstraction fournisseur — c'est-à-dire de la dette
créée volontairement. La première vague Chariow s'arrête donc à **L4**, et L5 attend M1/M2.

Même règle pour les crédits CTD : ils passent par `orders` (§6) et n'existent pas avant L1.
Deux systèmes de crédits seraient de la dette, pas une fonctionnalité.

---

## 10. Facture Pharnos

Chariow se déclare « **pas marchand de référence** ». Juridiquement, **le vendeur c'est Pharnos** —
Chariow n'est qu'un encaisseur, comme Stripe. Aucun risque de double facturation : notre facture est
la seule pièce comptable qui compte pour le client.

**Règles non négociables :**

1. **Numérotation séquentielle sans trou**, issue d'une séquence Postgres, format `PH-2026-000001`,
   attribuée **dans la transaction** qui passe la commande en `paid`. Jamais côté client, jamais un
   compteur applicatif, jamais dérivée d'un identifiant Chariow.
2. **Une facture émise est immuable.** On stocke le PDF dans Storage **et** un instantané JSON des
   données d'émission (raison sociale, adresse, taux, mentions). Un changement de mentions l'an
   prochain ne doit pas réécrire les factures de cette année.
3. **Un remboursement produit un avoir**, jamais une suppression ni une modification.
4. **Génération côté Edge** : la facture doit exister même si le client n'ouvre jamais l'application.
   `_shared/invoice-core.ts` + rendu PDF, envoi par Resend.

**Bloquant — à fournir avant de figer le gabarit :**

| # | Information | Pourquoi |
|---|---|---|
| 1 | Raison sociale exacte + forme juridique | Mention obligatoire |
| 2 | Adresse du siège | Mention obligatoire |
| 3 | **RCCM** et **IFU** | Obligatoires au Bénin |
| 4 | **Régime TVA** : assujetti ? Si oui, taux, et prix **HT ou TTC** ? | **Le plus important** : change la facture, le prix affiché et la marge |
| 5 | Coordonnées bancaires à afficher, ou non | Mise en page |
| 6 | Logo haute définition | Rendu |

⚠️ Vérifier que `EMAIL_FROM` pointe sur un domaine vérifié chez Resend. Le repli codé en dur est
`onboarding@resend.dev` — une **facture** partant de cette adresse finit en spam.

---

## 11. Ce qui reste hors Chariow

**L'abonnement Pharnos.** Vérifié à l'écran : pour un produit Licence, les seuls modèles de
tarification sont Paiement unique, Gratuit et Prix libre. **Aucune récurrence.** Pro / Team /
Business continuent en facture + virement.

**Les gros contrats.** Business 400k et Entreprise sur devis passent par bon de commande et virement :
c'est ainsi que les labos achètent, et cela évite 15 % de commission sur les plus gros tickets.

---

## 12. Réversibilité

`_shared/payments.ts` expose deux méthodes — `createCheckout()`, `verifySale()` — et `chariow.ts`
les implémente. Coût : ~40 lignes. Le jour du basculement on écrit `stripe.ts` ou `moneroo.ts`, et
**ni le front, ni la base, ni le pipeline de livraison ne bougent**.

Ce n'est pas une précaution temporaire : **Stripe ne fera jamais de Mobile Money UEMOA.** Deux
implémentations coexisteront de façon permanente — autant poser l'abstraction maintenant.

À noter : **Moneroo appartient au même groupe qu'Axa Zara/Chariow** et donne accès aux mêmes rails
sans la commission créateur. C'est la première sortie à évaluer, avant Stripe Atlas.

Comparatif des agrégateurs UEMOA (CinetPay, Wave, PayDunya, FedaPay, Hub2, Kkiapay, Semoa,
IntouchPay, Paystack) : conservé dans l'historique de décision, à ré-instruire au moment du
basculement — les grilles évoluent, et la passerelle d'interopérabilité BCEAO les rebattra.

---

## 13. Recette

- [ ] Achat Audit Module 1 réel en Mobile Money → `orders.status = 'paid'` en < 30 s
- [ ] Rejeu manuel du même Pulse → **aucune** seconde ligne (contrainte unique)
- [ ] Pulse forgé (POST direct, `sale_id` inexistant) → rejeté, tracé Sentry, **aucun octroi**
- [ ] Achat d'un 2ᵉ audit par le même e-mail → accepté (type Licence)
- [ ] `credits_used` atteint `credits_total` → `order-run` refuse
- [ ] Ré-export du même livrable à J+29 → **ne consomme pas** de crédit
- [ ] Facture : numérotation sans trou sur 20 commandes concurrentes
- [ ] CSP et Lighthouse inchangés sur `checking-standard.html` (aucune directive ajoutée)
- [ ] `services.pharnos.com` en HTTPS valide (HSTS `includeSubDomains`)
- [ ] Parcours EN complet
