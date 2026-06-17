# PLAN — Quota & gestion des données (le pendant « data » du quota IA)

> **Cadrage CTO (2026-06-17), demandé par le CEO.** Complète [STORAGE-DATA-POLICY.md](STORAGE-DATA-POLICY.md)
> (qui annonçait le quota stockage en §8 « à implémenter » — jamais fait) et [PLAN-N-EXECUTION.md](PLAN-N-EXECUTION.md).
> Objectif : **borner et fiabiliser la donnée** comme on a borné l'IA (tokens, jalon M), dans une archi **PWA offline-first** et un contexte **pharma (GxP/ALCOA++)**.
>
> **✅ Séquencement RATIFIÉ CEO (2026-06-17)** : **D1 maintenant** (rattaché à N3) · **D2** (quota dur) **à la bascule Pro+R2** (1er payant) · **D3** (robustesse offline client) **fast-follow post-N**.

## 0. Les deux seuls coûts/ressources variables de Pharnos
| Axe | État | Mécanisme |
|---|---|---|
| **IA (tokens Gemini)** | ✅ **Borné** (jalon M) | `plan_limits.monthly_ai_tokens` + `consume_ai_quota` (gate 429 fail-closed) + `record_ai_usage` |
| **DATA (stockage)** | ⚠️ **NON borné par org** | seulement : cap *nombre* de dossiers (`max_dossiers`) + alerte **globale** 70 % + max fichier (proposé, non enforce) |

→ Une org peut aujourd'hui saturer le **palier partagé** (Supabase Storage 1 Go / DB 500 Mo). C'est le trou à fermer avant d'ouvrir à des payants self-serve.

## 1. Le stockage en offline-first = DEUX couches (clé du sujet)
1. **Serveur** (coût/ressource partagé) : Supabase **Storage `documents`** (1 Go free → 100 Go Pro → R2) + **Postgres** (métadonnées). C'est ce qu'**une org peut saturer** → besoin d'un **quota par org** (vrai pendant des tokens IA).
2. **Client** (par appareil, pas un coût pour nous, mais **fiabilité terrain**) : **IndexedDB/Dexie** (données) + **OPFS/Cache** (blobs PDF). Le navigateur **plafonne et peut ÉVICTER** ces données sous pression disque → risque : un dossier lourd ne tient pas / la sync rame / un cache offline saute. Les RA travaillent hors-ligne sur le terrain → ça compte.

