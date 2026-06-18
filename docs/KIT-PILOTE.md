# Kit pilote — parcours-type « 1 dossier Module 1 compilé < 1 jour »

> **But.** Donner à chaque organisation pilote un parcours **reproductible** qui satisfait la
> Definition of Done du GO-LIVE (gate N4) : **1 dossier réel compilé < 1 j + 1 correspondance + 1 partage**.
> Ce parcours a été **validé en prod** (2026-06-17, compte Enterprise de test) — voir §5.

## 1. Definition of Done (par org pilote)
- [ ] **1 produit** créé depuis ses propres documents (fiche d'identification complète).
- [ ] **1 dossier Module 1** monté (chaque pièce sous le bon nœud CTD).
- [ ] **Monitor/Regafy** passés (validité des pièces admin + conformité RCP/Notice) — constats traités ou justifiés.
- [ ] **1 PDF Module 1 compilé** (cover CTD + pièces) — téléchargé OU envoyé.
- [ ] **1 fil de correspondance** ouvert (envoi du dossier à l'agence via lien tokenisé).
- [ ] **1 partage utilisé** (lien ouvert/relu côté destinataire).
- [ ] **Le tout en < 1 jour ouvré.**

## 2. Le parcours (8 étapes)
1. **Connexion** (Google ou e-mail) → on arrive sur le **Catalogue**.
2. **Catalogue → Nouveau produit** : remplir l'identification (nom commercial, DCI + dosage, forme,
   présentation, classe thérapeutique, **titulaire** nom+adresse, **fabricant** nom+adresse). Source =
   la lettre de demande / le RCP / le COPP du produit.
3. **CTD Workspace → Nouveau dossier** : choisir le produit, **CTD (PDF)**, l'activité (ex. *Nouvelle AMM*),
   le **pays cible** (ex. Bénin/ABMed) → *Créer le dossier*.
4. **Montage** : pour chaque pièce, **sélectionner le nœud** dans l'arborescence puis **Téléverser** le
   fichier (mapping §3). Les RCP/Notice/Étiquetage peuvent aussi être **remplis via le formulaire officiel**
   (« Remplir le template ») au lieu d'être téléversés.
5. **Monitor** (gratuit, tous plans) tourne en continu (validité 6/18 mois, titulaire≠fabricant…).
   **Regafy** (IA, dès Pro) : bouton **Analyser** par pièce → validité (admin) / conformité + langue (RCP…).
6. **Traduire** si une pièce est dans une langue ≠ langue officielle du pays (bouton « Traduire en FR »).
7. **Compiler le PDF** : la fenêtre liste les constats restants → *Audit de conformité* (rapport A4) ou
   *Compiler quand même* → **PDF Module 1** (cover + TDM + pages de garde) → **Télécharger** ou **Envoyer**.
8. **Correspondance** : *Envoyer* génère un **lien tokenisé** vers l'agence (review sans compte) →
   l'agence ouvre/décide → le statut remonte dans le dossier et le **Tableau de bord**.

## 3. Mapping document → nœud CTD (Module 1 UEMOA)
| Document | Nœud | Catégorie |
|---|---|---|
| Lettre de demande | **1.1.1** | Correspondance |
| Lettre de PGHT | **1.1.2** | Correspondance |
| Formulaire de demande/soumission | **1.2.1** | Administratif |
| Quittance / paiement des frais | **1.2.2** | Administratif |
| CEP (Pharmacopée Européenne) | **1.2.3.1** | Admin — validité |
| **COPP** | **1.2.3.2** | Admin — validité |
| AMM pays d'origine | **1.2.3.3** | Admin — validité |
| **COA** (certificat d'analyse) | **1.2.3.4** | Admin — validité (≥ 18 mois) |
| **BPF / GMP** | **1.2.4.1** | Admin — validité |
| **ML** (licence d'établissement) | **1.2.4.2** | Admin — validité |
| **FSC** (vente libre) | **1.2.4.3** | Admin — validité |
| **RCP** | **1.3.1** | Produit — conformité + langue |
| **Notice / PIL** | **1.3.2** | Produit — conformité + langue |
| Étiquette (conditionnement primaire) | **1.3.3.1** | Produit — conformité + langue |
| Carton (emballage extérieur) | **1.3.3.2** | Produit — conformité + langue |

> **Hors Module 1** : QIS / QOS / données qualité = **Module 3** (non couvert par le MVP — Module 1 only).

## 4. Comptes de test (réf. `Test/Readme.txt` — mots de passe hors dépôt)
Free · Pro · Team · Business · Enterprise · God Admin. Le plan **change ce qui est testable** :
Regafy IA et la traduction sont **dès Pro** (Free = Monitor déterministe seul) ; la **compilation** est
métrée (Free = 1/mois). Jeux de documents fournis : **Gynoril Ovule** et **KV-Super Muscle**.

## 5. Déjà validé en prod (dry-run CTO, 2026-06-17, compte Enterprise)
- **Création produit** (KV-Super Muscle, identité réelle extraite des docs) + **création dossier** (Bénin, CTD, Nouvelle AMM) ✅
- **Regafy IA en anglais** sous UI EN (constat COPP « validity not detected automatically… ») ✅ (P0-2)
- **En-tête de template sticky** au scroll d'un long RCP ✅ (P0-1)
- **Gate de pré-compilation** localisé (liste tous les constats) → **compilation Module 1 en ~2 s** →
  `Gynoril Ovule_M1_bf.pdf` (cover CTD + contenu) téléchargeable/envoyable ✅
- **Limite connue** : le téléversement automatisé des PDF locaux via l'outil navigateur est bloqué par le
  bac à sable (seuls les dossiers « connectés » à la session sont autorisés) → l'org pilote téléverse
  elle-même (parcours normal), ou on connecte le dossier source à la session.

## 6. Friction à surveiller chez les pilotes (à collecter)
Temps de bout en bout, étapes où ils hésitent, libellés peu clairs, erreurs sans CTA, lenteurs de
compilation sur gros dossiers, langue des constats. → alimente le backlog *erreurs actionnables* (Phase 2 #1).
