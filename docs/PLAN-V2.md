# Pharnos V2 — durcissement piloté de A à Z

> **[2026-06-12] V2 + recettes n°1-7 LIVRÉES (en prod).** La suite (jalons H→M jusqu'au MVP
> livrable) est ancrée dans **[ROADMAP-MVP.md](ROADMAP-MVP.md)**.

> Plan approuvé par le CEO le 2026-06-11. Ne remplace pas `docs/PLAN.md` (plan MVP, historique) —
> il le prolonge. La V2 vit sur la branche `v2`, déployée en preview sur
> **https://v2.pharnos.pages.dev** ; `main` et la prod (https://pharnos.pages.dev) restent
> intacts jusqu'au go final (merge unique `v2 → main`, tag `v1-mvp` posé avant).

## Verdict CTO

**Pas de réécriture.** Trois audits (produit, architecture, qualité/sécu) notent l'existant 9/10 :
offline-first Dexie + outbox/LWW, RLS prouvée pgTAP en CI, TS strict, 81 tests verts,
Lighthouse 91, budget 135 Ko gzip. La « meilleure version » = durcissement systématique
de l'existant, en tranches mergeables, vérifiées dans le vrai navigateur sur la preview.

## Findings d'audit — vérifiés sur le code

| Finding | Verdict |
|---|---|
| `web/.env.local` commité | **Faux positif** — non suivi (`.gitignore` : `*.local`) ; anon key publique par design |
| Aucun header de sécurité | **Confirmé** — `web/public/` = `_redirects` + favicon seulement → T1 |
| Edge sans timeout/retry/log | **Confirmé + aggravé** — `regafy-ai:189` `catch → []` = faux négatif silencieux ; retry aveugle ; CORS `*` → T2 |
| Tracing Sentry | **Inerte** — `tracesSampleRate` sans `browserTracingIntegration` → T10 |
| Workspace 1 799 lignes | **Confirmé** — 0 test sur la page → caractérisation obligatoire avant refactor (T7.0) |
| `@types/node` inutile | **Faux** — requis par `tsconfig.node.json` + `vite.config.ts` |
| Coverage absent | Config présente ; manque l'exécution CI + artifact → T3 |

## Tranches (ordre d'exécution : T0 → T1 → T3 → T4 → T2 → T5 → T6 → T7 → T8 → T9 → T10 → T11)

| # | Tranche | Contenu | h | État |
|---|---|---|---|---|
| T0 | Socle V2 | Branche `v2`, deploy preview par branche, ce plan, CI sur v2 | 2 | ✅ #91 |
| T1 | Headers sécurité + cache | `web/public/_headers` : CSP (Report-Only → **enforcée**, 0 violation au navigateur réel), XFO, nosniff, HSTS, Referrer/Permissions-Policy, COOP ; immutable `/assets/*` ; `check-headers.mjs` en CI | 4 | ✅ #91+#102 |
| T3 | CI durcie | coverage en CI + planchers + artifact ; jobs gitleaks (197 commits, 0 fuite) et edge (deno test+check) | 2 | ✅ #93 |
| T4 | Rate-limit `create_org` | Migration additive 0015 (3 orgs/24 h/user), pgTAP 14→16 — **appliquée en prod le 2026-06-11 (go CEO)**, `migration list` aligné | 3 | ✅ #92 |
| T2 | Edge durcies | Timeout + retry borné (429/5xx) + circuit breaker + logs JSON (reqId) ; fix faux négatif lettres (`degraded` + toast) ; CORS whitelist — **déployées en prod le 2026-06-11 (go CEO)**, smoke tests : écho CORS prod/preview ✓, wildcard disparu ✓, 401 sans JWT ✓ | 6 | ✅ #94 |
| T5 | Uploads sûrs | `sanitizeFileName` + whitelist types + plafond 25 Mo commun (trou catalogue comblé) + `accept=` | 3 | ✅ #95 |
| T6 | Validation TipTap | Schéma zod au pull, quarantaine douce (jamais d'écrasement d'une version locale saine) | 3 | ✅ #96 |
| T7 | Refactor workspace | 1 809 → **956 l. (−47 %)** ; caractérisation d'abord (7 tests) ; hooks + sélecteurs purs + panneaux extraits ; écart vs cible 800 assumé (JSX d'orchestration, ligne d'arrêt) | 14 | ✅ #99 |
| T7bis | Fix auto-sélection | Bug d'origine découvert par la caractérisation (course docs=[]) : la première section documentée est enfin sélectionnée | 1 | ✅ #101 |
| T8 | Retry sync client | `lib/retry.ts` (backoff+jitter, transitoires only) sur les 6 syncs + `reportError` | 3 | ✅ #97 |
| T9 | Perf | Précache SW **−1 200 Kio (−28 %)** ; preconnect Supabase ; constats Regafy au fil de l'eau (chunks de 3) ; e2e dédié | 5 | ✅ #100 |
| T10 | Web Vitals | `browserTracingIntegration()` — le tracing était inerte | 1 | ✅ #98 |
| T11a | SSE traduction | Streaming de bout en bout (opt-in `stream:true`, repli JSON) : premier texte ~2 s, panneau de progression auto-scrollé — **Edge redéployée + smoke tests OK le 2026-06-11** | 6 | ✅ #103 |
| T11b | i18n EN | **Reporté après Regafy Upgrade** (décision CTO, à confirmer CEO) : seuls 4 fichiers sont i18n-isés — couvrir tout le chrome = ~15 fichiers wrappés + tests de caractérisation à réécrire, churn massif avant le merge final, valeur pilote UEMOA (FR) nulle à court terme | 8 | ⏸️ reporté |
| T11c | Checklist ops | Backups vérifiés par CLI : WALG **actif** (physique, Paris), **PITR non activé** (plan Pro requis) — voir checklist ci-dessous | 1 | ✅ |

