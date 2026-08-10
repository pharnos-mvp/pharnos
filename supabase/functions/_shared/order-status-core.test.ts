// deno test — ce que la page publique voit d'une commande. Aucun réseau, aucune base.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import { resumer, type LigneSection } from './order-status-core.ts'

const cmd = (o: Partial<{ status: string; deposits_used: number; delivery_expires_at: string }> = {}) => ({
  status: 'running',
  deposits_used: 1,
  delivery_expires_at: '2026-09-03T10:00:00.000Z',
  ...o,
})

const ligne = (o: Partial<LigneSection>): LigneSection => ({
  section_id: '1',
  phase: 'conformity',
  status: 'done',
  content: { status: 'filled' },
  ...o,
})

/* ────────────────────────────────────── Le résumé ──────────────────────────────────────────── */

Deno.test('résumé : l’avancement est celui de la PHASE, jamais du travail total', () => {
  // ⚠️ Cumuler les trois passes donnerait un compteur qui RECULE : 34 rubriques en conformité,
  // ~25 en traduction, 4 en revue. Un « 34 sur 34 » suivi d'un « 3 sur 25 » se lit comme une panne.
  const lignes = [
    ligne({ section_id: '1', phase: 'conformity' }),
    ligne({ section_id: '2', phase: 'conformity' }),
    ligne({ section_id: '1', phase: 'translation', status: 'done' }),
    ligne({ section_id: '2', phase: 'translation', status: 'queued' }),
  ]
  const r = resumer(cmd(), { phase: 'translation', sections_total: 2 }, lignes, 3)
  assertEquals(r.phase, 'translation')
  assertEquals(r.faites, 1)
  assertEquals(r.total, 2)
})

Deno.test('résumé : le total ne descend jamais sous ce qui est déjà fait', () => {
  // `sections_total` retarde d'une transition ; annoncer « 5 sur 3 » serait absurde à l'écran.
  const lignes = [
    ligne({ section_id: 'a' }),
    ligne({ section_id: 'b' }),
    ligne({ section_id: 'c' }),
  ]
  const r = resumer(cmd(), { phase: 'conformity', sections_total: 0 }, lignes, 3)
  assertEquals(r.total, 3)
  assertEquals(r.faites, 3)
})

Deno.test('résumé : les ÉCHECS sont annoncés, pas découverts', () => {
  const lignes = [ligne({ section_id: 'a' }), ligne({ section_id: 'b', status: 'failed' })]
  const r = resumer(cmd(), { phase: 'conformity', sections_total: 2 }, lignes, 3)
  assertEquals(r.echecs, 1)
  assertEquals(r.faites, 1)
})

Deno.test('résumé : `pret` suit le statut de la COMMANDE, pas un décompte', () => {
  // Un décompte peut être complet alors que la phase suivante n'a pas encore démarré : le seul
  // signal fiable est l'état posé par le worker au terme de tout le travail.
  assertEquals(resumer(cmd({ status: 'running' }), null, [], 3).pret, false)
  assertEquals(resumer(cmd({ status: 'done' }), null, [], 3).pret, true)
  assertEquals(resumer(cmd({ status: 'failed' }), null, [], 3).pret, false)
})

Deno.test('résumé : les dépôts restants ne passent jamais sous zéro', () => {
  assertEquals(resumer(cmd({ deposits_used: 3 }), null, [], 3).depositsLeft, 0)
  assertEquals(resumer(cmd({ deposits_used: 5 }), null, [], 3).depositsLeft, 0)
  assertEquals(resumer(cmd({ deposits_used: 0 }), null, [], 3).depositsLeft, 3)
})

Deno.test('résumé : AUCUNE donnée personnelle n’en sort', () => {
  // La page est atteinte par la seule possession d'un jeton — lequel se retrouve dans un historique
  // de navigateur, un cache de proxy, une capture d'écran envoyée au support.
  const champs = Object.keys(resumer(cmd(), null, [], 3))
  for (const interdit of ['email', 'first_name', 'last_name', 'chariow_sale_id', 'ref']) {
    assertEquals(champs.includes(interdit), false, interdit)
  }
})

// ⚠️ Les tests du « livrable » sont partis avec `assembler()` (U5) : l'assemblage vit désormais
// dans `job-tick` et ses garanties — refuser une rubrique manquante, refuser un tableau absent —
// sont testées là où elles s'exercent (`deliverable-markdown.test.ts`, `analyseDepuisParts`).
