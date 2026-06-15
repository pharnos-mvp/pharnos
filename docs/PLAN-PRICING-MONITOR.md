# Jalon O — Refonte pricing (5 plans) & séparation Monitor / Regafy (plan d'exécution CTO)

> Nouveau périmètre produit ratifié par le CEO (2026-06-15). S'insère **après le jalon M (livré)
> et AVANT le gate N (GO-LIVE)** : on aligne le modèle commercial + on sépare la vérification
> déterministe gratuite (Monitor) du copilote IA payant (Regafy). Chaîne : [ROADMAP-MVP.md](ROADMAP-MVP.md)
> · socle quotas = [PLAN-M-N-GOLIVE.md](PLAN-M-N-GOLIVE.md).

## 1. Objectif & métrique de succès

- **Objectif** — porter Pharnos sur le **modèle commercial réel** (5 plans à dimensions : team/sièges,
  dossiers, tokens IA, features — tous pilotables depuis `/admin`) et **séparer Monitor** (vérifs
  déterministes, gratuites, sans IA) de **Regafy** (copilote IA payant en tokens), pour que chaque
  plan — Free compris — délivre une valeur nette sans coût variable non maîtrisé.
- **Succès** — en prod : (a) les 5 plans **s'appliquent réellement** (Free = pas de team, pas de
  Regafy, 1 dossier ; bornes dossiers/tokens par plan ; tout éditable/dérogeable depuis `/admin`) ;
  (b) **Monitor tourne gratuitement pour tous** (complétude + pièces requises + dates déclarées vs
  validités requises ; **date d'expiration COA obligatoire au save**) ; (c) **Regafy** (payant) ajoute
  la **contre-expertise documentaire** ; recette navigateur réelle OK ; **zéro régression pilote**.

## 2. Scope (tranche verticale d'abord)

Du plus structurant au plus visible : **O1 modèle de plans & enforcement** (tier `team`, sièges,
dossiers *lifetime|mensuel*, tokens, **feature flags `team` + `regafy`**, période mensuel|annuel ;
grandfathering des pilotes ; /admin enrichi) → **O2 Monitor** (moteur déterministe partagé : complétude,
pièces requises, dates déclarées vs politique ; COA obligatoire au save ; remarques) → **O3 Regafy =
Monitor + contre-expertise IA** (gated payant ; lit le doc et signale les écarts vs dates déclarées).

## 3. Non-goals

- **Paiement réel** (Stripe/encaissement) — **hors MVP** : on **stocke** le plan + la période
  (mensuel/annuel) + le décompte de sièges, on **applique** les quotas, mais les contrats restent
  **manuels**. Le changement de plan = action `/admin` (pas de self-service payant).
- Refonte de la **politique réglementaire** de validité — on **réutilise l'existant** (admin ≥ 6 mois,
  COA ≥ 18 mois ; conformité aux templates en vigueur).
- **Monitor ne lit PAS les documents** (déterministe sur données **déclarées**) — la lecture/extraction
  documentaire reste **Regafy** (IA).

## 4. Architecture & décisions (ancrées sur le code réel)

### Existant réutilisé
- `plan_tier` (free/pro/business/enterprise) + `plan_limits` + `org_quota_override` + `consume_ai_quota`
  + trigger dossiers (jalon M). `documents.expiryDate` **existe déjà** (déclaré), mais **optionnel** et
  affiché **uniquement pour la catégorie `admin`** ([DocumentsSection.tsx](web/src/features/catalogue/DocumentsSection.tsx)).
- Le **dashboard J** calcule déjà des **échéances déterministes** à partir des dates déclarées
  ([dashboard-data.ts](web/src/features/dashboard/dashboard-data.ts)) → **socle de Monitor**.
- `conformity-specs` (rubriques requises par type de doc) → **socle de la complétude Monitor**.
- Regafy (Edge `regafy-ai`) fait aujourd'hui la validité **par l'IA** (Gemini lit le PDF) → devient la
  **contre-expertise** de O3.

### O1 — Modèle de plans (migration additive)
- `alter type plan_tier add value 'team' before 'business'` (5 tiers).
- `plan_limits` gagne : `max_seats int` (NULL = ∞), `dossiers_period text` check `('lifetime','month')`.
  `features` jsonb gagne **`team` + `regafy`** (booléens). Reseed (valeurs CEO, **éditables /admin**) :

  | plan | team | regafy | max_seats | dossiers | période dossiers | tokens IA/mois |
  |---|---|---|---|---|---|---|
  | **free** | non | non | 1 | 1 | **lifetime** | **0** |
  | **pro** | non | oui | 1 | 5 | month | 200 000 |
  | **team** | oui | oui | ∞ (per-seat) | 15 | month | *(à confirmer — déf. 1 000 000)* |
  | **business** | oui | oui | ∞ (per-seat) | 50 | month | *(à confirmer — déf. 5 000 000)* |
  | **enterprise** | oui | oui | ∞ | ∞ | month | ∞ |