## 2. Ce qu'on a déjà (à réutiliser)
- Isolation **RLS par `org_id`**, **résidence UE** (eu-west-3 + Sentry EU), backups chiffrés age (jalon I), **rétention GxP** (#162 : confirmation+motif, blocage suppression d'un dossier soumis).
- Le workflow **alerts.yml** sait déjà sommer `storage.objects` (global) → réutilisable **par org**.
- Modèle quota IA (`plan_limits`/override/usage/gate) = **patron à dupliquer** pour le stockage.
- **Trajectoire R2** déjà décidée (egress 0 $) au 1er payant / >70 % / CTD lourds.

## 3. Pratique du domaine (RIM/pharma type Veeva Vault + SaaS doc + PWA offline)
- **Allocation de stockage par plan** (Go), **compteur d'usage visible**, **blocage de l'upload au plafond** avec CTA upgrade — **JAMAIS de suppression** de données réglementées pour faire de la place (intégrité GxP).
- **Garde-fous fichier** : taille max, **types autorisés** (PDF + images), idéalement **scan antivirus** + **checksum d'intégrité** (déjà write-once pour la correspondance).
- **Offline PWA (best practice)** : `navigator.storage.persist()` (anti-éviction), `estimate()` (jauge live), **pinning sélectif** (cacher offline **uniquement les dossiers actifs/épinglés**, pas toute l'org), **éviction LRU** des blobs non épinglés, **dégradation gracieuse** en stockage bas, **jamais perdre un brouillon non synchronisé** (l'outbox prime).

## 4. Recommandation — plan en 3 tranches
### D1 — Garde-fous & visibilité (léger, sûr, à faire tôt — candidat N3) · ~0,5-1 session
- **Taille de fichier max** (MVP : **50 Mo**) + **MIME allowlist** (PDF + images) **enforce à l'upload** (client + politique Storage / Edge). Empêche l'abus immédiat.
- **Compteur d'usage stockage par org** : table `storage_usage(org_id, bytes, updated_at)` maintenue par **trigger** sur `storage.objects` (insert/delete) — ou requête agrégée si le volume reste faible. Source unique pour la jauge.
- **Jauge d'usage** dans l'app (Compte → Abonnement, à côté des dossiers/tokens) + **console admin** (déjà branchée sur des chiffres réels). **Pas de blocage encore** — on mesure et on montre.

### D2 — Quota dur par org (au moment d'ouvrir aux payants / bascule Pro+R2) · ~1 session
- `plan_limits.max_storage_bytes` (+ `org_quota_override`), seedé par plan (ex. free 1 Go · pro 20 Go · business 100 Go · enterprise ∞ — **à caler**).
- **Gate à l'upload** (Edge/RPC, miroir de `consume_ai_quota`) : refuse au-delà du cap → **HTTP 413/429 propre FR/EN** + **CTA « Mettre à niveau »** (le tunnel de conversion, comme le 429 IA). **Fail-safe** : ne bloque que les **nouveaux** uploads, **ne supprime jamais** l'existant (rétention GxP).
- Couplé à la **bascule R2 + Supabase Pro** (100 Go, egress 0 $) déjà planifiée → le palier partagé n'est plus le facteur limitant, le quota par org devient un **levier commercial** (différenciation de plan).

### D3 — Robustesse stockage client offline (fast-follow fiabilité — post-N) · ~1 session
- `navigator.storage.persist()` au login (demande le stockage persistant, anti-éviction).
- **Jauge `navigator.storage.estimate()`** + **alerte stockage bas** (UX honnête : « espace appareil faible, certains PDF hors-ligne peuvent être rechargés en ligne »).
- **Pinning sélectif** : par défaut, ne garder offline que les **dossiers ouverts/épinglés** (pas toute l'org) ; **éviction LRU** des blobs OPFS non épinglés. Les **données** (Dexie) restent légères ; ce sont les **blobs PDF** qu'on gère.
- **Invariant GxP/offline** : un **brouillon ou une action non synchronisés** ne sont **jamais** évincés (l'outbox est la source de vérité jusqu'à confirmation serveur).

## 5. Garde-fous pharma (transverses, non négociables)
- Le quota **borne les écritures**, **ne détruit jamais** de donnée réglementée (respecte la rétention/GxP/ALCOA++).
- **Résidence UE** maintenue de bout en bout (Supabase eu-west-3, Sentry EU, R2 région EU au scale).
- **Audit** : dépassements de quota et purges (grâce/RGPD) tracés dans `audit_log`.
- **Restaurabilité** : tout fichier régulé reste couvert par le backup Storage (jalon I) ; un quota atteint ne contourne pas la sauvegarde.

## 6. Où ça atterrit dans la roadmap
- **D1** (garde-fous + jauge) → rattachable à **N3 (scalabilité)** du gate, ou fast-follow immédiat (léger, augmente la sûreté avant pilotes payants).
- **D2** (quota dur) → **à la bascule Pro/R2** (1er client payant) — moment naturel (on passe à 100 Go + R2, le cap devient un levier de plan). **Différable sans dette** (métadonnée `plan_limits`, comme les tokens).
- **D3** (offline client) → **fast-follow fiabilité** post-N (améliore le terrain RA, pas bloquant go-live).

## 7. Prochaine étape recommandée
Trancher **D1 maintenant** (garde-fous taille/type + jauge d'usage par org) : c'est léger, sûr, et ça ferme le risque « une org sature le partagé » avant d'ouvrir aux pilotes payants — sans attendre R2. D2/D3 séquencés ensuite selon traction.
