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

/** Sections RENDUES par le client. `ctd_structure` (P4.5) absente tant que rien ne la rend. */
export const REF_SECTIONS = ["agency", "fees", "submission", "samples"] as const;
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
