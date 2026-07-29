// Schéma de sortie PAR RUBRIQUE (lot M2) — module PUR (ni SDK, ni réseau, ni API Deno).
//
// Pourquoi ce fichier existe (PLAN-MOTEUR-IA §3.2) : le décodage contraint rend le JSON invalide
// MÉCANIQUEMENT impossible, mais il fait bien plus que protéger le parseur —
//
//  1. `section_id` en `enum` alimenté depuis `conformity-specs.ts` : inventer une rubrique absente
//     du gabarit devient structurellement impossible. En génération par rubrique, l'énumération est
//     réduite à LA rubrique demandée : le modèle ne peut pas répondre à côté.
//  2. `status` en `enum` remplace le `grep` sur `[NON FOURNI DANS LE DOCUMENT SOURCE]`. Le marqueur
//     reste le libellé RENDU (contrat client), il cesse d'être le mécanisme.
//  3. `source_evidence` rend la garantie zéro-hallucination vérifiable par la machine (`evidence.ts`).
//
// Le schéma reste volontairement MINIMAL (types, enums, `required`, `additionalProperties: false`).
// Aucun mot-clé exotique (`maxLength`, `pattern`…) : le support varie d'un fournisseur à l'autre et
// un mot-clé refusé se paie en 400 sur un document client. Les bornes de taille vivent en code.
import { flattenRubrics, type ConformitySpec, type RubricSpec } from '../conformity-specs.ts'

/** État d'une rubrique — champ TYPÉ, plus un marqueur texte à retrouver au grep. */
export type SectionStatus = 'filled' | 'partial' | 'missing'

export const SECTION_STATUSES: readonly SectionStatus[] = ['filled', 'partial', 'missing']

/** Sortie d'un appel « une rubrique ». Les noms sont ceux du schéma, donc en `snake_case`. */
export interface SectionResult {
  section_id: string
  status: SectionStatus
  content: string
  source_evidence: string
}

/** Sortie inexploitable (JSON, forme, rubrique hors gabarit) — déterministe, donc NON re-tentable. */
export class SectionOutputError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'SectionOutputError'
    this.reason = reason
  }
}

/** Identifiants de TOUTES les rubriques du gabarit, parents et enfants (ordre du template). */
export function sectionIds(spec: ConformitySpec): string[] {
  return flattenRubrics(spec).map((r) => r.id)
}

/** Retrouve une rubrique par son identifiant officiel, à n'importe quelle profondeur. */
export function findRubric(spec: ConformitySpec, id: string): RubricSpec | null {
  return flattenRubrics(spec).find((r) => r.id === id) ?? null
}

/**
 * Schéma de sortie structurée pour les rubriques `allowedIds`.
 * Passer UN seul identifiant est le mode nominal : la génération est par rubrique (§8.1).
 */
export function sectionSchema(allowedIds: string[]): Record<string, unknown> {
  if (allowedIds.length === 0) {
    throw new SectionOutputError('empty_enum', 'schéma de rubrique sans identifiant autorisé')
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['section_id', 'status', 'content', 'source_evidence'],
    properties: {
      section_id: { type: 'string', enum: [...allowedIds] },
      status: { type: 'string', enum: [...SECTION_STATUSES] },
      content: { type: 'string' },
      source_evidence: { type: 'string' },
    },
  }
}

/**
 * Retire un éventuel encadrement ```json … ``` : le décodage contraint ne le produit pas, mais un
 * modèle de REPLI (§10, `fallbacks: default`) n'est pas tenu au même contrat de sortie. Réparer ce
 * cas coûte trois lignes ; le subir coûte une rubrique rejouée inutilement.
 */
function unfence(raw: string): string {
  const t = raw.trim()
  if (!t.startsWith('```')) return t
  return t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
}

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string') {
    throw new SectionOutputError('invalid_shape', `champ « ${field} » absent ou non textuel`)
  }
  return v
}

/**
 * Valide la sortie du modèle. **Défense en profondeur** : le décodage contraint garantit déjà la
 * forme, mais la garantie appartient au fournisseur — pas à nous. Un repli de modèle, un
 * changement d'API ou un `AI_PROVIDER` mal posé la font tomber en silence. Le contrôle vit donc
 * ici, dans le code qui exploite la sortie.
 */
export function parseSectionResult(raw: string, allowedIds: string[]): SectionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(unfence(raw))
  } catch {
    throw new SectionOutputError('invalid_json', 'sortie de rubrique : JSON illisible')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SectionOutputError('invalid_shape', 'sortie de rubrique : objet attendu')
  }
  const o = parsed as Record<string, unknown>

  const sectionId = asString(o.section_id, 'section_id')
  if (!allowedIds.includes(sectionId)) {
    // Le modèle a répondu SUR UNE AUTRE rubrique que celle demandée : ranger cette sortie sous
    // l'identifiant attendu produirait un document faux. On refuse.
    throw new SectionOutputError(
      'unknown_section',
      `sortie de rubrique : « ${sectionId.slice(0, 40)} » hors du gabarit demandé`,
    )
  }
  const status = asString(o.status, 'status')
  if (!(SECTION_STATUSES as readonly string[]).includes(status)) {
    throw new SectionOutputError('invalid_status', `sortie de rubrique : statut « ${status.slice(0, 20)} » inconnu`)
  }
  return {
    section_id: sectionId,
    status: status as SectionStatus,
    content: asString(o.content, 'content').trim(),
    source_evidence: asString(o.source_evidence, 'source_evidence').trim(),
  }
}
