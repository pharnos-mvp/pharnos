# Capacité par palier — jalon N3 (gate GO-LIVE)

> **MAJ 2026-06-17.** Doc de capacité du gate N3 : offre par palier · capacité de la plateforme
> (Supabase Free) · résilience Edge sous charge (k6) · déclencheurs de bascule Pro.
> Sources : `plan_limits` (prod), mesures prod read-only, [rapport k6](../load/REPORT.md),
> [[storage-data-policy]] / [STORAGE-DATA-POLICY.md](STORAGE-DATA-POLICY.md).

## 1. Offre par palier (caps `plan_limits`, éditables en god mode)

| Palier | Dossiers | AI tokens / mois | Sièges | Stockage |
|---|---|---|---|---|
| **free** | 1 (à vie) | 0 (Regafy en Vitrine) | 1 | 1 Go |
| **pro** | 5 / mois | 200 000 | 1 | 20 Go |
| **team** | 15 / mois | 1 000 000 | ∞ | 50 Go |
| **business** | 50 / mois | 5 000 000 | ∞ | 100 Go |
| **enterprise** | ∞ | ∞ | ∞ | ∞ |

Robinet (feature 3 états) **≠** débit (quota chiffré) : l'IA « Activée » = `features.regafy='enabled'` **ET**
`monthly_ai_tokens>0` (migration `0038`). Tout est administrable en god mode sans déploiement.

## 2. Capacité de la plateforme (Supabase **Free**, eu-west-3)

| Ressource | Plafond Free | Usage prod (2026-06-17) | Marge |
|---|---|---|---|
| Base de données | 500 Mo | **20,1 Mo** (6 orgs, 7 dossiers, 5 produits) | ~4 % |
| Stockage (bucket `documents`) | 1 Go | **95,8 Mo** (83 objets) | ~9 % |
| Invocations Edge | 500 000 / mois | négligeable (pré-lancement) | — |
| MAU Auth | 50 000 | 6 | — |
| PITR / backups gérés | ❌ (Free) | backups **chiffrés hors-Supabase** (jalon I, GitHub) | OK |

**Goulot = le STOCKAGE** (cohérent [[storage-data-policy]]). Coût observé ≈ **~14 Mo / dossier CTD réel**
(95,8 Mo / 7). Donc, à iso-profil :
- **alerte à 70 %** (≈ 717 Mo, `alerts.yml`) ≈ **~50 dossiers** ;
- **plafond 1 Go** ≈ **~70 dossiers** avant saturation Storage.

La DB (20 Mo) et les invocations Edge ne sont **pas** contraignantes à l'échelle pilote. → capacité pilote
**~50–70 dossiers réels** sur Free avant bascule (le backstop serveur 50 Mo/fichier `0036` borne le pire cas).

## 3. Résilience Edge sous charge (k6, [rapport complet](../load/REPORT.md))

Charge légère (8+8 VUs, 948 requêtes) sur les **chemins de rejet** (sans Gemini, sans session) :

| Garde | Couverture | p95 | 5xx | Fuite |
|---|---|---|---|---|
| Auth 401/403 (regafy-ai/translate/upgrade/admin/team) | 100 % rejetées | **491 ms** | 0 % | **0** |
| Public `share` (token bidon → 4xx + rate-limit IP 429) | 100 % en 4xx | **333 ms** | 0 % | **0** |

→ Les gardes tiennent sous charge concurrente, **0 fuite**, **0 5xx**, p95 < 0,5 s. La surface IA payante
est inatteignable sans session (protection coût Edge **en plus** du gate DB `consume_ai_quota`).
Les gates **403 feature** / **429 quota** authentifiés sont prouvés par pgTAP + impersonation prod
(free→`feature_disabled`, pro→`allowed`).

## 4. Déclencheurs de bascule Supabase **Pro** (25 $/mois) — N4

Basculer dès le **premier** atteint (cohérent « 0 € jusqu'au 1er payant ») :
1. **1er client payant** signé (contrat finance la dépense) ;
2. **Stockage > 70 %** (~700 Mo) ou **DB > 70 %** (~350 Mo) — `alerts.yml` (job rouge + e-mail) ;
3. besoin de **PITR** / **leaked-password protection** (Pro-only) / **`auth.pharnos.com`** (branding écran Google) ;
4. quota stockage **DUR** à l'upload (D2) au moment Pro.

À la bascule : envisager **R2** si le stockage domine le coût (déclencheurs dans [[storage-data-policy]]).

## 5. Conclusion N3
EXPLAIN sync indexé (`0035`) · backstop stockage (`0036`) + quota administrable (`0037`) · **k6 gates verts**
· **capacité documentée**. → **N3 COMPLET.** Reste **N4** (checklist GO-LIVE signée + 3 pilotes + bascule Pro).
