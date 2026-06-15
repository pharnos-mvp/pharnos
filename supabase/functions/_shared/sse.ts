// Transformation du flux SSE Vertex (`alt=sse`) en SSE simple pour le client (T11, PLAN-V2).
// Vertex émet `data: {candidates:[{content:{parts:[{text}]}}], usageMetadata?, …}` par fragment ;
// le client n'a besoin que des deltas de texte : on émet `data: {"text":"…"}` puis `data: [DONE]`.

const encoder = new TextEncoder()

/** Extrait le delta de texte d'un événement JSON Vertex (chaîne vide si fragment sans texte). */
export function vertexEventText(json: string): string {
  try {
    const parsed = JSON.parse(json) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return (parsed.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  } catch {
    return ''
  }
}

/** Extrait les tokens (usageMetadata) d'un événement Vertex — présent sur le dernier fragment. */
export function vertexEventUsage(json: string): { in: number; out: number } | null {
  try {
    const parsed = JSON.parse(json) as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const u = parsed.usageMetadata
    if (!u) return null
    return { in: Number(u.promptTokenCount) || 0, out: Number(u.candidatesTokenCount) || 0 }
  } catch {
    return null
  }
}

/**
 * Transforme le body SSE Vertex en SSE simple. `onDone(chars)` est appelé à la fin du flux
 * (logging) ; `onUsage(in,out)` reçoit les tokens consommés (quota par org, M1) — usageMetadata si
 * fourni, sinon estimation (~4 chars/token sur la sortie émise) pour ne jamais laisser un appel
 * non compté.
 */
export function vertexSseToSimple(
  vertexBody: ReadableStream<Uint8Array>,
  onDone?: (chars: number) => void,
  onUsage?: (input: number, output: number) => void,
): ReadableStream<Uint8Array> {
  const reader = vertexBody.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let total = 0
  let usageIn = 0
  let usageOut = 0
  let sawUsage = false

  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, text: string) => {
    total += text.length
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
  }

  // Un événement `data:` peut porter du texte ET/OU l'usageMetadata final.
  const consume = (controller: ReadableStreamDefaultController<Uint8Array>, payload: string) => {
    const text = vertexEventText(payload)
    if (text) emit(controller, text)
    const usage = vertexEventUsage(payload)
    if (usage) {
      usageIn = usage.in
      usageOut = usage.out
      sawUsage = true
    }
    return text.length > 0
  }

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    onDone?.(total)
    // usageMetadata si vu, sinon estimation sur la sortie émise (l'entrée est inconnue ici).
    onUsage?.(sawUsage ? usageIn : 0, sawUsage ? usageOut : Math.ceil(total / 4))
    controller.close()
  }

  return new ReadableStream<Uint8Array>({
    // Boucle jusqu'à produire au moins un chunk (ou terminer) : un pull qui résout sans rien
    // enqueue laisse certains runtimes en attente (événement SSE coupé entre deux paquets réseau).
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Dernier événement éventuel resté dans le buffer (flux sans \n\n final).
          const tail = buffer.trim()
          if (tail.startsWith('data:')) consume(controller, tail.slice(5).trim())
          finish(controller)
          return
        }
        buffer += decoder.decode(value, { stream: true })
        // Les événements SSE sont séparés par une ligne vide.
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        let emitted = false
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue
            if (consume(controller, line.slice(5).trim())) emitted = true
          }
        }
        if (emitted) return
      }
    },
    cancel(reason) {
      void reader.cancel(reason)
    },
  })
}
