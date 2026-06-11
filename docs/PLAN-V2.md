# Pharnos V2 — durcissement piloté de A à Z

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

Recette métier à dérouler avec le CEO sur la preview : lettres réelles KV-* → AUCUN constat de
conformité attendu ; RCP anglophone → chaîne complète Traduire → constat → Upgrader → onglet
conforme → compilation.
