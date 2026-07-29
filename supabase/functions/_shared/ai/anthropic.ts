// Fournisseur LLM — Anthropic (Claude Opus 5), derrière la surface neutre de `provider.ts` (M1).
// Secret : ANTHROPIC_API_KEY. Modèle surchargeable par ANTHROPIC_MODEL (défaut `claude-opus-5`).
//
// Choix de modèle (PLAN-MOTEUR-IA §10) : Opus 5, `effort: medium`, réflexion adaptative. L'effort
// élevé fait produire du contenu non demandé — exactement le défaut à proscrire sur un livrable
// réglementaire.
//
// ⚠️ Trois différences avec Vertex qui ne se devinent pas :
//  1. `temperature` / `top_p` / `top_k` sont REFUSÉS par l'API (400) sur Opus 5 — l'option neutre
//     `temperature` est donc volontairement ignorée ici, jamais transmise.
//  2. `max_tokens` plafonne réflexion + texte. Un `max_tokens` calibré pour Gemini (1024) tronque
//     le document en plein milieu : on impose un plancher (`MIN_MAX_TOKENS`).
//  3. Une troncature (`stop_reason: max_tokens`) rend un JSON/texte VALIDE mais incomplet. Elle est
//     donc levée en erreur ici, dans la fonction qui écrit — jamais laissée passer silencieusement.
import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0'

import { CircuitBreaker, HttpError } from '../retry.ts'
import { addUsage } from '../usage.ts'
import { boundedTimeout } from './limits.ts'
import type { AiOptions, Part, SimpleSseHooks } from './types.ts'

/** Breaker PROPRE à Anthropic : une panne Vertex ne doit pas ouvrir le circuit Anthropic. */
const breaker = new CircuitBreaker()

const DEFAULT_MODEL = 'claude-opus-5'
/** Plancher de `max_tokens` : la réflexion Opus 5 partage ce budget avec le texte rendu. */
const MIN_MAX_TOKENS = 16_000
const DEFAULT_TIMEOUT_MS = 90_000

const encoder = new TextEncoder()

/** Erreur déterministe (troncature, refus, schéma manquant) : NON re-tentable, jamais un HttpError. */
export class AnthropicOutputError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'AnthropicOutputError'
    this.reason = reason
  }
}

function client(timeoutMs: number): Anthropic {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant')
  // maxRetries: 0 — la politique de retry vit dans `_shared/retry.ts` (transitoires only, borne
  // partagée avec le breaker). Laisser le SDK re-tenter en plus multiplierait le wall clock.
  return new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs })
}

/** Traduit un fragment neutre en bloc de contenu Anthropic (texte, document PDF ou image). */
function toBlock(part: Part): Anthropic.ContentBlockParam {
  if (part.inlineData) {
    const { mimeType, data } = part.inlineData
    if (mimeType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        data,
      },
    }
  }
  return { type: 'text', text: part.text ?? '' }
}

/** Corps de requête commun aux deux modes (bloquant et flux). */
function buildBody(parts: Part[], opts: AiOptions): Anthropic.MessageCreateParamsNonStreaming {
  if (opts.json && !opts.jsonSchema) {
    // Sur Anthropic il n'existe pas de mode « JSON libre » : le décodage contraint EXIGE un schéma.
    // Échouer ici est plus honnête que rendre du texte libre là où l'appelant attend du JSON.
    throw new AnthropicOutputError(
      'schema_required',
      'sortie JSON demandée sans `jsonSchema` : Anthropic exige un schéma (PLAN-MOTEUR-IA §3.2)',
    )
  }
  return {
    model: opts.model || Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
    // Le plancher protège de la troncature : l'appelant borne le TEXTE, pas la réflexion.
    max_tokens: Math.max(opts.maxOutputTokens ?? 0, MIN_MAX_TOKENS),
    ...(opts.system ? { system: opts.system } : {}),
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: {
      effort: opts.effort ?? 'medium',
      ...(opts.jsonSchema ? { format: { type: 'json_schema', schema: opts.jsonSchema } } : {}),
    },
    messages: [{ role: 'user', content: parts.map(toBlock) }],
  }
}

