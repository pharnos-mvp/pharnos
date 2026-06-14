# Jalon L — i18n FR/EN complet de l'app

> Chaîne doc : [ROADMAP-MVP.md](ROADMAP-MVP.md) §L. **Socle existant** (posé au jalon J) :
> `web/src/lib/i18n-context.ts` + `I18nProvider.tsx` — chaînes **co-localisées** `t({ fr, en })`
> (pas de dico de clés), persistance `localStorage` (`pharnos.lang`), **défaut FR**, met à jour
> `document.documentElement.lang`. **Ce jalon = généraliser ce socle à TOUTE l'app + ajouter le
> sélecteur de langue + localiser les e-mails.**

## 1. Objectif & succès
- **Objectif** : toute l'interface de l'app bascule **FR↔EN** via un sélecteur **persisté**, **sans
  rechargement**, **sans régression** — la landing est déjà bilingue, l'app le devient.
- **Succès** : sur **chaque page** (login, reset, catalogue, workspace, dashboard, correspondance,
  compte, page publique de review), **aucun texte d'UI ne reste figé dans l'autre langue** quand on
  bascule ; e-mails transactionnels localisés ; **Lighthouse a11y ≥ 95 / perf ≥ 90** en CI ; recette
  navigateur réel FR **et** EN.

## 2. Scope (tranche verticale de valeur d'abord)
- **Sélecteur de langue** réutilisable `<LangSwitch>` **visible** (app-shell + LoginPage + page publique).
- **Généralisation du socle** `t({fr,en})` à TOUT le texte d'UI restant : auth, catalogue, workspace
  (montage CTD + **UI** Regafy), correspondance + page publique, reliquats (App/AppGate, ErrorBoundary,
  toasts, loading/empty, ImageField).
- **Helpers d'étiquettes partagés** rendus lang-aware (`docTypeLabel`, `countryLabel`, `activityLabel`,
  libellés d'états de dossier) — réutilisés partout.
- **E-mails transactionnels** (`supabase/functions/share`) localisés selon la langue de l'**expéditeur**
  (param `lang` client → Edge, **repli FR**).

## 3. Non-goals (explicitement HORS scope)
- **Contenu réglementaire** : templates RCP/CTD, **règles & findings Regafy**, libellés officiels →
  restent **pilotés par la langue officielle du pays cible** (politique inchangée). On traduit le
  **chrome UI**, **jamais** le contenu réglementaire ni les findings.
- **Pas de migration vers une lib i18n** (react-i18next/lingui) : on garde le socle co-localisé
  (0 dépendance, offline-first, type-safe).
- **Pas de préférence serveur/Supabase cross-device** : `localStorage` suffit (offline-first). Option future.
- Contenu utilisateur (noms de dossiers, messages), RTL, langues au-delà de FR/EN, ICU/pluriels avancés.

## 4. Architecture & stack (décidée)
- **Socle conservé** : `t({fr,en})` co-localisé + `I18nProvider` (localStorage, défaut FR, `document.lang`).
  *Rationale : déjà éprouvé (dashboard), 0 dépendance, pas de chargement async (offline-first),
  type-safe (`Translatable`), perf nulle.*
- **`<LangSwitch>`** : petit toggle FR/EN (DA neutre, `aria-label`), branché sur `useI18n().setLang`.
  Placé bas de barre latérale (app-shell), header LoginPage, header page publique.
- **Helpers lang-aware** : `docTypeLabel/countryLabel/activityLabel/états` renvoient `Translatable`
  (ou acceptent `lang`).
- **E-mails** : `share/index.ts` reçoit `lang`, templates FR/EN (repli FR) ; DKIM/Resend inchangés.

## 5. Milestones (tranches livrables, chacune recettable)
- **L1 — Fondations + sélecteur + auth/chrome** (~0,5 s.) : `<LangSwitch>` + branchements ; convertir
  auth (LoginPage, ResetPasswordPage), App/AppGate, ErrorBoundary, toasts/loading/empty globaux,
  helpers d'étiquettes partagés. → l'utilisateur **bascule FR↔EN** ; entrée + dashboard (déjà fait)
  100 % bilingues. Recette : toggle persistant, login + dashboard en EN.
- **L2 — Catalogue (+ reliquats Compte)** (~0,3 s.) : CataloguePage, ProductForm(Page),
  DocumentsSection, doc-types ; ImageField + vérif compte. Recette EN.
- **L3 — CTD Workspace** (~0,6 s.) : montage (DossierWorkspacePage, WorkspacePage, NewDossierPage,
  RoadmapPage), toolbar/RichTextEditor, templates UI (TemplateFillForm), **UI** Regafy (RegafyGateDialog,
  NonConformCard, AuditReportView, CompletionPanel, TranslationProgress), Pdf(Viewer/PreviewDialog),
  Arborescence/Tree/Donut. **(contenu réglementaire/Regafy NON touché).** Recette EN.
- **L4 — Correspondance + page publique + e-mails** (~0,4 s.) : ShareDialog, CorrespondencePanel,
  MessageThread, avatar ; PublicReviewPage + son propre `<LangSwitch>` (repli = langue du partage) ;
  e-mails `share` bilingues (param `lang`). Recette : envoi EN + page publique EN + e-mail localisé.

## 6. Risques & mitigations (top 3)
1. **Chaînes manquées** (~30+ fichiers ; un texte oublié reste figé) → balayage systématique par tranche
   + audit grep (diacritiques/mots FR dans le JSX) + **recette navigateur EN sur chaque page** ;
   option : pseudo-locale dev.
2. **Régression build/JSX** (édits de masse) → TS strict (`noUncheckedIndexedAccess`), tests existants,
   CI 6 jobs par PR, commits par tranche, e2e a11y.
3. **Plomberie e-mail i18n** (lang client → Edge + templates) → param `lang` + repli FR, test unitaire
   FR/EN, envoi réel de contrôle.

## 7. Definition of Done
- Toggle FR/EN **visible**, **persisté** (`localStorage`), défaut FR, **sans rechargement**,
  `document.lang` à jour, `aria-label`.
- **Aucune chaîne d'UI figée** dans l'autre langue sur login/reset/catalogue/workspace (montage + UI
  Regafy)/dashboard/correspondance/compte/page publique — vérifié en recette **FR + EN**.
- E-mails transactionnels localisés (expéditeur, repli FR), testés FR/EN.
- **Contenu réglementaire/Regafy inchangé** (langue officielle pays).
- CI verte : lint, TS strict, tests unitaires, e2e (a11y), **Lighthouse perf ≥ 90 / a11y ≥ 95** ;
  budget bundle tenu (pas de régression perf).

## 8. Prochaine étape (action unique)
**L1** : créer `<LangSwitch>`, le brancher (app-shell + LoginPage), convertir l'auth + le chrome global
+ les helpers d'étiquettes partagés → premier jet où la bascule FR↔EN est **visible et persistée**.

## Vérification (bout en bout)
Par tranche : `npm --prefix web run build` + tests ; **recette navigateur réel** — basculer FR↔EN sur
la/les page(s) de la tranche, vérifier 0 texte figé, persistance au reload, `document.lang`. L4 : envoi
réel + e-mail localisé. Final : e2e a11y + Lighthouse en CI.
