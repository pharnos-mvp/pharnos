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
| T0 | Socle V2 | Branche `v2`, deploy preview par branche, ce plan, CI sur v2 | 2 | 🔄 |
| T1 | Headers sécurité + cache | `web/public/_headers` : CSP (Report-Only → enforce), XFO, nosniff, HSTS, Referrer/Permissions-Policy, COOP ; immutable `/assets/*` ; `check-headers.mjs` en CI | 4 | ⬜ |
| T3 | CI durcie | coverage en CI + artifact ; job gitleaks (historique complet) | 2 | ⬜ |
| T4 | Rate-limit `create_org` | Migration additive 0015 (3 orgs/24 h/user), pgTAP 14→16 | 3 | ⬜ |
| T2 | Edge durcies | Timeout + retry borné (429/5xx) + circuit breaker + logs JSON (reqId) ; fix faux négatif lettres (`degraded` + toast) ; CORS whitelist | 6 | ⬜ |
| T5 | Uploads sûrs | `sanitizeFileName` + whitelist MIME/extension (pdf/png/jpg/webp) + `accept=` | 3 | ⬜ |
| T6 | Validation TipTap | Schéma zod au pull (`generated-docs-sync`), quarantaine douce | 3 | ⬜ |
| T7 | Refactor workspace | 1 799 → ≤ 800 l. ; T7.0 caractérisation bloquant ; extractions move-only (composants, `useRegafyCopilot`, `useDebouncedDocSave`, sélecteurs purs, `useViewables`) | 14 | ⬜ |
| T8 | Retry sync client | `lib/retry.ts` (backoff+jitter, transitoires only) sur les 6 syncs + `reportError` | 3 | ⬜ |
| T9 | Perf | Preconnect Supabase ; worker pdf.js (1,2 Mo) hors precache → runtimeCaching + warm-up ; constats Regafy au fil de l'eau | 5 | ⬜ |
| T10 | Web Vitals | `browserTracingIntegration()` (1 ligne) | 1 | ⬜ |
| T11 | Finitions | SSE traduction ; i18n EN (chrome UI) ; checklist ops backups/PITR | 14 | ⬜ |

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

## Checklist ops (T11, hors code)

- [ ] Vérifier le plan Supabase du projet `uhsireqwzqqymgsxuvqh` : backups quotidiens actifs,
      PITR si plan Pro ; documenter un test de restauration.
- [ ] Alertes Sentry : LCP p75 > 2,5 s ; erreurs Edge (via logs JSON).
