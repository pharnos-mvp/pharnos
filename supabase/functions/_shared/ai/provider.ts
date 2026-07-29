// Abstraction fournisseur LLM (lot M1) — POINT D'ENTRÉE UNIQUE du moteur IA.
// INVARIANT (PLAN-MOTEUR-IA §8) : aucun appelant n'importe `vertex.ts` ou `anthropic.ts`
// directement. Changer de fournisseur devient une option d'appel, pas une réécriture.
//
// Le module Anthropic est chargé PARESSEUSEMENT (`import()` à spécificateur littéral, donc inclus
// dans le bundle de déploiement) : les fonctions qui restent sur Gemini — le chat `regafy-ai` —
// ne paient pas l'évaluation du SDK au démarrage à froid.
import { vertexSseToSimple } from '../sse.ts'
import { generateParts as vertexGenerate, streamParts as vertexStream } from '../vertex.ts'
import { assertStructuredOutputSupported, resolveProvider } from './select.ts'
import type { AiOptions, Part, SimpleSseHooks } from './types.ts'

export { boundedTimeout, EDGE_WALL_CLOCK_MS, MAX_CALL_TIMEOUT_MS } from './limits.ts'
export { assertStructuredOutputSupported, resolveProvider } from './select.ts'
export type { AiOptions, Effort, Part, Provider, SimpleSseHooks } from './types.ts'

/** Fournisseur de CET appel : option explicite, sinon la variable d'environnement. */
function providerFor(opts: AiOptions) {
  return resolveProvider(opts.provider, Deno.env.get('AI_PROVIDER'))
}

/**
 * Les options neutres qui ont un sens côté Gemini (le reste est propre à Anthropic).
 * ⚠️ `jsonSchema` n'en fait PAS partie — voir `assertStructuredOutputSupported`, appelé à l'entrée
 * de chaque mode : un appel structuré ne doit jamais être servi en JSON libre.
 */
function vertexOptions(opts: AiOptions) {
  return {
    system: opts.system,
    maxOutputTokens: opts.maxOutputTokens,
    temperature: opts.temperature,
    json: opts.json,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
  }
}

/** Génère du texte à partir de fragments (texte + documents/images), fournisseur au choix. */
export async function generateParts(parts: Part[], opts: AiOptions = {}): Promise<string> {
  const provider = providerFor(opts)
  assertStructuredOutputSupported(provider, Boolean(opts.jsonSchema))
  if (provider === 'anthropic') {
    const anthropic = await import('./anthropic.ts')
    return anthropic.generateParts(parts, opts)
  }
  return vertexGenerate(parts, vertexOptions(opts))
}

/** Génère du texte (non-streaming) à partir d'une seule invite. */
export function generateText(prompt: string, opts: AiOptions = {}): Promise<string> {
  return generateParts([{ text: prompt }], opts)
}

/**
 * Génère en FLUX et rend le SSE simple du produit (`data: {"text":…}` puis `data: [DONE]`).
 * Le format de fil de chaque fournisseur est normalisé PAR le fournisseur : l'appelant ne voit
 * jamais un flux Vertex ni un flux Anthropic, seulement celui du produit.
 */
export async function streamSimpleSse(
  parts: Part[],
  opts: AiOptions = {},
  hooks: SimpleSseHooks = {},
): Promise<ReadableStream<Uint8Array>> {
  const provider = providerFor(opts)
  assertStructuredOutputSupported(provider, Boolean(opts.jsonSchema))
  if (provider === 'anthropic') {
    const anthropic = await import('./anthropic.ts')
    return anthropic.streamSimpleSse(parts, opts, hooks)
  }
  const res = await vertexStream(parts, vertexOptions(opts))
  return vertexSseToSimple(res.body!, hooks.onDone, hooks.onUsage)
}
