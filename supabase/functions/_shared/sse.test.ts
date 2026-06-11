// deno test — transformation SSE Vertex → SSE simple (deltas de texte uniquement).
import { assertEquals } from 'jsr:@std/assert@1'

import { vertexEventText, vertexSseToSimple } from './sse.ts'

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

const vertexEvent = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`

Deno.test('vertexEventText : extrait le delta, vide si fragment sans texte ou JSON invalide', () => {
  assertEquals(vertexEventText('{"candidates":[{"content":{"parts":[{"text":"Bonjour"}]}}]}'), 'Bonjour')
  assertEquals(vertexEventText('{"usageMetadata":{}}'), '')
  assertEquals(vertexEventText('pas du json'), '')
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