/** Normalise une erreur SDK vers la politique de retry maison (transitoires only). */
function toPolicyError(e: unknown): unknown {
  // Un timeout ne doit JAMAIS être re-tenté : sous le mur de 150 s, une 2ᵉ tentative après
  // `timeoutMs` ne peut pas aboutir (même invariant que `retry.ts`).
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new AnthropicOutputError('timeout', 'Anthropic : délai dépassé')
  }
  if (e instanceof Anthropic.APIConnectionError) return new HttpError(503, 'Anthropic : réseau')
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    const retryAfterS = Number(e.headers?.get?.('retry-after'))
    return new HttpError(
      e.status,
      `Anthropic ${e.status}: ${String(e.message).slice(0, 400)}`,
      Number.isFinite(retryAfterS) && retryAfterS > 0 ? retryAfterS * 1000 : undefined,
    )
  }
  return e
}

/** Refus de sécurité ou troncature : deux états à constater AVANT de lire le contenu. */
function assertUsableStop(stopReason: string | null | undefined, where: string): void {
  if (stopReason === 'max_tokens') {
    throw new AnthropicOutputError(
      'truncated',
      `${where} : réponse tronquée (max_tokens) — contenu incomplet, non exploitable`,
    )
  }
  if (stopReason === 'refusal') {
    throw new AnthropicOutputError('refusal', `${where} : requête refusée par le modèle`)
  }
}

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Comptabilise les tokens pour le quota par organisation (les lectures de cache sont facturées). */
function recordUsage(usage: AnthropicUsage | undefined): { in: number; out: number } {
  const input = (usage?.input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0)
  const output = usage?.output_tokens ?? 0
  addUsage(input, output)
  return { in: input, out: output }
}

/** Génère du texte (mode bloquant). */
export async function generateParts(parts: Part[], opts: AiOptions = {}): Promise<string> {
  const timeoutMs = boundedTimeout(opts.timeoutMs, DEFAULT_TIMEOUT_MS)
  const body = buildBody(parts, opts)

  return await breaker.run(async () => {
    let message: Anthropic.Message
    try {
      message = await client(timeoutMs).messages.create(body)
    } catch (e) {
      throw toPolicyError(e)
    }
    assertUsableStop(message.stop_reason, 'anthropic.generate')
    recordUsage(message.usage as AnthropicUsage)
    // `content` est une union : blocs de réflexion PUIS blocs de texte. Seul le texte est le
    // livrable ; la réflexion (`display: summarized`) sert la mesure du lot M3, pas le document.
    return message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  })
}

/**
 * Génère en FLUX et rend directement le SSE simple du produit (`data: {"text":…}` puis `[DONE]`) —
 * chaque fournisseur possède son propre format de fil, l'appelant n'en voit aucun.
 */
export async function streamSimpleSse(
  parts: Part[],
  opts: AiOptions = {},
  hooks: SimpleSseHooks = {},
): Promise<ReadableStream<Uint8Array>> {
  const timeoutMs = boundedTimeout(opts.timeoutMs, DEFAULT_TIMEOUT_MS)
  const body = buildBody(parts, opts)

  const stream = await breaker.run(() => {
    try {
      return Promise.resolve(client(timeoutMs).messages.stream(body))
    } catch (e) {
      throw toPolicyError(e)
    }
  })

  let total = 0
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text ?? ''
            if (text) {
              total += text.length
              emit({ text })
            }
          }
        }
        const final = await stream.finalMessage()
        recordUsage(final.usage as AnthropicUsage)
        hooks.onUsage?.(
          (final.usage?.input_tokens ?? 0) + (final.usage?.cache_read_input_tokens ?? 0),
          final.usage?.output_tokens ?? 0,
        )
        // Le client a déjà reçu du texte : on ne peut plus « annuler ». On signale la troncature
        // explicitement — un document incomplet ne doit jamais passer pour complet.
        if (final.stop_reason === 'max_tokens') emit({ error: 'truncated' })
        else if (final.stop_reason === 'refusal') emit({ error: 'refusal' })
      } catch (e) {
        emit({ error: String((e as Error).message).slice(0, 200) })
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        hooks.onDone?.(total)
        controller.close()
      }
    },
    cancel() {
      stream.abort()
    },
  })
}