## Non-goals

Pas de réécriture, pas de changement de stack, pas de nouvelles features produit, pas
d'extension métier Regafy (continue sur `main`, `v2` se rebase), pas de CRDT, pas de
découpage JSX cosmétique, pas de migration DB destructive (additif uniquement).

## Risques majeurs & mitigations

1. **CSP casse un chemin silencieux** (update SW, WASM pdf.js, Sentry lazy) → Report-Only
   plusieurs jours + matrice manuelle avant enforce ; rollback = suppression `_headers`.
2. **Backend partagé** (Edge + DB uniques) : T2/T4 touchent la prod dès déploiement →
   contrat de réponse strictement additif, validation stack locale complète, fenêtre creuse
   + smoke test prod immédiat, rollback = redéploiement précédent / `create or replace` inverse.
3. **Régression refactor workspace** (0 test existant) → T7.0 bloquant, move-only 1 PR
   chacune, parcours manuel scripté sur preview après chaque merge.

## Definition of done V2 (chiffrée)

1. **Sécurité** : grade A securityheaders.com sur v2 ; CSP enforcée `script-src 'self'` ;
   gitleaks 0 finding ; `npm audit` high = 0 ; `create_org` borné prouvé pgTAP (16 assertions).
2. **Robustesse** : 100 % des fetch Vertex avec timeout + retry borné ; 1 log JSON/requête
   Edge (reqId) ; 0 échec IA silencieux ; sync client 3 tentatives backoff.
3. **Dette** : workspace ≤ 800 l. ; ≥ 96 tests verts ; coverage publié avec plancher.
4. **Perf** : entryJs ≤ 135 Ko gzip ; Lighthouse ≥ 91 ; précache SW initial −1,2 Mo ;
   preconnect Supabase présent.
5. **Process** : prod intacte de bout en bout ; migrations validées en CI locale avant push ;
   go CEO = merge unique `v2 → main`.

## Checklist ops (T11c)

- [x] Backups du projet `uhsireqwzqqymgsxuvqh` vérifiés (CLI, 2026-06-11) : **WALG actif**
      (sauvegarde physique, West EU Paris) ; backups quotidiens du free tier conservés 7 j
      (dashboard → Database → Backups). **PITR non activé** (réservé plan Pro).
- [ ] **Avant le pilote multi-organisations réel : passer au plan Pro et activer PITR.**
      Risque actuel : jusqu'à 24 h de données serveur en cas de restauration — atténué par
      l'offline-first (les données vivent aussi en Dexie sur les postes et se re-synchronisent),
      mais inacceptable à terme pour des dossiers réglementaires multi-clients.
- [ ] Documenter un test de restauration (dashboard, projet jetable) avant le pilote.
- [ ] Alertes Sentry (dashboard) : LCP p75 > 2,5 s ; erreurs Edge (les logs JSON `reqId` de T2
      rendent le tri immédiat).

## Regafy Upgrade + Traduction Pro (spec CEO du 2026-06-11 — LIVRÉ)

Fonctionnalité ultime : repérage des documents non conformes aux **templates réglementaires**
en vigueur et mise en conformité assistée (bouton **Upgrader**), zéro hallucination. Documents
couverts : Cover letter, Lettre de PGHT, RCP, Notice, Étiquette.

