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

import { logJson } from '../log.ts'
import { CircuitBreaker, HttpError } from '../retry.ts'
import { addUsage } from '../usage.ts'
import { servedByFallback, type UsageIteration } from './fallback.ts'
import { boundedTimeout } from './limits.ts'
import type { AiOptions, Part, SimpleSseHooks } from './types.ts'

/** Breaker PROPRE à Anthropic : une panne Vertex ne doit pas ouvrir le circuit Anthropic. */
const breaker = new CircuitBreaker()

const DEFAULT_MODEL = 'claude-opus-5'
/** Plancher de `max_tokens` : la réflexion Opus 5 partage ce budget avec le texte rendu. */
const MIN_MAX_TOKENS = 16_000
const DEFAULT_TIMEOUT_MS = 90_000

/**
 * Repli serveur. Opus 5 embarque des classificateurs (`cyber`, `bio`) qui peuvent DÉCLINER une
 * requête : réponse HTTP 200 normale, `stop_reason: "refusal"`, contenu vide. Sur un dossier d'AMM
 * payé, un refus est une panne produit.
 *
 * `"default"` laisse l'API choisir le modèle de repli SELON LA CATÉGORIE du refus et rejoue la
 * requête dans le même appel — le refus survenu avant toute sortie n'est pas facturé. On préfère
 * `"default"` à un modèle épinglé : la bonne cible dépend de la raison du refus, et un modèle
 * épinglé devient une dette le jour où il est déprécié.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

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
function toBlock(part: Part): Anthropic.Beta.BetaContentBlockParam {
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

/**
 * Place le point de rupture du cache de préfixe.
 *
 * Anthropic met en cache tout ce qui PRÉCÈDE le bloc marqué, bloc compris — donc la consigne
 * système aussi, sans qu'il faille la marquer séparément. Écriture facturée 1,25×, relecture 0,1× :
 * le gain n'existe que si le préfixe est relu plusieurs fois avant expiration (5 min par défaut).
 *
 * ⚠️ Marquer le DERNIER bloc mettrait la requête entière en cache, partie variable comprise :
 * chaque appel paierait l'écriture sans jamais relire. On refuse plutôt que de coûter en silence.
 */
function withCacheBreakpoint(
  blocks: Anthropic.Beta.BetaContentBlockParam[],
  at: number | undefined,
): Anthropic.Beta.BetaContentBlockParam[] {
  if (at === undefined) return blocks
  if (!Number.isInteger(at) || at < 0 || at >= blocks.length - 1) {
    throw new AnthropicOutputError(
      'bad_cache_breakpoint',
      `cacheBreakpointAfter=${at} invalide : il doit désigner un fragment AUTRE que le dernier ` +
        `(${blocks.length} fragments) — sinon la partie variable entre dans le cache et chaque ` +
        `appel paie l'écriture sans jamais relire`,
    )
  }
  return blocks.map((b, i) =>
    i === at ? { ...b, cache_control: { type: 'ephemeral' as const } } : b
  )
}

