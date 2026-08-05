// deno test — ce que la page publique voit d'une commande. Aucun réseau, aucune base.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import { assembler, resumer, type LigneSection } from './order-status-core.ts'

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

/* ───────────────────────────────────── Le livrable ─────────────────────────────────────────── */

const complet = (): LigneSection[] => [
  ...['1', '2', '3'].map((id) => ligne({ section_id: id, phase: 'conformity' })),
  ...['1', '2'].map((id) => ligne({ section_id: id, phase: 'translation' })),
  ...['terminology', 'relocations', 'findings', 'recommendations'].map((id) =>
    ligne({ section_id: id, phase: 'report', content: { [id]: [] } })
  ),
]

Deno.test('livrable : les trois passes sont rendues, la revue indexée par tableau', () => {
  const l = assembler(complet(), { conformity: 3, report: 4 }, { sourceKind: 'text', lang: 'fr' })
  assertEquals('erreur' in l, false)
  const ok = l as Exclude<typeof l, { erreur: string }>
  assertEquals(ok.conformity.length, 3)
  assertEquals(ok.translation.length, 2)
  assertEquals(Object.keys(ok.report).sort(), ['findings', 'recommendations', 'relocations', 'terminology'])
  assertEquals(ok.sourceKind, 'text')
})

Deno.test('livrable : une rubrique MANQUANTE fait refuser, elle ne se laisse pas tronquer', () => {
  // ⚠️ Les cinq fichiers sont fabriqués dans le navigateur À PARTIR de ce JSON. Un JSON amputé
  // produirait un document silencieusement incomplet, avec un décompte de lacunes calculé sur ce
  // qui reste — le défaut de `d224665`, où un rapport contredisait son propre document.
  const ampute = complet().filter((l) => !(l.phase === 'conformity' && l.section_id === '2'))
  const r = assembler(ampute, { conformity: 3, report: 4 }, { sourceKind: 'text', lang: 'fr' })
  assertEquals('erreur' in r, true)
  assertStringIncludes((r as { erreur: string }).erreur, '2 rubriques sur 3')
})

Deno.test('livrable : un TABLEAU de revue manquant fait refuser aussi', () => {
  const sansConstats = complet().filter((l) => l.section_id !== 'findings')
  const r = assembler(sansConstats, { conformity: 3, report: 4 }, { sourceKind: 'text', lang: 'fr' })
  assertEquals('erreur' in r, true)
  assertStringIncludes((r as { erreur: string }).erreur, 'revue incomplète')
})

Deno.test('livrable : une rubrique non ABOUTIE ne compte pas comme faite', () => {
  // `running` ou `queued` ne sont pas des contenus : les compter livrerait des trous.
  const enCours = complet().map((l) =>
    l.phase === 'conformity' && l.section_id === '3' ? { ...l, status: 'running' } : l
  )
  const r = assembler(enCours, { conformity: 3, report: 4 }, { sourceKind: 'text', lang: 'fr' })
  assertEquals('erreur' in r, true)
})

Deno.test('livrable : une traduction absente NE bloque pas — la rubrique reste en français', () => {
  // Un livrable dont une rubrique reste dans la langue d'origine est visiblement incomplet ; un
  // livrable dont un dosage a changé est faux. On préfère toujours le premier (cf. `translated`).
  const sansTraduction = complet().filter((l) => l.phase !== 'translation')
  const r = assembler(sansTraduction, { conformity: 3, report: 4 }, { sourceKind: 'ocr', lang: 'fr' })
  assertEquals('erreur' in r, false)
  assertEquals((r as { translation: unknown[] }).translation.length, 0)
})