- `orgs.billing_period text default 'monthly'` check `('monthly','annual')` (métadonnée ; pas d'encaissement).
- **Enforcement** :
  - **Dossiers** : trigger *period-aware* — `lifetime` → count actifs ; `month` → count **créés ce mois
    calendaire** ; cap = override ?? plan.
  - **Regafy** : double garde — feature `regafy=false` (Free) **et/ou** tokens=0 → Edge IA renvoie 429
    `feature_disabled`/`quota_exceeded` ; UI masque « Analyser » et propose l'upgrade.
  - **Team/sièges** : `create_invitation` gated par feature `team` (Free/Pro → refus `team_disabled`) +
    plafond `max_seats` (count membres+invitations en attente). Team/Business/Enterprise = `max_seats` NULL.
- **`/admin`** : éditer par plan `max_seats`, `dossiers_period`, features `team`/`regafy` ; par org la
  période + les dérogations. (Étend `admin_set_plan_limits` + la section Plans & Quotas.)
- **GRANDFATHERING** (anti-régression, **critique**) : les orgs pilotes actuelles sont en `free` *ancien*
  (généreux). Le `free` *nouveau* est restrictif (0 token, 1 dossier) → on **bascule les orgs existantes
  sur un plan adéquat** à la migration (proposition : **business**) pour **zéro perte d'accès**.

### O2 — Monitor (déterministe, gratuit, offline)
- Module partagé **`features/workspace/monitor.ts`** : entrées = arborescence dossier + pièces produit +
  **dates déclarées** + contenu des formulaires/lettres → sorties = findings **déterministes** :
  1. **Complétude** : champs de formulaire/lettre manquants (via `conformity-specs` + champs obligatoires).
  2. **Pièces requises** : pièce attendue (selon activité/pays/politique) **absente** du dossier.
  3. **Validité déclarée** : date déclarée < validité requise (admin ≥ 6 mois, **COA ≥ 18 mois**) → alerte.
- **COA obligatoire au save** : la date d'expiration devient **requise** pour COA (+ pièces admin) à
  l'upload — **pas d'enregistrement sans date** (DocumentsSection + upload workspace). Champ COA ajouté
  là où il manque.
- Findings surfacés dans **« remarques »** (RegafyFinding `source:'monitor'`), **gratuit, sans token**,
  **offline**, exécuté automatiquement (pas de bouton « Analyser »).

### O3 — Regafy = Monitor + contre-expertise (IA, payant)
- Regafy (bouton « Analyser ») **gated** : feature `regafy` + quota tokens (Free → masqué + invite upgrade).
- Regafy **reprend les findings Monitor** PUIS ajoute la **contre-expertise** : lit réellement le document
  (Gemini), extrait la date/validité, **compare à la date DÉCLARÉE** par l'user ; si **écart** → signale
  « divergence — à vérifier ». (L'Edge `regafy-ai` reçoit désormais les dates déclarées en entrée.)

## 5. Milestones

| # | Tranche | Contenu | Effort |
|---|---------|---------|--------|
| **O1** | **Plans & enforcement** ⭐ | migration (tier `team`, seats, dossiers_period, billing_period, features team/regafy) + reseed + **grandfathering** + enforcement (dossiers period-aware, Regafy gated, sièges/team gated) + `/admin` enrichi + pgTAP | **M** |
| **O2** | **Monitor déterministe** | module Monitor (complétude + pièces requises + dates déclarées vs politique) + **COA obligatoire au save** + findings `monitor` (gratuit/offline) + tests unitaires | **M/L** |
| **O3** | **Regafy contre-expertise** | Regafy gated (feature+tokens) + reprise Monitor + contre-expertise documentaire (écart déclaré/réel) + recette | **M** |

*Puis **N** (gate GO-LIVE) inchangé.*

## 6. Risques & mitigations

1. **Régression de la validité existante** (aujourd'hui IA) en la scindant → Monitor d'abord (parité sur
   les **dates déclarées**, déterministe, testé) ; Regafy **garde** sa lecture documentaire en plus ;
   recette comparée avant/après.
2. **Free casse l'expérience des pilotes actuels** (0 token, 1 dossier) → **grandfathering** des orgs
   existantes sur un plan généreux à la migration (zéro perte) ; Free restrictif ne s'applique qu'aux
   **nouvelles** orgs.
3. **Friction UX** (dossiers lifetime/mensuel + COA obligatoire) → messages clairs + invite upgrade ;
   COA obligatoire **uniquement** sur les pièces concernées ; dérogations `/admin` par org.

## 7. Definition of Done

- **Tests** : pgTAP (caps period-aware, feature gates `team`/`regafy`, sièges, grandfathering) ; unit
  **Monitor déterministe** (findings exacts, zéro IA) ; e2e (Free → Regafy masqué + 1 dossier + Monitor
  visible ; Pro → Regafy actif + 5/mois ; Team → invitations) ; suites existantes vertes.
- **Sécurité** : enforcement **server-side** (Edge + RPC + trigger), pas seulement UI ; feature flags
  **re-vérifiés côté Edge** (un client modifié ne contourne pas).
- **Perf** : Monitor **déterministe offline** (quelques ms) ; pas de régression bundle (entrée ≤ 135 Ko).
- **Recette navigateur** : Free, Pro, Team — parcours réels ; COA sans date → save bloqué ; Regafy écart
  déclaré/réel signalé.

## 8. Prochaine étape recommandée (action unique)

**O1 — migration du modèle de plans**, en commençant par le **grandfathering des orgs pilotes** (zéro
régression), puis reseed + enforcement. **3 points à confirmer avant** (voir go/no-go) : (a) tokens IA
Team & Business, (b) plan de grandfathering des pilotes, (c) périmètre de la date d'expiration obligatoire.