| # | Tranche | Contenu | État |
|---|---|---|---|
| U1 | Specs de conformité | `_shared/conformity-specs.ts` : transcription déclarative versionnée des 5 templates (RCP 1–10 + 4.x/5.x/6.x, Notice 1–6, Étiquetage A/B/C, Cover 5 tirets, PGHT tableau FCFA) ; mentions par pays (email ABMed BJ) ; `specPromptText` = source unique des prompts ; 9 tests deno — **à relire par le CEO (expert RA)** | ✅ #104 |
| U2 | Traduction Pro | `_shared/pharma-glossary.ts` : 27 SOC MedDRA EN→FR, 6 fréquences CIOMS bornées, formes/voies EDQM, formules consacrées, invariants DCI/unités/noms ; prompt `translate` par type de doc avec titres officiels FR ; 6 tests deno. Attribution ANS (Licence Ouverte 2.0) + MedDRA v29 FR | ✅ #105 |
| U3 | Constat de conformité | Edge `regafy-ai` : vérification des pièces (langue cible uniquement — sinon Traduire prévaut, b64 réutilisé) + des traductions (texte, cache id+updatedAt, re-analyse 8 s post-édition) ; CERTAINTY-only anti-faux-positifs ; findings additifs `upgrade`/`missing` | ✅ #106 |
| U4 | Upgrader | Edge `upgrade` (nouvelle) : température 0, marqueur exact `[NON FOURNI DANS LE DOCUMENT SOURCE]`, SSE ; bouton Upgrader (panneau + bannières) ; onglet `<original>_CONFORME` ; compteur live des rubriques à compléter ; .docx ; **fix : les onglets d'un nœud coexistent** (lettre + traduction + conforme) | ✅ #107 |
| U5 | Bout-en-bout | CI complète, déploiement des 3 fonctions + smoke tests, vérification navigateur preview, docs/mémoire | ✅ |

## Conformité d'abord (retour de recette CEO du 2026-06-11 — LIVRÉ, PRs #108–#110)

| # | Tranche | Contenu | État |
|---|---|---|---|
| C1 | Multi-langue + cache v4 | Bug Notice FR corrigé à la racine (CACHE_VERSION non incrémenté en U3 → v4, règle documentée) ; conformité vérifiée sur TOUTES les langues (structurelle, titres traduits conformes) ; langue détectée portée sur le constat ; le constat de langue de l'original devient informatif | ✅ #108 |
| C2 | Remplir le template | Squelette officiel généré localement (zéro IA, offline), titres VERROUILLÉS (filterTransaction ProseMirror : suppression/frappe/réordonnancement rejetés — testé en éditeur headless) ; pré-remplissage STRICTEMENT session Identification produit ; structure 7.1/7.2 si titulaire ≠ fabricant (valeurs vides) ; specs U1 = source unique front/Edge (@specs) ; conformité vérifiée à chaque enregistrement ; compteur [À COMPLÉTER] ; boutons sur constats + nœuds 1.3.x vides | ✅ #109 |
| C3 | Traduction après conformité | Version conforme non-FR → bannière + bouton Traduire (translate accepte une source texte) ; pas de boucle ; « Générer » reçoit le CONTEXTE CERTIFIÉ du dossier : rubrique 9 auto pour nouvelle AMM, 7.1 Titulaire / 7.2 Fabricant (données fiche produit) | ✅ #110 |
| C4 | Zéro rouge + déploiement | Univers conformité : violet/ambre/émeraude, aucun rouge ; 3 Edge redéployées + smoke OK ; preview 0 violation CSP | ✅ |

**Flux final** : upload → constat de conformité (toute langue) → « Remplir le template » (squelette
verrouillé, l'utilisateur complète, Regafy vérifie au save) OU « Générer » (Regafy remplit tout :
document source + contexte certifié, zéro hallucination) → si non-FR : Traduire en FR → compilation.

Recette métier CEO sur la preview : Notice FR → constat émis (cache v4) ; RCP anglais → constat
direct → Générer (rubrique 9 + 7.1/7.2 auto) → Traduire en FR → compilation ; nœud 1.3.1 vide →
Remplir le template (titres indestructibles) ; lettres KV-* → zéro constat ; formulation
rubrique 9 à valider (« Sans objet — première demande d'AMM en cours d'instruction. »).

## Recette CEO n°2 — fiabilité des aperçus + Regafy simplifié (LIVRÉ, PR #111)

