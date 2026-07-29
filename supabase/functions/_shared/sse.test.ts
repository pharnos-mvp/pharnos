// deno test — transformation SSE Vertex → SSE simple (deltas de texte uniquement).
import { assertEquals } from 'jsr:@std/assert@1'

import { vertexEventFinish, vertexEventText, vertexSseToSimple } from './sse.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  let out = ''
  for await (const chunk of stream) out += dec.decode(chunk, { stream: true })
  return out
}

/** Enveloppe un payload JSON dans une trame SSE (`data: …` + ligne vide). */
const sseFrame = (json: string) => `data: ${json}\n\n`

const vertexEvent = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`

Deno.test('vertexEventText : extrait le delta, vide si fragment sans texte ou JSON invalide', () => {
  assertEquals(vertexEventText('{"candidates":[{"content":{"parts":[{"text":"Bonjour"}]}}]}'), 'Bonjour')
  assertEquals(vertexEventText('{"usageMetadata":{}}'), '')
  assertEquals(vertexEventText('pas du json'), '')
})

Deno.test('vertexEventFinish : lit le motif d’arrêt, null si absent ou JSON invalide', () => {
  assertEquals(
    vertexEventFinish('{"candidates":[{"finishReason":"MAX_TOKENS"}]}'),
    'MAX_TOKENS',
  )
  assertEquals(vertexEventFinish('{"candidates":[{"content":{"parts":[{"text":"a"}]}}]}'), null)
  assertEquals(vertexEventFinish('pas du json'), null)
})

Deno.test('vertexSseToSimple : flux TRONQUÉ → signale l’erreur AVANT [DONE]', async () => {
  // Le cœur du défaut corrigé : sans ce marqueur, un flux coupé se termine par un `[DONE]`
  // strictement identique à celui d'un flux complet — le client affiche un document amputé
  // comme s'il était entier.
  const body = streamOf(
    sseFrame('{"candidates":[{"content":{"parts":[{"text":"debut de doc"}]}}]}'),
    sseFrame('{"candidates":[{"finishReason":"MAX_TOKENS"}]}'),
  )
  const out = await collect(vertexSseToSimple(body))
  assertEquals(out.includes('"text":"debut de doc"'), true)
  assertEquals(out.includes('"error":"truncated"'), true)
  assertEquals(out.indexOf('"error":"truncated"') < out.indexOf('[DONE]'), true)
})

Deno.test('vertexSseToSimple : flux BLOQUÉ (sécurité) → signale « blocked »', async () => {
  const body = streamOf(sseFrame('{"candidates":[{"finishReason":"SAFETY"}]}'))
  const out = await collect(vertexSseToSimple(body))
  assertEquals(out.includes('"error":"blocked"'), true)
})

Deno.test('vertexSseToSimple : flux COMPLET → aucun marqueur d’erreur (non-régression)', async () => {
  const body = streamOf(
    sseFrame('{"candidates":[{"content":{"parts":[{"text":"doc entier"}]},"finishReason":"STOP"}]}'),
  )
  const out = await collect(vertexSseToSimple(body))
  assertEquals(out.includes('"error"'), false)
  assertEquals(out.includes('[DONE]'), true)
})

Deno.test('vertexSseToSimple : re-streame les deltas puis [DONE]', async () => {
  let total = -1
  const out = await collect(
    vertexSseToSimple(streamOf(vertexEvent('Bon'), vertexEvent('jour')), (n) => (total = n)),
  )
  assertEquals(out, 'data: {"text":"Bon"}\n\ndata: {"text":"jour"}\n\ndata: [DONE]\n\n')
  assertEquals(total, 7)
})

Deno.test('vertexSseToSimple : événement coupé entre deux chunks réseau', async () => {
  const event = vertexEvent('Étiquetage')
  const cut = Math.floor(event.length / 2)
  const out = await collect(vertexSseToSimple(streamOf(event.slice(0, cut), event.slice(cut))))
  assertEquals(out, 'data: {"text":"Étiquetage"}\n\ndata: [DONE]\n\n')
})

Deno.test('vertexSseToSimple : dernier événement sans séparateur final', async () => {
  const out = await collect(vertexSseToSimple(streamOf(vertexEvent('a') + 'data: {"candidates":[{"content":{"parts":[{"text":"fin"}]}}]}')))
  assertEquals(out.includes('data: {"text":"a"}'), true)
  assertEquals(out.includes('data: {"text":"fin"}'), true)
  assertEquals(out.endsWith('data: [DONE]\n\n'), true)
})
