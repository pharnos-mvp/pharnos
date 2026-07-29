// deno test — interprétation du motif d'arrêt. Module pur : aucun téléchargement npm.
import { assertEquals } from 'jsr:@std/assert@1'

import { finishProblem, finishProblemMessage } from './finish.ts'

Deno.test('finishProblem : arrêt normal → aucun problème', () => {
  assertEquals(finishProblem('STOP'), null)
  assertEquals(finishProblem('FINISH_REASON_UNSPECIFIED'), null)
})

Deno.test('finishProblem : absent ou vide → aucun problème (réponse sans motif)', () => {
  assertEquals(finishProblem(undefined), null)
  assertEquals(finishProblem(null), null)
  assertEquals(finishProblem(''), null)
})

Deno.test('finishProblem : budget de sortie épuisé → tronqué', () => {
  assertEquals(finishProblem('MAX_TOKENS'), 'truncated')
})

Deno.test('finishProblem : casse et espaces tolérés', () => {
  assertEquals(finishProblem(' max_tokens '), 'truncated')
  assertEquals(finishProblem(' stop '), null)
})

Deno.test('finishProblem : motifs de blocage connus → bloqué', () => {
  for (const r of ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'OTHER']) {
    assertEquals(finishProblem(r), 'blocked', `motif ${r}`)
  }
})

Deno.test('finishProblem : motif INCONNU → bloqué, jamais un succès', () => {
  // Défaut pessimiste assumé : un motif que nous ne connaissons pas encore ne doit pas être pris
  // pour une génération réussie. Se tromper ici coûte un message d'erreur ; se tromper dans
  // l'autre sens livre un document faux au client.
  assertEquals(finishProblem('UN_MOTIF_QUI_N_EXISTE_PAS_ENCORE'), 'blocked')
})

Deno.test('finishProblemMessage : distingue troncature et blocage', () => {
  const t = finishProblemMessage('truncated', 'test')
  const b = finishProblemMessage('blocked', 'test')
  assertEquals(t.includes('tronquée'), true)
  assertEquals(b.includes('interrompue'), true)
  assertEquals(t === b, false)
})
