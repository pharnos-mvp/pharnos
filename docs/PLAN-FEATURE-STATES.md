# PLAN — Gestion des features en god mode : modèle à 3 états

> **Validé CEO le 2026-06-17. À construire (1 PR, migration `0038`).** Doc d'exécution.
> Contexte : audit `/cto:review` du 2026-06-17 → le gating Regafy est déjà **100 % piloté par la
> donnée, zéro hardcode** (cf. [PLAN-N-EXECUTION.md](PLAN-N-EXECUTION.md), mémoire `post-n-backlog`).
> Ce plan enrichit le modèle de features pour donner au CEO un **contrôle total + un levier de conversion**.

## 1. Le modèle : 3 états par feature (par plan)

Chaque feature de `plan_limits.features` (jsonb) passe d'un **booléen** à un **état à 3 niveaux** :

| État (interne) | Jargon admin (FR / EN) | Frontend | Au clic / à l'usage | Rôle |
|---|---|---|---|---|
| `hidden` | **Masquée** / Hidden | Invisible | — | La feature n'existe pas pour ce plan |
| `teaser` | **Vitrine** / Preview | **Visible** (bouton, entrée) | Message « Incluse dès le plan {X} — Mettre à niveau » | **Tunnel de conversion** (montrer sans donner) |
| `enabled` | **Activée** / Enabled | Visible | **Opérationnelle** | Accès complet |

Mapping au vocabulaire CEO : *Non disponible* = **Masquée** · *Disponible* = **Vitrine** · *Activé* = **Activée**.

## 2. Feature ≠ quota (règle d'or)

> **La feature = le robinet (offre on/off). Le quota = le débit (tokens/dossiers/stockage chiffrés).**

Pour l'IA (Regafy) : « **Activée** » = `features.regafy = 'enabled'` **+ `monthly_ai_tokens` > 0**.
- Activée + 50 000 tokens → marche jusqu'à 50k.
- Activée + 0 token → visible mais **429** (« quota du mois atteint ») au 1er appel.
- Vitrine → clic = upsell « passez à Pro ».

→ On peut **offrir Regafy au plan free avec 10 000 tokens d'essai**, purement depuis `/admin`, zéro code.

## 3. Boutons « Analyser » + « Traduire » (décision CEO)

- **Toujours visibles** à côté du bouton **Upload**, pour **tous** les plans (si état ≠ Masquée).
- **ON-DEMAND** : pas d'analyse automatique (doctrine recette n°6 **conservée** — maîtrise des coûts).
- Clic → **run** si Activée ; **upsell** si Vitrine.
- **Monitor** (déterministe, gratuit) continue de signaler **automatiquement** pour tous (titulaire≠fabricant,
  champs à compléter…). C'est l'IA (langue, conformité au template) qui est on-demand.
- État actuel à corriger : « Analyser » n'est visible que si un doc analysable est l'onglet actif ; « Traduire »
  **n'a aucun bouton autonome** (seulement après une analyse Regafy réussie) → un free ne peut jamais l'atteindre.

## 4. Plan d'exécution (1 PR, migration `0038`)

1. **Données + gates serveur** (cœur sensible) :
   - `features` booléen → état `hidden/teaser/enabled` ; **reseed** : `true → enabled`, `false → teaser`.
   - Convertir les gardes : `consume_ai_quota` (`features->>'regafy' = 'enabled'`),
     `create_invitation` / onboarding (`features->>'team' = 'enabled'`), + tout autre check booléen de `features`.
   - **Rétro-compat** pendant la bascule : lire `= 'enabled' OR = 'true'`.
   - **pgTAP** : plan en Vitrine → `feature_disabled` ; Activée → passe (mirroir du test B1).
2. **Socle front** : type `FeatureState` + helpers `featureState(plan,key)` / `isEnabled` / `isVisible` +
   labels i18n (Masquée/Vitrine/Activée) + **composant upsell** (« Incluse dès le plan {X} → Mettre à niveau »
   renvoyant à l'onglet Compte → Abonnement).
3. **God mode** : `AdminPlans` → **menus déroulants 3 états** (au lieu des cases à cocher) ;
   `admin-api` type `Record<string, FeatureState>` (l'Edge `admin` passe le jsonb tel quel → pas de changement Edge).
4. **Front gates** : `TeamSection` aligné sur 3 états + `DossierWorkspacePage` → Analyser + Traduire
   toujours visibles à côté d'Upload, clic → run/upsell.
5. **Recette** : `/admin` bascule un plan Vitrine ↔ Activée, vérif front (visible → upsell → opérationnel) ;
   smoke prod du gate `consume_ai_quota` (free Vitrine → `feature_disabled`).

## 5. Risque de dette technique

**Modéré, bien contenu.** Le seul point délicat = la **conversion du gate `consume_ai_quota`**
(sécurité / facturation) → couvert par **pgTAP + smoke prod**, exactement comme le correctif B1 (`0034`).
Aucun refactor du copilote (`use-regafy-copilot.ts`) requis : l'analyse est déjà strictement on-demand.

## 6. Garde-fous

- **Zéro hardcode** : aucun `if plan = '…'` ; tout reste piloté par `plan_limits.features` / overrides, éditable en god mode.
- **Invariant facturation** : un override de tokens ne débloque jamais une feature en Vitrine/Masquée
  (le gate de feature prime sur le quota — cf. ordre dans `consume_ai_quota`).
- **i18n** : libellés admin + upsell bilingues FR/EN ; le contenu réglementaire reste inchangé.
