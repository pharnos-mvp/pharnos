// Vue Agent local tokenisée (LOT 10b, jalon M7) — validation PURE des événements de cycle de vie
// que l'AGENT LOCAL peut journaliser via son lien (Edge `share`, action `lifecycle_event`).
//
// Principes :
//   • WHITELIST stricte des types AVAL que l'agent confirme (mockup validé CEO) — jamais les
//     jalons amont (correspondance), jamais les conditions échantillons/frais (pilotées labo, M3),
//     jamais `reminder_sent` (bouton labo / cron système).
//   • Payload RECONSTRUIT clé par clé, borné et typé — on ne fait JAMAIS passer l'objet client
//     (saisie hostile par défaut : l'appelant est anonyme derrière un token).
//   • Parité de dialecte avec le côté labo (LifecycleActionCard/M2) : `submitted {mode, reference}`,
//     `authority_query {via, note}`, `amm_granted {amm_number, valid_until}` — `journalDetail` et
//     `deriveRenewalAlert` lisent ces clés, un seul dialecte pour tout le journal.
//   • `valid_until` est normalisé ICI en ISO midi-UTC (même règle que le labo, M2 : pas de
//     décalage de jour selon le fuseau du poste).

export const AGENT_EVENT_TYPES = [
  'deposited',
  'submitted',
  'authority_query',
  'amm_granted',
  'amm_refused',
] as const

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number]

const SUBMISSION_MODES = new Set(['portal', 'physical', 'portal_physical', 'paper'])
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Chaîne bornée/trimée, ou undefined si absente/vide/hors borne (tolérant, jamais passthrough). */
function boundedString(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s || s.length > max) return undefined
  return s
}

/** `YYYY-MM-DD` → ISO midi-UTC (règle labo M2) ; undefined si absent ou illisible. */
function dayToNoonUtc(v: unknown): string | undefined {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return undefined
  const iso = `${v}T12:00:00.000Z`
  return Number.isFinite(Date.parse(iso)) ? iso : undefined
}

export interface AgentLifecycleEvent {
  type: AgentEventType
  payload: Record<string, unknown>
}

/**
 * Valide et RECONSTRUIT l'événement demandé par l'agent — `null` si le type est hors whitelist
 * ou si un champ REQUIS manque (amm_number). Les champs optionnels invalides sont omis
 * (saisie tolérante, cohérente avec le journal append-only : une correction = un nouvel événement).
 */
export function validateAgentLifecycleEvent(
  rawType: unknown,
  rawPayload: unknown,
): AgentLifecycleEvent | null {
  if (typeof rawType !== 'string') return null
  const type = rawType as AgentEventType
  if (!AGENT_EVENT_TYPES.includes(type)) return null
  const p = (rawPayload ?? {}) as Record<string, unknown>

  switch (type) {
    case 'deposited':
      return { type, payload: {} }
    case 'submitted': {
      const payload: Record<string, unknown> = {}
      const mode = boundedString(p.mode, 40)
      if (mode && SUBMISSION_MODES.has(mode)) payload.mode = mode
      const reference = boundedString(p.reference, 120)
      if (reference) payload.reference = reference
      return { type, payload }
    }
    case 'authority_query': {
      // Relayée PAR l'agent, par construction (cas « en direct » = saisie labo, M4-T4).
      const payload: Record<string, unknown> = { via: 'agent' }
      const note = boundedString(p.note, 2000)
      if (note) payload.note = note
      return { type, payload }
    }
    case 'amm_granted': {
      const ammNumber = boundedString(p.amm_number, 80)
      if (!ammNumber) return null // seul champ REQUIS de toute la surface
      const payload: Record<string, unknown> = { amm_number: ammNumber }
      const validUntil = dayToNoonUtc(p.valid_until)
      if (validUntil) payload.valid_until = validUntil
      return { type, payload }
    }
    case 'amm_refused': {
      const payload: Record<string, unknown> = {}
      const reason = boundedString(p.reason, 500)
      if (reason) payload.reason = reason
      return { type, payload }
    }
  }
}
