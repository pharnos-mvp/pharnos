# Rapport k6 — résilience des gardes Edge (jalon N3, gate GO-LIVE)

> Script : [`k6-edge-gates.js`](k6-edge-gates.js) · k6 v2.0.0 · cible **prod** `uhsireqwzqqymgsxuvqh.supabase.co`
> Exécuté le **2026-06-17**. Re-jouable : `k6 run -e SUPA_URL=https://<ref>.supabase.co -e SUPA_ANON=<clé anon publique> load/k6-edge-gates.js`

## Objectif
Prouver que les **gardes** des Edge functions tiennent **sous charge** et mesurer la **p95**, **sans
brûler de Gemini** (tout est rejeté AVANT Vertex) et **sans session valide** — on charge la surface
d'**abus anonyme** (le vrai vecteur DoS) :
- **regafy-ai / translate / upgrade / admin / team** appelées avec une clé anon (JWT valide, **sans
  utilisateur**) → la fonction rejette en **401/403** avant tout quota/Gemini.
- **share** (surface publique) : **token bidon** → **4xx** ; sous rafale depuis 1 IP → **rate-limit 429**.

> Les chemins **403 (feature « hors offre »)** et **429 (quota tokens)** authentifiés exigent une session
> et sont prouvés **par ailleurs** : pgTAP (`quotas_rls`, `ai_rate_limit`, `feature_states`) + impersonation
> rolled-back en prod (free → `feature_disabled`, pro → `allowed`). Hors-scope d'un k6 anonyme.

## Résultat (8+8 VUs, 2×20 s, 948 itérations)

| Seuil | Cible | Mesuré | Verdict |
|---|---|---|---|
| `gate_leak` (réponse 2xx = garde franchie) | `== 0` | **0** | ✅ aucune fuite |
| checks (gated→401/403 · share→4xx) | 100 % | **948 / 948** | ✅ |
| p95 latence `auth_reject` | < 2500 ms | **490,98 ms** | ✅ |
| p95 latence `share_public` | < 2500 ms | **332,84 ms** | ✅ |
| `http_req_failed` (5xx) | < 2 % | **0,00 %** | ✅ |

- Débit soutenu : **~21,6 req/s** ; p95 global **~427 ms** ; max 3,35 s (queue rate-limit), **0 erreur 5xx**.
- **0 appel Gemini** déclenché (aucune requête n'a passé le gate IA).

## Lecture
- Les **gardes d'authentification** (regafy-ai/translate/upgrade/admin/team) rejettent **100 %** des
  requêtes sans utilisateur, en **< 0,5 s p95**, sous charge concurrente : la surface IA payante est
  **inatteignable** sans session — coût Gemini protégé côté Edge **en plus** du gate DB `consume_ai_quota`.
- La **surface publique `share`** (lien de correspondance) absorbe la rafale de tokens invalides en 4xx
  + **rate-limit IP 429**, **sans 5xx** : pas d'amplification, pas de fuite.
- Conclusion N3 : **les Edge critiques sont résilients aux gates 401/403/429 sous charge légère**, p95
  largement sous le budget. Pas de goulot Edge avant les paliers de capacité documentés
  ([CAPACITY-N3.md](../docs/CAPACITY-N3.md)).
