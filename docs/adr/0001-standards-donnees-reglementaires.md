# ADR 0001 — Standards de données réglementaires (ISO IDMP, eCTD v4 / ICH M8, ALCOA++)

- **Statut** : Proposé (à valider par le CEO, expert RA)
- **Date** : 2026-06-06
- **Portée** : modèle de données Pharnos (Catalogue, Documents/CTD) + couche d'intégrité/audit

## Contexte

Pharnos manipule des **données pharmaceutiques réglementées**. Pour la qualité des données,
l'interopérabilité internationale, et la valeur des modules **Audit (Regafy AI)** et **CTD/eCTD**,
le modèle de données doit s'aligner sur les standards que les agences (et l'ICH) ont adoptés.
Construire l'audit/reco sans cet ancrage = audits non fiables et reprise coûteuse plus tard.

## Les 3 piliers retenus

### 1. Données **produit** → ISO **IDMP** (Identification of Medicinal Products)
Suite de normes ISO portée par l'ICH/les régulateurs :
- **ISO 11238** — substances (la DCI / substance active, identifiée de façon structurée)
- **ISO 11239** — **formes pharmaceutiques, unités de présentation, voies d'administration, conditionnement** (vocabulaires contrôlés ; cf. EDQM Standard Terms)
- **ISO 11240** — **unités de mesure** (basé UCUM)
- **ISO 11615** — identification du médicament (MPID) : nom, ingrédients, AMM, conditionnement, particularités cliniques
- **ISO 11616** — produit pharmaceutique (PhPID) : algorithme à partir de substance + dosage + forme

**Conséquence modèle** : le dosage devient **valeur + unité** (pas du texte libre « 500 mg ») ;
**forme** et **voie** deviennent des **vocabulaires contrôlés** ; la DCI est une substance
(code optionnel). On ne fait pas l'IDMP complet au MVP, mais on rend le modèle **IDMP-ready**.

### 2. Données **document / dossier** → **eCTD v4.0 (ICH M8)**
eCTD v4 = format **message HL7 RPS R2 / FHIR**, piloté par métadonnées (plus une simple
arborescence de dossiers) : chaque document a un **UUID stable**, un **type** issu d'un
vocabulaire contrôlé, un **« Context of Use »** (le nœud CTD où il est utilisé), une **version**,
et des **opérateurs de cycle de vie** (new / replace / append / delete) + réutilisation de contenu.

**Conséquence modèle** : la table `documents` doit porter dès maintenant : `uuid` stable,
`doc_type` (vocabulaire contrôlé), `context_of_use` (nœud CTD), `version`, `lifecycle_op`,
`language` (BCP-47). Ainsi la **compilation PDF (M6)** et l'**export eCTD v4** deviennent une
transformation de métadonnées, pas une réécriture.

### 3. **Intégrité des données** → **ALCOA++**
Cadre d'intégrité (FDA 21 CFR Part 11, EU GMP Annexe 11 / Chap. 4, OMS) : **A**ttribuable,
**L**isible, **C**ontemporain, **O**riginel, **A**xact + **C**omplet, **C**ohérent, **E**ndurant,
**D**isponible, **T**raçable. Socle des **pistes d'audit**.

**Conséquence modèle** : une table **`audit_log` append-only** (insert-only, jamais update/delete
via RLS), **attribuée** (`auth.uid()`), **horodatée serveur** (contemporain), enregistrant
entité + action + diff (avant/après) + raison éventuelle, **traçable** au record. C'est l'épine
dorsale du module Audit **et** la condition pour que Pharnos soit un système « GxP-relevant » crédible.

## Décision

Adopter les 3 piliers comme **fondation de données**, avec des **vocabulaires contrôlés versionnés**
(formes EDQM/ISO 11239, voies, unités UCUM, types de documents CTD, pays UEMOA/CEDEAO, langues),
**curés/validés par le CEO (expert RA)** — ce qui adresse directement le risque n°1 (exactitude réglementaire).

## Phasage (pragmatique MVP)

- **Maintenant / fin M1** : `audit_log` ALCOA++ (additif) ; dosage **valeur+unité** ; **forme** et
  **voie** en `select` contrôlé (sous-ensemble EDQM) ; `documents` avec métadonnées eCTD-ready.
- **M4 (Audit/Regafy)** : l'IA s'appuie sur la piste d'audit + les vocabulaires contrôlés
  (validité des pièces, complétude vs structure CTD, conformité).
- **M6 (Compilation)** : métadonnées documents déjà alignées eCTD v4 → export = transformation.
- **Plus tard** : IDMP complet (PhPID), export eCTD v4 message HL7, validation CSV du système.

## Conséquences

- ➕ Qualité des données, interopérabilité, audits fiables, chemin eCTD ouvert, crédibilité GxP.
- ➖ Coût : **curation des vocabulaires contrôlés** (CEO/RA) + formulaires plus structurés. Mitigé par le phasage.

## Sources

- ISO IDMP / EMA — Data on medicines (ISO IDMP standards) : https://www.ema.europa.eu/en/human-regulatory-overview/research-development/data-medicines-iso-idmp-standards-overview
- FDA — Identification of Medicinal Products (IDMP) : https://www.fda.gov/media/166736/download
- ICH — eCTD v4.0 : https://www.ich.org/page/ich-electronic-common-technical-document-ectd-v40
- ICH M8 — eCTD v4.0 Implementation Package (support doc) : https://admin.ich.org/sites/default/files/inline-files/eCTDv4_0_SupportDocumentation_v1_4.pdf
- OMS — Guideline on data integrity (TRS 1033, Annexe 4) : https://cdn.who.int/media/docs/default-source/medicines/norms-and-standards/guidelines/inspections/trs1033-annex4-guideline-on-data-integrity.pdf
