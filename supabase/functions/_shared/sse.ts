// Transformation du flux SSE Vertex (`alt=sse`) en SSE simple pour le client (T11, PLAN-V2).
// Vertex émet `data: {candidates:[{content:{parts:[{text}]}}], …}` par fragment ; le client n'a
// besoin que des deltas de texte : on émet `data: {"text":"…"}` puis `data: [DONE]`.

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

/**
 * Transforme le body SSE Vertex en SSE simple. `onDone(chars)` est appelé à la fin du flux
 * (logging) avec le nombre total de caractères émis.
 */
export function vertexSseToSimple(
  vertexBody: ReadableStream<Uint8Array>,
  onDone?: (chars: number) => void,
): ReadableStream<Uint8Array> {
  const reader = vertexBody.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let total = 0

  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, text: string) => {
    total += text.length
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
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
          if (tail.startsWith('data:')) {
            const text = vertexEventText(tail.slice(5).trim())
            if (text) emit(controller, text)
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          onDone?.(total)
          controller.close()
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
            const text = vertexEventText(line.slice(5).trim())
            if (text) {
              emit(controller, text)
              emitted = true
            }
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