| # | Tranche | Contenu | État |
|---|---|---|---|
| R1 | Aperçus + simplification | Aperçus PDF réparés : Storage `download()` partout (l'URL signée + fetch cassait sur les chemins à caractères spéciaux — COPP invisible en nav privée et manquant à la compilation) ; worker pdf.js DE RETOUR au précache SW (rollback T9 : warm-up trop fragile hors-ligne) ; Regafy simplifié : constat de conformité = UNE phrase (détail dans `missing`, jamais énuméré), bouton « Générer » (upgrade IA) retiré de l'UI (moteur en place, réactivable), « Remplir le template » et validité conservés ; cache v5 ; migration 0016 grants explicites (nouvelle image Postgres CI) | ✅ #111 |

## Recette CEO n°3 — branding mockup + formulaire RCP officiel (LIVRÉ, PR #112)

| # | Tranche | Contenu | État |
|---|---|---|---|
| R2 | Carte mockup + formulaire RCP | **Carte de non-conformité (mockup CEO)** : carte blanche arrondie flottante centrée sur l'aperçu (« \« RCP \» / non conforme au template en vigueur ! » + bouton violet « Upgrader ! » → ouvre le template à remplir), remplace les bannières violettes (aperçu pièce + onglet traduction), sticky au scroll, masquable (session). **Formulaire RCP officiel** (gabarit `RCP_formulaire_interactif.html` du CEO) : feuille A4 Times 12pt navy #263F73, MODEL verbatim (50 champs, checks, ATC, durée), topbar Réinitialiser/PDF/DOCX ; exports 100 % conformes (DOCX lib docx lazy + PDF impression iframe — saisies et options cochées uniquement) ; persistance dans le content TipTap du doc `fill` (attrs `fillKey`, zod-compatibles) → sync/compilation/conformité au save inchangées ; réhydratation des anciens squelettes ; préfill STRICTEMENT Identification ; Notice/Étiquetage : squelette TipTap conservé. Frontend du panneau de prévisualisation uniquement (zéro changement Edge/DB) | ✅ #112 |

## Recette CEO n°4 — compilation multi-documents + gabarits Notice & Étiquetage (LIVRÉ, PRs #113-#114)

| # | Tranche | Contenu | État |
|---|---|---|---|
| D1 | Compilation multi-docs | **Bug recette** : le formulaire RCP absent du PDF compilé — `generated` n'acceptait qu'UN document généré par nœud (écrasement ; la traduction FR masquait le formulaire). `CompileNodeContent.generated` devient une **liste** (chaque document du nœud compilé avec sa page d'annonce x.1/x.2) ; `listGeneratedDocs` trié `createdAt` (onglets + compilation stables) ; papier en-tête/pied réservé aux LETTRES ; `horizontalRule` rendue | ✅ #113 |
| D2-D5 | Gabarits Notice & Étiquetage | **Moteur généralisé** (form-types/content/docx/print) : blocs dynamiques (verbe/HCP), bullets, cases conditionnelles (dependsOn), sous-titres à choix, bandeaux gris ; persistance compat RCP #112 + `formGlobals` dans les attrs du titre. **Notice** = gabarit CEO `Notice_patient_interactive.html` verbatim + barre de réglages globaux (prendre/utiliser, professionnels). **Étiquetage** = template officiel ABMed 2026 verbatim (3 parties A/B/C, bandeaux gris navy, FAB/EXP, Sans objet) ; artwork → labeling. `buildTemplateSkeleton` délègue aux formulaires (squelette [À COMPLÉTER] conservé cover/pght). Vérifié navigateur réel : compile 13 pages multi-docs, verbe global re-rend + persisté, 35 bandeaux gris | ✅ #114 |

## Recette CEO n°5 — fidélité du PDF compilé + rebranding de la page de montage (PRs #115-#116)

| # | Tranche | Contenu | État |
|---|---|---|---|
| E1-E2 | Fidélité du compilé | **Exclusions respectées** : un doc produit retiré du dossier (excludedDocIds) n'est plus compilé (même filtre que l'UI, dans le compilateur). **Rendu stylé des formulaires** : renderTiptap(styled) pour les `fill` — titre centré navy bold, rubriques navy, niveau 4 souligné, BANDEAUX GRIS bordés (wrap multi-lignes) = identique aux exports DOCX/PDF ; lettres/traductions inchangées. Validé au pixel (viewer PDF) | ✅ #115 |
| E3 | Rebranding montage | Mockups appliqués à la règle : « Compiler le PDF » + Roadmap dans le BANDEAU (ref fraîche) ; pilule d'édition SOMBRE conditionnelle (la feuille monte) ; retraits : checkbox TDM, titre de section/badges (h2 sr-only), Enregistrer, footer ; barre fine onglets (toujours visibles) + Générer/Téléverser ; panneaux w-80 en cartes rounded-2xl sur fond muted, sticky relevés ; feuille des formulaires 62 rem ; sidebar AUTO-REPLIÉE en rail sur le montage + profil/statut réseau en bas de barre ; carte non-conforme : type sans guillemets + bouton OUTLINE violet « Remplir le template » ; « Tableau de complétude » donut bleu | ✅ #116 |

## 🚀 BASCULE EN PRODUCTION — 2026-06-12 (PR #117)

La **V2 est la production** : `v2` → `main` mergée (merge commit, 34 commits préservés,
PRs #91 → #116), déployée sur **pharnos.pages.dev** (bundle identique à la preview validée).
Smoke prod : CSP enforce + nosniff + X-Frame DENY actifs, SW à jour, données synchronisées.
**Retour arrière** : tag **`v1-mvp`** (b943af3) — redéployer ce tag sur main en cas de besoin.
Flux post-MVP : `main` = prod ; features en branches PR (preview Cloudflare par branche) ;
la branche `v2` reste comme alias de preview.

## Recette CEO n°6 — Regafy à la demande + Audit Global + UI premium (PRs #118-#120)

| # | Tranche | Contenu | État |
|---|---|---|---|
| F1 | Regafy à la demande | **Plus d'analyse automatique** (3 useEffect retirés). Bouton **« Analyser »** à côté de Téléverser (pièce affichée, désactivé hors ligne) → politique : template → conformité (+ langue) ; pièce admin → validité ; cache (pieceId, updatedAt) traversé, CACHE v6. **Animation de scan** du mockup (regafy-scan.css, 2.4 s). **Carte de constat** : template → Remplir le template / [Traduire] / Remplacer ; admin → Remplacer ; constat conformité+langue FUSIONNÉ. **« Remplacer »** : upload → ancienne pièce retirée + remarques purgées. **Panneau Remarques vide par défaut**, résultat positif consigné (pastille émeraude), ré-analyse REMPLACE. 6 tests hook + carte + page (168 verts) | ✅ #118 |
| F2 | Audit Global | `runGlobalAudit` (chunks + lettres + conformité + déterministes) → rapport A4 corporate DÉTERMINISTE (zéro hallucination : documents cités, manquants énumérés, conformité enfreinte) + gate de compilation avec « Audit Global » (même sans analyses) | ✅ #119 |
| F3 | UI premium | Barre d'action compacte, donut dégradé mockup, poignées de rabat 18×46, polices arborescence réduites (num 10px / libellé 12.5px), panneau collé au rail gauche, poignées 18×46 sur les bords intérieurs (les boutons internes disparaissent) | ✅ #120 |

## Recette CEO n°7 — traductions auditables, pages de garde, quota CI (PRs #121-#122)

| # | Tranche | Contenu | État |
|---|---|---|---|
| G1-G4 | Produit | **Analyser sur les documents traduits/conformes** (conformité texte, cache (genId, updatedAt), scan + carte sans « Remplacer », CACHE v7) ; **pages de GARDE épurées** (parents + 1.0 TdM : pièces exactes seulement, page centrée numéro/intitulé/message + [Autogénéré] enfoncé + [Téléverser], cover custom → vue normale, compilation INCHANGÉE) ; carte de constat lisible en thème sombre (neutres forcés) ; complétude : donut 110 centré, sous-titre retiré | ✅ #121 |
| G5 | Quota Actions (90 %) | concurrency cancel-in-progress, e2e/lighthouse/rls sur PR uniquement (push main = web+edge+secrets), cache Playwright, paths-ignore docs/md/RA-source, v2 retirée, **keep-alive Supabase** (ping REST /3 j — anti-pause du palier gratuit). Cycle PR+merge ~17 → ~9-10 min | ✅ #122 |

**Stratégie coûts validée** : 0 € jusqu'au premier client payant (capacité pilote ~100-150
dossiers / ~30-50 users, goulot Storage 1 Go) ; bascule Supabase Pro (25 $/mois) au premier
seuil atteint : 1er contrat · Storage > 70 % · exigence PITR/SLA. Suivi à poser : backup
hebdo pg_dump chiffré → R2 (secret SUPABASE_DB_URL requis).
