// Contrat d'EFFICACITÉ des payloads du référentiel réglementaire versionné (P4.1→P4.4).
//
// Problème résolu : le God dashboard publie du contenu (`ref_entries.payload` jsonb) que le
// résolveur CLIENT (`web/src/features/catalogue/ref-content.ts`) re-normalise défensivement. Si
// les deux logiques divergent, deux pannes SILENCIEUSES apparaissent :
//   • l'Edge accepte un payload que le client ignore → « version publiée qui ne rend rien » (le
//     god croit avoir publié, les clients voient toujours le socle) ;
//   • l'Edge refuse un payload que le client rendrait → publication bloquée sans raison visible.
//
// Ce module est LA définition serveur, et `ref-payload-fixtures.json` LE contrat commun : le test
// Deno d'ici et le test de parité vitess côté web assertent la MÊME table. Toute dérive d'un des
// deux côtés casse la CI (même mécanique que `ref-seed.test.ts` pour la parité socle ↔ seed).
//
// Règle de conception : ce fichier reste SANS dépendance (importable par n'importe quelle Edge
// Function, testable en pur) et purement défensif — il ne corrige jamais un payload, il répond
// « ce contenu produira-t-il quelque chose ? ».

/** Sections RENDUES par le client (une section que rien ne rend serait un piège à publier). */
export const REF_SECTIONS = [
  "agency",
  "fees",
  "submission",
  "samples",
  "ctd_structure",
] as const;
export type RefSection = typeof REF_SECTIONS[number];

export function isRefSection(v: unknown): v is RefSection {
  return typeof v === "string" && (REF_SECTIONS as readonly string[]).includes(v);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Traduisible UTILE : `fr` ET `en` non vides. Une paire vide n'est pas du contenu — le socle
 *  bilingue du code vaut mieux qu'un champ blanc dans une lettre officielle. */
export function isUsefulT(v: unknown): boolean {
  if (!isObj(v)) return false;
  return typeof v.fr === "string" && v.fr.trim() !== "" &&
    typeof v.en === "string" && v.en.trim() !== "";
}

/** Montant/durée UTILISABLE : nombre fini POSITIF ou nul. Un négatif est une coquille de saisie
 *  (l'éditeur god ne peut pas en produire) — mieux vaut retomber sur le socle que l'afficher. */
export function isUsefulNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

const FEE_KEYS = ["new_ma", "renewal", "variation_minor", "variation_major"] as const;

// ── Structure du Module 1 (P4.5) ───────────────────────────────────────────────────────────────
// L'arborescence du Module 1 est le SEUL module CTD qui varie par pays (« checking standard »).
// Elle vient du socle code (`getModule1Tree`) ; une entrée `ctd_structure` publie des DELTAS par
// pays plutôt qu'un arbre complet : un arbre complet publié figerait le pays hors de toute
// évolution du socle (nouveaux formats, corrections) et rendrait la moindre coquille catastrophique.

/** Numérotation CTD — c'est l'IDENTITÉ d'un nœud : elle ne se renomme jamais. */
const CTD_NUMBER_RE = /^\d+(\.\d+)*$/;
export const CTD_DELTA_KINDS = ["add", "remove", "relabel"] as const;
/** Formats d'arbre visés par un delta ; absent = les deux. */
export const CTD_FORMATS = ["ctd", "ectd"] as const;

/**
 * Un delta est-il APPLICABLE par le client ? (miroir de `applyStructureDeltas`, ref-structure.ts)
 * - `add` : numéro valide + libellé non vide (le parent est déduit du numéro, `1.2.9` → `1.2`) ;
 * - `remove` : numéro valide (« plus exigé » — le client ne supprime QUE du vide, cf. P4.5c) ;
 * - `relabel` : numéro valide + libellé non vide.
 * `activities` optionnel borne le delta (décision A : par défaut toutes les activités, une
 * restriction explicite reste possible SANS changer la forme du payload).
 */
function ctdDeltaEffective(v: unknown): boolean {
  if (!isObj(v)) return false;
  const kind = v.kind;
  if (typeof kind !== "string" || !(CTD_DELTA_KINDS as readonly string[]).includes(kind)) {
    return false;
  }
  // TRIM avant test, comme le client (`deltaFromPayload`) : sans lui, « 1.1.2 » entouré d'espaces
  // était refusé ici et appliqué là-bas — divergence invisible à l'œil (Major M5, revue P4.5).
  const number = typeof v.number === "string" ? v.number.trim() : "";
  if (!CTD_NUMBER_RE.test(number)) return false;
  // Un `remove` ne vise qu'un nœud de profondeur ≥ 3 segments : retirer « 1.2 » effacerait une
  // branche entière et rendrait ses pièces déjà déposées invisibles ET absentes du PDF (M2).
  if (kind === "remove" && number.split(".").length < 3) return false;
  if (kind !== "remove") {
    if (typeof v.label !== "string" || v.label.trim() === "") return false;
  }
  if (v.format !== undefined && !(CTD_FORMATS as readonly string[]).includes(v.format as string)) {
    return false;
  }
  if (v.activities !== undefined) {
    if (!Array.isArray(v.activities) || v.activities.length === 0) return false;
    if (!v.activities.every((a) => typeof a === "string" && a.trim() !== "")) return false;
  }
  return true;
}

/**
 * Ce payload produira-t-il du contenu une fois normalisé par le résolveur client ?
 * Miroir STRICT de `agencyFromPayload`/`feesFromPayload`/`submissionFromPayload`/
 * `samplesFromPayload` (`ref-content.ts`) — verrouillé par les fixtures partagées.
 */
export function refPayloadEffective(section: string, payload: unknown): boolean {
  if (!isObj(payload)) return false;
  switch (section) {
    case "agency": {
      // Le patch agence se fusionne champ par champ avec le socle : sans sigle NI dénomination,
      // il n'y a pas d'identité d'agence à publier (le client retombe sur le socle).
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const full = typeof payload.full === "string" ? payload.full.trim() : "";
      return name !== "" || full !== "";
    }
    case "fees": {
      if (!isObj(payload.fees)) return false;
      const fees = payload.fees;
      return FEE_KEYS.some((k) => isUsefulNumber(fees[k]));
    }
    case "submission":
      return isUsefulT(payload.note);
    case "samples": {
      if (!isObj(payload.samples)) return false;
      const s = payload.samples;
      const list = (v: unknown) => Array.isArray(v) && v.some(isUsefulT);
      return list(s.new_ma) || list(s.renewal_variation) || isUsefulT(s.reserve);
    }
    case "ctd_structure": {
      // Au moins UN delta applicable. Un tableau vide (ou 100 % de deltas malformés) publierait
      // une structure « à jour » qui ne change rien : bannière de mise à jour pour du néant.
      if (!Array.isArray(payload.deltas)) return false;
      return payload.deltas.some(ctdDeltaEffective);
    }
    default:
      // Section hors liste blanche : le client l'ignore, donc publier serait un piège.
      return false;
  }
}

/** Une fixture du contrat partagé (`ref-payload-fixtures.json`). */
export interface RefPayloadFixture {
  /** Ce que la fixture prouve — repris tel quel dans le nom du cas de test. */
  case: string;
  section: string;
  payload: unknown;
  /** Attendu des DEUX côtés : l'Edge publie ⟺ le client rend. */
  effective: boolean;
}