/** Corps de requête commun aux deux modes (bloquant et flux). */
function buildBody(
  parts: Part[],
  opts: AiOptions,
): Anthropic.Beta.MessageCreateParamsNonStreaming {
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
    ...(opts.fallbacks === false ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' }),
    // La consigne système part en BLOC quand elle doit être mise en cache : `cache_control` ne
    // s'attache pas à une chaîne nue.
    ...(opts.system
      ? {
        system: opts.cacheSystem
          ? [{
            type: 'text' as const,
            text: opts.system,
            cache_control: { type: 'ephemeral' as const },
          }]
          : opts.system,
      }
      : {}),
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: {
      effort: opts.effort ?? 'medium',
      ...(opts.jsonSchema ? { format: { type: 'json_schema', schema: opts.jsonSchema } } : {}),
    },
    messages: [{
      role: 'user',
      content: withCacheBreakpoint(parts.map(toBlock), opts.cacheBreakpointAfter),
    }],
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
function assertUsableStop(
  stopReason: string | null | undefined,
  where: string,
  category?: string | null,
): void {
  if (stopReason === 'max_tokens') {
    throw new AnthropicOutputError(
      'truncated',
      `${where} : réponse tronquée (max_tokens) — contenu incomplet, non exploitable`,
    )
  }
  if (stopReason === 'refusal') {
    // Avec `fallbacks`, un refus FINAL signifie que TOUTE la chaîne a décliné (modèle principal
    // puis repli) — pas un simple refus rattrapable. La catégorie oriente le diagnostic.
    throw new AnthropicOutputError(
      'refusal',
      `${where} : requête refusée par la chaîne de modèles${category ? ` (${category})` : ''}`,
    )
  }
}

/** Journalise un rattrapage : un document CLIENT a été décliné par le modèle principal. */
function logIfFallback(where: string, model: string, iterations: unknown): void {
  if (!servedByFallback(iterations as UsageIteration[] | undefined)) return
  logJson({ fn: 'ai', op: where, status: 'fallback', servedBy: model })
}

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * Comptabilise les tokens pour le quota par organisation (les lectures de cache sont facturées).
 *
 * ⚠️ Les trois compteurs d'entrée sont additionnés pour le QUOTA mais journalisés SÉPARÉMENT : sans
 * cela, un cache qui ne prend jamais serait invisible — le total resterait identique et l'on
 * croirait économiser. `cacheRead` proche de zéro sur une série de rubriques signale un préfixe qui
 * n'est pas réellement stable, ou une série plus longue que les 5 minutes de rétention.
 */
function recordUsage(usage: AnthropicUsage | undefined): {
  in: number
  out: number
  cacheRead: number
  cacheWrite: number
} {
  const cacheRead = usage?.cache_read_input_tokens ?? 0
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0
  const input = (usage?.input_tokens ?? 0) + cacheRead + cacheWrite
  const output = usage?.output_tokens ?? 0
  addUsage(input, output, cacheRead, cacheWrite)
  return { in: input, out: output, cacheRead, cacheWrite }
}

/** Génère du texte (mode bloquant). */
export async function generateParts(parts: Part[], opts: AiOptions = {}): Promise<string> {
  const timeoutMs = boundedTimeout(opts.timeoutMs, DEFAULT_TIMEOUT_MS)
  const body = buildBody(parts, opts)

  return await breaker.run(async () => {
    let message: Anthropic.Beta.BetaMessage
    try {
      message = await client(timeoutMs).beta.messages.create(body)
    } catch (e) {
      throw toPolicyError(e)
    }
    // Comptabiliser AVANT de constater un arrêt inexploitable : une réponse tronquée ou refusée a
    // été produite, donc facturée. Lever d'abord ferait perdre ces tokens pour le quota — il
    // suffirait alors de faire échouer la génération pour consommer l'IA gratuitement.
    const used = recordUsage(message.usage as AnthropicUsage)
    // Journalisé même sans cache demandé : un `cacheRead` nul sur une série de rubriques est le
    // signal qu'un préfixe cesse d'être partagé, et il ne se voit nulle part ailleurs.
    if (opts.cacheBreakpointAfter !== undefined || opts.cacheSystem) {
      logJson({
        fn: 'anthropic',
        op: 'cache',
        read: used.cacheRead,
        write: used.cacheWrite,
        fresh: used.in - used.cacheRead - used.cacheWrite,
      })
    }
    logIfFallback('generate', message.model, message.usage?.iterations)
    assertUsableStop(message.stop_reason, 'anthropic.generate', message.stop_details?.category)
    // `content` est une union : blocs de réflexion PUIS blocs de texte. Seul le texte est le
    // livrable ; la réflexion (`display: summarized`) sert la mesure du lot M3, pas le document.
    // Un bloc `fallback` (marqueur de bascule) n'est pas du texte : il est ignoré ici.
    return message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
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
      return Promise.resolve(client(timeoutMs).beta.messages.stream(body))
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
        // En flux, une bascule se produit SUR LE MÊME flux : le texte déjà émis reste valable, le
        // modèle de repli poursuit. Rien à annuler côté client — mais le rattrapage doit se voir.
        logIfFallback('stream', final.model, final.usage?.iterations)
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
